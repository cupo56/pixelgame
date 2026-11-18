import { describe, expect, it } from 'vitest'
import { REACTIONS as R } from '../config/reactions.ts'
import {
  approachAmbient, coolWater, earthHeatingK, fireChargeFraction, fireHeatForCharge, glowFraction, grainPlan, heatWater,
  mergeTarget, metalEdgeM, puddleWidthPx, quenchFire, sandWettingThresholdKg, solidHeatingK, windFeedHeat,
} from './thermo.ts'

describe('Feuer und Wasser', () => {
  it('ein Tropfen löscht einen kleinen Feuerball', () => {
    expect(quenchFire(R.fireHeatMinJ, R.dropletMassKg).extinguished).toBe(true)
  })

  it('ein voll geladener Feuerball erlischt erst am 14. Tropfen', () => {
    let heat: number = R.fireHeatMaxJ
    let drops = 0
    for (;;) {
      const result = quenchFire(heat, R.dropletMassKg)
      drops++
      if (result.extinguished) break
      heat = result.heatJ
    }
    // 13 Tropfen senken Q von 4,5 MJ auf ~0,09 MJ (0,339 MJ je Tropfen), der 14. löscht.
    expect(drops).toBe(14)
  })

  it('Q ↔ Aufladung ist linear und geklemmt', () => {
    expect(fireChargeFraction(R.fireHeatMinJ)).toBe(0)
    expect(fireChargeFraction(R.fireHeatMaxJ)).toBe(1)
    expect(fireChargeFraction(R.fireHeatMaxJ * 2)).toBe(1)
    expect(fireChargeFraction(0)).toBe(0)
    expect(fireHeatForCharge(0.5)).toBeCloseTo((R.fireHeatMinJ + R.fireHeatMaxJ) / 2)
  })

  it('Wasser gefriert bei 0 °C und kocht bei 100 °C', () => {
    expect(coolWater(15, 30)).toEqual({ tempC: -15, frozen: true })
    expect(coolWater(15, 10).frozen).toBe(false)
    expect(heatWater(15, 90).boiled).toBe(true)
    expect(heatWater(15, 50).boiled).toBe(false)
  })

  it('Temperaturen nähern sich der Umgebung ohne Überschwingen', () => {
    expect(approachAmbient(-10, 4, 10)).toBe(R.ambientC)
    expect(approachAmbient(-10, 4, 1)).toBe(-6)
    expect(approachAmbient(900, 60, 1)).toBe(840)
  })

  it('eine Scherbe schmilzt nach etwa 7,5 s', () => {
    let tempC: number = R.iceStartC
    let seconds = 0
    while (tempC <= R.waterFreezeC) {
      tempC = approachAmbient(tempC, R.iceWarmingKPerS, 1 / 60)
      seconds += 1 / 60
    }
    expect(seconds).toBeGreaterThan(7)
    expect(seconds).toBeLessThan(8)
  })

  it('die geladene Peitsche löscht einen vollen Feuerball, die normale einen halb geladenen', () => {
    expect(quenchFire(R.fireHeatMaxJ, R.chargedWhipWaterKg).extinguished).toBe(true)
    expect(quenchFire(fireHeatForCharge(0.5), R.whipWaterKg).extinguished).toBe(true)
    expect(quenchFire(R.fireHeatMaxJ, R.whipWaterKg).extinguished).toBe(false)
  })

  it('Wind nährt Feuer um 15 % je vollem Kontakt, höchstens bis zum 1,6-Fachen des Maximums', () => {
    expect(windFeedHeat(1e6, 1)).toBeCloseTo(1.15e6)
    expect(windFeedHeat(1e6, 0.5)).toBeCloseTo(1.075e6)
    expect(windFeedHeat(R.fireHeatMaxJ * 1.55, 1)).toBeCloseTo(R.fireHeatMaxJ * R.fireWindHeatFactorMax)
    expect(windFeedHeat(R.fireHeatMaxJ * 2, 0)).toBeCloseTo(R.fireHeatMaxJ * R.fireWindHeatFactorMax)
  })

  it('ein voller Windstoß aus der Nähe friert einen Tropfen', () => {
    expect(coolWater(R.waterStartC, R.gustCoolingK).frozen).toBe(true)
  })
})

describe('Erde, Sand, Metall', () => {
  it('Nässeschwelle wächst mit der Oberfläche', () => {
    expect(sandWettingThresholdKg(1.5)).toBeCloseTo(9 * sandWettingThresholdKg(0.5))
  })

  it('der kleine Block zerfällt am ersten Tropfen, der dicke nach 4', () => {
    expect(Math.ceil(sandWettingThresholdKg(0.5) / R.dropletMassKg)).toBe(1)
    expect(Math.ceil(sandWettingThresholdKg(1.5) / R.dropletMassKg)).toBe(4)
  })

  it('Kornplan: 10 Körner für 0,5 m, Deckel 60, mindestens 4 bei vollem Budget, Masse erhalten', () => {
    expect(grainPlan(0.5, 999).count).toBe(10)
    expect(grainPlan(1.5, 999).count).toBe(60)
    const tight = grainPlan(1.5, 2)
    expect(tight.count).toBe(4)
    expect(tight.count * tight.grainMassKg).toBeCloseTo(1.5 ** 3 * 1800)
    expect(tight.grainRadiusM).toBeGreaterThan(grainPlan(1.5, 999).grainRadiusM)
  })

  it('geladener Feuerball bringt ein 22,5-kg-Korn über die Schmelztemperatur, ein kleiner nicht', () => {
    expect(solidHeatingK(R.fireHeatMaxJ, 1, 22.5)).toBeGreaterThan(R.sandMeltC)
    expect(solidHeatingK(R.fireHeatMinJ, 1, 22.5)).toBeLessThan(R.sandMeltC)
  })

  it('schon der kleinste Feuerball macht einen 0,5-m-Erdblock zu Metall', () => {
    expect(R.ambientC + earthHeatingK(R.fireHeatMinJ, 0.5)).toBeGreaterThanOrEqual(R.sandMeltC)
  })

  it('der 1,5-m-Block schmilzt nicht an einem kleinsten Feuerball, aber an einer Handvoll', () => {
    const perBall = earthHeatingK(R.fireHeatMinJ, 1.5)
    expect(R.ambientC + perBall).toBeLessThan(R.sandMeltC)
    expect(R.ambientC + 3 * perBall).toBeGreaterThanOrEqual(R.sandMeltC)
  })

  it('Metallkante aus Sandmasse über Metalldichte', () => {
    expect(metalEdgeM(225)).toBeCloseTo(Math.cbrt(225 / 7800))
    expect(metalEdgeM(225)).toBeCloseTo(0.306, 2)
  })

  it('Glühen von 0 bei 500 °C bis 1 bei 1500 °C', () => {
    expect(glowFraction(400, 500, 1500)).toBe(0)
    expect(glowFraction(1000, 500, 1500)).toBeCloseTo(0.5)
    expect(glowFraction(2000, 500, 1500)).toBe(1)
  })

  it('Pfützenbreite wächst mit der Masse und ist gedeckelt', () => {
    expect(puddleWidthPx(R.dropletMassKg)).toBe(R.puddleMinWidthPx)
    expect(puddleWidthPx(1000)).toBe(R.puddleMaxWidthPx)
    expect(puddleWidthPx(R.dropletMassKg * 4)).toBe(R.puddleMinWidthPx * 2)
  })
})

describe('Pfützen', () => {
  it('mergeTarget wählt die nächste Pfütze innerhalb des Abstands, sonst keine', () => {
    const puddles = [{ x: 0, y: 0, id: 'a' }, { x: 15, y: 0, id: 'b' }, { x: 100, y: 0, id: 'c' }]
    expect(mergeTarget(puddles, 12, 0, R.puddleMergePx)?.id).toBe('b')
    expect(mergeTarget(puddles, 50, 0, R.puddleMergePx)).toBeUndefined()
    expect(mergeTarget([], 0, 0, R.puddleMergePx)).toBeUndefined()
  })
})
