import Phaser from 'phaser'
import { settings } from '../settings/Settings.ts'
import '../ui/menu.css'

const ELEMENT_MARKS = [
  ['earth', 'Erde', '<path d="M20 4 36 32H4Z M13 19h14 M9 26h22"/>'],
  ['fire', 'Feuer', '<path d="M23 3c4 11-3 12 2 17 3-2 5-4 5-7 12 15 3 24-10 24C7 37 3 28 8 20c2 4 5 6 6 3-3-9 9-11 9-20Z"/>'],
  ['water', 'Wasser', '<path d="M20 3C17 12 7 18 7 26a13 13 0 0 0 26 0C33 18 23 12 20 3Z M13 27c0 4 3 6 7 6"/>'],
  ['air', 'Luft', '<path d="M4 15h23c9 0 9-11 2-11-4 0-6 3-6 6 M4 21h29 M4 27h17c9 0 9 10 2 10-4 0-6-3-6-6"/>'],
] as const

/** Menü und Optionen als scharfes HTML; keine laufende Spielwelt im Hintergrund. */
export class MenuScene extends Phaser.Scene {
  private root?: HTMLElement
  private listeners?: AbortController
  private optionsOpen = false

  constructor() { super('MenuScene') }

  create(): void {
    this.optionsOpen = false
    // Phaser behält globale Tastensperren nach dem Szenenende. Im HTML-Menü
    // müssen Space/Enter wieder native Buttons und Checkboxen bedienen können.
    this.input.keyboard?.clearCaptures()
    this.cameras.main.setBackgroundColor('#071820')
    const hud = document.getElementById('hudbar')
    if (hud) hud.style.display = 'none'
    document.getElementById('main-menu')?.remove()
    this.listeners = new AbortController()
    const root = document.createElement('main')
    root.id = 'main-menu'
    root.innerHTML = `
      <div class="menu-landscape" aria-hidden="true"><div class="menu-moon"></div><div class="menu-ridge menu-ridge-back"></div><div class="menu-ridge menu-ridge-front"></div><div class="menu-horizon"></div></div>
      <div class="menu-frame">
        <header class="menu-heading"><p class="menu-eyebrow">Das Grenzland</p><h1>ELEMENTS</h1><p class="menu-intro">Vier Elemente. Dein eigener Weg.</p></header>
        <section class="menu-home" aria-label="Hauptmenü">
          <div class="menu-elements">${ELEMENT_MARKS.map(([id, label, svg]) => `<div class="menu-element menu-element-${id}"><span class="menu-element-mark"><svg viewBox="0 0 40 40" aria-hidden="true">${svg}</svg></span><span>${label}</span></div>`).join('')}</div>
          <div class="menu-actions"><button class="menu-button menu-button-primary" data-action="play">Spiel starten <span aria-hidden="true">↗</span></button><button class="menu-button" data-action="options">Optionen <span aria-hidden="true">＋</span></button></div>
          <p class="menu-save-note">Erkunde die Welt und entwickle deine Elemente.</p>
        </section>
        <section class="menu-options" aria-labelledby="menu-options-title" hidden>
          <div class="menu-options-title"><p class="menu-eyebrow">Dein Spiel</p><h2 id="menu-options-title">Optionen</h2></div>
          <label class="menu-option-row"><span><strong>Kamerawackeln</strong><small>Rückmeldung bei Angriffen und Treffern</small></span><input type="checkbox" name="camera-shake" ${settings.cameraShake ? 'checked' : ''}><span class="menu-toggle" aria-hidden="true"></span></label>
          <div class="menu-option-row"><span><strong>Anzeige</strong><small>Das gesamte Spiel im Vollbild anzeigen</small></span><button class="menu-small-button" data-action="fullscreen">Vollbild einschalten</button></div>
          <p class="menu-options-note" role="status"></p>
          <div class="menu-controls"><h3>Steuerung</h3><dl><div><dt>A / D</dt><dd>Bewegen</dd></div><div><dt>Leertaste</dt><dd>Springen</dd></div><div><dt>S halten</dt><dd>Bauchlage</dd></div><div><dt>Linksklick</dt><dd>Angreifen / halten zum Aufladen</dd></div><div><dt>Mausrad / 1–4</dt><dd>Element wechseln</dd></div><div><dt>M</dt><dd>Karte</dd></div><div><dt>K</dt><dd>Skilltree</dd></div><div><dt>Esc</dt><dd>Zum Startbildschirm</dd></div></dl></div>
          <button class="menu-button" data-action="back"><span aria-hidden="true">←</span> Zurück</button>
        </section>
        <footer class="menu-footer"><span>ERKUNDUNGS-PROTOTYP</span><span>ERDE · FEUER · WASSER · LUFT</span></footer>
      </div>`
    document.body.append(root)
    this.root = root
    const options = { signal: this.listeners.signal }
    root.querySelector<HTMLButtonElement>('[data-action="play"]')!.addEventListener('click', () => {
      this.scene.start('GameScene')
    }, options)
    root.querySelector<HTMLButtonElement>('[data-action="options"]')!.addEventListener('click', () => this.showOptions(true), options)
    root.querySelector<HTMLButtonElement>('[data-action="back"]')!.addEventListener('click', () => this.showOptions(false), options)
    root.querySelector<HTMLInputElement>('[name="camera-shake"]')!.addEventListener('change', event => {
      settings.setCameraShake((event.target as HTMLInputElement).checked)
      this.showSaveState()
    }, options)
    root.querySelector<HTMLButtonElement>('[data-action="fullscreen"]')!.addEventListener('click', () => { void this.toggleFullscreen() }, options)
    document.addEventListener('fullscreenchange', () => this.refreshFullscreen(), options)
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.optionsOpen) {
        event.preventDefault()
        this.showOptions(false)
      }
    }, options)
    this.refreshFullscreen()
    this.showSaveState()
    root.querySelector<HTMLButtonElement>('[data-action="play"]')!.focus()
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this)
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this)
  }

  private showOptions(open: boolean): void {
    if (!this.root) return
    this.optionsOpen = open
    this.root.querySelector<HTMLElement>('.menu-home')!.hidden = open
    this.root.querySelector<HTMLElement>('.menu-options')!.hidden = !open
    this.root.classList.toggle('menu-show-options', open)
    const focusTarget = open ? '[name="camera-shake"]' : '[data-action="options"]'
    this.root.querySelector<HTMLElement>(focusTarget)?.focus()
  }

  private showSaveState(): void {
    const note = this.root?.querySelector<HTMLElement>('.menu-options-note')
    if (note) note.textContent = settings.saveAvailable ? 'Einstellungen werden automatisch auf diesem Gerät gespeichert.' : 'Einstellungen gelten für diese Sitzung; der Browser erlaubt kein lokales Speichern.'
  }

  private refreshFullscreen(): void {
    const button = this.root?.querySelector<HTMLButtonElement>('[data-action="fullscreen"]')
    if (!button) return
    button.textContent = document.fullscreenElement ? 'Vollbild verlassen' : 'Vollbild einschalten'
    button.disabled = !document.fullscreenEnabled && !document.fullscreenElement
    if (button.disabled) button.textContent = 'Nicht verfügbar'
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
      this.showSaveState()
    } catch {
      const note = this.root?.querySelector<HTMLElement>('.menu-options-note')
      if (note) note.textContent = 'Vollbild konnte in diesem Browser nicht aktiviert werden.'
    }
    this.refreshFullscreen()
  }

  private cleanup(): void {
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this)
    this.events.off(Phaser.Scenes.Events.DESTROY, this.cleanup, this)
    this.listeners?.abort()
    this.listeners = undefined
    this.root?.remove()
    this.root = undefined
  }
}
