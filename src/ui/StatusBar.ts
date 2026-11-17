/**
 * Statusleiste oben als HTML über dem Canvas: Das Spiel rendert mit pixelArt und wird hochskaliert,
 * Canvas-Text wäre also immer verpixelt. Zeigt nur Leben und Ort; lebt einmal pro Seite und überlebt Szenen-Neustarts.
 */
const ROOT_ID = 'statusbar'

export class StatusBar {
  private static instance?: StatusBar
  private readonly healthValue: HTMLElement
  private readonly healthFill: HTMLElement
  private readonly regionName: HTMLElement
  private health = { current: -1, max: -1 }
  private regionLabel = ''

  static get(): StatusBar {
    return (StatusBar.instance ??= new StatusBar())
  }

  private constructor() {
    const existing = document.getElementById(ROOT_ID)
    const root = existing ?? document.createElement('header')
    root.id = ROOT_ID
    root.innerHTML = `
      <div class="sb-health"><span class="sb-label">Leben</span><span class="sb-health-bar"><span class="sb-health-fill"></span></span><span class="sb-health-value"></span></div>
      <div class="sb-region"><span class="sb-region-name"></span></div>
    `
    if (!existing) document.body.prepend(root)
    const pick = (selector: string): HTMLElement => {
      const element = root.querySelector<HTMLElement>(selector)
      if (!element) throw new Error(`Statusleiste: ${selector} fehlt`)
      return element
    }
    this.healthValue = pick('.sb-health-value')
    this.healthFill = pick('.sb-health-fill')
    this.regionName = pick('.sb-region-name')
  }

  /** Aktueller Ortsname, z. B. für Browserprüfungen. */
  get region(): string {
    return this.regionLabel
  }

  setHealth(current: number, max: number): void {
    if (current === this.health.current && max === this.health.max) return
    this.health = { current, max }
    this.healthValue.textContent = `${current} / ${max}`
    this.healthFill.style.width = `${Math.round((max > 0 ? current / max : 0) * 100)}%`
    this.healthFill.classList.toggle('is-low', current <= 30)
  }

  setRegion(name: string): void {
    if (name === this.regionLabel) return
    this.regionLabel = name
    this.regionName.textContent = name
  }
}
