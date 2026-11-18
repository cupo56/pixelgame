import { describe, expect, it } from 'vitest'
import { pruneTrail } from './trailMath.ts'

describe('pruneTrail', () => {
  it('verwirft Punkte, die älter als die Lebensdauer sind', () => {
    const points = [{ x: 0, y: 0, at: 0 }, { x: 1, y: 0, at: 100 }, { x: 2, y: 0, at: 200 }]
    expect(pruneTrail(points, 250, 120).map((p) => p.x)).toEqual([2])
  })
  it('begrenzt die Länge auf die neuesten Punkte', () => {
    const points = Array.from({ length: 30 }, (_, i) => ({ x: i, y: 0, at: 1000 }))
    const kept = pruneTrail(points, 1000, 500, 12)
    expect(kept).toHaveLength(12)
    expect(kept[0].x).toBe(18)
  })
})
