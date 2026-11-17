import Phaser from 'phaser'
import type { Attack } from './Attack.ts'
import { REACTIONS as R } from '../config/reactions.ts'
import { metersToPixels } from '../config/physics.ts'
import { WaterWhipAttack, type WaterPose } from './WaterWhipAttack.ts'
import type { WaterMaterial } from '../materials/WaterMaterial.ts'
import type { ReactionSystem } from '../materials/ReactionSystem.ts'

const DROPLETS_PER_BURST = 5
const SPREAD_RAD = 0.1
const SPEED_JITTER = 0.1
const SPAWN_DISTANCE_M = 0.12

/** Kurzer Klick: echte Wassertropfen. Halten: Wasserpeitsche mit Eisfessel. */
export class WaterJetAttack implements Attack {
  readonly name = 'Wasserstrahl'
  readonly cooldownMs = 90
  /** Pro Tropfen; ergibt ca. 14 m/s Mündungsgeschwindigkeit. */
  readonly energyJoules = 15

  private readonly water: WaterMaterial
  private readonly whip: WaterWhipAttack

  constructor(scene: Phaser.Scene, water: WaterMaterial, getPose: () => WaterPose, system: ReactionSystem) {
    this.water = water
    this.whip = new WaterWhipAttack(scene, getPose, system)
  }

  get isCharging(): boolean { return this.whip.isCharging }
  get chargeProgress(): number | undefined { return this.whip.chargeProgress }
  get chargedCooldownMs(): number { return this.whip.cooldownMs }
  beginCharge(): boolean { return this.whip.beginCharge() }
  cancelCharge(): void { this.whip.cancelCharge() }
  cancel(): void { this.whip.cancel() }
  release(origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): boolean {
    return this.whip.release(origin, direction)
  }

  execute(origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): boolean {
    if (this.isCharging) return false
    const aim = Math.atan2(direction.y, direction.x)
    const baseSpeedMs = Math.sqrt((2 * this.energyJoules) / R.dropletMassKg)
    const distancePx = metersToPixels(SPAWN_DISTANCE_M)
    for (let i = 0; i < DROPLETS_PER_BURST; i++) {
      const angle = aim + Phaser.Math.FloatBetween(-SPREAD_RAD, SPREAD_RAD)
      const speedMs = baseSpeedMs * Phaser.Math.FloatBetween(1 - SPEED_JITTER, 1 + SPEED_JITTER)
      this.water.spawnDroplet((origin.x ?? 0) + Math.cos(angle) * distancePx, (origin.y ?? 0) + Math.sin(angle) * distancePx, angle, speedMs)
    }
    return true
  }

  destroy(): void {
    this.whip.destroy()
  }
}
