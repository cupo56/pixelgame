import Phaser from 'phaser'
import type { Attack } from './Attack.ts'
import { SPARK_TEXTURE, coneBurst } from '../effects/particles.ts'
import { screenShake } from '../effects/juice.ts'
import { FIRE_COLORS, type FireMaterial } from '../materials/FireMaterial.ts'
import { fireHeatForCharge } from '../materials/thermo.ts'

const CHARGE_MS = 2000

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

/** Zielt und lädt auf; den Feuerball selbst verwaltet FireMaterial. */
export class FireballAttack implements Attack {
  readonly name = 'Feuerball'
  readonly cooldownMs = 450
  readonly energyJoules = 100

  private readonly scene: Phaser.Scene
  private readonly fire: FireMaterial
  private readonly getChargeOrigin: () => Phaser.Math.Vector2
  private readonly chargeView: Phaser.GameObjects.Graphics
  private readonly chargeText: Phaser.GameObjects.Text
  private readonly aim = new Phaser.Math.Vector2(1, 0)
  private charging?: Charge

  constructor(scene: Phaser.Scene, fire: FireMaterial, getChargeOrigin: () => Phaser.Math.Vector2) {
    this.scene = scene
    this.fire = fire
    this.getChargeOrigin = getChargeOrigin
    this.chargeView = scene.add.graphics().setDepth(14).setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
    this.chargeText = scene.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#ffe3a0',
      backgroundColor: '#342016', padding: { x: 3, y: 2 },
    }).setOrigin(0.5, 1).setDepth(16).setVisible(false)
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.update, this)
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
    this.fire.spawn(origin, this.aim, fireHeatForCharge(charge))
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

  execute(origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): boolean {
    if (this.charging) return false
    return this.fire.spawn(origin, direction, fireHeatForCharge(0)) !== undefined
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.update, this)
    this.cancelCharge()
    this.chargeView.destroy()
    this.chargeText.destroy()
  }

  private update(_time: number, deltaMs: number): void {
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
}
