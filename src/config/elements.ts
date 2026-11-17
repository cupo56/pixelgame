export type ElementId = 'earth' | 'fire' | 'water' | 'air'

export interface ElementInfo {
  readonly id: ElementId
  readonly label: string
  readonly color: number
  readonly implemented: boolean
}

/** Reihenfolge entspricht den Tasten 1-4. */
export const ELEMENTS: readonly ElementInfo[] = [
  { id: 'earth', label: 'Erde', color: 0xb08a5a, implemented: true },
  { id: 'fire', label: 'Feuer', color: 0xff7a1f, implemented: true },
  { id: 'water', label: 'Wasser', color: 0x3fa7ff, implemented: true },
  { id: 'air', label: 'Luft', color: 0xcfe9f2, implemented: true },
]
