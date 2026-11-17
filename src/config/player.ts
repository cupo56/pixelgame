import { GRAVITY_MS2 } from './physics.ts'

/** Spielerwerte in SI-Einheiten (m, s, kg). */
export const PLAYER = {
  heightM: 1.8,
  widthM: 0.5,
  massKg: 80,
  /** Höchstgeschwindigkeit beim Rennen (m/s). */
  maxSpeedMs: 6,
  walkSpeedMs: 2.2,
  /** Beschleunigung am Boden (m/s²): ~0,75 s bis zur Höchstgeschwindigkeit. */
  groundAccelMs2: 14,
  /** Haftreibung beim Stoppen: Reibwert 0,8 * g (m/s²). */
  stopDecelMs2: 1.5 * GRAVITY_MS2,
  /** Luftsteuerung ist schwach, Impuls bleibt erhalten (m/s²). */
  airAccelMs2: 4,
  /** Sprunghöhe (m); Absprunggeschwindigkeit folgt aus v = sqrt(2*g*h). */
  jumpHeightM: 0.95,
  coyoteSeconds: 0.09,
  jumpBufferSeconds: 0.12,
  /** Gleiten (Luft): maximale Fallgeschwindigkeit (m/s) und Abbremsung dorthin (m/s²). */
  glideFallSpeedMs: 1.5,
  glideDecelMs2: 25,
  /** Länge eines Doppelschritts (m), steuert die Beinanimation. */
  strideM: 1.6,
} as const

export const JUMP_SPEED_MS = Math.sqrt(2 * GRAVITY_MS2 * PLAYER.jumpHeightM)
