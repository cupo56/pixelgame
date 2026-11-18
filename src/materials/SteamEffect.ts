import type Phaser from 'phaser'
import { REACTIONS as R } from '../config/reactions.ts'
import { dry, isWet } from '../combat/status.ts'
import { steam } from '../effects/particles.ts'

/** Hitze trocknet einen nassen Gegner und lässt ihn dampfen (kein Bonusschaden). true, wenn er nass war. */
export const steamOffEnemy = (scene: Phaser.Scene, enemy: MatterJS.BodyType): boolean => {
  if (!isWet(enemy, scene.time.now)) return false
  dry(enemy)
  steam(scene, enemy.position.x, enemy.position.y, 10)
  return true
}

/** Dampfwolke für eine verdampfte Wassermasse; nur Partikel, kein Körper. */
export const steamCloud = (scene: Phaser.Scene, x: number, y: number, waterKg: number): void => {
  const count = Math.round(Math.min(40, 6 + 10 * Math.sqrt(waterKg / R.dropletMassKg)))
  steam(scene, x, y, count)
}
