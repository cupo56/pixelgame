import Phaser from 'phaser'
import { REACTIONS as R } from '../config/reactions.ts'
import { PHYSICS_FPS, metersToPixels } from '../config/physics.ts'
import { SubstanceRegistry, type Substance, type SubstanceKind } from './Substance.ts'
import { lookupReaction, type ReactionContext } from './reactions.ts'
import type { Materials } from './Materials.ts'

export type WindSource = 'gust' | 'tornado'
type WindHandler = (s: Substance, direction: Phaser.Math.Vector2, strength: number, source: WindSource) => void
/** heatJ ist die am Stoff ankommende Wärme (nach Abfall); das Material rechnet sie in ΔT um. */
type HeatHandler = (s: Substance, heatJ: number, ctx: ReactionContext) => void
type WhipHandler = (s: Substance, waterKg: number, point: { x: number; y: number }) => boolean
type StepListener = (dtS: number, now: number) => void
interface CaptureHandlers { capture: (s: Substance) => boolean; release: (s: Substance) => void }

const DT = 1 / PHYSICS_FPS
/** Deckel je Stoffart; Metall verwaltet seinen Deckel selbst (dauerhafte Blöcke, Versinken). */
const KIND_BUDGET: Partial<Record<SubstanceKind, number>> = { water: R.budgetDroplets, sand: R.budgetGrains }
/** Verdrängungsreihenfolge, wenn das Gesamtbudget voll ist. */
const DISPLACE_ORDER: readonly SubstanceKind[] = ['water', 'sand', 'ice', 'fire']

/**
 * Ein Ort für alle Stoffreaktionen: hört einmal auf Kollisionen, führt die
 * Thermoschritte der Materialien aus und bietet die Wind-Schnittstelle.
 */
export class ReactionSystem {
  readonly registry = new SubstanceRegistry()
  /** Angemeldete Materialien, damit Reaktionshandler Stoffe umwandeln können. */
  readonly materials: Partial<Materials> = {}
  private readonly scene: Phaser.Scene
  private readonly windHandlers = new Map<SubstanceKind, WindHandler>()
  private readonly heatHandlers = new Map<SubstanceKind, HeatHandler>()
  private readonly whipHandlers = new Map<SubstanceKind, WhipHandler>()
  private readonly captureHandlers = new Map<SubstanceKind, CaptureHandlers>()
  private readonly stepListeners = new Set<StepListener>()
  /** Paare, die in diesem Physikschritt bereits reagiert haben (verhindert Doppelzündung). */
  private readonly fired = new Set<string>()

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    scene.matter.world.on(Phaser.Physics.Matter.Events.BEFORE_UPDATE, this.step, this)
    scene.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
  }

  /** Platz im Budget schaffen; false, wenn auch nach Verdrängung kein Platz ist. */
  reserve(kind: SubstanceKind): boolean {
    const cap = KIND_BUDGET[kind]
    if (cap !== undefined && this.registry.count(kind) >= cap && !this.displace(kind)) return false
    while (this.registry.count() >= R.budgetTotal) {
      if (!this.displace(kind) && !DISPLACE_ORDER.some((other) => other !== kind && this.displace(other))) return false
    }
    return true
  }

  /** Wind auf einen Stoff; true, wenn ein Material ihn behandelt hat (Aufrufer überspringt dann seine Standardlogik). */
  applyWind(body: MatterJS.BodyType, direction: Phaser.Math.Vector2, strength: number, source: WindSource): boolean {
    const substance = this.registry.get(body)
    const handler = substance && this.windHandlers.get(substance.kind)
    if (!substance || !handler) return false
    handler(substance, direction, strength, source)
    return true
  }

  canCapture(body: MatterJS.BodyType): boolean {
    const kind = this.registry.kindOf(body)
    return kind !== undefined && this.captureHandlers.has(kind)
  }

  capture(body: MatterJS.BodyType): boolean {
    const substance = this.registry.get(body)
    const handlers = substance && this.captureHandlers.get(substance.kind)
    return !!substance && !!handlers && handlers.capture(substance)
  }

  release(body: MatterJS.BodyType): void {
    const substance = this.registry.get(body)
    if (substance) this.captureHandlers.get(substance.kind)?.release(substance)
  }

  /** Die Wasserpeitsche trifft als „virtuelles Wasser“ mit Masse. */
  whipContact(body: MatterJS.BodyType, waterKg: number, point: { x: number; y: number }): boolean {
    const substance = this.registry.get(body)
    const handler = substance && this.whipHandlers.get(substance.kind)
    return !!substance && !!handler && handler(substance, waterKg, point)
  }

  /** Explosionen heizen Stoffe im Radius; Abfall linear mit der Entfernung. */
  heatArea(center: { x: number; y: number }, radiusM: number, heatJ: number): void {
    const radiusPx = metersToPixels(radiusM)
    const ctx = this.context(center)
    for (const substance of this.registry.all()) {
      const handler = this.heatHandlers.get(substance.kind)
      if (!handler) continue
      const distance = Phaser.Math.Distance.Between(center.x, center.y, substance.body.position.x, substance.body.position.y)
      if (distance > radiusPx) continue
      handler(substance, heatJ * (1 - distance / radiusPx), ctx)
    }
  }

  /** Gezielte Wärme an einen Stoff (z. B. Feuerball prallt an Metall ab). */
  heatSubstance(substance: Substance, heatJ: number, point: { x: number; y: number }): void {
    this.heatHandlers.get(substance.kind)?.(substance, heatJ, this.context(point))
  }

  attach<K extends keyof Materials>(kind: K, material: Materials[K]): void { this.materials[kind] = material }

  setWindHandler(kind: SubstanceKind, handler: WindHandler): void { this.windHandlers.set(kind, handler) }
  setHeatHandler(kind: SubstanceKind, handler: HeatHandler): void { this.heatHandlers.set(kind, handler) }
  setWhipHandler(kind: SubstanceKind, handler: WhipHandler): void { this.whipHandlers.set(kind, handler) }
  setCaptureHandlers(kind: SubstanceKind, capture: (s: Substance) => boolean, release: (s: Substance) => void): void {
    this.captureHandlers.set(kind, { capture, release })
  }

  /** Vor jedem Physikschritt (BEFORE_UPDATE), für Thermoschritte der Materialien. */
  onStep(listener: StepListener): () => void {
    this.stepListeners.add(listener)
    return () => { this.stepListeners.delete(listener) }
  }

  context(point: { x: number; y: number }): ReactionContext {
    return { scene: this.scene, system: this, point, now: this.scene.time.now }
  }

  /** Entfernt einen Stoff vollständig: Grafik/Körper über den Besitzer, Eintrag aus der Registry. */
  remove(substance: Substance): void {
    if (!this.registry.unregister(substance.body)) return
    substance.remove()
  }

  destroy(): void {
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.BEFORE_UPDATE, this.step, this)
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
    for (const substance of this.registry.all()) this.remove(substance)
    this.stepListeners.clear()
  }

  private displace(kind: SubstanceKind): boolean {
    const victim = this.registry.oldest(kind)
    if (!victim) return false
    this.remove(victim)
    return true
  }

  private step(): void {
    this.fired.clear()
    const now = this.scene.time.now
    for (const listener of this.stepListeners) listener(DT, now)
  }

  private onCollision(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    for (const pair of event.pairs) {
      const a = this.registry.get(pair.bodyA.parent)
      const b = this.registry.get(pair.bodyB.parent)
      if (!a || !b || a === b) continue
      const reaction = lookupReaction(a, b)
      if (!reaction) continue
      const key = a.body.id < b.body.id ? `${a.body.id}:${b.body.id}` : `${b.body.id}:${a.body.id}`
      if (this.fired.has(key)) continue
      this.fired.add(key)
      reaction.handler(reaction.first, reaction.second, this.context(contactPoint(pair)))
    }
  }
}

const contactPoint = (pair: Phaser.Types.Physics.Matter.MatterCollisionPair): { x: number; y: number } => {
  // Matter legt das supports-Array mit fester Länge an; nicht belegte Plätze sind null.
  const supports = ((pair.collision as { supports?: ({ x: number; y: number } | null)[] } | undefined)?.supports ?? [])
    .filter((p): p is { x: number; y: number } => !!p)
  if (supports.length) {
    return {
      x: supports.reduce((sum, p) => sum + p.x, 0) / supports.length,
      y: supports.reduce((sum, p) => sum + p.y, 0) / supports.length,
    }
  }
  return {
    x: (pair.bodyA.position.x + pair.bodyB.position.x) / 2,
    y: (pair.bodyA.position.y + pair.bodyB.position.y) / 2,
  }
}
