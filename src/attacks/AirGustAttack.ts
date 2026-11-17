import type Phaser from 'phaser'
import type { Attack } from './Attack.ts'
import { metersPerSecondToMatter, metersToPixels } from '../config/physics.ts'
import { coneBurst } from '../effects/particles.ts'
import { screenShake } from '../effects/juice.ts'

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

  constructor(scene: Phaser.Scene, playerBody: MatterJS.BodyType) {
    this.scene = scene
    this.playerBody = playerBody
  }

  execute(origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): void {
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
  }

  destroy(): void {
    // Keine Listener oder Spielobjekte zu entfernen.
  }

  /** Δv = Impuls / Masse, nimmt mit der Entfernung linear ab. */
  private pushBodies(originX: number, originY: number, direction: Phaser.Math.Vector2): void {
    const rangePx = metersToPixels(RANGE_M)
    const minCos = Math.cos(HALF_ANGLE_RAD)
    for (const body of this.scene.matter.world.getAllBodies()) {
      if (body.isStatic || body.isSensor || body === this.playerBody) {
        continue
      }
      const dx = body.position.x - originX
      const dy = body.position.y - originY
      const distance = Math.hypot(dx, dy)
      if (distance === 0 || distance > rangePx) {
        continue
      }
      if ((dx * direction.x + dy * direction.y) / distance < minCos) {
        continue
      }
      const deltaV = metersPerSecondToMatter((IMPULSE_NS * (1 - distance / rangePx)) / body.mass)
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
