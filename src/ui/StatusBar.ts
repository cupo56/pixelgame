/**
 * Statusleiste als HTML über dem Canvas: Das Spiel rendert mit pixelArt und wird hochskaliert,
 * Canvas-Text wäre also immer verpixelt. Die Leiste lebt einmal pro Seite und überlebt Szenen-Neustarts.
 */
export interface StatusBarState {
  health: { current: number; max: number }
  region: { index: number; name: string }
  enemies: { alive: number; total: number }
  stones: { found: number; total: number; saved: boolean }
}

const ROOT_ID = 'statusbar'

export class StatusBar {
  private readonly root: HTMLElement
  private static instance?: StatusBar
  private readonly healthValue: HTMLElement
  private readonly healthFill: HTMLElement
  private readonly regionIndex: HTMLElement
  private readonly regionName: HTMLElement
  private readonly enemiesValue: HTMLElement
  private readonly stonesValue: HTMLElement
  private readonly stonesNote: HTMLElement
  private readonly state: StatusBarState = {
    health: { current: 100, max: 100 },
    region: { index: 1, name: 'Das Grenzland' },
    enemies: { alive: 0, total: 0 },
    stones: { found: 0, total: 3, saved: true },
  }

  static get(): StatusBar {
    return (StatusBar.instance ??= new StatusBar())
  }

  private constructor() {
    const existing = document.getElementById(ROOT_ID)
    const root = existing ?? document.createElement('header')
    this.root = root
    root.id = ROOT_ID
    root.innerHTML = `
      <div class="sb-brand"><span class="sb-title">ELEMENTS</span><span class="sb-sub">Erkundungs-Prototyp</span></div>
      <div class="sb-region"><span class="sb-label">Ort</span><span class="sb-region-index"></span><span class="sb-region-name"></span></div>
      <div class="sb-health"><span class="sb-label">Leben</span><span class="sb-health-bar"><span class="sb-health-fill"></span></span><span class="sb-health-value"></span></div>
      <div class="sb-enemies"><span class="sb-label">Plüschgegner</span><span class="sb-enemies-value"></span></div>
      <div class="sb-stones"><span class="sb-label">Grenzsteine</span><span class="sb-stones-value"></span><span class="sb-stones-note"></span></div>
      <button type="button" class="sb-skills">K · Skilltrees</button>
      <div class="sb-keys">M Karte · Esc Menü</div>
    `
    if (!existing) document.body.prepend(root)
    const pick = (selector: string): HTMLElement => {
      const element = root.querySelector<HTMLElement>(selector)
      if (!element) throw new Error(`Statusleiste: ${selector} fehlt`)
      return element
    }
    this.healthValue = pick('.sb-health-value')
    this.healthFill = pick('.sb-health-fill')
    this.regionIndex = pick('.sb-region-index')
    this.regionName = pick('.sb-region-name')
    this.enemiesValue = pick('.sb-enemies-value')
    this.stonesValue = pick('.sb-stones-value')
    this.stonesNote = pick('.sb-stones-note')
    this.render()
  }

  setVisible(visible: boolean): void { this.root.style.display = visible ? '' : 'none' }

  onSkills(callback: () => void): () => void {
    const button = this.root.querySelector<HTMLButtonElement>('.sb-skills')!
    button.addEventListener('click', callback)
    return () => button.removeEventListener('click', callback)
  }

  /** Aktueller Ortsname, z. B. für Browserprüfungen. */
  get region(): string {
    return this.state.region.name
  }

  setHealth(current: number, max: number): void {
    if (current === this.state.health.current && max === this.state.health.max) return
    this.state.health = { current, max }
    this.render()
  }

  setRegion(index: number, name: string): void {
    if (name === this.state.region.name && index === this.state.region.index) return
    this.state.region = { index, name }
    this.render()
  }

  setEnemies(alive: number, total: number): void {
    if (alive === this.state.enemies.alive && total === this.state.enemies.total) return
    this.state.enemies = { alive, total }
    this.render()
  }

  setStones(found: number, total: number, saved: boolean): void {
    const s = this.state.stones
    if (found === s.found && total === s.total && saved === s.saved) return
    this.state.stones = { found, total, saved }
    this.render()
  }

  private render(): void {
    const { health, region, enemies, stones } = this.state
    const ratio = health.max > 0 ? health.current / health.max : 0
    this.healthValue.textContent = `${health.current} / ${health.max}`
    this.healthFill.style.width = `${Math.round(ratio * 100)}%`
    this.healthFill.classList.toggle('is-low', health.current <= 30)
    this.regionIndex.textContent = String(region.index).padStart(2, '0')
    this.regionName.textContent = region.name
    this.enemiesValue.textContent = `${enemies.alive} / ${enemies.total}`
    this.stonesValue.textContent = `${stones.found} / ${stones.total}`
    this.stonesNote.textContent = stones.saved ? 'lokal gespeichert' : 'nur diese Sitzung'
  }
}
