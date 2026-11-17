import type Phaser from 'phaser'
import type { Substance, SubstanceKind } from './Substance.ts'
import type { ReactionSystem } from './ReactionSystem.ts'
import { REACTIONS as R } from '../config/reactions.ts'
import { quenchFire } from './thermo.ts'

export interface ReactionContext {
  scene: Phaser.Scene
  system: ReactionSystem
  /** Kontaktpunkt (Mittel der Kollisions-Supports). */
  point: { x: number; y: number }
  now: number
}

/** Stoffe kommen in der Reihenfolge von KIND_ORDER an (erster Schlüsselteil zuerst). */
export type ReactionHandler = (a: Substance, b: Substance, ctx: ReactionContext) => void

/** Kanonische Reihenfolge der Stoffe für Tabellenschlüssel. */
export const KIND_ORDER: readonly SubstanceKind[] = ['fire', 'water', 'ice', 'earth', 'sand', 'metal']

export const reactionKey = (a: SubstanceKind, b: SubstanceKind): string =>
  KIND_ORDER.indexOf(a) <= KIND_ORDER.indexOf(b) ? `${a}:${b}` : `${b}:${a}`

const noop: ReactionHandler = () => {}

/** Wasser entzieht dem Feuer Verdampfungswärme und verdampft dabei; Q ≤ 0 löscht ohne Druckwelle. */
const fireMeetsWater: ReactionHandler = (fire, water, ctx) => {
  const { fire: fireMaterial, water: waterMaterial, puddle } = ctx.system.materials
  if (!fireMaterial || !waterMaterial) return
  if (water.body.label === 'puddle') {
    // Pfütze: nur so viel verdampft, wie das Feuer an Wärme hergibt; der Rest bleibt liegen.
    const kg = Math.min(water.massKg, fire.heatJ / R.waterLatentJPerKg)
    puddle?.evaporate(water, kg)
    const result = quenchFire(fire.heatJ, kg)
    fire.heatJ = result.heatJ
    if (result.extinguished) fireMaterial.quench(fire)
    return
  }
  const result = quenchFire(fire.heatJ, water.massKg)
  fire.heatJ = result.heatJ
  waterMaterial.evaporate(water)
  if (result.extinguished) fireMaterial.quench(fire)
}

/**
 * Die Reaktionsmatrix des Designs. Die Materialien füllen die Handler über
 * `setReaction`; hier stehen nur die Zellen, die es überhaupt gibt.
 */
export const REACTIONS = new Map<string, ReactionHandler>([
  ['fire:water', fireMeetsWater],
  ['fire:ice', noop],
  ['fire:earth', noop],
  ['fire:sand', noop],
  ['fire:metal', noop],
  ['water:earth', noop],
  ['water:sand', noop],
  ['water:metal', noop],
  ['ice:earth', noop],
])

/** Ersetzt den Handler einer vorhandenen Zelle; unbekannte Zellen sind ein Programmierfehler. */
export const setReaction = (a: SubstanceKind, b: SubstanceKind, handler: ReactionHandler): void => {
  const key = reactionKey(a, b)
  if (!REACTIONS.has(key)) throw new Error(`Unbekannte Reaktion ${key}`)
  REACTIONS.set(key, handler)
}

export const lookupReaction = (
  a: Substance,
  b: Substance,
): { handler: ReactionHandler; first: Substance; second: Substance } | undefined => {
  const handler = REACTIONS.get(reactionKey(a.kind, b.kind))
  if (!handler) return undefined
  const ordered = KIND_ORDER.indexOf(a.kind) <= KIND_ORDER.indexOf(b.kind)
  return { handler, first: ordered ? a : b, second: ordered ? b : a }
}
