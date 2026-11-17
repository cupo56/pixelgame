import type Phaser from 'phaser'

const FADE_MS = 500

/** Blendet eine Grafik aus und zerstört sie danach. */
export const fadeOut = (scene: Phaser.Scene, view: Phaser.GameObjects.Graphics, durationMs = FADE_MS): void => {
  scene.tweens.add({ targets: view, alpha: 0, duration: durationMs, onComplete: () => view.destroy() })
}

/** Flacher Wasserfilm mit welliger Glanzlinie; wird bei Größenänderung und für das Glitzern neu gezeichnet. */
export const drawPuddle = (g: Phaser.GameObjects.Graphics, x: number, y: number, widthPx: number, timeMs: number): void => {
  const half = Math.round(widthPx / 2)
  g.clear()
  g.fillStyle(0x1b6fc2, 0.55).fillRect(Math.round(x) - half, Math.round(y) - 2, half * 2, 3)
  g.fillStyle(0x3fa7ff, 0.7).fillRect(Math.round(x) - half + 1, Math.round(y) - 2, half * 2 - 2, 2)
  // Glanzpunkte wandern langsam über die Oberfläche.
  for (let i = 0; i < Math.max(1, Math.floor(widthPx / 14)); i++) {
    const t = ((timeMs * 0.0004 + i * 0.37) % 1)
    g.fillStyle(0xdffbff, 0.85).fillRect(Math.round(x - half + 2 + t * (half * 2 - 5)), Math.round(y) - 2, 2, 1)
  }
}
