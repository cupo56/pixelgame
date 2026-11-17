import type Phaser from 'phaser'

/** Gemeinsame Schnittstelle aller Attacken; Werte in SI-Einheiten. */
export interface Attack {
  readonly name: string
  readonly cooldownMs: number
  /** Kinetische Startenergie in Joule; daraus folgt die Startgeschwindigkeit. */
  readonly energyJoules: number
  /** `direction` ist normiert. */
  execute(origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): void
  destroy(): void
}
