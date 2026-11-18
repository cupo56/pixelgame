/** Matter-Kollisionskategorien (Bitmasken). Standardkörper nutzen Kategorie 1. */
export const COLLISION_CATEGORY = {
  world: 1,
  water: 2,
  player: 4,
  enemy: 8,
  ice: 16,
  sand: 32,
  metal: 64,
  armor: 128,
  /** Gegner-Geschosse: treffen nur Gelände (inkl. Mauer) und Spieler. */
  enemyShot: 256,
} as const

export const ALL_CATEGORIES = 0xffffffff

/** Stoffe, die den Spieler nicht anstoßen: Wasser, Eisscherben, Sandkörner, frisch entstandenes Metall. */
const WITHOUT_PLAYER = (ALL_CATEGORIES & ~COLLISION_CATEGORY.player) >>> 0

/** Wassertropfen stoßen nicht am Spieler an. */
export const WATER_MASK = WITHOUT_PLAYER
export const ICE_MASK = WITHOUT_PLAYER
export const SAND_MASK = WITHOUT_PLAYER
/** Wie Erde: nach der Schonfrist wird die Maske auf ALL_CATEGORIES gesetzt. */
export const METAL_LAUNCH_MASK = WITHOUT_PLAYER

/** Rüstungsplatten und Metallspitzen berühren nur Gegner: kein Einfluss auf Spieler, Gelände oder Stoffe. */
export const ARMOR_MASK = COLLISION_CATEGORY.enemy

export const ENEMY_SHOT_MASK = (COLLISION_CATEGORY.world | COLLISION_CATEGORY.player) >>> 0

/** Gleiche negative Gruppe: Körper dieser Art kollidieren nie untereinander. */
export const WATER_GROUP = -1
export const ICE_GROUP = -3
/** Sandkörner kollidieren untereinander, sonst gäbe es keine Haufen. */
export const SAND_GROUP = 0
