import { REACTIONS } from './reactions.ts'

/**
 * Stellwerte der Element-Kombos (Spec 2026-11-18-element-combos-design.md).
 * SI-Einheiten (kg, m, s, J, °C); Umrechnung in Pixel nur über config/physics.ts.
 * Alle Werte sind Startwerte und werden nach dem Spieltest mit /balance-check nachgezogen.
 */
export const COMBOS = {
  // Wucht: Schaden aus kinetischer Energie, der bisherige Festwert bleibt Untergrenze.
  wuchtJoulesPerHp: 2400,
  wuchtDamageCap: 60,

  // Windschub auf Erdblöcke (bisher lokal in EarthMaterial).
  airBoostMs: 18,
  airMaxSpeedMs: 30,
  /** Masse des 0,5-m-Referenzblocks (225 kg), auf die der Windschub bezogen ist; aus der Erddichte abgeleitet. */
  airReferenceMassKg: 0.5 ** 3 * REACTIONS.earthDensityKgM3,

  // Meteor: glühender, schneller Block explodiert beim Einschlag.
  meteorMinJ: 30_000,
  /** Anteil der Übertemperatur, den der Block nach dem Einschlag behält. */
  meteorHeatRetention: 0.4,

  // Feuerwirbel: Q sinkt linear über die Wirbeldauer, Ticks schaden und heizen Blöcke.
  fireVortexTickMs: 300,
  fireVortexDamageMin: 2,
  fireVortexDamageMax: 6,
  /**
   * Spielabstraktion (neben fireSolidCoupling): Der Wirbel hält die Flamme am Block,
   * deshalb erhält jeder gefangene Block je Tick einen Bruchteil des aktuellen Q.
   */
  fireVortexRockHeatFraction: 0.08,

  // Gegner-Zustände: Nass und Kälte (Eisfessel kommt aus COMBAT.waterFreezeMs).
  wetMs: 6000,
  chillMinStrength: 0.3,
  /** Eisfessel-Dauer = waterFreezeMs · (chillFreezeMinFactor + (1 − chillFreezeMinFactor) · Stärke). */
  chillFreezeMinFactor: 0.5,
  frostImmunityMs: 3000,

  // Salve des Wirbels (Steinhagel).
  volleyMaxBodies: 12,
} as const
