import { describe, expect, it } from 'vitest'
import { airBoostSpeedMs, wuchtDamage } from './wucht.ts'

describe('wuchtDamage', () => {
  it('liefert die Beispiele der Spec', () => {
    expect(wuchtDamage(225, 18, 15)).toBe(15) // 36 kJ
    expect(wuchtDamage(225, 30, 15)).toBe(42) // 101 kJ
    expect(wuchtDamage(6075, 6, 15)).toBe(46) // 109 kJ, 1,5-m-Block
  })

  it('sinkt nie unter den Festwert', () => {
    expect(wuchtDamage(225, 3, 15)).toBe(15)
    expect(wuchtDamage(225, 3, 60)).toBe(60)
  })

  it('deckelt bei 60, ein höherer Festwert bleibt', () => {
    expect(wuchtDamage(6075, 30, 15)).toBe(60)
    expect(wuchtDamage(225, 1, 70)).toBe(70)
  })

  it('ungültige Werte ergeben den Festwert', () => {
    expect(wuchtDamage(Number.NaN, 10, 15)).toBe(15)
    expect(wuchtDamage(225, 0, 15)).toBe(15)
    expect(wuchtDamage(225, -4, 15)).toBe(15)
    expect(wuchtDamage(-225, 10, 15)).toBe(15)
  })
})

describe('airBoostSpeedMs', () => {
  it('Referenzblock 18 m/s, der 1,5-m-Block verliert nur gut ein Drittel', () => {
    expect(airBoostSpeedMs(225, 1)).toBeCloseTo(18)
    expect(airBoostSpeedMs(6075, 1)).toBeCloseTo(18 * 27 ** -0.125)
    expect(airBoostSpeedMs(6075, 1)).toBeGreaterThan(11)
    expect(airBoostSpeedMs(225, 0.5)).toBeCloseTo(9)
  })

  it('liefert 0 bei ungültiger Masse oder Stärke', () => {
    expect(airBoostSpeedMs(0, 1)).toBe(0)
    expect(airBoostSpeedMs(225, 0)).toBe(0)
    expect(airBoostSpeedMs(Number.NaN, 1)).toBe(0)
  })
})
