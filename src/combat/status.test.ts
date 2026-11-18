import { describe, expect, it } from 'vitest'
import { applyWet, chillEnemy, dry, isWet } from './status.ts'

const body = (): MatterJS.BodyType => ({}) as MatterJS.BodyType
const spy = (result = true) => {
  const calls: number[] = []
  return { calls, freeze: (_body: MatterJS.BodyType, ms: number): boolean => { calls.push(ms); return result } }
}

describe('Nass', () => {
  it('hält wetMs und wird bei jedem Treffer erneuert', () => {
    const b = body()
    applyWet(b, 0)
    expect(isWet(b, 5999)).toBe(true)
    expect(isWet(b, 6001)).toBe(false)
    applyWet(b, 5000)
    expect(isWet(b, 10_999)).toBe(true)
  })

  it('dry entfernt Nass sofort', () => {
    const b = body()
    applyWet(b, 0)
    dry(b)
    expect(isWet(b, 1)).toBe(false)
  })

  it('ein kürzerer Treffer verkürzt eine laufende Nässe nicht', () => {
    const b = body()
    applyWet(b, 0, 6000)
    applyWet(b, 1000, 1000)
    expect(isWet(b, 5000)).toBe(true)
  })
})

describe('chillEnemy', () => {
  it('wirkt nicht auf trockene Gegner', () => {
    const s = spy()
    expect(chillEnemy(body(), 1, 0, s.freeze)).toBe(false)
    expect(s.calls).toEqual([])
  })

  it('fesselt nasse Gegner, Dauer 0,5 bis 1,0 · waterFreezeMs, und verbraucht Nass', () => {
    const s = spy()
    const strong = body()
    applyWet(strong, 0)
    expect(chillEnemy(strong, 1, 100, s.freeze)).toBe(true)
    expect(s.calls).toEqual([1600])
    expect(isWet(strong, 200)).toBe(false)

    const weak = body()
    applyWet(weak, 0)
    chillEnemy(weak, 0.3, 100, s.freeze)
    expect(s.calls[1]).toBe(1040)
  })

  it('Stärke unter der Schwelle wirkt nicht und behält Nass', () => {
    const s = spy()
    const b = body()
    applyWet(b, 0)
    expect(chillEnemy(b, 0.29, 100, s.freeze)).toBe(false)
    expect(isWet(b, 200)).toBe(true)
    expect(s.calls).toEqual([])
  })

  it('Frostschutz: nach dem Fesseln 3 s über das Ende der Fessel hinaus immun', () => {
    const s = spy()
    const b = body()
    applyWet(b, 0)
    chillEnemy(b, 1, 0, s.freeze) // Fessel bis 1600, Schutz bis 4600
    applyWet(b, 1000)
    expect(chillEnemy(b, 1, 4000, s.freeze)).toBe(false)
    applyWet(b, 4600)
    expect(chillEnemy(b, 1, 4700, s.freeze)).toBe(true)
  })

  it('kein Gegner (freeze liefert false): Nass bleibt, kein Frostschutz', () => {
    const b = body()
    applyWet(b, 0)
    expect(chillEnemy(b, 1, 10, () => false)).toBe(false)
    expect(isWet(b, 20)).toBe(true)
    const s = spy()
    expect(chillEnemy(b, 1, 30, s.freeze)).toBe(true)
  })

  it('ungültige Stärke wirkt nicht', () => {
    const s = spy()
    const b = body()
    applyWet(b, 0)
    expect(chillEnemy(b, Number.NaN, 10, s.freeze)).toBe(false)
    expect(s.calls).toEqual([])
  })
})
