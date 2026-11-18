/** Stellwerte der Steinmauer (rechte Taste, Erde). Längen in Metern, Zeiten in ms. */
export const WALL = {
  widthM: 1.2,
  heightM: 2.5,
  /** Nur für die Masse: Tiefe der Mauer in die Bildschirmebene. */
  depthM: 1.5,
  growMs: 600,
  /** Kürzere Mauern werden beim Loslassen verworfen. */
  minHeightM: 1,
  minDistanceM: 2,
  maxDistanceM: 6,
  health: 60,
  lifetimeMs: 15_000,
  sinkMs: 1400,
  cooldownMs: 4000,
  /** Zeit vom Tritt bis die Mauer losgleitet (der Fuß trifft den Boden). */
  kickDelayMs: 150,
  throwSpeedMs: 14,
  throwAngleDeg: 35,
  /** So lange fliegt die geworfene Mauer ohne Schwerkraft. */
  throwNoGravityMs: 600,
  /** Aufprall bricht die Mauer ab dieser Geschwindigkeit (m/s). */
  shatterSpeedMs: 9,
  courses: 5,
  /** Festschaden als Untergrenze der Wucht, wie bei Erdblöcken. */
  damage: 30,
} as const
