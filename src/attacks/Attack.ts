import type Phaser from 'phaser'

/** Gemeinsame Schnittstelle aller Attacken; Werte in SI-Einheiten. */
export interface Attack {
  readonly name: string
  readonly cooldownMs: number
  /** Kinetische Startenergie in Joule; daraus folgt die Startgeschwindigkeit. */
  readonly energyJoules: number
  /** Aktualisiert die Zielhand auch während vorbereiteter Angriffe. */
  updateAim?(origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): void
  /** `direction` ist normiert; false lehnt den Angriff ohne Abklingzeit ab. */
  execute(origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): void | boolean
  destroy(): void
}
