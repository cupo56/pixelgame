import { describe, expect, it } from 'vitest'
import { SubstanceRegistry, type Substance, type SubstanceKind } from './Substance.ts'

let nextId = 1

/** Minimale Matter-Körper-Attrappe: nur id und parent werden von der Registry benutzt. */
const fakeBody = (): MatterJS.BodyType => {
  const body = { id: nextId++ } as unknown as MatterJS.BodyType
  body.parent = body
  return body
}

const childOf = (parent: MatterJS.BodyType): MatterJS.BodyType =>
  ({ id: nextId++, parent }) as unknown as MatterJS.BodyType

const substance = (kind: SubstanceKind, createdAt: number, restingMs = 0): Substance => ({
  kind, body: fakeBody(), temperatureC: 15, massKg: 1, wetnessKg: 0, heatJ: 0, restingMs, createdAt,
  remove: () => {},
})

describe('SubstanceRegistry', () => {
  it('findet Stoffe über Teilkörper (parent)', () => {
    const registry = new SubstanceRegistry()
    const rock = substance('earth', 0)
    registry.register(rock)
    expect(registry.get(childOf(rock.body))).toBe(rock)
    expect(registry.kindOf(rock.body)).toBe('earth')
    expect(registry.get(fakeBody())).toBeUndefined()
  })

  it('zählt pro Art und gesamt', () => {
    const registry = new SubstanceRegistry()
    registry.register(substance('water', 0))
    registry.register(substance('water', 1))
    registry.register(substance('fire', 2))
    expect(registry.count('water')).toBe(2)
    expect(registry.count()).toBe(3)
    expect(registry.ofKind('fire')).toHaveLength(1)
  })

  it('oldest bevorzugt ruhende Stoffe, sonst den ältesten', () => {
    const registry = new SubstanceRegistry()
    const older = substance('water', 0)
    const youngerResting = substance('water', 100, 500)
    registry.register(older)
    registry.register(youngerResting)
    expect(registry.oldest('water')).toBe(youngerResting)
    registry.unregister(youngerResting.body)
    expect(registry.oldest('water')).toBe(older)
    expect(registry.oldest('metal')).toBeUndefined()
  })

  it('unregister feuert onRemove genau einmal und liefert den Stoff', () => {
    const registry = new SubstanceRegistry()
    const removed: Substance[] = []
    const off = registry.onRemove((s) => removed.push(s))
    const drop = substance('water', 0)
    registry.register(drop)
    expect(registry.unregister(drop.body)).toBe(drop)
    expect(registry.unregister(drop.body)).toBeUndefined()
    expect(removed).toEqual([drop])
    off()
    registry.register(drop)
    registry.unregister(drop.body)
    expect(removed).toHaveLength(1)
  })
})

describe('kindOfLabel', () => {
  it('ordnet Körper-Labels auch nach dem Abmelden ihrer Stoffart zu', async () => {
    const { kindOfLabel } = await import('./Substance.ts')
    expect(kindOfLabel('water')).toBe('water')
    expect(kindOfLabel('puddle')).toBe('water')
    expect(kindOfLabel('rock')).toBe('earth')
    expect(kindOfLabel('fireball')).toBe('fire')
    expect(kindOfLabel('ice-sheet')).toBe('ice')
    expect(kindOfLabel('terrain')).toBeUndefined()
  })
})

describe('Budget-Sicht der Registry', () => {
  const make = (kind: SubstanceKind, createdAt: number, extra: Partial<Substance> = {}): Substance =>
    ({ ...substance(kind, createdAt), ...extra })

  it('budgetCount zählt nur budgetierte (dynamische) Stoffe', () => {
    const registry = new SubstanceRegistry()
    registry.register(make('water', 0))
    registry.register(make('water', 1, { budgeted: false }))   // Pfütze
    registry.register(make('ice', 2, { budgeted: false }))     // Eisfläche
    registry.register(make('ice', 3))
    expect(registry.budgetCount('water')).toBe(1)
    expect(registry.budgetCount('ice')).toBe(1)
    expect(registry.budgetCount()).toBe(2)
  })

  it('oldestBudgeted überspringt Pfützen und im selben Schritt entstandene Stoffe', () => {
    const registry = new SubstanceRegistry()
    const puddle = make('water', 0, { budgeted: false, restingMs: 1 })
    const fresh = make('water', 100)
    const older = make('water', 50)
    registry.register(puddle)
    registry.register(older)
    registry.register(fresh)
    expect(registry.oldestBudgeted('water', 100)).toBe(older)
    registry.unregister(older.body)
    expect(registry.oldestBudgeted('water', 100)).toBeUndefined()
    expect(registry.oldestBudgeted('water', 101)).toBe(fresh)
  })
})
