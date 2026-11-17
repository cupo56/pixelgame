import { ELEMENTS, type ElementId } from '../config/elements.ts'

/**
 * Einzige Spielleiste, unten als HTML über dem Canvas: links Leben, Mitte Elementauswahl, rechts Ort.
 * HTML statt Canvas, weil das Spiel mit pixelArt hochskaliert wird und Canvas-Text dadurch verpixelt.
 * Lebt einmal pro Seite und überlebt Szenen-Neustarts.
 */
const ROOT_ID = 'hudbar'

const hexColor = (color: number): string => `#${color.toString(16).padStart(6, '0')}`

export class HudBar {
  private static instance?: HudBar
  private readonly root: HTMLElement
  private readonly healthValue: HTMLElement
  private readonly healthFill: HTMLElement
  private readonly regionName: HTMLElement
  private readonly items = new Map<ElementId, HTMLElement>()
  private health = { current: -1, max: -1 }
  private regionLabel = ''
  private selected?: ElementId

  static get(): HudBar {
    return (HudBar.instance ??= new HudBar())
  }

  private constructor() {
    const existing = document.getElementById(ROOT_ID)
    const root = existing ?? document.createElement('footer')
    root.id = ROOT_ID
    this.root = root
    root.innerHTML = `
      <div class="hud-health"><span class="hud-label">Leben</span><span class="hud-health-bar"><span class="hud-health-fill"></span></span><span class="hud-health-value"></span></div>
      <div class="hud-elements"></div>
      <div class="hud-region"><span class="hud-region-name"></span></div>
    `
    const pick = (selector: string): HTMLElement => {
      const element = root.querySelector<HTMLElement>(selector)
      if (!element) throw new Error(`Spielleiste: ${selector} fehlt`)
      return element
    }
    this.healthValue = pick('.hud-health-value')
    this.healthFill = pick('.hud-health-fill')
    this.regionName = pick('.hud-region-name')
    const list = pick('.hud-elements')
    ELEMENTS.forEach((element, index) => {
      const item = document.createElement('div')
      item.className = 'hud-element'
      item.style.setProperty('--element-color', hexColor(element.color))
      const key = document.createElement('span')
      key.className = 'hud-element-key'
      key.textContent = String(index + 1)
      const label = document.createElement('span')
      label.className = 'hud-element-label'
      label.textContent = element.label
      item.append(key, label)
      list.append(item)
      this.items.set(element.id, item)
    })
    if (!existing) document.body.append(root)
  }

  /** Im Startmenü ausgeblendet, im Spiel sichtbar. */
  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none'
  }

  /** Aktueller Ortsname, z. B. für Browserprüfungen. */
  get region(): string {
    return this.regionLabel
  }

  /** Aktuell hervorgehobenes Element, z. B. für Browserprüfungen. */
  get element(): ElementId | undefined {
    return this.selected
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

  selectElement(id: ElementId): void {
    if (id === this.selected) return
    this.selected = id
    for (const [elementId, item] of this.items) item.classList.toggle('is-active', elementId === id)
  }
}
