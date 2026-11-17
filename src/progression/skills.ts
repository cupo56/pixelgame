/** Datenbasis für spätere Fähigkeits- und Combo-Freischaltungen. */
export interface SkillNode {
  id: string
  name: string
  description: string
  maxRank: number
  cost: number
  requiredLevel: number
  requires?: readonly string[]
  kind: 'root' | 'passive' | 'ability' | 'combo'
  available: boolean
}

export const SKILL_NODES: readonly SkillNode[] = [
  { id: 'foundation', name: 'Grundausbildung', description: 'Alle bisherigen Angriffe dieses Elements bleiben verfügbar.',
    maxRank: 1, cost: 0, requiredLevel: 1, kind: 'root', available: true },
  { id: 'power', name: 'Elementkraft', description: '+5 % Trefferschaden pro Rang. Lebenspunkte werden auf ganze Zahlen gerundet.',
    maxRank: 3, cost: 1, requiredLevel: 1, requires: ['foundation'], kind: 'passive', available: true },
  { id: 'focus', name: 'Fokus', description: '5 % kürzere Abklingzeit pro Rang nach einem Angriff.',
    maxRank: 2, cost: 1, requiredLevel: 2, requires: ['power'], kind: 'passive', available: true },
  { id: 'ability', name: 'Neue Fähigkeit', description: 'Reservierter Zweig. Die konkrete Fähigkeit folgt später.',
    maxRank: 1, cost: 1, requiredLevel: 3, requires: ['power'], kind: 'ability', available: false },
  { id: 'combo', name: 'Element-Combo', description: 'Reservierter Zweig für spätere Combo-Freischaltungen. Bestehende Kombinationen bleiben spielbar.',
    maxRank: 1, cost: 1, requiredLevel: 4, requires: ['focus'], kind: 'combo', available: false },
]
