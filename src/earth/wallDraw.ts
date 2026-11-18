import type Phaser from 'phaser'
import { mix } from '../materials/MetalMaterial.ts'

export interface WallDrawOptions {
  /** Mittelpunkt der Mauer (x) und Bodenlinie (y); unterhalb der Bodenlinie wird nichts gezeichnet. */
  x: number
  groundY: number
  widthPx: number
  /** Sichtbare Höhe über der Bodenlinie. */
  heightPx: number
  /** Höhe einer Steinlage in Pixeln. */
  courseHPx: number
  /** Zittern 0..1 (beim Aufsteigen). */
  tremor: number
  /** Versinken 0..1: schiebt die ganze Mauer nach unten in den Boden. */
  sink: number
  /** Haltbarkeit 0..1, steuert Risse und Ausbrüche. */
  health: number
  /** Grundfarbe der Erde (Nässe/Glut kommen über diese Farbe). */
  color: number
  seconds: number
}

const MORTAR = 0x3d3329
const LIGHT = 0xf0d9a8
const DARK = 0x2b241c

/** Deterministischer Streuwert 0..1 aus zwei Ganzzahlen, damit die Steine nicht flackern. */
const hash = (a: number, b: number): number => {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return n - Math.floor(n)
}

/** Stein-Grenzen je Lage im Läuferverband: gerade Lagen halbiert, ungerade mit Halbsteinen an den Rändern. */
const bonds = (course: number): number[] => (course % 2 === 0 ? [0, 0.5, 1] : [0, 0.25, 0.75, 1])

/**
 * Mauerwerk aus versetzten Steinlagen. Das Muster hängt starr an der Oberkante und wird an der Bodenlinie
 * abgeschnitten: wächst die Höhe, schiebt sich das ganze Mauerwerk aus dem Boden.
 */
export const drawWall = (g: Phaser.GameObjects.Graphics, o: WallDrawOptions): void => {
  g.clear()
  const courseH = o.courseHPx
  const left = o.x - o.widthPx / 2
  const clipY = o.groundY
  const fill = (x: number, y: number, w: number, h: number, color: number, alpha = 1): void => {
    const bottom = Math.min(y + h, clipY)
    if (bottom <= y || w <= 0) return
    g.fillStyle(color, alpha).fillRect(Math.round(x), Math.round(y), Math.round(w), Math.max(1, Math.round(bottom - y)))
  }
  const wallTop = o.groundY - o.heightPx + o.sink * o.heightPx
  for (let i = 0; wallTop + i * courseH < clipY; i++) {
    const topY = wallTop + i * courseH
    const bottomY = topY + courseH
    const wobble = o.tremor > 0 ? Math.sin(o.seconds * 55 + i * 2.3) * 1.2 * o.tremor : 0
    const edges = bonds(i)
    for (let k = 0; k < edges.length - 1; k++) {
      const x0 = left + edges[k] * o.widthPx + wobble
      const w = (edges[k + 1] - edges[k]) * o.widthPx
      const tone = hash(i, k)
      const base = mix(o.color, tone > 0.5 ? LIGHT : DARK, 0.06 + tone * 0.1)
      // Oberste Lage: unregelmäßige Oberkante wie bei einer gewachsenen Mauer.
      const notch = i === 0 ? Math.round(hash(k, 7) * 3) : 0
      const top = topY + notch
      fill(x0, top, w, bottomY - top, MORTAR)
      fill(x0 + 1, top + 1, w - 2, bottomY - top - 2, base)
      fill(x0 + 1, top + 1, w - 2, 2, mix(base, LIGHT, 0.35))
      fill(x0 + 1, bottomY - 3, w - 2, 2, mix(base, DARK, 0.4))
      fill(x0 + w - 3, top + 1, 2, bottomY - top - 2, mix(base, DARK, 0.18))
      // Kleine Maserung je Stein.
      fill(x0 + 4 + hash(k, i) * (w - 12), top + 5 + hash(i, k + 3) * (courseH - 12), 4, 1, mix(base, DARK, 0.3))
    }
  }
  drawDamage(g, o, courseH, left, clipY)
}

/** Risse und Ausbrüche wachsen mit dem Schaden; Linien enden an der Bodenlinie. */
const drawDamage = (g: Phaser.GameObjects.Graphics, o: WallDrawOptions, courseH: number, left: number, clipY: number): void => {
  const damage = 1 - Math.max(0, Math.min(1, o.health))
  if (damage <= 0.02 || o.tremor > 0) return
  const cracks = Math.floor(damage * 7) + 1
  g.lineStyle(1, DARK, 0.9)
  for (let c = 0; c < cracks; c++) {
    let x = left + hash(c, 1) * o.widthPx
    let y = o.groundY - o.heightPx * (0.25 + hash(c, 2) * 0.7) + o.sink * o.heightPx
    for (let s = 0; s < 3; s++) {
      const nx = x + (hash(c, s + 5) - 0.5) * 10
      const ny = y + 4 + hash(c, s + 9) * 7
      if (y < clipY && ny < clipY) g.lineBetween(Math.round(x), Math.round(y), Math.round(nx), Math.round(ny))
      x = nx
      y = ny
    }
  }
  // Ausbrüche: dunkle Vertiefungen, wo Steine abgeplatzt sind.
  const chips = Math.floor(Math.max(0, damage - 0.4) * 10)
  for (let c = 0; c < chips; c++) {
    const x = left + 2 + hash(c, 21) * (o.widthPx - 10)
    const y = o.groundY - o.heightPx + o.sink * o.heightPx + hash(c, 22) * (o.heightPx - courseH) + 2
    if (y + 4 < clipY) g.fillStyle(MORTAR, 0.95).fillRect(Math.round(x), Math.round(y), 5, 4)
  }
}
