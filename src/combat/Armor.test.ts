import { describe, expect, it } from 'vitest'
import { Armor } from './Armor.ts'

describe('Armor', () => {
  it('absorbiert bis 0 und gibt den Rest weiter', () => {
    const a = new Armor()
    a.equip(25)
    expect(a.absorb(10)).toBe(0)
    expect(a.current).toBe(15)
    expect(a.absorb(20)).toBe(5)
    expect(a.current).toBe(0)
    expect(a.active).toBe(false)
  })

  it('ohne Rüstung geht alles ins Leben, ungültige Werte zählen 0', () => {
    const a = new Armor()
    expect(a.absorb(7)).toBe(7)
    a.equip(25)
    expect(a.absorb(-3)).toBe(0)
    expect(a.absorb(Number.NaN)).toBe(0)
    expect(a.current).toBe(25)
  })

  it('equip setzt immer auf volle Punkte, clear leert', () => {
    const a = new Armor()
    a.equip(25)
    a.absorb(9)
    a.equip(25)
    expect(a.current).toBe(25)
    expect(a.max).toBe(25)
    a.clear()
    expect(a.active).toBe(false)
  })
})
