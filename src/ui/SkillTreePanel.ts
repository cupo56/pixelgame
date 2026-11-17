import { ELEMENTS, type ElementId } from '../config/elements.ts'
import { progression } from '../progression/Progression.ts'
import { SKILL_NODES } from '../progression/skills.ts'
import './skill-tree.css'

const ICONS: Record<ElementId, string> = {
  earth: '<path d="M5 27 15 7l5 9 4-6 7 17Z"/><path d="m11 17 4 4 4-5M9 30h19"/>',
  fire: '<path d="M20 4c2 9-8 11-3 17 3-1 5-4 5-7 10 9 8 17-4 18C5 31 4 21 11 13c-1 7 3 8 3 5C13 11 19 10 20 4Z"/>',
  water: '<path d="M18 4C15 11 7 17 7 23a11 11 0 0 0 22 0C29 17 21 11 18 4Z"/><path d="M12 23c0 4 2 6 6 6"/>',
  air: '<path d="M5 13h18c7 0 7-9 1-9-3 0-4 2-4 4M3 19h25c7 0 7 10 1 10-3 0-4-2-4-4M7 25h9c6 0 6 8 1 8"/>',
}
const icon = (element: ElementId) => `<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[element]}</svg>`
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
const POINTS: Record<string, [number, number]> = {
  foundation: [300, 48], power: [150, 176], focus: [450, 176], ability: [150, 304], combo: [450, 304],
}

/** DOM-Menü über dem pausierten Spiel; alle Käufe gehen durch das Fortschrittsmodell. */
export class SkillTreePanel {
  private readonly root: HTMLDivElement
  private readonly onClose: () => void
  private readonly unsubscribe: () => void
  private element: ElementId = 'earth'
  private selectedNode = 'power'
  private previousFocus: HTMLElement | null = null
  private message = ''

  constructor(onClose: () => void) {
    this.onClose = onClose
    this.root = document.createElement('div')
    this.root.className = 'skill-overlay'
    this.root.id = 'skill-tree-panel'
    this.root.hidden = true
    this.root.addEventListener('click', this.onClick)
    this.root.addEventListener('keydown', this.onKeyDown)
    this.root.addEventListener('keyup', this.stopGameKeys)
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'wheel']) this.root.addEventListener(type, this.stopPointer)
    document.body.append(this.root)
    this.unsubscribe = progression.subscribe(() => { if (this.isOpen) this.render() })
  }

  get isOpen(): boolean { return !this.root.hidden }

  open(element: ElementId): void {
    if (!this.isOpen) this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    this.element = element
    this.selectedNode = 'power'
    this.message = ''
    this.root.hidden = false
    this.render()
    this.root.querySelector<HTMLButtonElement>(`[data-tab="${element}"]`)?.focus()
  }

  close(): void {
    if (!this.isOpen) return
    this.root.hidden = true
    if (this.previousFocus?.isConnected) this.previousFocus.focus()
    this.previousFocus = null
  }

  destroy(): void {
    this.close()
    this.unsubscribe()
    this.root.remove()
  }

  private readonly stopPointer = (event: Event): void => { event.stopPropagation() }

  private readonly stopGameKeys = (event: KeyboardEvent): void => {
    // K und Esc gehören der Szenensteuerung. Sonst dürfen globale Phaser-
    // Tastencaptures die native Bedienung der Menübuttons nicht unterdrücken.
    if (event.key.toLowerCase() !== 'k' && event.key !== 'Escape') event.stopPropagation()
  }

  private readonly onClick = (event: MouseEvent): void => {
    event.stopPropagation()
    const button = (event.target as Element).closest<HTMLButtonElement>('button')
    if (!button || button.disabled) return
    if (button.dataset.action === 'close') { this.onClose(); return }
    if (button.dataset.tab) {
      this.element = button.dataset.tab as ElementId
      this.selectedNode = 'power'
      this.message = ''
      this.render()
    } else if (button.dataset.node) {
      this.selectedNode = button.dataset.node
      this.message = ''
      this.render()
    } else if (button.dataset.action === 'purchase') {
      const node = SKILL_NODES.find(entry => entry.id === this.selectedNode)
      if (!node) return
      this.message = progression.purchase(this.element, node.id) ? `${node.name} verbessert.` : 'Dieser Ausbau ist derzeit nicht möglich.'
      this.render()
    }
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    this.stopGameKeys(event)
    if (event.key === 'Tab') {
      const controls = [...this.root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter(button => button.tabIndex >= 0)
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      event.stopPropagation()
    }
    const target = event.target as HTMLElement
    if (target.dataset.tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation()
      const index = ELEMENTS.findIndex(element => element.id === this.element)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (index + (event.key === 'ArrowRight' ? 1 : 3)) % 4
      this.element = ELEMENTS[next].id
      this.selectedNode = 'power'
      this.message = ''
      this.render()
      this.root.querySelector<HTMLButtonElement>(`[data-tab="${this.element}"]`)?.focus()
    }
  }

  private render(): void {
    const focus = this.root.contains(document.activeElement) ? (document.activeElement as HTMLElement)?.dataset.focusKey : undefined
    const element = ELEMENTS.find(entry => entry.id === this.element)!
    const state = progression.get(this.element)
    const color = `#${element.color.toString(16).padStart(6, '0')}`
    const selected = SKILL_NODES.find(node => node.id === this.selectedNode) ?? SKILL_NODES[0]
    const rank = state.ranks[selected.id] ?? 0
    const available = progression.canPurchase(this.element, selected.id)
    const full = rank >= selected.maxRank
    const prerequisites = (selected.requires ?? []).map(id => SKILL_NODES.find(node => node.id === id)?.name ?? id)
    const blockedRequirements = (selected.requires ?? []).filter(id => !(state.ranks[id] > 0))
    const reason = !selected.available ? 'Dieser Platz wird mit einer späteren Fähigkeit belegt.' : full ? 'Vollständig erlernt.' :
      state.level < selected.requiredLevel ? `Benötigt Element-Level ${selected.requiredLevel}.` :
      blockedRequirements.length ? `Zuerst ${blockedRequirements.map(id => SKILL_NODES.find(node => node.id === id)?.name ?? id).join(' und ')} erlernen.` :
      state.points < selected.cost ? 'Sammle weitere EP für den nächsten Fähigkeitspunkt.' : 'Bereit zum Erlernen.'
    const lines = SKILL_NODES.flatMap(node => (node.requires ?? []).map(required => {
      const from = POINTS[required], to = POINTS[node.id]
      if (!from || !to) return ''
      const path = from[1] === to[1] ? `M${from[0]} ${from[1]}H${to[0]}` :
        `M${from[0]} ${from[1]}V${(from[1] + to[1]) / 2}H${to[0]}V${to[1]}`
      return `<path class="${state.ranks[required] > 0 ? 'is-lit' : ''}" d="${path}"/>`
    })).join('')
    this.root.style.setProperty('--skill-accent', color)
    this.root.innerHTML = `
      <section class="skill-dialog" role="dialog" aria-modal="true" aria-labelledby="skill-title">
        <header class="skill-heading">
          <div><p class="skill-eyebrow">ELEMENTS / ENTWICKLUNG</p><h1 id="skill-title">Die vier Elementpfade</h1><p class="skill-subtitle">Meistere jedes Element in deinem eigenen Tempo.</p></div>
          <button class="skill-close" data-action="close" data-focus-key="close" aria-label="Skilltree schließen">Schließen <span aria-hidden="true">×</span></button>
        </header>
        <div class="skill-tabs" role="tablist" aria-label="Element auswählen">
          ${ELEMENTS.map(entry => `<button id="skill-tab-${entry.id}" class="skill-tab ${entry.id === this.element ? 'is-active' : ''}" style="--tab-accent:#${entry.color.toString(16).padStart(6, '0')}" role="tab" aria-selected="${entry.id === this.element}" aria-controls="skill-path" tabindex="${entry.id === this.element ? 0 : -1}" data-tab="${entry.id}" data-focus-key="tab-${entry.id}">${icon(entry.id)}<span>${entry.label}<small>Level ${progression.get(entry.id).level}</small></span></button>`).join('')}
        </div>
        <div class="skill-path" id="skill-path" role="tabpanel" aria-labelledby="skill-tab-${this.element}">
          <div class="skill-progress">
            <div class="skill-level"><span class="skill-element-symbol">${icon(this.element)}</span><div><span class="skill-eyebrow">${element.label.toUpperCase()}</span><strong>Level ${state.level}</strong></div></div>
            <div class="skill-experience"><div><span>Erfahrung</span><strong>${state.xp} / ${state.xpToNext} EP</strong></div><progress max="${state.xpToNext}" value="${state.xp}" aria-label="${element.label}: Erfahrung zum nächsten Level"></progress><small>Nächster Level: +1 Fähigkeitspunkt</small></div>
            <div class="skill-points"><strong>${state.points}</strong><span>${state.points === 1 ? 'Punkt verfügbar' : 'Punkte verfügbar'}</span></div>
          </div>
          <div class="skill-content">
            <div class="skill-tree" aria-label="${element.label}-Skilltree">
              <svg class="skill-connectors" viewBox="0 0 600 352" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
              ${SKILL_NODES.map(node => {
                const owned = state.ranks[node.id] ?? 0
                const ready = progression.canPurchase(this.element, node.id)
                const status = !node.available ? 'Später verfügbar' : owned >= node.maxRank ? 'Erlernt' : ready ? 'Ausbaubar' : owned > 0 ? 'In Ausbildung' : 'Gesperrt'
                const glyph = node.kind === 'root' ? icon(this.element) : node.id === 'power' ? '<span aria-hidden="true">↗</span>' : node.id === 'focus' ? '<span aria-hidden="true">◎</span>' : node.kind === 'combo' ? '<span aria-hidden="true">◇</span>' : '<span aria-hidden="true">✧</span>'
                return `<button class="skill-node skill-node-${node.id} ${owned > 0 ? 'is-owned' : ''} ${ready ? 'is-ready' : ''} ${!node.available ? 'is-future' : ''} ${node.id === selected.id ? 'is-selected' : ''}" data-node="${node.id}" data-focus-key="node-${node.id}" aria-pressed="${node.id === selected.id}" aria-label="${escape(node.name)}, ${status}, Rang ${owned} von ${node.maxRank}"><span class="skill-node-symbol">${glyph}</span><span class="skill-node-copy"><strong>${escape(node.name)}</strong><small>${status}</small></span><span class="skill-rank">${node.kind === 'root' ? '✓' : !node.available ? '—' : `${owned}/${node.maxRank}`}</span></button>`
              }).join('')}
            </div>
            <aside class="skill-detail" aria-label="Gewählte Verbesserung">
              <span class="skill-eyebrow">${selected.kind === 'root' ? 'GRUNDLAGE' : selected.kind === 'ability' ? 'FÄHIGKEIT / VORSCHAU' : selected.kind === 'combo' ? 'COMBO / VORSCHAU' : 'PASSIVE VERBESSERUNG'}</span>
              <h2>${escape(selected.name)}</h2><p>${escape(selected.description)}</p>
              <dl><div><dt>Rang</dt><dd>${rank} / ${selected.maxRank}</dd></div><div><dt>Element-Level</dt><dd>${selected.requiredLevel}</dd></div>${prerequisites.length ? `<div><dt>Voraussetzung</dt><dd>${prerequisites.map(escape).join(', ')}</dd></div>` : ''}${selected.available && !full ? `<div><dt>Kosten je Rang</dt><dd>${selected.cost} ${selected.cost === 1 ? 'Punkt' : 'Punkte'}</dd></div>` : ''}</dl>
              <p class="skill-requirement ${available ? 'is-ready' : ''}">${escape(reason)}</p>
              <button class="skill-purchase" data-action="purchase" data-focus-key="purchase" ${available ? '' : 'disabled'}>${!selected.available ? 'Noch nicht verfügbar' : full ? 'Vollständig erlernt' : rank > 0 ? 'Nächsten Rang erlernen' : 'Erlernen'}</button>
              <p class="skill-feedback" role="status">${escape(this.message)}</p>
            </aside>
          </div>
        </div>
        <footer class="skill-footer"><p>Treffer mit einem Element bringen EP für seinen Pfad. Bestehende Angriffe bleiben verfügbar; neue Fähigkeiten und Combos folgen später.</p><span>K schließen · Esc Startbildschirm</span></footer>
        ${progression.saveAvailable ? '' : '<p class="skill-save-warning" role="status">Speichern ist im Browser nicht verfügbar. Dein Fortschritt gilt nur für diese Sitzung.</p>'}
      </section>`
    if (focus) {
      const replacement = this.root.querySelector<HTMLButtonElement>(`[data-focus-key="${focus}"]`)
      if (replacement && !replacement.disabled) replacement.focus({ preventScroll: true })
      else this.root.querySelector<HTMLButtonElement>(`[data-node="${this.selectedNode}"]`)?.focus({ preventScroll: true })
    }
  }
}
