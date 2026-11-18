import { COMBOS } from '../config/combos.ts'

/** Reine Rechnung des Feuerwirbels (Feuerball im Wirbel); ohne Phaser prüfbar. */

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/** Wärmeinhalt Q (J) nach `elapsedMs`: sinkt linear von `q0J` auf 0 über die Restdauer des Wirbels. */
export const vortexHeatJ = (q0J: number, elapsedMs: number, durationMs: number): number => {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(durationMs) || durationMs <= 0) return 0
  return Math.max(0, q0J * (1 - Math.max(0, elapsedMs) / durationMs))
}

/** Flammenschaden je Tick: 2 bis 6 nach dem Q-Anteil (q gegenüber dem Start-Q). */
export const vortexTickDamage = (qJ: number, q0J: number): number => {
  const fraction = q0J > 0 ? clamp01(qJ / q0J) : 0
  return Math.round(COMBOS.fireVortexDamageMin + (COMBOS.fireVortexDamageMax - COMBOS.fireVortexDamageMin) * fraction)
}

/** Wärme, die jeder gefangene Block je Tick erhält: ein Bruchteil des aktuellen Q. */
export const vortexRockHeatJ = (qJ: number): number => Math.max(0, qJ) * COMBOS.fireVortexRockHeatFraction
