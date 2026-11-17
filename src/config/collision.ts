/** Matter-Kollisionskategorien (Bitmasken). Standardkörper nutzen Kategorie 1. */
export const COLLISION_CATEGORY = {
  world: 1,
  water: 2,
  player: 4,
  enemy: 8,
  ice: 16,
  sand: 32,
  metal: 64,
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

/** Gleiche negative Gruppe: Körper dieser Art kollidieren nie untereinander. */
export const WATER_GROUP = -1
export const SAND_GROUP = -2
export const ICE_GROUP = -3
