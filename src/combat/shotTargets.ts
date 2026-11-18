/** Körper, die Gegner-Geschosse auffangen (z. B. die Steinmauer); der Empfänger zieht den Schaden ab. */
type ShotReceiver = (damage: number) => void

const targets = new WeakMap<MatterJS.BodyType, ShotReceiver>()

export const registerShotTarget = (body: MatterJS.BodyType, receive: ShotReceiver): void => { targets.set(body, receive) }
export const unregisterShotTarget = (body: MatterJS.BodyType): void => { targets.delete(body) }
export const shotTarget = (body: MatterJS.BodyType): ShotReceiver | undefined => targets.get(body.parent ?? body)
