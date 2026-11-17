import Phaser from 'phaser'
import type { Attack } from './Attack.ts'
import { applyBlast } from './explosion.ts'
import { metersPerSecondToMatter, metersToPixels } from '../config/physics.ts'
import { SPARK_TEXTURE, burst, coneBurst } from '../effects/particles.ts'
import { screenShake } from '../effects/juice.ts'
import { COMBAT } from '../config/combat.ts'

const BALL_RADIUS_M = 0.15
const CHARGED_RADIUS_M = 0.45
const CHARGE_MS = 2000
const BALL_MASS_KG = 0.5
const SPAWN_DISTANCE_M = 0.18
const MAX_FLIGHT_MS = 3000
const BLAST_RADIUS_M = 3
const BLAST_IMPULSE_NS = 250
const BLAST_SHAKE = 0.012
const FIRE_COLORS = [0xfff3a0, 0xff9a1f, 0xd6360b, 0x3a1a14]
const STEAM_COLORS = [0xffffff, 0xbfc9d1, 0x7f8a94]

interface Flight {
  readonly emitter: Phaser.GameObjects.Particles.ParticleEmitter
  readonly core: Phaser.GameObjects.Graphics
  readonly expiry: Phaser.Time.TimerEvent
  readonly radius: number
  readonly charge: number
  readonly damage: number
}

interface ChargeSpark {
  angle: number
  radius: number
  age: number
  life: number
}

interface Charge {
  elapsed: number
  progress: number
  nextSparkAt: number
  nextShakeAt: number
  emitter: Phaser.GameObjects.Particles.ParticleEmitter
  sparks: ChargeSpark[]
}

/** Feuerball ohne Gravitation (Magie), der beim ersten Treffer eine Druckwelle auslöst. */
export class FireballAttack implements Attack {
  readonly name = 'Feuerball'
  readonly cooldownMs = 450
  readonly energyJoules = 100

  private readonly scene: Phaser.Scene
  private readonly flights = new Map<MatterJS.BodyType, Flight>()
  private readonly getChargeOrigin: () => Phaser.Math.Vector2
  private readonly chargeView: Phaser.GameObjects.Graphics
  private readonly chargeText: Phaser.GameObjects.Text
  private readonly aim = new Phaser.Math.Vector2(1, 0)
  private charging?: Charge

  constructor(scene: Phaser.Scene, getChargeOrigin: () => Phaser.Math.Vector2) {
    this.scene = scene
    this.getChargeOrigin = getChargeOrigin
    this.chargeView = scene.add.graphics().setDepth(14).setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
    this.chargeText = scene.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#ffe3a0',
      backgroundColor: '#342016', padding: { x: 3, y: 2 },
    }).setOrigin(0.5, 1).setDepth(16).setVisible(false)
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.update, this)
    scene.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
  }

  get isCharging(): boolean { return this.charging !== undefined }

  get chargeProgress(): number | undefined { return this.charging?.progress }

  updateAim(_origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): void {
    if (direction.lengthSq() > 0) this.aim.copy(direction).normalize()
  }

  beginCharge(): boolean {
    if (this.charging) return false
    const emitter = this.scene.add.particles(0, 0, SPARK_TEXTURE, {
      lifespan: { min: 300, max: 650 }, speedX: { min: -18, max: 18 }, speedY: { min: -65, max: -25 },
      scale: { start: 0.75, end: 0 }, alpha: { start: 0.9, end: 0 },
      color: FIRE_COLORS, blendMode: 'ADD', frequency: 30, quantity: 2,
    }).setDepth(15)
    const origin = this.getChargeOrigin()
    emitter.setPosition(origin.x, origin.y)
    this.charging = { elapsed: 0, progress: 0, nextSparkAt: 0, nextShakeAt: 0, emitter, sparks: [] }
    return true
  }

  release(origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): boolean {
    if (!this.charging) return false
    const charge = this.charging.progress
    this.cancelCharge()
    this.updateAim(origin, direction)
    // Kein Anheben und keine zusätzliche Wartephase: dieselben 20 m/s wie beim kurzen Klick.
    this.launch(origin, this.aim, charge)
    coneBurst(this.scene, origin.x ?? 0, origin.y ?? 0, this.aim.angle(), 0.35,
      FIRE_COLORS, Math.round(12 + charge * 26), 250 + charge * 100)
    screenShake(this.scene, 0.002 + charge * 0.005, 100)
    return true
  }

  cancelCharge(): void {
    this.charging?.emitter.destroy()
    this.charging = undefined
    if (this.chargeView.scene) this.chargeView.clear().setVisible(false)
    if (this.chargeText.scene) this.chargeText.setVisible(false)
  }

  extinguish(body: MatterJS.BodyType): boolean {
    if (!this.flights.has(body)) return false
    this.fizzle(body)
    return true
  }

  execute(origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): boolean {
    if (this.charging) return false
    this.launch(origin, direction, 0)
    return true
  }

  private launch(origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2, charge: number): void {
    const spawnX = (origin.x ?? 0) + direction.x * metersToPixels(SPAWN_DISTANCE_M)
    const spawnY = (origin.y ?? 0) + direction.y * metersToPixels(SPAWN_DISTANCE_M)
    const radius = metersToPixels(Phaser.Math.Linear(BALL_RADIUS_M, CHARGED_RADIUS_M, charge))
    const body = this.scene.matter.add.circle(spawnX, spawnY, radius, {
      label: 'fireball',
      mass: BALL_MASS_KG,
      isSensor: true,
      ignoreGravity: true,
      frictionAir: 0,
    })

    const speedMs = Math.sqrt((2 * this.energyJoules) / BALL_MASS_KG)
    const speed = metersPerSecondToMatter(speedMs)
    this.scene.matter.body.setVelocity(body, { x: direction.x * speed, y: direction.y * speed })

    const emitter = this.scene.add.particles(0, 0, SPARK_TEXTURE, {
      follow: body.position,
      lifespan: { min: 200, max: 450 },
      speed: { min: 5, max: 30 },
      scale: { start: 2.2 + charge * 2.5, end: 0 },
      color: FIRE_COLORS,
      blendMode: 'ADD',
      frequency: 12,
      quantity: 2 + Math.round(charge * 3),
    })
    emitter.setDepth(15)

    const core = this.scene.add.graphics().setDepth(16).setBlendMode(Phaser.BlendModes.ADD)
    const expiry = this.scene.time.delayedCall(MAX_FLIGHT_MS, () => this.explode(body))
    const flight = { emitter, core, expiry, radius, charge, damage: Math.round(Phaser.Math.Linear(COMBAT.fireDamage, COMBAT.chargedFireDamage, charge)) }
    this.flights.set(body, flight)
    this.drawFlight(body, flight)
  }

  private update(_time: number, deltaMs: number): void {
    for (const [body, flight] of this.flights) this.drawFlight(body, flight)
    const charge = this.charging
    if (!charge) return
    const dt = Math.min(deltaMs, 50)
    const now = this.scene.time.now
    charge.elapsed = Math.min(CHARGE_MS, charge.elapsed + dt)
    charge.progress = charge.elapsed / CHARGE_MS
    const q = charge.progress
    const origin = this.getChargeOrigin()
    charge.emitter.setPosition(origin.x, origin.y)
    if (now >= charge.nextSparkAt) {
      for (let i = 0; i < 2 + Math.round(q * 2); i++) charge.sparks.push({
        angle: Phaser.Math.FloatBetween(0, Math.PI * 2), radius: Phaser.Math.FloatBetween(24, 42 + q * 15),
        age: 0, life: Phaser.Math.FloatBetween(400, 800),
      })
      charge.nextSparkAt = now + 45
    }
    const g = this.chargeView
    g.setVisible(true).clear()
    const radius = 3 + q * 9 + Math.sin(now * 0.027) * (0.3 + q * 0.8)
    g.fillStyle(0xff5d12, 0.08).fillCircle(origin.x, origin.y, radius * 2.8)
    g.fillStyle(0xff9d21, 0.18).fillCircle(origin.x, origin.y, radius * 1.6)
    for (let i = charge.sparks.length - 1; i >= 0; i--) {
      const spark = charge.sparks[i]
      spark.age += dt
      if (spark.age >= spark.life) { charge.sparks.splice(i, 1); continue }
      const t = spark.age / spark.life
      const angle = spark.angle + t * (2.5 + q * 2)
      const distance = spark.radius * (1 - t) ** 1.2
      const x = origin.x + Math.cos(angle) * distance
      const y = origin.y + Math.sin(angle) * distance * 0.75
      g.fillStyle(t > 0.65 ? 0xffed9e : 0xff7d1b, Math.min(1, t * 6)).fillRect(Math.round(x), Math.round(y), t > 0.7 ? 3 : 2, 2)
    }
    g.lineStyle(1, 0xffa536, 0.8)
    for (const offset of [0, Math.PI]) {
      const angle = now * 0.004 + offset
      g.beginPath().arc(origin.x, origin.y, radius + 5, angle, angle + 1.5).strokePath()
    }
    g.fillStyle(0xff7d1b, 0.9).fillCircle(origin.x, origin.y, radius)
    g.fillStyle(0xffd76d).fillCircle(origin.x, origin.y, radius * 0.66)
    g.fillStyle(0xfff4cc).fillCircle(origin.x - radius * 0.15, origin.y - radius * 0.15, radius * 0.3)
    g.lineStyle(2, 0xffda7b, 0.75).beginPath()
      .arc(origin.x, origin.y, radius + 10, -Math.PI / 2, -Math.PI / 2 + q * Math.PI * 2).strokePath()
    this.chargeText.setVisible(true).setPosition(origin.x, origin.y - radius - 17)
      .setText(q >= 1 ? 'MAX · LOSLASSEN' : `FEUER ${Math.floor(q * 100)}%`)
    if (q > 0.35 && now >= charge.nextShakeAt) {
      screenShake(this.scene, 0.0005 + q * 0.0015, 100)
      charge.nextShakeAt = now + 150
    }
  }

  private drawFlight(body: MatterJS.BodyType, flight: Flight): void {
    const g = flight.core
    const radius = flight.radius * (1 + Math.sin(this.scene.time.now * 0.035) * 0.08)
    g.setPosition(body.position.x, body.position.y).clear()
    g.fillStyle(0xff6a0e, 0.18).fillCircle(0, 0, radius * 1.7)
    g.fillStyle(0xffa120, 0.9).fillCircle(0, 0, radius)
    g.fillStyle(0xffe6a3).fillCircle(0, 0, radius * 0.6)
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.update, this)
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
    this.cancelCharge()
    for (const body of [...this.flights.keys()]) {
      this.remove(body)
    }
    this.chargeView.destroy()
    this.chargeText.destroy()
  }

  private onCollision(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    for (const pair of event.pairs) {
      this.checkHit(pair.bodyA.parent, pair.bodyB.parent)
      this.checkHit(pair.bodyB.parent, pair.bodyA.parent)
    }
  }

  private checkHit(candidate: MatterJS.BodyType, other: MatterJS.BodyType): void {
    if (!this.flights.has(candidate) || other.isSensor || other.label === 'player') {
      return
    }
    if (other.label === 'water') {
      this.fizzle(candidate)
      return
    }
    this.explode(candidate)
  }

  /** Wasser löscht den Feuerball: nur Dampf, keine Druckwelle. */
  private fizzle(body: MatterJS.BodyType): void {
    if (!this.flights.has(body)) {
      return
    }
    burst(this.scene, body.position.x, body.position.y, STEAM_COLORS, 25, 70)
    this.retire(body)
  }

  private explode(body: MatterJS.BodyType): void {
    const flight = this.flights.get(body)
    if (!flight) return
    const { x, y } = body.position
    burst(this.scene, x, y, FIRE_COLORS, Math.round(40 + flight.charge * 60), 160 + flight.charge * 100)
    applyBlast(this.scene, { x, y }, BLAST_RADIUS_M + flight.charge * 1.5,
      BLAST_IMPULSE_NS * (1 + flight.charge * 1.5), flight.damage)
    screenShake(this.scene, BLAST_SHAKE * (1 + flight.charge * 0.65), 160)
    this.retire(body)
  }

  /** Sofort aus der Verwaltung nehmen (verhindert Doppeltreffer), Körper erst nach dem Physikschritt löschen. */
  private retire(body: MatterJS.BodyType): void {
    const flight = this.flights.get(body)
    if (!flight) {
      return
    }
    this.flights.delete(body)
    flight.emitter.destroy()
    flight.core.destroy()
    flight.expiry.remove()
    this.scene.time.delayedCall(0, () => this.scene.matter.world?.remove(body))
  }

  private remove(body: MatterJS.BodyType): void {
    const flight = this.flights.get(body)
    if (!flight) {
      return
    }
    this.flights.delete(body)
    flight.emitter.destroy()
    flight.core.destroy()
    flight.expiry.remove()
    this.scene.matter.world?.remove(body)
  }
}
