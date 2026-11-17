type DamageReceiver = (amount: number) => boolean
type FreezeReceiver = (durationMs: number) => boolean
const enemies = new WeakMap<MatterJS.BodyType, { damage: DamageReceiver; freeze?: FreezeReceiver; wind?: FreezeReceiver }>()

export const registerEnemy = (body: MatterJS.BodyType, receive: DamageReceiver, freeze?: FreezeReceiver, wind?: FreezeReceiver): void => {
  enemies.set(body, { damage: receive, freeze, wind })
}
export const unregisterEnemy = (body: MatterJS.BodyType): void => { enemies.delete(body) }

/** Elementangriffe treffen nur registrierte, noch lebende Gegner. */
export const damageEnemy = (body: MatterJS.BodyType, amount: number): boolean =>
  enemies.get(body.parent ?? body)?.damage(amount) ?? false

/** Eisfesseln wirken nur auf registrierte Gegner und verändern ihre Kollisionskörper nicht. */
export const freezeEnemy = (body: MatterJS.BodyType, durationMs: number): boolean =>
  enemies.get(body.parent ?? body)?.freeze?.(durationMs) ?? false

export const isEnemy = (body: MatterJS.BodyType): boolean => enemies.has(body.parent ?? body)

/** Pausiert die eigene Flugsteuerung, während ein Windfeld den Körper bewegt. */
export const holdEnemyInWind = (body: MatterJS.BodyType, durationMs: number): boolean =>
  enemies.get(body.parent ?? body)?.wind?.(durationMs) ?? false
