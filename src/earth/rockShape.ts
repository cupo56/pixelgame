/** Reine Geometrie der Erdblock-Optik (ohne Phaser): Umriss, Schnitt an der Bodenlinie, Formgrad. */

export interface Pt {
  x: number
  y: number
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/** Deterministischer Streuwert 0..1 aus zwei Zahlen, damit Steine nicht flackern. */
export const rockHash = (a: number, b: number): number => {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return n - Math.floor(n)
}

/** Formgrad 0 (weicher Erdbrocken) bis 1 (riesiger Felsen) aus der Kantenlänge: 0,5 m bis 1,5 m. */
export const rockStyle = (edgeM: number): number => clamp01((edgeM - 0.5) / 1)

/**
 * Umriss in Einheitskoordinaten (−0,5 bis 0,5): abgerundetes Quadrat, das mit dem Formgrad zackiger wird.
 * Die Punkte bleiben innerhalb des Kollisionsquadrats, die Optik ragt nie darüber hinaus.
 */
export const rockOutline = (seed: number, style: number): Pt[] => {
  const s = clamp01(style)
  const count = 10 + Math.round(8 * s)
  const jitter = 0.04 + 0.2 * s
  const points: Pt[] = []
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * Math.PI * 2
    const c = Math.cos(theta), sn = Math.sin(theta)
    // Überelliptisches Quadrat (Exponent 5): fast eckig, aber mit weichen Ecken.
    const px = Math.sign(c) * Math.abs(c) ** (2 / 5)
    const py = Math.sign(sn) * Math.abs(sn) ** (2 / 5)
    // Zacken: jeder zweite Punkt tiefer eingezogen; Streuung nur nach innen.
    const notch = i % 2 === 1 ? 0.06 * s : 0
    const inset = 1 - jitter * rockHash(seed, i) - notch
    points.push({ x: px * 0.5 * inset, y: py * 0.5 * inset })
  }
  return points
}

/** Schneidet ein Polygon an einer Waagerechten ab: bleibt, was oberhalb von `clipY` liegt (Sutherland-Hodgman). */
export const clipPolygonAbove = (points: readonly Pt[], clipY: number): Pt[] => {
  const out: Pt[] = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const aIn = a.y <= clipY
    const bIn = b.y <= clipY
    if (aIn) out.push(a)
    if (aIn !== bIn) {
      const t = (clipY - a.y) / (b.y - a.y)
      out.push({ x: a.x + (b.x - a.x) * t, y: clipY })
    }
  }
  return out
}
