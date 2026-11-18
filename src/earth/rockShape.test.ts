import { describe, expect, it } from 'vitest'
import { clipPolygonAbove, rockOutline, rockStyle } from './rockShape.ts'

describe('rockStyle', () => {
  it('0,5 m ist Erdbrocken, 1,5 m voller Felsen, dazwischen stufenlos', () => {
    expect(rockStyle(0.5)).toBe(0)
    expect(rockStyle(1.5)).toBe(1)
    expect(rockStyle(1)).toBeCloseTo(0.5)
    expect(rockStyle(0.1)).toBe(0)
    expect(rockStyle(4)).toBe(1)
  })
})

describe('rockOutline', () => {
  it('bleibt deterministisch und innerhalb des Kollisionsquadrats', () => {
    for (const style of [0, 0.5, 1]) {
      const a = rockOutline(42, style)
      expect(rockOutline(42, style)).toEqual(a)
      for (const p of a) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(0.5 + 1e-9)
        expect(Math.abs(p.y)).toBeLessThanOrEqual(0.5 + 1e-9)
      }
    }
  })

  it('der Felsen hat mehr Ecken und ist unregelmäßiger als der Erdbrocken', () => {
    const clod = rockOutline(7, 0), boulder = rockOutline(7, 1)
    expect(boulder.length).toBeGreaterThan(clod.length)
    const spread = (pts: { x: number; y: number }[]): number => {
      const r = pts.map((p) => Math.hypot(p.x, p.y))
      return Math.max(...r) - Math.min(...r)
    }
    expect(spread(boulder)).toBeGreaterThan(spread(clod))
  })

  it('verschiedene Startwerte geben verschiedene Formen', () => {
    expect(rockOutline(1, 1)).not.toEqual(rockOutline(2, 1))
  })
})

describe('clipPolygonAbove', () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
  it('lässt ein Polygon oberhalb der Linie unverändert', () => {
    expect(clipPolygonAbove(square, 20)).toEqual(square)
  })
  it('schneidet an der Linie ab', () => {
    const clipped = clipPolygonAbove(square, 4)
    expect(Math.max(...clipped.map((p) => p.y))).toBe(4)
    expect(clipped).toHaveLength(4)
  })
  it('liefert nichts, wenn alles unterhalb liegt', () => {
    expect(clipPolygonAbove(square, -1)).toEqual([])
  })
})
