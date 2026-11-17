import { describe, expect, it } from 'vitest'
import { METAL } from '../config/metal.ts'
import { spikeCount, spikeDamage, spikeDirections, spikeSpeedMs } from './spikes.ts'

describe('Spitzen', () => {
  it('Anzahl, Tempo, Schaden steigen mit der Ladung', () => {
    expect(spikeCount(0)).toBe(8)
    expect(spikeCount(1)).toBe(24)
    expect(spikeCount(2)).toBe(24)
    expect(spikeSpeedMs(0)).toBe(16)
    expect(spikeSpeedMs(1)).toBe(26)
    expect(spikeDamage(0)).toBe(8)
    expect(spikeDamage(1)).toBe(14)
  })

  it('Hälfte im Fächer zur Maus, Rest gleichmäßig rundum', () => {
    const dirs = spikeDirections(10, 0, METAL.fanHalfRad)
    expect(dirs).toHaveLength(10)
    expect(dirs.slice(0, 5).every((a) => Math.abs(a) <= METAL.fanHalfRad + 1e-9)).toBe(true)
    const rest = dirs.slice(5).map((a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).sort((a, b) => a - b)
    for (let i = 1; i < rest.length; i++) expect(rest[i] - rest[i - 1]).toBeCloseTo((2 * Math.PI) / 5)
  })

  it('ungerade Anzahl: der Fächer bekommt die größere Hälfte', () => {
    const dirs = spikeDirections(9, 1, METAL.fanHalfRad)
    expect(dirs.slice(0, 5).every((a) => Math.abs(a - 1) <= METAL.fanHalfRad + 1e-9)).toBe(true)
  })
})
