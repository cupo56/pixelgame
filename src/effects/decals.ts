import Phaser from 'phaser'

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

/** Glatte Eisplatte mit hellen Kanten und feinen Rissen. */
export const drawIceSheet = (g: Phaser.GameObjects.Graphics, x: number, y: number, widthPx: number): void => {
  const half = Math.round(widthPx / 2)
  const left = Math.round(x) - half
  const top = Math.round(y) - 3
  g.clear()
  g.fillStyle(0x9edfff, 0.85).fillRect(left, top, half * 2, 3)
  g.fillStyle(0xe5fcff, 0.95).fillRect(left, top, half * 2, 1)
  g.lineStyle(1, 0x60a8d6, 0.9)
  for (let cx = left + 6; cx < left + half * 2 - 4; cx += 11) {
    g.lineBetween(cx, top + 1, cx + 3, top + 3)
  }
}

/** Unregelmäßiges Sechseck als Eisscherbe. */
export const drawIceShard = (g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number): void => {
  const points: Phaser.Math.Vector2[] = []
  for (let i = 0; i < 6; i++) {
    const a = angle + (i / 6) * Math.PI * 2
    const r = 2.6 + ((i * 7) % 3) * 0.6
    points.push(new Phaser.Math.Vector2(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r)))
  }
  g.clear()
  g.fillStyle(0xd8f6ff, 0.95).fillPoints(points, true)
  g.lineStyle(1, 0xffffff, 0.9).strokePoints(points, true)
}

/** Brandfleck auf Gelände; blendet über sechs Sekunden aus. */
export const scorchDecal = (scene: Phaser.Scene, x: number, y: number, radiusPx: number): void => {
  const g = scene.add.graphics().setDepth(4)
  g.fillStyle(0x15120f, 0.55).fillEllipse(Math.round(x), Math.round(y), radiusPx * 2, Math.max(3, radiusPx * 0.5))
  g.fillStyle(0x2a1d14, 0.5).fillEllipse(Math.round(x), Math.round(y), radiusPx * 1.3, Math.max(2, radiusPx * 0.3))
  for (let i = 0; i < 5; i++) {
    const px = x + (Math.random() - 0.5) * radiusPx * 2
    g.fillStyle(0x0d0b09, 0.6).fillRect(Math.round(px), Math.round(y - 1 + Math.random() * 2), 2, 1)
  }
  scene.tweens.add({ targets: g, alpha: 0, duration: 6000, onComplete: () => g.destroy() })
}
