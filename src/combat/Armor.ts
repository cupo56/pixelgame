/** Schutzpunkte vor dem Leben (Metallrüstung). Rein, ohne Phaser. */
export class Armor {
  private value = 0
  private capacity = 0

  get current(): number { return this.value }
  get max(): number { return this.capacity }
  get active(): boolean { return this.value > 0 }

  equip(points: number): void {
    this.capacity = Math.max(0, points)
    this.value = this.capacity
  }

  clear(): void { this.value = 0 }

  /** Zieht amount ab und liefert den Rest, der ins Leben geht (nie negativ). */
  absorb(amount: number): number {
    if (!Number.isFinite(amount) || amount <= 0) return 0
    const taken = Math.min(this.value, amount)
    this.value -= taken
    return amount - taken
  }
}
