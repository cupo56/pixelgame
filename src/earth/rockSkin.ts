import type Phaser from 'phaser'
import { mix } from '../materials/MetalMaterial.ts'
import { clipPolygonAbove, rockHash, rockOutline, type Pt } from './rockShape.ts'

export interface RockSkinOptions {
  /** Mittelpunkt, Drehwinkel (rad) und Kantenlänge in Pixeln. */
  x: number
  y: number
  angle: number
  sizePx: number
  /** Formgrad 0 (Erdbrocken) bis 1 (Felsen), siehe `rockStyle`. */
  style: number
  seed: number
  /** Nässe 0..1 (dunkler, glänzende Punkte) und Glut 0..1 (rot bis weißgelb). */
  wet: number
  glow: number
  /** Alles unterhalb dieser Linie wird nicht gezeichnet (Block steckt noch im Boden). */
  clipY?: number
}

const OUTLINE = 0x2e231a
const SOIL = { base: 0x6e4d31, light: 0x95733f, dark: 0x3d2b1c }
const STONE = { base: 0x7e7466, light: 0xb0a48e, dark: 0x4a4339 }
/** Licht von links oben (Weltkoordinaten): Flächen, die dorthin zeigen, werden heller. */
const LIGHT = { x: -0.6, y: -0.8 }

/** Farbe einer Fläche nach Nässe und Glut (gleiche Glutskala wie die frühere Einfarb-Darstellung). */
const tone = (color: number, wet: number, glow: number): number => {
  const damp = mix(color, 0x2f2419, wet * 0.5)
  if (glow <= 0) return damp
  return glow < 0.5 ? mix(damp, 0x7a1e0a, glow * 2) : mix(0xff8a1f, 0xffe28a, (glow - 0.5) * 2)
}

/**
 * Erdblock mit zwei Gesichtern: klein ein krümeliger Erdbrocken mit Grasschopf, groß ein zerklüfteter Felsen
 * mit Facetten, Rissen und Moos. Der Übergang folgt dem Formgrad stufenlos. Gezeichnet wird ein Polygon
 * (dreht sich mit dem Körper), das am Kollisionsquadrat bleibt.
 */
export const drawRockSkin = (g: Phaser.GameObjects.Graphics, o: RockSkinOptions): void => {
  const sin = Math.sin(o.angle), cos = Math.cos(o.angle)
  const world = (p: Pt): Pt => ({
    x: o.x + (p.x * cos - p.y * sin) * o.sizePx,
    y: o.y + (p.x * sin + p.y * cos) * o.sizePx,
  })
  const outline = rockOutline(o.seed, o.style).map(world)
  const base = tone(mix(SOIL.base, STONE.base, o.style), o.wet, o.glow)
  const light = tone(mix(SOIL.light, STONE.light, o.style), o.wet, o.glow)
  const dark = tone(mix(SOIL.dark, STONE.dark, o.style), o.wet, o.glow)
  const clip = (points: Pt[]): Pt[] => (o.clipY === undefined ? points : clipPolygonAbove(points, o.clipY))
  const visible = (p: Pt): boolean => o.clipY === undefined || p.y < o.clipY - 1
  const fillPoly = (points: Pt[], color: number, alpha = 1): void => {
    const poly = clip(points)
    if (poly.length >= 3) g.fillStyle(color, alpha).fillPoints(poly.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })) as unknown as Phaser.Math.Vector2[], true)
  }
  const rect = (p: Pt, w: number, h: number, color: number, alpha = 1): void => {
    if (visible(p)) g.fillStyle(color, alpha).fillRect(Math.round(p.x), Math.round(p.y), w, h)
  }

  fillPoly(outline, base)
  // Facetten: jedes Dreieck vom Zentrum nach außen wird nach der Lage zum Licht getönt.
  const center = { x: o.x, y: o.y }
  const strength = 0.16 + 0.34 * o.style
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length]
    const mx = (a.x + b.x) / 2 - o.x, my = (a.y + b.y) / 2 - o.y
    const len = Math.hypot(mx, my) || 1
    const shade = (mx / len) * LIGHT.x + (my / len) * LIGHT.y
    const target = shade > 0 ? light : dark
    fillPoly([center, a, b], mix(base, target, Math.min(1, Math.abs(shade) * strength * 2)))
  }
  g.lineStyle(1, OUTLINE, 0.95)
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length]
    if (visible(a) && visible(b)) g.lineBetween(Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y))
  }

  const local = (u: number, v: number): Pt => world({ x: u, y: v })
  // Krümel und Kiesel: bei Erde viele kleine, bei Fels wenige größere.
  const specks = 5 + Math.round(6 * (1 - o.style))
  for (let i = 0; i < specks; i++) {
    const p = local((rockHash(o.seed, 40 + i) - 0.5) * 0.62, (rockHash(o.seed, 80 + i) - 0.5) * 0.62)
    const big = o.style > 0.5 && i % 3 === 0 ? 2 : 1
    rect(p, big + 1, big, rockHash(o.seed, 120 + i) > 0.5 ? light : dark, 0.85)
  }
  if (o.style < 0.55) drawGrass(g, o, local, visible, 1 - o.style / 0.55)
  if (o.style > 0.3) drawCracks(g, o, local, visible, o.style)
  if (o.wet > 0.3) {
    for (let i = 0; i < 3; i++) {
      rect(local((rockHash(o.seed, 160 + i) - 0.5) * 0.6, (rockHash(o.seed, 170 + i) - 0.5) * 0.6), 2, 1, 0x8cc4ea, 0.85 * o.wet)
    }
  }
}

/** Grasbüschel an der Oberseite des Erdbrockens. */
const drawGrass = (
  g: Phaser.GameObjects.Graphics, o: RockSkinOptions, local: (u: number, v: number) => Pt,
  visible: (p: Pt) => boolean, weight: number,
): void => {
  if (o.glow > 0.2) return
  const tufts = 3 + Math.round(2 * weight)
  const up = { x: Math.sin(o.angle), y: -Math.cos(o.angle) }
  for (let i = 0; i < tufts; i++) {
    const base = local(-0.34 + (i / Math.max(1, tufts - 1)) * 0.68, -0.43 + rockHash(o.seed, 200 + i) * 0.05)
    if (!visible(base)) continue
    const height = (2 + rockHash(o.seed, 210 + i) * 3) * weight
    g.lineStyle(1, i % 2 === 0 ? 0x6fa04f : 0x4f7d3c, 0.95)
    g.lineBetween(Math.round(base.x), Math.round(base.y), Math.round(base.x + up.x * height), Math.round(base.y + up.y * height))
  }
}

/** Risse im Fels und etwas Moos auf der Oberseite. */
const drawCracks = (
  g: Phaser.GameObjects.Graphics, o: RockSkinOptions, local: (u: number, v: number) => Pt,
  visible: (p: Pt) => boolean, style: number,
): void => {
  g.lineStyle(1, OUTLINE, 0.7 * style)
  for (let c = 0; c < 2; c++) {
    let u = (rockHash(o.seed, 300 + c) - 0.5) * 0.6
    let v = -0.38
    for (let s = 0; s < 3; s++) {
      const nu = u + (rockHash(o.seed, 310 + c * 3 + s) - 0.5) * 0.25
      const nv = v + 0.12 + rockHash(o.seed, 330 + c * 3 + s) * 0.1
      const a = local(u, v), b = local(nu, nv)
      if (visible(a) && visible(b)) g.lineBetween(Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y))
      u = nu
      v = nv
    }
  }
  if (o.glow > 0.2) return
  for (let i = 0; i < 3; i++) {
    const p = local(-0.3 + i * 0.28 + rockHash(o.seed, 350 + i) * 0.08, -0.43 + rockHash(o.seed, 360 + i) * 0.04)
    if (visible(p)) g.fillStyle(0x6a8a52, 0.85 * style).fillRect(Math.round(p.x), Math.round(p.y), 3, 2)
  }
}
