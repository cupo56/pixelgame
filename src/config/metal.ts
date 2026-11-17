/** Stellwerte des Elements Metall (SI-Einheiten, Zeiten in ms). */
export const METAL = {
  /** Reichweite des Bändigens um die Figur. */
  bendRangeM: 5,
  /** Schutzpunkte der Rüstung, unabhängig von der Zahl der Klumpen. */
  armorPoints: 25,
  tearUpMs: 250,
  fuseMs: 400,
  /** Ab diesem Abstand zur Brust beginnt das Verschmelzen. */
  fuseDistanceM: 0.8,
  /** Zielgeschwindigkeit beim Anziehen (m/s) und Nachführrate (1/s); schwere Klumpen reagieren träger. */
  pullSpeedMs: 9,
  pullResponse: 10,
  /** Anteil der Abweichung zum Anker, den eine Platte je Physikschritt aufholt. */
  plateSpring: 0.45,
  /** Ab dieser Abweichung (px) wird eine Platte direkt auf ihren Anker gesetzt (Teleport). */
  plateSnapPx: 12,
  chargeMs: 2000,
  spikesMin: 8,
  spikesMax: 24,
  spikeMassKg: 1.5,
  spikeSpeedMinMs: 16,
  spikeSpeedMaxMs: 26,
  /** Halber Öffnungswinkel des Fächers zur Maus. */
  fanHalfRad: (35 * Math.PI) / 180,
  orbitDamage: 3,
  spikeDamageMin: 8,
  spikeDamageMax: 14,
  spikeStickMs: 1500,
  cooldownMs: 900,
  color: 0x9aa4ad,
} as const
