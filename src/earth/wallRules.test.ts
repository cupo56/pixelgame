import { describe, expect, it } from 'vitest'
import {
  clampThrowDirection, courseVisible, nextShotDelayMs, wallDistanceM, wallEquivalentEdgeM, wallGrowthProgress,
  wallHeightAt, wallMassKg, wallTakeDamage,
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

  it('Lagen steigen nacheinander: die erste früher als die letzte', () => {
    expect(courseVisible(0.2, 0, 5)).toBeGreaterThan(courseVisible(0.2, 4, 5))
    expect(courseVisible(0, 0, 5)).toBe(0)
    for (let i = 0; i < 5; i++) expect(courseVisible(1, i, 5)).toBe(1)
  })
})

describe('Platzierung', () => {
  it('Abstand wird auf 2 bis 6 m geklemmt, Vorzeichen zeigt zur Maus', () => {
    expect(wallDistanceM(0.5, 2, 6)).toBe(2)
    expect(wallDistanceM(4, 2, 6)).toBe(4)
    expect(wallDistanceM(20, 2, 6)).toBe(6)
    expect(wallDistanceM(-20, 2, 6)).toBe(-6)
    expect(wallDistanceM(0, 2, 6)).toBe(2)
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
