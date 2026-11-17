/** Gemeinsame Lebenspunkte für Spieler und Gegner. */
export class Health {
  readonly max: number
  private value: number

  constructor(max: number) {
    this.max = max
    this.value = max
  }

  get current(): number { return this.value }
  get alive(): boolean { return this.value > 0 }

  hurt(amount: number): boolean {
    if (!this.alive || !Number.isFinite(amount) || amount <= 0) return false
    this.value = Math.max(0, this.value - amount)
    return true
  }

  restore(): void { this.value = this.max }
}
