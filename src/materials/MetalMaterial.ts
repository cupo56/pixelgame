import Phaser from 'phaser'
import { ALL_CATEGORIES, COLLISION_CATEGORY, METAL_LAUNCH_MASK } from '../config/collision.ts'
import { REACTIONS as R } from '../config/reactions.ts'
import { AIR_DRAG, metersToPixels } from '../config/physics.ts'
import { damageEnemy, isEnemy } from '../combat/damage.ts'
import { SPARK_TEXTURE, dust } from '../effects/particles.ts'
import { screenShake } from '../effects/juice.ts'
import { impactRing } from '../effects/impact.ts'
import { approachAmbient, glowFraction, metalEdgeM, solidHeatingK } from './thermo.ts'
import type { Substance } from './Substance.ts'
import type { ReactionSystem } from './ReactionSystem.ts'

const OWNER_GRACE_MS = 220
const SINK_MS = 300
const METAL_DARK = 0x4a4f57
const METAL_LIGHT = 0x8a9099
const METAL_SHINE = 0xc9ced6
const GLOW_RED = 0x7a1e0a
const GLOW_ORANGE = 0xff8a1f
const GLOW_YELLOW = 0xffe28a

export interface MetalBlock extends Substance {
  readonly kind: 'metal'
  readonly view: Phaser.GameObjects.Graphics
  readonly glow: Phaser.GameObjects.Graphics
  readonly edgePx: number
  solidToPlayerAt: number
  readonly lastBurnAt: Map<MatterJS.BodyType, number>
  sinking: boolean
}

/** Metall: schwere, dauerhafte Blöcke aus verschmolzenem Sand; glühen, brennen, lassen Feuer abprallen. */
export class MetalMaterial {
  private readonly scene: Phaser.Scene
  private readonly system: ReactionSystem
  private readonly playerBody: MatterJS.BodyType
  private readonly blocks = new Set<MetalBlock>()
  private readonly offStep: () => void

  constructor(scene: Phaser.Scene, system: ReactionSystem, playerBody: MatterJS.BodyType) {
    this.scene = scene
    this.system = system
    this.playerBody = playerBody
    system.attach('metal', this)
    this.offStep = system.onStep(this.step.bind(this))
    system.setHeatHandler('metal', (s, heatJ) => this.heat(s, heatJ))
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.draw, this)
    scene.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
  }

  /** Verschmilzt Körner: Masse summiert, Kante aus der Metalldichte, Lage im Massenschwerpunkt. */
  fromGrains(grains: Substance[]): Substance | undefined {
    if (!grains.length) return undefined
    const massKg = grains.reduce((sum, g) => sum + g.massKg, 0)
    const x = grains.reduce((sum, g) => sum + g.body.position.x * g.massKg, 0) / massKg
    const y = grains.reduce((sum, g) => sum + g.body.position.y * g.massKg, 0) / massKg
    const temperatureC = Math.min(R.solidMaxC, Math.max(...grains.map((g) => g.temperatureC)))
    // Körner ziehen sich sichtbar zur Mitte zusammen, der Block erscheint danach.
    for (const grain of grains) {
      const ghost = this.scene.add.circle(grain.body.position.x, grain.body.position.y, 4, 0xffe28a).setDepth(6)
      this.scene.tweens.add({ targets: ghost, x, y, duration: 200, onComplete: () => ghost.destroy() })
      this.system.remove(grain)
    }
    const flash = this.scene.add.circle(x, y, 18, 0xffffff, 0.9).setDepth(17).setBlendMode(Phaser.BlendModes.ADD)
    this.scene.tweens.add({ targets: flash, alpha: 0, scale: 2, duration: 220, onComplete: () => flash.destroy() })
    const block = this.spawn(x, y, massKg, temperatureC)
    block.view.setVisible(false)
    this.scene.time.delayedCall(200, () => { if (block.view.scene) block.view.setVisible(true) })
    return block
  }

  all(): MetalBlock[] {
    return [...this.blocks]
  }

  destroy(): void {
    this.offStep()
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.draw, this)
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
    for (const block of [...this.blocks]) this.system.remove(block)
  }

  private spawn(x: number, y: number, massKg: number, temperatureC: number): MetalBlock {
    while (this.blocks.size >= R.metalMax) {
      const oldest = [...this.blocks].filter((b) => !b.sinking).sort((a, b) => a.createdAt - b.createdAt)[0]
      if (!oldest) break
      this.sink(oldest)
    }
    const edgePx = Math.max(6, metersToPixels(metalEdgeM(massKg)))
    const body = this.scene.matter.add.rectangle(x, y, edgePx, edgePx, {
      label: 'metal',
      mass: massKg,
      friction: 0.5,
      frictionStatic: 0.8,
      frictionAir: AIR_DRAG,
      restitution: 0.1,
      collisionFilter: { category: COLLISION_CATEGORY.metal, mask: METAL_LAUNCH_MASK, group: 0 },
    })
    // Matter skaliert die Drehträgheit nicht mit der mass-Option; ein schwerer kleiner Block
    // würde sonst durch Reibungsimpulse unkontrolliert rotieren. Quadrat: I = m·a²/6.
    this.scene.matter.body.setInertia(body, (massKg * edgePx * edgePx) / 6)
    const view = this.scene.add.graphics().setDepth(5)
    const glow = this.scene.add.graphics().setDepth(15).setBlendMode(Phaser.BlendModes.ADD)
    const now = this.scene.time.now
    const block: MetalBlock = {
      kind: 'metal', body, view, glow, edgePx, solidToPlayerAt: now + OWNER_GRACE_MS, lastBurnAt: new Map(), sinking: false,
      temperatureC, massKg, wetnessKg: 0, heatJ: 0, restingMs: 0, createdAt: now,
      remove: () => {
        this.blocks.delete(block)
        view.destroy()
        glow.destroy()
        this.scene.time.delayedCall(0, () => this.scene.matter.world?.remove(body))
      },
    }
    this.blocks.add(block)
    this.system.registry.register(block)
    return block
  }

  /** Der älteste Block versinkt mit kurzer Animation, wenn der Deckel erreicht ist. */
  private sink(block: MetalBlock): void {
    block.sinking = true
    this.system.registry.unregister(block.body)
    this.blocks.delete(block)
    this.scene.matter.world.remove(block.body)
    block.glow.destroy()
    dust(this.scene, block.body.position.x, block.body.position.y + block.edgePx / 2, 10, 50)
    this.scene.tweens.add({
      targets: block.view, y: block.view.y + block.edgePx + 4, alpha: 0, duration: SINK_MS,
      onComplete: () => block.view.destroy(),
    })
  }

  private heat(substance: Substance, heatJ: number): void {
    const block = substance as MetalBlock
    if (!this.blocks.has(block)) return
    block.temperatureC = Math.min(R.solidMaxC, block.temperatureC + solidHeatingK(heatJ, 1, block.massKg))
  }

  /** Wasser auf heißem Metall: Verdampfungswärme kühlt den Block (ohne Kopplungsfaktor, reine Physik). */
  quenchWith(substance: Substance, waterKg: number): boolean {
    const block = substance as MetalBlock
    if (!this.blocks.has(block) || block.temperatureC < R.waterBoilC) return false
    block.temperatureC = Math.max(R.ambientC, block.temperatureC - (waterKg * R.waterLatentJPerKg) / (R.solidHeatCapacityJPerKgK * block.massKg))
    return true
  }

  private step(dtS: number, now: number): void {
    for (const block of this.blocks) {
      block.temperatureC = approachAmbient(block.temperatureC, R.metalCoolingKPerS, dtS)
      if (now >= block.solidToPlayerAt && block.body.collisionFilter.mask === METAL_LAUNCH_MASK &&
        !this.scene.matter.overlap(block.body, [this.playerBody])) {
        block.body.collisionFilter.mask = ALL_CATEGORIES
      }
    }
  }

  private draw(): void {
    const now = this.scene.time.now
    for (const block of this.blocks) {
      if (block.sinking) continue
      const { x, y } = block.body.position
      const half = block.edgePx / 2
      const glow = glowFraction(block.temperatureC, R.metalGlowC, R.metalWhiteC)
      const g = block.view
      g.setPosition(x, y).setRotation(block.body.angle).clear()
      g.fillStyle(mix(METAL_DARK, glow < 0.5 ? GLOW_RED : GLOW_ORANGE, glow < 0.5 ? glow * 2 : 1)).fillRect(-half, -half, block.edgePx, block.edgePx)
      g.fillStyle(mix(METAL_LIGHT, GLOW_YELLOW, glow)).fillRect(-half, -half, block.edgePx, Math.max(1, Math.round(block.edgePx * 0.18)))
      g.fillStyle(METAL_SHINE, 0.9).fillRect(-half + 2, -half + 2, Math.max(1, Math.round(block.edgePx * 0.35)), 1)
      g.lineStyle(1, 0x2a2e34).strokeRect(-half, -half, block.edgePx, block.edgePx)
      const s = block.glow.setPosition(x, y).clear()
      if (glow > 0) {
        s.fillStyle(0xff7a1f, 0.12 + glow * 0.2).fillCircle(0, 0, half * (1.6 + glow))
        // Hitzeflimmern über heißem Metall.
        if (Math.random() < 0.3 + glow * 0.5) {
          const emitter = this.scene.add.particles(x + Phaser.Math.FloatBetween(-half, half), y - half, SPARK_TEXTURE, {
            lifespan: 300, speedY: { min: -40, max: -20 }, scale: { start: 0.6, end: 0 }, alpha: { start: 0.5, end: 0 },
            color: [0xffd27a], emitting: false,
          }).setDepth(15)
          emitter.explode(1)
          this.scene.time.delayedCall(350, () => emitter.destroy())
        }
      }
      void now
    }
  }

  private onCollision(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    for (const pair of event.pairs) {
      this.burn(pair.bodyA.parent, pair.bodyB.parent)
      this.burn(pair.bodyB.parent, pair.bodyA.parent)
    }
  }

  /** Glühendes Metall verbrennt Gegner bei Berührung, höchstens alle 500 ms je Gegner. */
  private burn(body: MatterJS.BodyType, other: MatterJS.BodyType): void {
    const block = this.system.registry.get(body) as MetalBlock | undefined
    if (block?.kind !== 'metal' || !this.blocks.has(block) || block.temperatureC < R.metalGlowC || !isEnemy(other)) return
    const now = this.scene.time.now
    if (now - (block.lastBurnAt.get(other) ?? -Infinity) < R.glowContactIntervalMs) return
    if (damageEnemy(other, R.glowContactDamage)) {
      block.lastBurnAt.set(other, now)
      impactRing(this.scene, other.position.x, other.position.y, 0xff8a1f)
      screenShake(this.scene, 0.002, 60)
    }
  }
}

/** Farbmischung zweier Integer-Farben. */
export const mix = (a: number, b: number, t: number): number => {
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(
    Phaser.Display.Color.IntegerToColor(a), Phaser.Display.Color.IntegerToColor(b), 1, Phaser.Math.Clamp(t, 0, 1))
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b)
}
