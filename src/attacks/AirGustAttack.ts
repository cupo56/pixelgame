import type Phaser from 'phaser'
import type { Attack } from './Attack.ts'
import { metersPerSecondToMatter, metersToPixels } from '../config/physics.ts'
import { coneBurst } from '../effects/particles.ts'
import { screenShake } from '../effects/juice.ts'
import { damageEnemy } from '../combat/damage.ts'
import { COMBAT } from '../config/combat.ts'
import { AirTornadoAttack, type AirPose } from './AirTornadoAttack.ts'
import type { ReactionSystem } from '../materials/ReactionSystem.ts'

const RANGE_M = 7
const HALF_ANGLE_RAD = (35 * Math.PI) / 180
const IMPULSE_NS = 140
/** Rückstoß auf den Spieler (m/s): Windstoß nach unten gibt Auftrieb. */
const RECOIL_MS = 3
const GUST_SHAKE = 0.003
const WIND_COLORS = [0xffffff, 0xcfe9f2, 0x8fc4d6]
const STREAK_COUNT = 28
const STREAK_SPEED_PX = 420

/** Windstoß im Kegel: drückt bewegliche Körper in Zielrichtung und stößt den Spieler zurück. */
export class AirGustAttack implements Attack {
  readonly name = 'Windstoß'
  readonly cooldownMs = 700
  /** Nicht benutzt: Wind überträgt Impuls, keine Startenergie. */
  readonly energyJoules = 0

  private readonly scene: Phaser.Scene
  private readonly playerBody: MatterJS.BodyType
  private readonly system: ReactionSystem
  private readonly tornado: AirTornadoAttack

  constructor(scene: Phaser.Scene, playerBody: MatterJS.BodyType, system: ReactionSystem, getPose: () => AirPose) {
    this.scene = scene
    this.playerBody = playerBody
    this.system = system
    this.tornado = new AirTornadoAttack(scene, playerBody, getPose, system)
  }

  get isCharging(): boolean { return this.tornado.isCharging }
  get chargeProgress(): number | undefined { return this.tornado.chargeProgress }
  get chargedCooldownMs(): number { return this.tornado.cooldownMs }
  beginCharge(): boolean { return this.tornado.beginCharge() }
  cancelCharge(): void { this.tornado.cancelCharge() }
  cancel(): void { this.tornado.cancel() }
  updateAim(origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): void { this.tornado.updateAim(origin, direction) }
  release(origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): boolean { return this.tornado.release(origin, direction) }

  execute(origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): boolean {
    if (this.isCharging) return false
    const originX = origin.x ?? 0
    const originY = origin.y ?? 0
    this.pushBodies(originX, originY, direction)
    this.recoil(direction)
    coneBurst(
      this.scene,
      originX,
      originY,
      Math.atan2(direction.y, direction.x),
      HALF_ANGLE_RAD,
      WIND_COLORS,
      STREAK_COUNT,
      STREAK_SPEED_PX,
    )
    screenShake(this.scene, GUST_SHAKE, 80)
    return true
  }

  destroy(): void {
    this.tornado.destroy()
  }

  /** Δv = Impuls / Masse, nimmt mit der Entfernung linear ab. */
  private pushBodies(originX: number, originY: number, direction: Phaser.Math.Vector2): void {
    const rangePx = metersToPixels(RANGE_M)
    const minCos = Math.cos(HALF_ANGLE_RAD)
    for (const body of this.scene.matter.world.getAllBodies()) {
      if (body === this.playerBody) continue
      // Statische Körper und Sensoren sind nur als registrierte Stoffe (Pfützen, Feuerbälle) windempfindlich.
      if ((body.isStatic || body.isSensor) && !this.system.registry.get(body)) continue
      const dx = body.position.x - originX
      const dy = body.position.y - originY
      const distance = Math.hypot(dx, dy)
      if (distance === 0 || distance > rangePx) {
        continue
      }
      if ((dx * direction.x + dy * direction.y) / distance < minCos) {
        continue
      }
      const strength = 1 - distance / rangePx
      if (strength <= 0) continue
      if (this.system.applyWind(body, direction, strength, 'gust')) {
        // Ein heller Luftfächer am Stoff macht den zusätzlichen Schub sichtbar.
        coneBurst(this.scene, body.position.x, body.position.y, Math.atan2(direction.y, direction.x),
          HALF_ANGLE_RAD * 0.4, WIND_COLORS, 12, STREAK_SPEED_PX * 0.65)
        continue
      }
      if (body.isSensor) continue
      damageEnemy(body, Math.ceil(COMBAT.airDamage * strength))
      const deltaV = metersPerSecondToMatter((IMPULSE_NS * strength) / body.mass)
      this.scene.matter.body.setVelocity(body, {
        x: body.velocity.x + direction.x * deltaV,
        y: body.velocity.y + direction.y * deltaV,
      })
    }
  }

  private recoil(direction: Phaser.Math.Vector2): void {
    const deltaV = metersPerSecondToMatter(RECOIL_MS)
    this.scene.matter.body.setVelocity(this.playerBody, {
      x: this.playerBody.velocity.x - direction.x * deltaV,
      y: this.playerBody.velocity.y - direction.y * deltaV,
    })
  }
}
