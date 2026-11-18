import Phaser from 'phaser'
import type { Attack } from './Attack.ts'
import { COLLISION_CATEGORY } from '../config/collision.ts'
import { AIR_DRAG, GRAVITY_MS2, PIXELS_PER_METER, metersPerSecondToMatter, metersToPixels } from '../config/physics.ts'
import { DUST_COLORS, SPARK_TEXTURE, dust } from '../effects/particles.ts'
import { screenShake } from '../effects/juice.ts'
import { EarthMaterial, LAUNCH_MASK } from '../materials/EarthMaterial.ts'
import { findGroundSpot } from '../earth/groundSpot.ts'
import { GROUND_AIM } from '../config/wall.ts'
import { rockStyle } from '../earth/rockShape.ts'
import { drawRockSkin } from '../earth/rockSkin.ts'

const ROCK_SIZE_M = 0.5
const CHARGED_SIZE_M = 1.5
const CHARGE_DELAY_MS = 180
const CHARGE_MS = 2200
const CHARGED_SPEED_MS = 10
const EARTH_DENSITY_KG_M3 = 1800
const ROCK_MASS_KG = ROCK_SIZE_M ** 3 * EARTH_DENSITY_KG_M3
const ROCK_COLOR = 0x947653
const ROCK_OUTLINE = 0x4a3f33
const LIFT_MS = 260
const HOLD_MS = 80
/** Ein Klick ohne Mausbewegung wirft den Block vom Spieler weg, leicht nach oben (Grad). */
const FALLBACK_THROW_DEG = 12
/** Ab dieser Mausbewegung seit dem Drücken (Pixel) zielt der Wurf zur Maus. */
const AIM_MOVE_MIN_PX = 30
const SPIN_RAD_PER_STEP = 0.025

interface GroundSource {
  x: number
  y: number
  body: MatterJS.BodyType
}

interface Lift {
  source: GroundSource
  shape: Phaser.GameObjects.Rectangle
  /** Sichtbare Erdbrocken-/Felsen-Optik des aufsteigenden Blocks (das Rechteck bleibt unsichtbarer Körperträger). */
  view: Phaser.GameObjects.Graphics
  seed: number
  mode: 'waiting' | 'quick' | 'charging' | 'releasing'
  /** Mausposition beim Drücken: Bezug dafür, ob der Spieler danach gezielt hat. */
  press: { x: number; y: number }
  launchY: number
  centerY: number
  size: number
  charge: number
  elapsed: number
  releaseStartY: number
  releaseDurationMs: number
  nextDustAt: number
  nextShakeAt: number
  blocked: boolean
}

interface Effect {
  view: Phaser.GameObjects.Graphics | Phaser.GameObjects.Particles.ParticleEmitter
  expiresAt: number
  fade: boolean
}

/** Hebt Erde aus echtem Gelände; beim Abschuss übernimmt EarthMaterial den Block. */
export class EarthRockAttack implements Attack {
  readonly name = 'Erdstoß'
  readonly cooldownMs = 650
  /** Verdichteter Erdblock: 225 kg; 24 kJ ergeben etwa 14,6 m/s. */
  readonly energyJoules = 24_000

  private readonly scene: Phaser.Scene
  private readonly playerBody: MatterJS.BodyType
  private readonly earth: EarthMaterial
  private readonly onLaunch: (charge: number) => void
  private readonly aim = new Phaser.Math.Vector2(1, 0)
  /** Aktuelle Mausposition (Welt): Zielpunkt des Wurfs beim Loslassen. */
  private readonly mouse = new Phaser.Math.Vector2()
  private readonly effects = new Set<Effect>()
  private readonly chargeGraphics: Phaser.GameObjects.Graphics
  private readonly chargeText: Phaser.GameObjects.Text
  private lifting?: Lift

  constructor(scene: Phaser.Scene, playerBody: MatterJS.BodyType, earth: EarthMaterial, onLaunch: (charge: number) => void) {
    this.scene = scene
    this.playerBody = playerBody
    this.earth = earth
    this.onLaunch = onLaunch
    this.chargeGraphics = scene.add.graphics().setDepth(15).setVisible(false)
    this.chargeText = scene.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#ead7b2',
      backgroundColor: '#29251f', padding: { x: 3, y: 2 },
    }).setOrigin(0.5, 1).setDepth(16).setVisible(false)
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.update, this)
  }

  updateAim(_origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): void {
    if (direction.lengthSq() > 0) this.aim.copy(direction).normalize()
  }

  /** Die Hebehaltung bleibt bis zum tatsächlichen Abschuss bestehen. */
  get chargeProgress(): number | undefined {
    const lift = this.lifting
    return lift && (lift.mode === 'charging' || lift.mode === 'releasing') ? lift.charge : undefined
  }

  execute(origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): boolean {
    if (!this.begin(origin, direction, this.mouse.clone())) return false
    return this.release()
  }

  /** Linke Maustaste: kurzes Tippen bleibt ein Wurf, längeres Halten lädt auf. */
  /** Zielpunkt des Wurfs (Mausposition in Weltkoordinaten); jeden Frame und beim Loslassen setzen. */
  setMouse(target: Phaser.Types.Math.Vector2Like): void {
    this.mouse.set(target.x ?? 0, target.y ?? 0)
  }

  /** `target` ist die Mausposition: der Block steigt am Boden darunter auf. */
  begin(origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2, target: Phaser.Math.Vector2): boolean {
    if (this.lifting) return false
    this.updateAim(origin, direction)
    this.setMouse(target)
    const source = this.findGround(target)
    if (!source) return false
    const size = metersToPixels(ROCK_SIZE_M)
    // Auch in Bauchlage muss der ganze rotierende Block über die Oberfläche passen.
    const launchY = source.y - size / Math.SQRT2 - 2
    if (!this.clearLiftPath(source, launchY, size)) return false

    const shape = this.scene.add.rectangle(source.x, source.y - 0.5, size, 1, ROCK_COLOR)
      .setStrokeStyle(1, ROCK_OUTLINE).setDepth(5).setVisible(false).setAlpha(0)
    const view = this.scene.add.graphics().setDepth(5)
    this.lifting = {
      source, shape, view, seed: Math.floor(Math.random() * 100_000), launchY, press: { x: target.x, y: target.y },
      mode: 'waiting', centerY: source.y + size / 2, size, charge: 0, elapsed: 0,
      releaseStartY: 0, releaseDurationMs: 0, nextDustAt: 0, nextShakeAt: 0, blocked: false,
    }
    this.crackGround(source)
    dust(this.scene, source.x, source.y - 2, 16, 75)
    screenShake(this.scene, 0.002, 90)
    return true
  }

  release(): boolean {
    const lift = this.lifting
    if (!lift || (lift.mode !== 'waiting' && lift.mode !== 'charging')) return false
    if (lift.mode === 'waiting') {
      lift.mode = 'quick'
    } else {
      // Teilweise freigelegte Blöcke steigen vor dem Wurf noch ganz aus dem Boden.
      lift.mode = 'releasing'
      lift.releaseStartY = lift.centerY
      lift.releaseDurationMs = Phaser.Math.Clamp((lift.centerY - lift.launchY) * 8, 0, 180)
    }
    lift.elapsed = 0
    this.hideCharge()
    return true
  }

  cancel(): void {
    this.lifting?.shape.destroy()
    this.lifting?.view.destroy()
    this.lifting = undefined
    this.hideCharge()
  }

  cancelCharge(): void {
    // Ein bereits losgelassener Wurf wird auch beim schnellen Elementwechsel fertig.
    if (this.lifting?.mode === 'waiting' || this.lifting?.mode === 'charging') this.cancel()
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.update, this)
    this.cancel()
    for (const effect of this.effects) effect.view.destroy()
    this.effects.clear()
    this.chargeGraphics.destroy()
    this.chargeText.destroy()
  }

  /** Boden unter der Maus; der ausgewachsene Block muss dort Platz haben und der Weg nach oben frei sein. */
  private findGround(target: Phaser.Math.Vector2): GroundSource | undefined {
    const vertices = this.playerBody.vertices
    if (!vertices?.length) return undefined
    const halfWidth = (Math.max(...vertices.map((v) => v.x)) - Math.min(...vertices.map((v) => v.x))) / 2
    const size = metersToPixels(ROCK_SIZE_M)
    const full = metersToPixels(CHARGED_SIZE_M)
    const spot = findGroundSpot(this.scene, this.playerBody, target, full + 2, halfWidth + full / 2 + 4)
    if (!spot) return undefined
    const source = { x: spot.x, y: spot.groundY, body: spot.terrain }
    return this.clearLiftPath(source, source.y - size / Math.SQRT2 - 2, size) ? source : undefined
  }

  /** Wurfrichtung beim Loslassen: zur Maus; ein Klick ohne Mausbewegung wirft vom Spieler weg, leicht nach oben. */
  private throwDirection(lift: Lift): Phaser.Math.Vector2 {
    const moved = Math.hypot(this.mouse.x - lift.press.x, this.mouse.y - lift.press.y)
    const dx = this.mouse.x - lift.source.x, dy = this.mouse.y - lift.launchY
    if (moved >= AIM_MOVE_MIN_PX && Math.hypot(dx, dy) > 1) return new Phaser.Math.Vector2(dx, dy).normalize()
    const side = Math.sign(lift.source.x - this.playerBody.position.x) || 1
    const rad = (FALLBACK_THROW_DEG * Math.PI) / 180
    return new Phaser.Math.Vector2(side * Math.cos(rad), -Math.sin(rad))
  }

  private clearLiftPath(source: GroundSource, launchY: number, size: number): boolean {
    const { min, max } = source.body.bounds
    if (source.x - size / 2 < min.x + 1 || source.x + size / 2 > max.x - 1 || max.y - min.y < size) return false
    const top = launchY - size / 2 - 1
    const bottom = source.y - 0.5
    const probe = this.scene.matter.bodies.rectangle(source.x, (top + bottom) / 2, size + 2, bottom - top)
    const obstacles = this.scene.matter.world.getAllBodies().filter((body) =>
      body !== source.body && body !== this.playerBody && !body.isSensor,
    )
    return !this.scene.matter.overlap(probe, obstacles)
  }

  private update(_time: number, deltaMs: number): void {
    const now = this.scene.time.now
    const lift = this.lifting
    if (lift) {
      const distance = Phaser.Math.Distance.Between(lift.source.x, lift.source.y, this.playerBody.position.x, this.playerBody.position.y)
      if (distance > metersToPixels(GROUND_AIM.reachM + 2) || !this.clearLiftPath(lift.source, lift.launchY, lift.size)) {
        this.cancel()
      } else {
        this.updateLift(lift, Math.min(deltaMs, 50), now)
      }
    }
    for (const effect of this.effects) {
      if (now >= effect.expiresAt) {
        effect.view.destroy()
        this.effects.delete(effect)
      } else if (effect.fade) effect.view.setAlpha(Math.min(1, (effect.expiresAt - now) / 500))
    }
  }

  private updateLift(lift: Lift, deltaMs: number, now: number): void {
    lift.elapsed += deltaMs
    if (lift.mode === 'waiting') {
      if (lift.elapsed < CHARGE_DELAY_MS) return
      lift.mode = 'charging'
      lift.elapsed = 0
    }

    if (lift.mode === 'charging') {
      const charge = Math.min(1, lift.charge + deltaMs / CHARGE_MS)
      const size = metersToPixels(Phaser.Math.Linear(ROCK_SIZE_M, CHARGED_SIZE_M, charge))
      const launchY = lift.source.y - size / Math.SQRT2 - 2
      // Nur tatsächlich formbare Masse zählt als Aufladung und später als Schaden.
      lift.blocked = !this.clearLiftPath(lift.source, launchY, size)
      if (!lift.blocked) {
        lift.charge = charge
        lift.size = size
        lift.launchY = launchY
      }
      const eased = lift.charge ** 2 * (3 - 2 * lift.charge)
      lift.centerY = Phaser.Math.Linear(lift.source.y + lift.size / 2, lift.launchY, eased)
      this.showLift(lift, Math.sin(now * 0.06) * (0.2 + lift.charge * 0.6))
      this.drawCharge(lift)
      if (now >= lift.nextDustAt) {
        this.gatherDust(lift)
        lift.nextDustAt = now + 100 - lift.charge * 25
      }
      if (now >= lift.nextShakeAt) {
        screenShake(this.scene, 0.001 + lift.charge * 0.003, 120)
        lift.nextShakeAt = now + 125
      }
      // Auch bei voller Ladung wartet der Block ausdrücklich auf das Loslassen.
      return
    }

    const duration = lift.mode === 'quick' ? LIFT_MS : lift.releaseDurationMs
    const t = duration > 0 ? Math.min(1, lift.elapsed / duration) : 1
    const startY = lift.mode === 'quick' ? lift.source.y + lift.size / 2 : lift.releaseStartY
    lift.centerY = Phaser.Math.Linear(startY, lift.launchY, 1 - (1 - t) ** 3)
    this.showLift(lift)
    if (lift.elapsed >= duration + (lift.mode === 'quick' ? HOLD_MS : 0)) this.launch(lift)
  }

  private showLift(lift: Lift, jitterX = 0): void {
    const top = lift.centerY - lift.size / 2
    const bottom = Math.min(lift.source.y, lift.centerY + lift.size / 2)
    const height = Math.max(0.1, bottom - top)
    // Nur der freigelegte Teil wird gezeichnet; der Rest steckt noch in der Erde (Schnitt an der Bodenlinie).
    lift.view.clear()
    if (bottom <= top || height < 1) return
    drawRockSkin(lift.view, {
      x: lift.source.x + jitterX, y: lift.centerY, angle: 0, sizePx: lift.size, style: rockStyle(lift.size / PIXELS_PER_METER),
      seed: lift.seed, wet: 0, glow: 0, clipY: lift.source.y,
    })
  }

  private drawCharge(lift: Lift): void {
    const g = this.chargeGraphics
    const x = lift.source.x
    const y = Math.min(lift.source.y, lift.centerY - lift.size / 2) - 9
    g.setVisible(true).clear()
    g.fillStyle(0x29251f, 0.9).fillRect(x - 25, y - 1, 50, 6)
    g.fillStyle(lift.charge >= 1 ? 0xe4c278 : 0xad885b).fillRect(x - 24, y, 48 * lift.charge, 4)
    g.lineStyle(1, ROCK_OUTLINE)
    const spread = lift.size * 0.75
    g.lineBetween(x - spread, lift.source.y + 1, x + spread, lift.source.y + 1)
    g.lineBetween(x - spread * 0.7, lift.source.y, x - spread, lift.source.y + 7)
    g.lineBetween(x + spread * 0.5, lift.source.y + 1, x + spread * 0.8, lift.source.y + 5)
    this.chargeText.setVisible(true).setPosition(x, y - 4)
      .setText(lift.blocked ? 'ZU ENG · LOSLASSEN' : lift.charge >= 1 ? 'MAX · LOSLASSEN' : `ERDE ${Math.floor(lift.charge * 100)}%`)
  }

  private hideCharge(): void {
    // Beim Szenenwechsel kann die Display-Liste bereits zerstört worden sein.
    if (this.chargeGraphics.scene) this.chargeGraphics.clear().setVisible(false)
    if (this.chargeText.scene) this.chargeText.setVisible(false)
  }

  private launch(lift: Lift): void {
    this.lifting = undefined
    this.hideCharge()
    const size = lift.size
    const edgeM = size / PIXELS_PER_METER
    const mass = edgeM ** 3 * EARTH_DENSITY_KG_M3
    lift.view.destroy()
    lift.shape.setVisible(true).setSize(size, size).setPosition(lift.source.x, lift.launchY)
    const body = this.scene.matter.add.rectangle(lift.source.x, lift.launchY, size, size, {
      label: 'rock',
      mass,
      friction: 0.65,
      frictionStatic: 0.9,
      frictionAir: AIR_DRAG,
      restitution: 0.08,
      collisionFilter: { category: COLLISION_CATEGORY.world, mask: LAUNCH_MASK, group: 0 },
    })
    this.scene.matter.add.gameObject(lift.shape, body)
    const speed = metersPerSecondToMatter(Phaser.Math.Linear(Math.sqrt(2 * this.energyJoules / ROCK_MASS_KG), CHARGED_SPEED_MS, lift.charge))
    const throwDir = this.throwDirection(lift)
    this.scene.matter.body.setVelocity(body, { x: throwDir.x * speed, y: throwDir.y * speed })
    this.scene.matter.body.setAngularVelocity(body, SPIN_RAD_PER_STEP / (1 + lift.charge * 2) * Math.sign(throwDir.x || 1))
    this.earth.adopt(body, lift.shape, lift.charge, edgeM, lift.seed)
    dust(this.scene, lift.source.x, lift.launchY, Math.round(5 + lift.charge * 25), 30 + lift.charge * 60)
    screenShake(this.scene, 0.0025 + lift.charge * 0.006, 100)
    this.onLaunch(lift.charge)
  }

  private gatherDust(lift: Lift): void {
    const emitter = this.scene.add.particles(lift.source.x, lift.source.y - 3, SPARK_TEXTURE, {
      x: { min: -lift.size * 0.75, max: lift.size * 0.75 },
      y: { min: -3, max: 3 },
      lifespan: { min: 650, max: 1100 },
      angle: { min: 195, max: 345 },
      speed: { min: 20, max: 45 + lift.charge * 30 },
      gravityY: GRAVITY_MS2 * PIXELS_PER_METER * 0.25,
      scale: { start: 1.5 + lift.charge * 1.8, end: 0.2 },
      alpha: { start: 0.65, end: 0 }, color: DUST_COLORS, emitting: false,
    }).setDepth(6)
    emitter.explode(Math.round(3 + lift.charge * 5))
    this.effects.add({ view: emitter, expiresAt: this.scene.time.now + 1250, fade: false })
  }

  private crackGround(source: GroundSource): void {
    const g = this.scene.add.graphics().setDepth(4)
    const { x, y } = source
    g.lineStyle(2, ROCK_OUTLINE).lineBetween(x - 15, y + 1, x + 14, y + 1)
    g.lineStyle(1, 0xd0ae78).lineBetween(x - 13, y - 1, x - 5, y - 2)
    g.lineStyle(1, ROCK_OUTLINE).lineBetween(x - 9, y + 1, x - 13, y + 6)
    g.lineBetween(x + 6, y + 1, x + 11, y + 5)
    this.effects.add({ view: g, expiresAt: this.scene.time.now + 1000, fade: true })
  }
}
