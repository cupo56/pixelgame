import { ELEMENTS, type ElementId } from '../config/elements.ts'

/**
 * Elementleiste unten als HTML (scharfe Schrift): die vier Elemente, das gewählte hervorgehoben.
 * Lebt einmal pro Seite und überlebt Szenen-Neustarts.
 */
const ROOT_ID = 'elementbar'

const hexColor = (color: number): string => `#${color.toString(16).padStart(6, '0')}`

export class ElementBar {
  private static instance?: ElementBar
  private readonly items = new Map<ElementId, HTMLElement>()
  private selected?: ElementId

  static get(): ElementBar {
    return (ElementBar.instance ??= new ElementBar())
  }

  private constructor() {
    const existing = document.getElementById(ROOT_ID)
    const root = existing ?? document.createElement('footer')
    root.id = ROOT_ID
    root.replaceChildren()
    ELEMENTS.forEach((element, index) => {
      const item = document.createElement('div')
      item.className = 'eb-item'
      item.style.setProperty('--element-color', hexColor(element.color))
      const key = document.createElement('span')
      key.className = 'eb-key'
      key.textContent = String(index + 1)
      const label = document.createElement('span')
      label.className = 'eb-label'
      label.textContent = element.label
      item.append(key, label)
      root.append(item)
      this.items.set(element.id, item)
    })
    if (!existing) document.body.append(root)
  }

  /** Aktuell hervorgehobenes Element, z. B. für Browserprüfungen. */
  get current(): ElementId | undefined {
    return this.selected
  }

  select(id: ElementId): void {
    if (id === this.selected) return
    this.selected = id
    for (const [elementId, item] of this.items) item.classList.toggle('is-active', elementId === id)
  }
}
