import type Phaser from 'phaser'
import type { Attack } from './Attack.ts'
import { METAL } from '../config/metal.ts'
import type { MetalBending } from '../metal/MetalBending.ts'
import type { SpikeSphere } from '../metal/SpikeSphere.ts'

/** Metall: kurzer Klick bändigt Klumpen zur Rüstung; gehaltener Klick (mit Rüstung) lädt die Spitzen-Sphäre. */
export class MetalAttack implements Attack {
  readonly name = 'Metallbändigen'
  readonly cooldownMs = METAL.cooldownMs
  /** Nicht benutzt: Metall überträgt keine Startenergie aus der Hand. */
  readonly energyJoules = 0

  private readonly bending: MetalBending
  private readonly sphere: SpikeSphere

  constructor(bending: MetalBending, sphere: SpikeSphere) {
    this.bending = bending
    this.sphere = sphere
  }

  get isCharging(): boolean { return this.sphere.isCharging }
  get chargeProgress(): number | undefined { return this.sphere.chargeProgress }
  get chargedCooldownMs(): number { return METAL.cooldownMs }
  /** Nur mit angelegter Rüstung und ohne laufendes Bändigen. */
  beginCharge(): boolean { return !this.bending.active && this.sphere.beginCharge() }
  cancelCharge(): void { this.sphere.cancelCharge() }
  release(_origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): boolean {
    return this.sphere.release(Math.atan2(direction.y, direction.x))
  }

  /** Teleport: kreisende Spitzen reisen mit, ein laufendes Bändigen bricht ab. */
  teleport(dx: number, dy: number): void {
    this.bending.cancel()
    this.sphere.shift(dx, dy)
  }

  anchorsRefreshed(): void { this.sphere.anchorsRefreshed() }

  execute(): boolean {
    return this.bending.begin()
  }

  /** Abbruch durch Elementwechsel oder Fokusverlust: Bändigen und Laden enden. */
  cancel(): void {
    this.bending.cancel()
    this.sphere.cancelCharge()
  }

  destroy(): void {
    this.bending.destroy()
    this.sphere.destroy()
  }
}
