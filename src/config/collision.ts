/** Matter-Kollisionskategorien (Bitmasken). Standardkörper nutzen Kategorie 1. */
export const COLLISION_CATEGORY = {
  world: 1,
  water: 2,
  player: 4,
} as const

const ALL_CATEGORIES = 0xffffffff

/** Wassertropfen stoßen nicht am Spieler an. */
export const WATER_MASK = (ALL_CATEGORIES & ~COLLISION_CATEGORY.player) >>> 0

/** Gleiche negative Gruppe: Tropfen kollidieren nie untereinander. */
export const WATER_GROUP = -1
