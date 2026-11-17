import { beforeEach, describe, expect, it, vi } from 'vitest'

const body = (): MatterJS.BodyType => {
  const body = {} as MatterJS.BodyType
  body.parent = body
  return body
}

beforeEach(() => vi.resetModules())

describe('damage experience integration', () => {
  it('attributes only successful hits and splits a shared target XP budget between actual elements', async () => {
    const { registerEnemy, damageEnemy } = await import('../combat/damage.ts')
    const { progression } = await import('./Progression.ts')
    const target = body()
    registerEnemy(target, () => true)
    expect(damageEnemy(body(), 20, 'air')).toBe(false)
    expect(damageEnemy(target, 0, 'air')).toBe(false)
    expect(damageEnemy(target, Infinity, 'air')).toBe(false)
    damageEnemy(target, 10, 'earth')
    damageEnemy(target, 100, 'fire')
    damageEnemy(target, 100, 'water')
    expect(progression.get('earth').xp).toBe(10)
    expect(progression.get('fire').xp).toBe(20)
    expect(progression.get('water').xp).toBe(0)
    expect(progression.get('air').xp).toBe(0)
  })

  it('caps repeated droplets and does not award blocked or unattributed hits', async () => {
    const { registerEnemy, damageEnemy } = await import('../combat/damage.ts')
    const { progression } = await import('./Progression.ts')
    const blocked = body(), target = body()
    registerEnemy(blocked, () => false)
    registerEnemy(target, () => true)
    damageEnemy(blocked, 30, 'water')
    damageEnemy(target, 10)
    for (let i = 0; i < 100; i++) damageEnemy(target, 1, 'water')
    expect(progression.get('water').xp).toBe(20)
  })

  it('applies purchased damage ranks and credits the final hit even if the receiver unregisters on death', async () => {
    const { registerEnemy, unregisterEnemy, damageEnemy } = await import('../combat/damage.ts')
    const { progression } = await import('./Progression.ts')
    const target = body()
    let received = 0
    registerEnemy(target, damage => { received = damage; unregisterEnemy(target); return true })
    expect(progression.purchase('earth', 'power')).toBe(true)
    expect(damageEnemy(target, 15, 'earth')).toBe(true)
    expect(received).toBe(16)
    expect(progression.get('earth').xp).toBe(16)
    expect(damageEnemy(target, 15, 'earth')).toBe(false)
  })
})
