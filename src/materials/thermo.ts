import { REACTIONS as R } from '../config/reactions.ts'

/** Reines Thermomodell: keine Phaser-Abhängigkeit, damit es ohne Browser prüfbar bleibt. */

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/** Wasser entzieht dem Feuer seine Verdampfungswärme; Q ≤ 0 bedeutet erloschen. */
export const quenchFire = (heatJ: number, waterKg: number): { heatJ: number; extinguished: boolean } => {
  const remaining = heatJ - waterKg * R.waterLatentJPerKg
  return { heatJ: Math.max(0, remaining), extinguished: remaining <= 0 }
}

/** 0 bei fireHeatMinJ, 1 bei fireHeatMaxJ, geklemmt. */
export const fireChargeFraction = (heatJ: number): number =>
  clamp01((heatJ - R.fireHeatMinJ) / (R.fireHeatMaxJ - R.fireHeatMinJ))

export const fireHeatForCharge = (charge: number): number =>
  R.fireHeatMinJ + (R.fireHeatMaxJ - R.fireHeatMinJ) * clamp01(charge)

/** Annäherung an die Umgebungstemperatur ohne Überschwingen. */
export const approachAmbient = (tempC: number, rateKPerS: number, dtS: number): number => {
  const diff = R.ambientC - tempC
  const step = rateKPerS * dtS
  return Math.abs(diff) <= step ? R.ambientC : tempC + Math.sign(diff) * step
}

export const coolWater = (tempC: number, deltaK: number): { tempC: number; frozen: boolean } => {
  const next = tempC - deltaK
  return { tempC: next, frozen: next <= R.waterFreezeC }
}

export const heatWater = (tempC: number, deltaK: number): { tempC: number; boiled: boolean } => {
  const next = tempC + deltaK
  return { tempC: next, boiled: next >= R.waterBoilC }
}

/** Wasser, das ein Block aufnehmen muss, bevor er zu Sand zerfällt. */
export const sandWettingThresholdKg = (edgeM: number): number => R.sandWaterKgPerM2 * edgeM ** 2

export interface GrainPlan {
  count: number
  grainMassKg: number
  grainRadiusM: number
}

/** Kornzahl aus Blockgröße und freien Plätzen; Masse bleibt erhalten, überzählige Masse geht in größere Körner. */
export const grainPlan = (edgeM: number, freeSlots: number): GrainPlan => {
  const wanted = Math.min(R.sandGrainsPerBlockMax, Math.round(R.sandGrainsPerHalfMeterBlock * (edgeM / 0.5) ** 2))
  const count = Math.max(R.sandGrainsMin, Math.min(wanted, freeSlots))
  const grainMassKg = edgeM ** 3 * R.earthDensityKgM3 / count
  const grainRadiusM = Math.cbrt((3 * grainMassKg) / (4 * Math.PI * R.sandDensityKgM3))
  return { count, grainMassKg, grainRadiusM }
}

/** Erwärmung eines Festkörpers durch Feuer; der Kopplungsfaktor ist die einzige Spielabstraktion. */
export const solidHeatingK = (heatJ: number, falloff: number, massKg: number): number =>
  (heatJ * clamp01(falloff) * R.fireSolidCoupling) / (R.solidHeatCapacityJPerKgK * Math.max(0.001, massKg))

/** Kantenlänge eines Metallwürfels aus der verschmolzenen Sandmasse. */
export const metalEdgeM = (sandMassKg: number): number => Math.cbrt(sandMassKg / R.metalDensityKgM3)

/** 0 unterhalb von glowC, 1 ab whiteC. */
export const glowFraction = (tempC: number, glowC: number, whiteC: number): number =>
  clamp01((tempC - glowC) / (whiteC - glowC))

/** Pfützenbreite wächst mit der Wurzel der Masse, gedeckelt. */
export const puddleWidthPx = (massKg: number): number =>
  Math.min(R.puddleMaxWidthPx, Math.max(R.puddleMinWidthPx, R.puddleMinWidthPx * Math.sqrt(massKg / R.dropletMassKg)))

/** Nächste Pfütze innerhalb des Zusammenführungsabstands. */
export const mergeTarget = <T extends { x: number; y: number }>(
  puddles: readonly T[], x: number, y: number, mergePx: number,
): T | undefined => {
  let best: T | undefined
  let bestDistance = mergePx
  for (const puddle of puddles) {
    const distance = Math.hypot(puddle.x - x, puddle.y - y)
    if (distance <= bestDistance) { best = puddle; bestDistance = distance }
  }
  return best
}

/** Wind nährt Feuer: relativer Zuwachs pro Kontakt, gedeckelt auf das 1,6-Fache des Maximums. */
export const windFeedHeat = (heatJ: number, strength: number): number =>
  Math.min(heatJ * (1 + R.fireWindHeatGain * clamp01(strength)), R.fireHeatMaxJ * R.fireWindHeatFactorMax)
