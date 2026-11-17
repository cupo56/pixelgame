import { ELEMENTS, type ElementId } from '../config/elements.ts'
import { SKILL_NODES } from './skills.ts'

export const PROGRESSION_SAVE_KEY = 'elements.skills.v1'
const MAX_TOTAL_XP = 1_000_000
const requiredXP = (level: number): number => 60 + (level - 1) * 30

type StoragePort = Pick<Storage, 'getItem' | 'setItem'>
interface ElementProgress { totalXp: number; ranks: Record<string, number> }
export interface ProgressSnapshot {
  level: number
  xp: number
  xpToNext: number
  points: number
  ranks: Record<string, number>
}

const browserStorage = (): StoragePort | null => {
  if (typeof window === 'undefined') return null
  try { return globalThis.localStorage ?? null } catch { return null }
}
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const integer = (value: unknown, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0

/** Unabhängige Trainingsstände je Element. Level/Punkte werden aus EP und Käufen abgeleitet. */
export class Progression {
  private readonly storage: StoragePort | null
  private readonly elements = new Map<ElementId, ElementProgress>()
  private readonly listeners = new Set<() => void>()
  private saving: boolean

  constructor(storage: StoragePort | null = browserStorage()) {
    this.storage = storage
    this.saving = storage !== null
    for (const element of ELEMENTS) this.elements.set(element.id, { totalXp: 0, ranks: { foundation: 1 } })
    this.load()
  }

  get saveAvailable(): boolean { return this.saving }

  get(element: ElementId): ProgressSnapshot {
    const state = this.elements.get(element)!
    const { level, xp } = this.levelFor(state.totalXp)
    const spent = SKILL_NODES.reduce((sum, node) => sum + (state.ranks[node.id] ?? 0) * node.cost, 0)
    return { level, xp, xpToNext: requiredXP(level), points: level - spent, ranks: { ...state.ranks } }
  }

  /** EP aus Treffern oder künftig Quests; ignoriert ungültige/negative Werte. */
  awardExperience(element: ElementId, amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return
    const state = this.elements.get(element)!
    const next = Math.min(MAX_TOTAL_XP, state.totalXp + Math.floor(amount))
    if (next === state.totalXp) return
    state.totalXp = next
    this.changed()
  }

  canPurchase(element: ElementId, nodeId: string): boolean {
    const node = SKILL_NODES.find(node => node.id === nodeId)
    if (!node || !node.available || node.kind === 'root') return false
    const state = this.get(element)
    return state.level >= node.requiredLevel && (state.ranks[nodeId] ?? 0) < node.maxRank && state.points >= node.cost &&
      (node.requires ?? []).every(id => (state.ranks[id] ?? 0) > 0)
  }

  purchase(element: ElementId, nodeId: string): boolean {
    if (!this.canPurchase(element, nodeId)) return false
    const state = this.elements.get(element)!
    state.ranks[nodeId] = (state.ranks[nodeId] ?? 0) + 1
    this.changed()
    return true
  }

  damageMultiplier(element: ElementId): number { return 1 + (this.elements.get(element)!.ranks.power ?? 0) * 0.05 }
  cooldownMultiplier(element: ElementId): number { return 1 - (this.elements.get(element)!.ranks.focus ?? 0) * 0.05 }

  /** Spätere aktive Fähigkeiten können dieselbe geprüfte Freischaltung abfragen. */
  isUnlocked(element: ElementId, nodeId: string): boolean { return (this.elements.get(element)!.ranks[nodeId] ?? 0) > 0 }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private levelFor(totalXp: number): { level: number; xp: number } {
    let level = 1, xp = totalXp
    while (xp >= requiredXP(level)) { xp -= requiredXP(level); level++ }
    return { level, xp }
  }

  private changed(): void {
    if (this.storage) {
      try {
        this.storage.setItem(PROGRESSION_SAVE_KEY, JSON.stringify({ version: 1, elements: Object.fromEntries(this.elements) }))
        this.saving = true
      } catch { this.saving = false }
    }
    for (const listener of [...this.listeners]) listener()
  }

  private load(): void {
    if (!this.storage) return
    let raw: string | null
    try { raw = this.storage.getItem(PROGRESSION_SAVE_KEY) } catch { this.saving = false; return }
    if (!raw) return
    let saved: unknown
    try { saved = JSON.parse(raw) } catch { return }
    if (!object(saved) || saved.version !== 1 || !object(saved.elements)) return
    for (const element of ELEMENTS) {
      const entry = saved.elements[element.id]
      if (!object(entry)) continue
      const state = this.elements.get(element.id)!
      state.totalXp = integer(entry.totalXp, MAX_TOTAL_XP)
      if (!object(entry.ranks)) continue
      // Keine gespeicherten Punkte/Level vertrauen; auch Voraussetzungen erneut prüfen.
      for (const node of SKILL_NODES) {
        if (!node.available || node.kind === 'root') continue
        const requested = integer(entry.ranks[node.id], node.maxRank)
        for (let rank = 0; rank < requested && this.canPurchase(element.id, node.id); rank++) {
          state.ranks[node.id] = (state.ranks[node.id] ?? 0) + 1
        }
      }
    }
  }
}

export const progression = new Progression()
