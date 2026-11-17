import { METAL } from '../config/metal.ts'

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))
const lerp = (a: number, b: number, t: number): number => a + (b - a) * clamp01(t)

export const spikeCount = (charge: number): number => Math.round(lerp(METAL.spikesMin, METAL.spikesMax, charge))
export const spikeSpeedMs = (charge: number): number => lerp(METAL.spikeSpeedMinMs, METAL.spikeSpeedMaxMs, charge)
export const spikeDamage = (charge: number): number => Math.round(lerp(METAL.spikeDamageMin, METAL.spikeDamageMax, charge))

/**
 * Flugrichtungen (rad): die größere Hälfte gleichmäßig im Fächer aimRad ± fanHalfRad,
 * der Rest gleichmäßig rundum, um einen halben Schritt versetzt.
 */
export const spikeDirections = (count: number, aimRad: number, fanHalfRad: number): number[] => {
  const fan = Math.ceil(count / 2)
  const around = count - fan
  const directions: number[] = []
  for (let i = 0; i < fan; i++) {
    const t = fan === 1 ? 0.5 : i / (fan - 1)
    directions.push(aimRad - fanHalfRad + 2 * fanHalfRad * t)
  }
  for (let i = 0; i < around; i++) directions.push(aimRad + ((i + 0.5) / around) * Math.PI * 2)
  return directions
}
