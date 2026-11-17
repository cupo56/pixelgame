import Phaser from 'phaser'
import { COLLISION_CATEGORY, SAND_GROUP, SAND_MASK } from '../config/collision.ts'
import { REACTIONS as R } from '../config/reactions.ts'
import { AIR_DRAG, matterToMetersPerSecond, metersPerSecondToMatter, metersToPixels } from '../config/physics.ts'
import { damageEnemy, isEnemy } from '../combat/damage.ts'
import { dust, sandCloud } from '../effects/particles.ts'
import { approachAmbient, grainPlan } from './thermo.ts'
import type { Substance } from './Substance.ts'
import type { ReactionSystem } from './ReactionSystem.ts'

const SAND_COLORS = [0xd9c3a0, 0xb8a079]
/** Unterhalb dieser Geschwindigkeit gilt ein Korn als ruhend (Versinken, Verdrängung). */
const RESTING_SPEED_MS = 0.1
/** Auftrieb beim Verwehen, damit die Bodenreibung den Stoß nicht schluckt (m/s). */
const CLOUD_LIFT_MS = 3

export interface Grain extends Substance {
  readonly kind: 'sand'
  readonly view: Phaser.GameObjects.Arc
  readonly radiusPx: number
  inVortex: boolean
  airborne: boolean
  readonly hitTargets: Set<MatterJS.BodyType>
}

/** Sand: lose Körner aus zerfallener Erde; bilden Haufen, bremsen Gegner, verwehen im Wind, versinken. */
export class SandMaterial {
  private readonly scene: Phaser.Scene
  private readonly system: ReactionSystem
  private readonly grains = new Set<Grain>()
  private readonly offStep: () => void
  /** Pro Physikschritt höchstens eine Bremsung je Gegner. */
  private readonly brakedThisStep = new Set<MatterJS.BodyType>()

  constructor(scene: Phaser.Scene, system: ReactionSystem) {
    this.scene = scene
    this.system = system
    system.attach('sand', this)
    this.offStep = system.onStep(this.step.bind(this))
    system.setWindHandler('sand', (s, direction, strength) => this.blow(s as Grain, direction, strength))
    system.setCaptureHandlers('sand', (s) => this.capture(s as Grain), (s) => this.release(s as Grain))
    scene.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
    scene.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_ACTIVE, this.onContact, this)
  }

  /** Block zerbröselt: Körner innerhalb der Blockfläche, Masse bleibt erhalten. */
  fromEarth(earth: Substance, edgeM: number): Substance[] {
    const { x, y } = earth.body.position
    const velocity = { x: earth.body.velocity.x, y: earth.body.velocity.y }
    const temperatureC = earth.temperatureC
    const sizePx = metersToPixels(edgeM)
    this.system.remove(earth)
    const freeSlots = Math.max(0, Math.min(R.budgetGrains - this.system.registry.count('sand'), R.budgetTotal - this.system.registry.count()))
    const plan = grainPlan(edgeM, freeSlots)
    const spawned: Substance[] = []
    for (let i = 0; i < plan.count; i++) {
      if (!this.system.reserve('sand')) break
      const grain = this.spawn(
        x + Phaser.Math.FloatBetween(-sizePx / 2 + 3, sizePx / 2 - 3),
        y + Phaser.Math.FloatBetween(-sizePx / 2 + 3, sizePx / 2 - 3),
        plan.grainMassKg, metersToPixels(plan.grainRadiusM), temperatureC,
      )
      this.scene.matter.body.setVelocity(grain.body, {
        x: velocity.x + Phaser.Math.FloatBetween(-0.4, 0.4),
        y: velocity.y + Phaser.Math.FloatBetween(-0.6, 0.1),
      })
      spawned.push(grain)
    }
    dust(this.scene, x, y, Math.round(8 + plan.count * 0.4), 70)
    return spawned
  }

  all(): Grain[] {
    return [...this.grains]
  }

  destroy(): void {
    this.offStep()
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.COLLISION_ACTIVE, this.onContact, this)
    for (const grain of [...this.grains]) this.system.remove(grain)
  }

  private spawn(x: number, y: number, massKg: number, radiusPx: number, temperatureC: number): Grain {
    const body = this.scene.matter.add.circle(x, y, radiusPx, {
      label: 'sand',
      mass: massKg,
      friction: 0.6,
      frictionStatic: 0.8,
      frictionAir: AIR_DRAG,
      restitution: 0.05,
      collisionFilter: { category: COLLISION_CATEGORY.sand, mask: SAND_MASK, group: SAND_GROUP },
    })
    // Körner rollen nicht davon: ohne Rotation bremst die Bodenreibung sie zum Haufen.
    this.scene.matter.body.setInertia(body, Infinity)
    const view = this.scene.add.circle(x, y, radiusPx, SAND_COLORS[Math.floor(Math.random() * SAND_COLORS.length)]).setDepth(5)
    this.scene.matter.add.gameObject(view, body)
    const grain: Grain = {
      kind: 'sand', body, view, radiusPx, inVortex: false, airborne: false, hitTargets: new Set(),
      temperatureC, massKg, wetnessKg: 0, heatJ: 0, restingMs: 0, createdAt: this.scene.time.now,
      remove: () => {
        this.grains.delete(grain)
        this.scene.time.delayedCall(0, () => {
          this.scene.matter.world?.remove(body)
          view.destroy()
        })
      },
    }
    this.grains.add(grain)
    this.system.registry.register(grain)
    return grain
  }

  private capture(grain: Grain): boolean {
    if (!this.grains.has(grain) || grain.inVortex) return false
    grain.inVortex = true
    grain.airborne = true
    grain.hitTargets.clear()
    return true
  }

  private release(grain: Grain): void {
    if (this.grains.has(grain)) grain.inVortex = false
  }

  /** Sandwolke: Körner fliegen mit dem Wind und schneiden, was sie schnell treffen. */
  private blow(grain: Grain, direction: Phaser.Math.Vector2, strength: number): void {
    if (!this.grains.has(grain)) return
    const deltaV = metersPerSecondToMatter(R.gustCarrySpeedMs * strength)
    const lift = direction.y < 0.65 ? metersPerSecondToMatter(CLOUD_LIFT_MS * Math.sqrt(strength)) : 0
    this.scene.matter.body.setVelocity(grain.body, {
      x: grain.body.velocity.x + direction.x * deltaV,
      y: Math.min(grain.body.velocity.y + direction.y * deltaV, -lift),
    })
    grain.airborne = true
    grain.hitTargets.clear()
    grain.restingMs = 0
    sandCloud(this.scene, grain.body.position.x, grain.body.position.y, direction, 3)
  }

  private step(dtS: number, now: number): void {
    this.brakedThisStep.clear()
    for (const grain of [...this.grains]) {
      grain.temperatureC = approachAmbient(grain.temperatureC, R.earthCoolingKPerS, dtS)
      const slow = matterToMetersPerSecond(grain.body.speed) < RESTING_SPEED_MS
      grain.restingMs = slow && !grain.inVortex ? grain.restingMs + dtS * 1000 : 0
      if (slow) grain.airborne = false
      if (grain.restingMs >= R.sandSinkMs) {
        dust(this.scene, grain.body.position.x, grain.body.position.y, 3, 25)
        this.system.remove(grain)
      }
    }
    void now
  }

  private onCollision(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    for (const pair of event.pairs) {
      this.cut(pair.bodyA.parent, pair.bodyB.parent)
      this.cut(pair.bodyB.parent, pair.bodyA.parent)
    }
  }

  /** Fliegende Körner verletzen Gegner einmal pro Korn. */
  private cut(body: MatterJS.BodyType, other: MatterJS.BodyType): void {
    const grain = this.system.registry.get(body) as Grain | undefined
    if (grain?.kind !== 'sand' || !this.grains.has(grain) || !grain.airborne || !isEnemy(other) || grain.hitTargets.has(other)) return
    const speedMs = matterToMetersPerSecond(Math.hypot(body.velocity.x - other.velocity.x, body.velocity.y - other.velocity.y))
    if (speedMs < R.sandCloudDamageSpeedMs) return
    if (damageEnemy(other, R.sandCloudDamage)) grain.hitTargets.add(other)
  }

  private onContact(event: Phaser.Physics.Matter.Events.CollisionActiveEvent): void {
    for (const pair of event.pairs) {
      this.brake(pair.bodyA.parent, pair.bodyB.parent)
      this.brake(pair.bodyB.parent, pair.bodyA.parent)
    }
  }

  /** Gegner, die im Haufen stecken, werden gebremst (einmal je Schritt und Gegner). */
  private brake(body: MatterJS.BodyType, other: MatterJS.BodyType): void {
    if (this.system.registry.kindOf(body) !== 'sand' || !isEnemy(other) || this.brakedThisStep.has(other)) return
    this.brakedThisStep.add(other)
    this.scene.matter.body.setVelocity(other, { x: other.velocity.x * R.sandBrakeFactor, y: other.velocity.y * R.sandBrakeFactor })
  }
}
