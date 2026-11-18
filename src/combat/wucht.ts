import { COMBOS } from '../config/combos.ts'

/**
 * Schaden aus der Wucht (kinetische Energie ½·m·v²). Der bisherige Festwert bleibt
 * Untergrenze, damit kein Angriff schwächer wird; `wuchtDamageCap` ist die Obergrenze
 * (ein höherer Festwert bleibt unverändert). Ungültige Eingaben ergeben den Festwert.
 */
export const wuchtDamage = (massKg: number, speedMs: number, floor: number): number => {
  if (!Number.isFinite(massKg) || !Number.isFinite(speedMs) || massKg <= 0 || speedMs <= 0) return floor
  const energyJ = 0.5 * massKg * speedMs ** 2
  const fromEnergy = Math.round(energyJ / COMBOS.wuchtJoulesPerHp)
  return Math.max(floor, Math.min(COMBOS.wuchtDamageCap, fromEnergy))
}

/**
 * Windschub in m/s auf einen Block: schwere Blöcke bekommen weniger, aber nur schwach abnehmend.
 * Bezogen auf den 0,5-m-Referenzblock (225 kg), skaliert mit der Windstärke (0 bis 1).
 */
export const airBoostSpeedMs = (massKg: number, strength: number): number => {
  if (!Number.isFinite(massKg) || !Number.isFinite(strength) || massKg <= 0 || strength <= 0) return 0
  return COMBOS.airBoostMs * (COMBOS.airReferenceMassKg / massKg) ** COMBOS.airMassExponent * strength
}
