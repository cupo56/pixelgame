import type Phaser from 'phaser'
import type { Attack } from './Attack.ts'
import { METAL } from '../config/metal.ts'
import type { MetalBending } from '../metal/MetalBending.ts'

/** Metall: kurzer Klick bändigt Klumpen zur Rüstung; gehaltener Klick (mit Rüstung) lädt die Spitzen-Sphäre. */
export class MetalAttack implements Attack {
  readonly name = 'Metallbändigen'
  readonly cooldownMs = METAL.cooldownMs
  /** Nicht benutzt: Metall überträgt keine Startenergie aus der Hand. */
  readonly energyJoules = 0

  private readonly bending: MetalBending

  constructor(bending: MetalBending) {
    this.bending = bending
  }

  get isCharging(): boolean { return false }
  get chargeProgress(): number | undefined { return undefined }
  get chargedCooldownMs(): number { return METAL.cooldownMs }
  beginCharge(): boolean { return false }
  cancelCharge(): void {}
  release(_origin: Phaser.Types.Math.Vector2Like, _direction: Phaser.Math.Vector2): boolean { return false }

  execute(): boolean {
    return this.bending.begin()
  }

  /** Abbruch durch Elementwechsel, Fokusverlust oder Teleport. */
  cancel(): void {
    this.bending.cancel()
  }

  destroy(): void {
    this.bending.destroy()
  }
}
