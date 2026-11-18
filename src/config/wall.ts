/** Stellwerte der Steinmauer (rechte Taste, Erde). Längen in Metern, Zeiten in ms. */
export const WALL = {
  widthM: 1.2,
  /** Höchste Mauer bei voller Aufladung (doppelt so hoch wie die erste Fassung mit 2,5 m). */
  maxHeightM: 5,
  /** Nur für die Masse: Tiefe der Mauer in die Bildschirmebene. */
  depthM: 1.5,
  /** Haltezeit bis zur vollen Höhe; 2,5 m (die halbe Höhe) sind nach etwa 0,8 s erreicht. */
  chargeMs: 1600,
  /** Kürzere Mauern werden beim Loslassen verworfen. */
  minHeightM: 1,
  /** Mindestabstand zum Spieler, damit er nicht in der Mauer steht. */
  minDistanceM: 1.5,
  /** Reichweite der Zielposition am Boden (waagerecht) und in der Höhe. */
  reachM: 10,
  verticalReachM: 5,
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
  /** Höhe einer Steinlage. */
  courseM: 0.5,
  /** Festschaden als Untergrenze der Wucht, wie bei Erdblöcken. */
  damage: 30,
} as const
