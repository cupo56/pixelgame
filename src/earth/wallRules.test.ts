import { describe, expect, it } from 'vitest'
import {
  clampThrowDirection, nextShotDelayMs, wallEquivalentEdgeM, wallGrowthProgress, wallHeightAt, wallMassKg,
  wallPlacementX, wallTakeDamage,
} from './wallRules.ts'

describe('Wachsen', () => {
  it('Fortschritt läuft von 0 bis 1 und ist geklemmt', () => {
    expect(wallGrowthProgress(0, 600)).toBe(0)
    expect(wallGrowthProgress(600, 600)).toBe(1)
    expect(wallGrowthProgress(9999, 600)).toBe(1)
    expect(wallGrowthProgress(-5, 600)).toBe(0)
    expect(wallGrowthProgress(300, 600)).toBeGreaterThan(0.3)
    expect(wallGrowthProgress(300, 600)).toBeLessThan(0.7)
  })

  it('Höhe ist Fortschritt mal Maximalhöhe', () => {
    expect(wallHeightAt(1, 2.5)).toBe(2.5)
    expect(wallHeightAt(0.4, 2.5)).toBeCloseTo(1)
  })

  it('gehaltene Aufladung: die halbe Höhe ist nach etwa der halben Zeit erreicht', () => {
    expect(wallHeightAt(wallGrowthProgress(800, 1600), 5)).toBeCloseTo(2.5)
    expect(wallHeightAt(wallGrowthProgress(1600, 1600), 5)).toBe(5)
  })
})

describe('Platzierung', () => {
  it('Zielposition folgt der Maus, Abstand auf [min, max] geklemmt', () => {
    expect(wallPlacementX(110, 100, 48, 320)).toBe(148)
    expect(wallPlacementX(300, 100, 48, 320)).toBe(300)
    expect(wallPlacementX(900, 100, 48, 320)).toBe(420)
    expect(wallPlacementX(-900, 100, 48, 320)).toBe(-220)
    expect(wallPlacementX(100, 100, 48, 320, -1)).toBe(52)
  })
})

describe('Wurf', () => {
  it('Richtung wird auf ±35° zur Waagerechten begrenzt', () => {
    const steep = clampThrowDirection(1, -5, 35, 1)
    expect(Math.atan2(-steep.y, steep.x) * 180 / Math.PI).toBeCloseTo(35)
    expect(Math.hypot(steep.x, steep.y)).toBeCloseTo(1)
    const flat = clampThrowDirection(-3, 0.1, 35, 1)
    expect(flat.x).toBeLessThan(0)
    expect(Math.abs(flat.y)).toBeLessThan(0.1)
  })

  it('senkrechtes Ziel fällt auf die Blickrichtung zurück', () => {
    const d = clampThrowDirection(0, -1, 35, -1)
    expect(d.x).toBeLessThan(0)
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1)
  })
})

describe('Masse und Haltbarkeit', () => {
  it('Masse aus Breite, Höhe, Tiefe und Erddichte', () => {
    expect(wallMassKg(1.2, 2.5, 1.5)).toBeCloseTo(1.2 * 2.5 * 1.5 * 1800)
  })

  it('äquivalente Kante ist die Wurzel der Fläche', () => {
    expect(wallEquivalentEdgeM(1.2, 2.5)).toBeCloseTo(Math.sqrt(3))
  })

  it('Treffer ziehen Haltbarkeit ab, bei 0 bricht die Mauer', () => {
    expect(wallTakeDamage(60, 6)).toEqual({ health: 54, broken: false })
    expect(wallTakeDamage(5, 6)).toEqual({ health: 0, broken: true })
    expect(wallTakeDamage(60, -3)).toEqual({ health: 60, broken: false })
    expect(wallTakeDamage(60, Number.NaN)).toEqual({ health: 60, broken: false })
  })
})

describe('Gegner-Schussintervall', () => {
  it('liegt zwischen den Grenzen', () => {
    expect(nextShotDelayMs(0, 3000, 4500)).toBe(3000)
    expect(nextShotDelayMs(1, 3000, 4500)).toBe(4500)
    expect(nextShotDelayMs(0.5, 3000, 4500)).toBe(3750)
  })
})
