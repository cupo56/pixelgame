/**
 * Stellwerte des Elementreaktionssystems in SI-Einheiten (kg, m, s, J, °C).
 * Umrechnung in Pixel nur über config/physics.ts.
 */
export const REACTIONS = {
  // Umgebung und Wasser
  ambientC: 15,
  waterStartC: 15,
  waterBoilC: 100,
  waterFreezeC: 0,
  /** Verdampfungswärme von Wasser. */
  waterLatentJPerKg: 2.26e6,
  dropletMassKg: 0.15,

  // Feuer: Wärmeinhalt Q eines Feuerballs, linear über die Aufladung.
  fireHeatMinJ: 0.3e6,
  fireHeatMaxJ: 4.5e6,
  /** Wind darf Q höchstens auf das 1,6-Fache des Maximums nähren. */
  fireWindHeatFactorMax: 1.6,
  /** Zuwachs an Q pro Windkontakt mit Stärke 1 (relativ). */
  fireWindHeatGain: 0.15,
  /** Anteil von Q, den ein Feuerball beim Abprallen an Metall verliert. */
  fireMetalBounceLoss: 0.2,

  // Wasserpeitsche als „virtuelles Wasser“ mit Masse.
  whipWaterKg: 1.5,
  chargedWhipWaterKg: 4,

  // Luft kühlt Wasser (Verdunstungskälte, bewusst kräftig, damit es lesbar ist).
  gustCoolingK: 30,
  vortexCoolingKPerS: 60,

  // Eis
  iceStartC: -30,
  iceWarmingKPerS: 4,
  iceSheetMeltMs: 10_000,
  iceShardDamageSpeedMs: 6,
  iceShardShatterSpeedMs: 10,
  iceShardDamage: 3,
  /** Reibungsfaktor des Spielers auf Eisflächen (1 = normaler Boden). */
  iceFriction: 0.08,

  // Pfützen
  puddleRestMs: 400,
  puddleMergePx: 20,
  puddleMinWidthPx: 8,
  puddleMaxWidthPx: 96,
  puddleEvaporateMs: 12_000,

  // Erde → Sand: Nässeschwelle wächst mit der Oberfläche (kg pro m² Kantenlänge²).
  sandWaterKgPerM2: 12,
  earthDensityKgM3: 1800,
  sandDensityKgM3: 1600,
  sandGrainsPerHalfMeterBlock: 10,
  sandGrainsPerBlockMax: 60,
  sandGrainsMin: 4,
  sandSinkMs: 12_000,
  sandBrakeFactor: 0.6,
  sandCloudDamage: 1,
  sandCloudDamageSpeedMs: 6,

  // Festkörper und Hitze
  solidHeatCapacityJPerKgK: 800,
  /**
   * Spielabstraktion: Der Bändiger-Feuerball wirkt auf Festkörper als anhaltende Flamme,
   * nicht als einmaliges Energiepaket. Alle anderen Werte sind physikalisch.
   */
  fireSolidCoupling: 60,
  sandMeltC: 1500,
  metalDensityKgM3: 7800,
  metalGlowC: 500,
  metalWhiteC: 1500,
  metalCoolingKPerS: 60,
  metalMax: 6,
  earthGlowC: 500,
  earthWhiteC: 1200,
  earthCoolingKPerS: 40,
  glowContactDamage: 4,
  glowContactIntervalMs: 500,

  // Körperbudget
  budgetTotal: 240,
  budgetDroplets: 120,
  budgetGrains: 160,
} as const
