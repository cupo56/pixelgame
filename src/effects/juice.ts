import type Phaser from 'phaser'
import { settings } from '../settings/Settings.ts'

const DEFAULT_SHAKE_MS = 120
const DEFAULT_SHAKE_INTENSITY = 0.01
const DEFAULT_HITSTOP_MS = 60

/** Kamerawackeln bei Treffern und Explosionen. */
export const screenShake = (
  scene: Phaser.Scene,
  intensity = DEFAULT_SHAKE_INTENSITY,
  durationMs = DEFAULT_SHAKE_MS,
): void => {
  if (settings.cameraShake) scene.cameras.main.shake(durationMs, intensity)
}

/** Kurzes Einfrieren der Physik für wuchtige Treffer. */
export const hitStop = (scene: Phaser.Scene, durationMs = DEFAULT_HITSTOP_MS): void => {
  const world = scene.matter.world
  world.pause()
  scene.time.delayedCall(durationMs, () => world.resume())
}
