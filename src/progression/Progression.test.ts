import { describe, expect, it } from 'vitest'
import { Progression, PROGRESSION_SAVE_KEY } from './Progression.ts'

const memory = (seed: string | null = null) => {
  let data = seed
  return { getItem: () => data, setItem: (_key: string, value: string) => { data = value } }
}

describe('element progression', () => {
  it('keeps all four elements independent, with one initial point and a free foundation', () => {
    const progress = new Progression(null)
    expect(progress.get('earth')).toEqual({ level: 1, xp: 0, xpToNext: 60, points: 1, ranks: { foundation: 1 } })
    progress.awardExperience('fire', 60)
    expect(progress.get('fire')).toMatchObject({ level: 2, xp: 0, xpToNext: 90, points: 2 })
    expect(progress.get('earth').level).toBe(1)
    expect(progress.get('water').xp).toBe(0)
    expect(progress.get('air').xp).toBe(0)
  })

  it('carries surplus XP over multiple levels and ignores invalid rewards', () => {
    const progress = new Progression(null)
    progress.awardExperience('water', 285)
    expect(progress.get('water')).toMatchObject({ level: 4, xp: 15, xpToNext: 150, points: 4 })
    for (const amount of [NaN, Infinity, -30, 0, 0.8]) progress.awardExperience('water', amount)
    expect(progress.get('water')).toMatchObject({ level: 4, xp: 15 })
  })

  it('enforces points, prerequisites, levels and rank limits atomically', () => {
    const progress = new Progression(memory())
    expect(progress.purchase('earth', 'focus')).toBe(false)
    expect(progress.purchase('earth', 'power')).toBe(true)
    expect(progress.get('earth').points).toBe(0)
    expect(progress.purchase('earth', 'power')).toBe(false)
    progress.awardExperience('earth', 60)
    expect(progress.purchase('earth', 'focus')).toBe(true)
    expect(progress.cooldownMultiplier('earth')).toBeCloseTo(0.95)
    progress.awardExperience('earth', 1_000)
    expect(progress.purchase('earth', 'power')).toBe(true)
    expect(progress.purchase('earth', 'power')).toBe(true)
    expect(progress.purchase('earth', 'power')).toBe(false)
    expect(progress.damageMultiplier('earth')).toBeCloseTo(1.15)
    expect(progress.damageMultiplier('fire')).toBe(1)
    expect(progress.purchase('earth', 'foundation')).toBe(false)
    expect(progress.purchase('earth', 'unknown')).toBe(false)
    expect(progress.purchase('earth', 'ability')).toBe(false)
    expect(progress.purchase('earth', 'combo')).toBe(false)
    expect(progress.isUnlocked('earth', 'ability')).toBe(false)
  })

  it('persists purchases and XP without trusting writable snapshots', () => {
    const storage = memory(), progress = new Progression(storage)
    progress.awardExperience('air', 160)
    progress.purchase('air', 'power'); progress.purchase('air', 'focus')
    const snapshot = progress.get('air')
    snapshot.ranks.power = 999; snapshot.points = 999
    const restored = new Progression(storage)
    expect(restored.get('air')).toEqual({ level: 3, xp: 10, xpToNext: 120, points: 1, ranks: { foundation: 1, power: 1, focus: 1 } })
    expect(progress.get('air')).toEqual(restored.get('air'))
    expect(JSON.parse(storage.getItem()!).version).toBe(1)
    expect(PROGRESSION_SAVE_KEY).toBe('elements.skills.v1')
  })

  it('recovers from corrupt/unsupported saves and clamps hostile rank data', () => {
    for (const save of ['{', 'null', '[]', '{"version":2,"elements":{}}']) {
      expect(new Progression(memory(save)).get('earth').points).toBe(1)
    }
    const saved = { version: 1, elements: {
      earth: { totalXp: 0, points: 999, level: 999, ranks: { foundation: 0, power: 100, focus: 100, ability: 1, combo: 1 } },
      fire: { totalXp: -70, ranks: { focus: 1 } },
      water: { totalXp: '999', ranks: [] },
    } }
    const progress = new Progression(memory(JSON.stringify(saved)))
    expect(progress.get('earth')).toMatchObject({ level: 1, points: 0, ranks: { foundation: 1, power: 1 } })
    expect(progress.get('earth').ranks.focus).toBeUndefined()
    expect(progress.get('earth').ranks.ability).toBeUndefined()
    expect(progress.get('fire').points).toBe(1)
    expect(progress.get('water').level).toBe(1)
  })

  it('retains session progress on blocked storage and supports unsubscribe', () => {
    const progress = new Progression({ getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('quota') } })
    expect(progress.saveAvailable).toBe(false)
    let changes = 0
    const off = progress.subscribe(() => changes++)
    progress.awardExperience('fire', 30)
    progress.purchase('fire', 'power')
    expect(changes).toBe(2)
    off(); progress.awardExperience('fire', 30)
    expect(changes).toBe(2)
    expect(progress.get('fire')).toMatchObject({ level: 2, points: 1 })
    expect(progress.saveAvailable).toBe(false)
  })
})
