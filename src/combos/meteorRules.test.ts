import { describe, expect, it } from 'vitest'
import { REACTIONS as R } from '../config/reactions.ts'
import { afterMeteorTemperature, isMeteorArmed, isMeteorImpact, meteorCharge, type MeteorImpactInput } from './meteorRules.ts'

const ok: MeteorImpactInput = { temperatureC: 600, energyJ: 40_000, spent: false, otherIsPlayer: false, otherIsSensor: false }

describe('isMeteorImpact', () => {
  it('zündet bei Glut und Wucht', () => {
    expect(isMeteorImpact(ok)).toBe(true)
  })

  it('zündet genau an den Schwellen', () => {
    expect(isMeteorImpact({ ...ok, temperatureC: R.earthGlowC, energyJ: 30_000 })).toBe(true)
  })

  it.each<[string, Partial<MeteorImpactInput>]>([
    ['zu kalt', { temperatureC: 499 }],
    ['zu wenig Wucht', { energyJ: 29_999 }],
    ['schon verbraucht', { spent: true }],
    ['Spieler getroffen', { otherIsPlayer: true }],
    ['Sensor getroffen', { otherIsSensor: true }],
  ])('zündet nicht: %s', (_name, patch) => {
    expect(isMeteorImpact({ ...ok, ...patch })).toBe(false)
  })

  it('ungültige Zahlen zünden nicht', () => {
    expect(isMeteorImpact({ ...ok, temperatureC: Number.NaN })).toBe(false)
    expect(isMeteorImpact({ ...ok, energyJ: Number.NaN })).toBe(false)
  })
})

describe('meteorCharge', () => {
  it('folgt der Glut von earthGlowC bis earthWhiteC', () => {
    expect(meteorCharge(R.earthGlowC)).toBe(0)
    expect(meteorCharge(R.earthWhiteC)).toBe(1)
    expect(meteorCharge(R.earthGlowC + (R.earthWhiteC - R.earthGlowC) / 2)).toBeCloseTo(0.5)
    expect(meteorCharge(R.solidMaxC)).toBe(1)
  })
})

describe('afterMeteorTemperature', () => {
  it('behält 40 % der Übertemperatur', () => {
    expect(afterMeteorTemperature(1500)).toBeCloseTo(R.ambientC + 0.4 * (1500 - R.ambientC))
  })

  it('kühlt nie unter die Umgebung und erwärmt nie', () => {
    expect(afterMeteorTemperature(R.ambientC)).toBe(R.ambientC)
    expect(afterMeteorTemperature(700)).toBeLessThan(700)
    expect(afterMeteorTemperature(0)).toBe(R.ambientC)
  })
})

describe('isMeteorArmed', () => {
  // 0,5-m-Block: 225 kg. 30 kJ verlangen v ≥ √(2·30000/225) ≈ 16,3 m/s.
  it('glühend und schnell genug: Schleppe an', () => {
    expect(isMeteorArmed(800, 225, 17, false)).toBe(true)
  })
  it('zu langsam für die Einschlagsenergie: keine Schleppe', () => {
    expect(isMeteorArmed(800, 225, 16, false)).toBe(false)
  })
  it('kalt oder verbraucht: keine Schleppe', () => {
    expect(isMeteorArmed(R.earthGlowC - 1, 225, 25, false)).toBe(false)
    expect(isMeteorArmed(800, 225, 25, true)).toBe(false)
  })
  it('ungültige Zahlen: keine Schleppe', () => {
    expect(isMeteorArmed(800, Number.NaN, 25, false)).toBe(false)
  })
})
