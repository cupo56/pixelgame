import { describe, expect, it } from 'vitest'
import { COMBOS } from '../config/combos.ts'
import { REACTIONS as R } from '../config/reactions.ts'
import { solidHeatingK } from '../materials/thermo.ts'
import { vortexFireIntensity, vortexHeatJ, vortexRockHeatJ, vortexTickDamage } from './fireVortexMath.ts'

const Q = R.fireHeatMaxJ

describe('vortexHeatJ', () => {
  it('sinkt linear auf 0', () => {
    expect(vortexHeatJ(Q, 0, 3200)).toBe(Q)
    expect(vortexHeatJ(Q, 1600, 3200)).toBeCloseTo(Q / 2)
    expect(vortexHeatJ(Q, 3200, 3200)).toBe(0)
    expect(vortexHeatJ(Q, 4000, 3200)).toBe(0)
  })

  it('ungültige Dauer oder Zeit ergibt 0 beziehungsweise das volle Q bei Zeit 0', () => {
    expect(vortexHeatJ(Q, 100, 0)).toBe(0)
    expect(vortexHeatJ(Q, Number.NaN, 3200)).toBe(0)
    expect(vortexHeatJ(Q, -50, 3200)).toBe(Q)
  })
})

describe('vortexTickDamage', () => {
  it('liegt zwischen 2 und 6 nach Q-Anteil', () => {
    expect(vortexTickDamage(0, Q)).toBe(2)
    expect(vortexTickDamage(Q, Q)).toBe(6)
    expect(vortexTickDamage(Q / 2, Q)).toBe(4)
  })

  it('klemmt Q über dem Start und ungültige Werte', () => {
    expect(vortexTickDamage(Q * 2, Q)).toBe(6)
    expect(vortexTickDamage(-1, Q)).toBe(2)
    expect(vortexTickDamage(5, 0)).toBe(2)
  })
})

describe('vortexRockHeatJ', () => {
  it('ist ein Bruchteil des aktuellen Q', () => {
    expect(vortexRockHeatJ(1_000_000)).toBeCloseTo(80_000)
    expect(vortexRockHeatJ(0)).toBe(0)
    expect(vortexRockHeatJ(-5)).toBe(0)
  })
})

/** 0,5-m-Block (225 kg) im Wirbel, ohne Abkühlung. */
const heatedTemperature = (durationMs: number): number => {
  let tempC = R.ambientC
  for (let ms = 0; ms < durationMs; ms += COMBOS.fireVortexTickMs) {
    tempC += solidHeatingK(vortexRockHeatJ(vortexHeatJ(Q, ms, durationMs)), 1, 225)
  }
  return tempC
}

describe('Blockheizung im Feuerwirbel', () => {
  it('voll geladener Feuerball in einem geladenen Wirbel (3200 ms) bringt den Block über die Glühgrenze', () => {
    expect(heatedTemperature(3200)).toBeGreaterThanOrEqual(R.earthGlowC)
  })

  it('ein kurzer Wirbel (1600 ms) allein reicht nicht', () => {
    expect(heatedTemperature(1600)).toBeLessThan(R.earthGlowC)
  })
})

describe('vortexFireIntensity', () => {
  it('ohne Feuerball 0', () => {
    expect(vortexFireIntensity([])).toBe(0)
  })
  it('stärkster Feuerball bestimmt die Glut', () => {
    expect(vortexFireIntensity([{ q: 250, q0: 1000 }, { q: 600, q0: 1000 }])).toBeCloseTo(0.6)
  })
  it('bleibt in 0 bis 1', () => {
    expect(vortexFireIntensity([{ q: 2000, q0: 1000 }])).toBe(1)
    expect(vortexFireIntensity([{ q: 5, q0: 0 }])).toBe(0)
  })
})
