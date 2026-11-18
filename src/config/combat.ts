/** Erste Testwerte; getrennt von den physikalischen Energien der Fähigkeiten. */
export const COMBAT = {
  enemyHealth: 30,
  contactDamage: 10,
  playerProtectionMs: 800,
  earthDamage: 15,
  chargedEarthDamage: 60,
  fireDamage: 12,
  chargedFireDamage: 48,
  waterDamage: 1,
  waterWhipDamage: 8,
  chargedWaterWhipDamage: 20,
  waterFreezeMs: 1600,
  airDamage: 6,
  tornadoDamage: 8,
  chargedTornadoDamage: 18,
  /** Gegner-Geschosse: Plüschbälle auf den Spieler. */
  shotIntervalMinMs: 3000,
  shotIntervalMaxMs: 4500,
  shotRangeM: 14,
  shotSpeedMs: 9,
  shotDamage: 6,
  shotLifetimeMs: 3000,
} as const

export const TEST_ENEMIES = [
  { x: 650, y: 842, color: 0xc9a9db },
  { x: 880, y: 818, color: 0xe3b39b },
  { x: 1150, y: 840, color: 0xa8cec4 },
] as const
