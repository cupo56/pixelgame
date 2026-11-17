import { describe, expect, it } from 'vitest'
import { KIND_ORDER, REACTIONS, lookupReaction, reactionKey } from './reactions.ts'
import type { Substance, SubstanceKind } from './Substance.ts'

const fake = (kind: SubstanceKind): Substance => ({
  kind, body: { id: 1 } as unknown as MatterJS.BodyType, temperatureC: 15, massKg: 1, wetnessKg: 0, heatJ: 0,
  restingMs: 0, createdAt: 0, remove: () => {},
})

describe('Reaktionstabelle', () => {
  it('reactionKey ist symmetrisch und folgt KIND_ORDER', () => {
    expect(reactionKey('water', 'fire')).toBe('fire:water')
    expect(reactionKey('fire', 'water')).toBe('fire:water')
    expect(KIND_ORDER.indexOf('fire')).toBeLessThan(KIND_ORDER.indexOf('water'))
  })

  it('alle Paare der Designmatrix haben einen Eintrag', () => {
    for (const key of ['fire:water', 'fire:ice', 'fire:earth', 'fire:sand', 'fire:metal', 'water:earth', 'water:sand', 'water:metal', 'ice:earth']) {
      expect(REACTIONS.has(key), key).toBe(true)
    }
  })

  it('lookupReaction liefert die Stoffe in Tabellenreihenfolge', () => {
    const water = fake('water')
    const fire = fake('fire')
    const found = lookupReaction(water, fire)
    expect(found?.first).toBe(fire)
    expect(found?.second).toBe(water)
    expect(found?.handler).toBe(REACTIONS.get('fire:water'))
  })

  it('Paare ohne Reaktion liefern undefined', () => {
    expect(lookupReaction(fake('ice'), fake('ice'))).toBeUndefined()
    expect(lookupReaction(fake('sand'), fake('metal'))).toBeUndefined()
  })
})
