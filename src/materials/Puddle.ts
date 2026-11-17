import Phaser from 'phaser'
import { COLLISION_CATEGORY, WATER_MASK } from '../config/collision.ts'
import { REACTIONS as R } from '../config/reactions.ts'
import { drawPuddle, fadeOut } from '../effects/decals.ts'
import { steamCloud } from './SteamEffect.ts'
import { approachAmbient, mergeTarget, puddleWidthPx } from './thermo.ts'
import type { Substance } from './Substance.ts'
import type { ReactionSystem } from './ReactionSystem.ts'

const PUDDLE_HEIGHT_PX = 3
/** Pfützen gleichen sich der Umgebung langsam an (dünner Film, großer Kontakt zum Boden). */
const PUDDLE_WARMING_K_PER_S = 2

export interface PuddleState extends Substance {
  readonly kind: 'water'
  x: number
  y: number
  widthPx: number
  lastFedAt: number
  readonly view: Phaser.GameObjects.Graphics
}

/** Ruhendes Wasser sammelt sich am Boden; Pfützen sind Sensoren und registrierte Wasserstoffe. */
export class Puddle {
  private readonly scene: Phaser.Scene
  private readonly system: ReactionSystem
  private readonly puddles = new Set<PuddleState>()
  private readonly offStep: () => void

  constructor(scene: Phaser.Scene, system: ReactionSystem) {
    this.scene = scene
    this.system = system
    system.attach('puddle', this)
    this.offStep = system.onStep(this.step.bind(this))
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.draw, this)
  }

  /** Tropfen am Boden aufnehmen: vorhandene Pfütze in Reichweite oder eine neue. */
  absorb(x: number, y: number, massKg: number, tempC: number): void {
    const target = mergeTarget([...this.puddles], x, y, R.puddleMergePx)
    if (target) {
      // Mischtemperatur nach Masse.
      target.temperatureC = (target.temperatureC * target.massKg + tempC * massKg) / (target.massKg + massKg)
      target.massKg += massKg
      target.lastFedAt = this.scene.time.now
      this.resize(target)
      return
    }
    const widthPx = puddleWidthPx(massKg)
    const body = this.scene.matter.add.rectangle(x, y - PUDDLE_HEIGHT_PX / 2, widthPx, PUDDLE_HEIGHT_PX, {
      label: 'puddle', isStatic: true, isSensor: true,
      collisionFilter: { category: COLLISION_CATEGORY.water, mask: WATER_MASK, group: 0 },
    })
    const view = this.scene.add.graphics().setDepth(5)
    const puddle: PuddleState = {
      kind: 'water', body, x, y, widthPx, lastFedAt: this.scene.time.now, view,
      temperatureC: tempC, massKg, wetnessKg: 0, heatJ: 0, restingMs: 1, createdAt: this.scene.time.now,
      remove: () => {
        this.puddles.delete(puddle)
        this.scene.matter.world?.remove(body)
        if (view.scene) fadeOut(this.scene, view)
      },
    }
    this.puddles.add(puddle)
    this.system.registry.register(puddle)
    drawPuddle(view, x, y, widthPx, this.scene.time.now)
  }

  at(x: number, y: number): PuddleState | undefined {
    return mergeTarget([...this.puddles], x, y, R.puddleMergePx)
  }

  /** Verdampft bis zu kg aus der Pfütze; liefert die tatsächlich verdampfte Masse. */
  evaporate(substance: Substance, kg: number): number {
    const puddle = substance as PuddleState
    if (!this.puddles.has(puddle)) return 0
    const taken = Math.min(puddle.massKg, kg)
    if (taken <= 0) return 0
    steamCloud(this.scene, puddle.x, puddle.y - 4, taken)
    puddle.massKg -= taken
    if (puddle.massKg < R.dropletMassKg * 0.5) this.system.remove(puddle)
    else this.resize(puddle)
    return taken
  }

  all(): PuddleState[] {
    return [...this.puddles]
  }

  destroy(): void {
    this.offStep()
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.draw, this)
    for (const puddle of [...this.puddles]) this.system.remove(puddle)
  }

  private resize(puddle: PuddleState): void {
    const widthPx = puddleWidthPx(puddle.massKg)
    if (Math.abs(widthPx - puddle.widthPx) < 0.5) return
    const bounds = puddle.body.bounds
    this.scene.matter.body.scale(puddle.body, widthPx / (bounds.max.x - bounds.min.x), 1)
    this.scene.matter.body.setPosition(puddle.body, { x: puddle.x, y: puddle.y - PUDDLE_HEIGHT_PX / 2 })
    puddle.widthPx = widthPx
  }

  private step(dtS: number, now: number): void {
    for (const puddle of [...this.puddles]) {
      puddle.temperatureC = approachAmbient(puddle.temperatureC, PUDDLE_WARMING_K_PER_S, dtS)
      if (now - puddle.lastFedAt >= R.puddleEvaporateMs) this.system.remove(puddle)
    }
  }

  private draw(): void {
    const now = this.scene.time.now
    for (const puddle of this.puddles) drawPuddle(puddle.view, puddle.x, puddle.y, puddle.widthPx, now)
  }
}
