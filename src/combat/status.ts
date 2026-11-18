import { COMBAT } from '../config/combat.ts'
import { COMBOS } from '../config/combos.ts'
import { freezeEnemy } from './damage.ts'

/**
 * Gegner-Zustände der Kombos: Nass und Kälte (Eisfessel kommt aus damage.ts).
 * Reine Logik ohne Phaser; die Zeit (ms) wird übergeben, damit sie ohne Szene prüfbar bleibt.
 */
type Body = MatterJS.BodyType
type Freeze = (body: Body, durationMs: number) => boolean

const wetUntil = new WeakMap<Body, number>()
const frostImmuneUntil = new WeakMap<Body, number>()

/** Teilkörper zusammengesetzter Körper verweisen über parent auf den Gegnerkörper. */
const owner = (body: Body): Body => body.parent ?? body

/** Macht einen Gegner nass; ein späterer Treffer erneuert, verkürzt aber nie eine laufende Nässe. */
export const applyWet = (body: Body, now: number, durationMs: number = COMBOS.wetMs): void => {
  const target = owner(body)
  wetUntil.set(target, Math.max(wetUntil.get(target) ?? -Infinity, now + durationMs))
}

export const isWet = (body: Body, now: number): boolean => now < (wetUntil.get(owner(body)) ?? -Infinity)

export const dry = (body: Body): void => {
  wetUntil.delete(owner(body))
}

/**
 * Kältetreffer (Windstoß, Wirbel, Eisscherbe). Fesselt nur nasse Gegner, nur ab `chillMinStrength`
 * und nur ohne Frostschutz. Dauer waterFreezeMs · (0,5 + 0,5 · Stärke); Nass wird dabei verbraucht.
 * Frostschutz gilt 3 s über das Ende der Fessel hinaus, damit niemand dauerhaft festfriert.
 * @returns true, wenn eine Eisfessel ausgelöst wurde.
 */
export const chillEnemy = (body: Body, strength: number, now: number, freeze: Freeze = freezeEnemy): boolean => {
  if (!Number.isFinite(strength) || strength < COMBOS.chillMinStrength) return false
  const target = owner(body)
  if (!isWet(target, now)) return false
  if (now < (frostImmuneUntil.get(target) ?? -Infinity)) return false
  const factor = COMBOS.chillFreezeMinFactor + (1 - COMBOS.chillFreezeMinFactor) * Math.min(1, strength)
  const durationMs = Math.round(COMBAT.waterFreezeMs * factor)
  if (!freeze(target, durationMs)) return false
  wetUntil.delete(target)
  frostImmuneUntil.set(target, now + durationMs + COMBOS.frostImmunityMs)
  return true
}
