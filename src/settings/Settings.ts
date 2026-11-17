const SAVE_KEY = 'elements.settings.v1'

/** Einstellungen sind unabhängig von Welt- und Skill-Fortschritt gespeichert. */
class Settings {
  private shake = true
  private canSave = true

  constructor() {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      let saved: unknown
      try { saved = JSON.parse(raw ?? '{}') }
      catch { return }
      if (saved && typeof saved === 'object' && 'cameraShake' in saved && typeof saved.cameraShake === 'boolean') {
        this.shake = saved.cameraShake
      }
    } catch { this.canSave = false }
  }

  get cameraShake(): boolean { return this.shake }
  get saveAvailable(): boolean { return this.canSave }

  setCameraShake(enabled: boolean): void {
    this.shake = enabled
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ cameraShake: this.shake }))
      this.canSave = true
    } catch { this.canSave = false }
  }
}

export const settings = new Settings()
