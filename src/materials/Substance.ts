/** Stoffarten des Reaktionssystems. Luft ist kein Stoff, sondern ein Feld (Wind). */
export type SubstanceKind = 'fire' | 'water' | 'ice' | 'earth' | 'sand' | 'metal'

/** Ein physischer Stoff in der Welt mit seinen Zustandsgrößen (SI-Einheiten). */
export interface Substance {
  readonly kind: SubstanceKind
  readonly body: MatterJS.BodyType
  temperatureC: number
  massKg: number
  /** Nur Erde: aufgenommenes Wasser. */
  wetnessKg: number
  /** Nur Feuer: Wärmeinhalt Q. */
  heatJ: number
  /** Ruhezeit auf Gelände in ms (Pfützenbildung, Versinken). */
  restingMs: number
  readonly createdAt: number
  /** Entfernt Körper und Grafik; ruft registry.unregister nicht selbst. */
  remove(): void
}

type RemoveListener = (substance: Substance) => void

/** Körper-Labels der Stoffe; greift auch noch, wenn ein Stoff im selben Schritt bereits abgemeldet wurde. */
const KIND_BY_LABEL: Readonly<Record<string, SubstanceKind>> = {
  fireball: 'fire', water: 'water', puddle: 'water', ice: 'ice', 'ice-sheet': 'ice',
  rock: 'earth', sand: 'sand', metal: 'metal',
}

export const kindOfLabel = (label: string | undefined): SubstanceKind | undefined =>
  label === undefined ? undefined : KIND_BY_LABEL[label]

/** Nachschlagewerk aller Stoffe: Körper → Stoff, plus Zählung und Verdrängung. */
export class SubstanceRegistry {
  private readonly byBody = new WeakMap<MatterJS.BodyType, Substance>()
  private readonly substances = new Set<Substance>()
  private readonly removeListeners = new Set<RemoveListener>()

  register(substance: Substance): void {
    this.byBody.set(substance.body, substance)
    this.substances.add(substance)
  }

  unregister(body: MatterJS.BodyType): Substance | undefined {
    const substance = this.get(body)
    if (!substance) return undefined
    this.byBody.delete(substance.body)
    this.substances.delete(substance)
    for (const listener of this.removeListeners) listener(substance)
    return substance
  }

  /** Teilkörper zusammengesetzter Körper verweisen über parent auf den registrierten Körper. */
  get(body: MatterJS.BodyType): Substance | undefined {
    return this.byBody.get(body.parent ?? body) ?? this.byBody.get(body)
  }

  kindOf(body: MatterJS.BodyType): SubstanceKind | undefined {
    return this.get(body)?.kind
  }

  all(): Substance[] {
    return [...this.substances]
  }

  ofKind(kind: SubstanceKind): Substance[] {
    return this.all().filter((substance) => substance.kind === kind)
  }

  count(kind?: SubstanceKind): number {
    return kind === undefined ? this.substances.size : this.ofKind(kind).length
  }

  /** Ältester ruhender Stoff einer Art (restingMs > 0), sonst der älteste überhaupt. */
  oldest(kind: SubstanceKind): Substance | undefined {
    const candidates = this.ofKind(kind)
    const resting = candidates.filter((substance) => substance.restingMs > 0)
    const pool = resting.length ? resting : candidates
    return pool.reduce<Substance | undefined>((best, s) => (!best || s.createdAt < best.createdAt ? s : best), undefined)
  }

  onRemove(listener: RemoveListener): () => void {
    this.removeListeners.add(listener)
    return () => { this.removeListeners.delete(listener) }
  }
}
