import Phaser from 'phaser'
import { hitStop } from './juice.ts'

const IMPACT_RING_FROM_PX = 12
const IMPACT_RING_TO_PX = 24
const IMPACT_RING_MS = 160

let hitStopUntil = 0

/** Weißer Blitz für zwei Frames (additiv). */
export const flash = (scene: Phaser.Scene, x: number, y: number, radiusPx: number, durationMs = 34): void => {
  const g = scene.add.graphics().setDepth(19).setBlendMode(Phaser.BlendModes.ADD)
  g.fillStyle(0xffffff, 0.95).fillCircle(Math.round(x), Math.round(y), radiusPx)
  scene.time.delayedCall(durationMs, () => g.destroy())
}

/** Expandierender Ring, der dünner und blasser wird. */
export const shockwaveRing = (scene: Phaser.Scene, x: number, y: number, fromPx: number, toPx: number, durationMs: number, color: number): void => {
  const g = scene.add.graphics().setDepth(19)
  const state = { t: 0 }
  scene.tweens.add({
    targets: state, t: 1, duration: durationMs,
    onUpdate: () => {
      const radius = Phaser.Math.Linear(fromPx, toPx, state.t)
      g.clear().lineStyle(Math.max(1, Math.round(3 * (1 - state.t))), color, 1 - state.t).strokeCircle(Math.round(x), Math.round(y), radius)
    },
    onComplete: () => g.destroy(),
  })
}

/** Aufprallring in Elementfarbe bei jedem Treffer gegen Gegner. */
export const impactRing = (scene: Phaser.Scene, x: number, y: number, color: number): void => {
  shockwaveRing(scene, x, y, IMPACT_RING_FROM_PX, IMPACT_RING_TO_PX, IMPACT_RING_MS, color)
}

/** Hitstop für wuchtige Treffer; während einer läuft, wird kein zweiter gestartet. */
export const hitStopOnce = (scene: Phaser.Scene, durationMs: number): void => {
  const now = scene.time.now
  if (now < hitStopUntil) return
  hitStopUntil = now + durationMs
  hitStop(scene, durationMs)
}
