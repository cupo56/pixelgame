import type Phaser from 'phaser'
import { REACTIONS as R } from '../config/reactions.ts'
import { steam } from '../effects/particles.ts'

/** Dampfwolke für eine verdampfte Wassermasse; nur Partikel, kein Körper. */
export const steamCloud = (scene: Phaser.Scene, x: number, y: number, waterKg: number): void => {
  const count = Math.round(Math.min(40, 6 + 10 * Math.sqrt(waterKg / R.dropletMassKg)))
  steam(scene, x, y, count)
}
