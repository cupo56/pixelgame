import { COMBOS } from '../config/combos.ts'
import { REACTIONS as R } from '../config/reactions.ts'
import { glowFraction } from '../materials/thermo.ts'

/** Reine Regeln des Meteors (glühender, schneller Erdblock explodiert beim Einschlag); ohne Phaser prüfbar. */
export interface MeteorImpactInput {
  temperatureC: number
  /** Einschlagsenergie ½·m·v² in Joule (Relativgeschwindigkeit). */
  energyJ: number
  /** Der Block hat seine Wärme schon abgegeben und seither keine neue erhalten. */
  spent: boolean
  otherIsPlayer: boolean
  otherIsSensor: boolean
}

export const isMeteorImpact = (input: MeteorImpactInput): boolean =>
  !input.spent && !input.otherIsPlayer && !input.otherIsSensor &&
  Number.isFinite(input.temperatureC) && Number.isFinite(input.energyJ) &&
  input.temperatureC >= R.earthGlowC && input.energyJ >= COMBOS.meteorMinJ

/** Explosionsstärke 0 bis 1 aus der Glut (0 an der Glühgrenze, 1 bei Weißglut). */
export const meteorCharge = (tempC: number): number => glowFraction(tempC, R.earthGlowC, R.earthWhiteC)

/** Der Block behält nach dem Einschlag einen Teil seiner Übertemperatur, nie weniger als die Umgebung. */
export const afterMeteorTemperature = (tempC: number): number =>
  Math.max(R.ambientC, R.ambientC + COMBOS.meteorHeatRetention * (tempC - R.ambientC))

/**
 * Würde der Block beim nächsten Einschlag explodieren? Steuert die Funken- und Rauchschleppe im Flug,
 * damit der Spieler sieht, welcher Block zum Meteor geworden ist.
 */
export const isMeteorArmed = (temperatureC: number, massKg: number, speedMs: number, spent: boolean): boolean =>
  Number.isFinite(massKg) && Number.isFinite(speedMs) &&
  isMeteorImpact({ temperatureC, energyJ: 0.5 * massKg * speedMs * speedMs, spent, otherIsPlayer: false, otherIsSensor: false })
