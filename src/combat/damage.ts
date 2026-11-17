import type { ElementId } from '../config/elements.ts'
import { COMBAT } from '../config/combat.ts'
import { progression } from '../progression/Progression.ts'

type DamageReceiver = (amount: number) => boolean
type FreezeReceiver = (durationMs: number) => boolean
const enemies = new WeakMap<MatterJS.BodyType, { damage: DamageReceiver; freeze?: FreezeReceiver; wind?: FreezeReceiver; remainingXP: number }>()

export const registerEnemy = (body: MatterJS.BodyType, receive: DamageReceiver, freeze?: FreezeReceiver, wind?: FreezeReceiver): void => {
  enemies.set(body, { damage: receive, freeze, wind, remainingXP: COMBAT.enemyHealth })
}
export const unregisterEnemy = (body: MatterJS.BodyType): void => { enemies.delete(body) }

/** Elementangriffe treffen nur registrierte, noch lebende Gegner. */
export const damageEnemy = (body: MatterJS.BodyType, amount: number, element?: ElementId): boolean => {
  const receiver = enemies.get(body.parent ?? body)
  if (!receiver || !Number.isFinite(amount) || amount <= 0) return false
  const damage = element ? Math.max(1, Math.round(amount * progression.damageMultiplier(element))) : amount
  if (!receiver.damage(damage)) return false
  // Ein Gegner gibt insgesamt höchstens seine Start-LP als EP ab, auch bei
  // Überkill, vielen Tropfen, mehreren Elementen oder wiederholten Materialkontakten.
  const experience = Math.min(receiver.remainingXP, damage)
  receiver.remainingXP -= experience
  if (element) progression.awardExperience(element, experience)
  return true
}

/** Eisfesseln wirken nur auf registrierte Gegner und verändern ihre Kollisionskörper nicht. */
export const freezeEnemy = (body: MatterJS.BodyType, durationMs: number): boolean =>
  enemies.get(body.parent ?? body)?.freeze?.(durationMs) ?? false

export const isEnemy = (body: MatterJS.BodyType): boolean => enemies.has(body.parent ?? body)

/** Pausiert die eigene Flugsteuerung, während ein Windfeld den Körper bewegt. */
export const holdEnemyInWind = (body: MatterJS.BodyType, durationMs: number): boolean =>
  enemies.get(body.parent ?? body)?.wind?.(durationMs) ?? false
