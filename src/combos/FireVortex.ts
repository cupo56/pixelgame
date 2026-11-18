import type Phaser from 'phaser'
import { COMBOS } from '../config/combos.ts'
import { damageEnemy, isEnemy } from '../combat/damage.ts'
import { impactRing } from '../effects/impact.ts'
import type { Fireball } from '../materials/FireMaterial.ts'
import type { ReactionSystem } from '../materials/ReactionSystem.ts'
import { steamOffEnemy } from '../materials/SteamEffect.ts'
import { vortexHeatJ, vortexRockHeatJ, vortexTickDamage } from './fireVortexMath.ts'

/** Geometrie eines Wirbels in Pixeln, wie ihn `AirTornadoAttack` je Frame übergibt. */
export interface VortexGeometry {
  x: number
  centerY: number
  radius: number
  height: number
  direction: number
  /** Ausgewachsen: erst dann nimmt der Wirbel Stoffe auf. */
  open: boolean
  remainingMs: number
}

interface FireState {
  fireball: Fireball
  q0: number
  elapsedMs: number
  durationMs: number
  angle: number
  tickMs: number
}

const ORBIT_RAD_PER_S = 6
/** Anteil der Abweichung zur Umlaufbahn, der je Physikschritt als Geschwindigkeit ausgeglichen wird. */
const FOLLOW = 0.22
const TICK_COLOR = 0xff8a1f

/**
 * Feuerwirbel: Ein Feuerball im Wirbel wird gefangen und kreist, statt zu explodieren. Sein Wärmeinhalt Q
 * sinkt linear über die Restdauer des Wirbels; solange er brennt, schaden Ticks den Gegnern im Wirbel und
 * heizen die gefangenen Blöcke (Feuerwirbel plus Steinhagel ergibt eine Meteor-Salve).
 * Beliebig viele Feuerbälle pro Wirbel, wie bei den Erdblöcken. Zustand je Wirbel über dessen Schlüsselobjekt.
 */
export class FireVortex {
  private readonly scene: Phaser.Scene
  private readonly system: ReactionSystem
  private readonly states = new Map<object, FireState[]>()

  constructor(scene: Phaser.Scene, system: ReactionSystem) {
    this.scene = scene
    this.system = system
  }

  /** Je Physik-Frame und Wirbel aufrufen; `rocks` sind die gefangenen Erdblöcke dieses Wirbels. */
  update(key: object, geometry: VortexGeometry, dtMs: number, rocks: readonly MatterJS.BodyType[]): void {
    const fire = this.system.materials.fire
    if (!fire) return
    // Von außen entfernte Feuerbälle (z. B. von Wasser gelöscht) verwerfen.
    const alive = (this.states.get(key) ?? []).filter((s) => this.system.registry.get(s.fireball.body))
    if (geometry.open) alive.push(...this.captureAll(geometry, alive))
    if (alive.length === 0) {
      this.states.delete(key)
      return
    }
    const remaining: FireState[] = []
    for (const state of alive) {
      state.elapsedMs += dtMs
      const q = vortexHeatJ(state.q0, state.elapsedMs, state.durationMs)
      if (q <= 0) {
        fire.fizzle(state.fireball)
        continue
      }
      state.fireball.heatJ = q
      this.steer(state, geometry, dtMs)
      state.tickMs += dtMs
      while (state.tickMs >= COMBOS.fireVortexTickMs) {
        state.tickMs -= COMBOS.fireVortexTickMs
        this.tick(state, q, geometry, rocks)
      }
      remaining.push(state)
    }
    if (remaining.length > 0) this.states.set(key, remaining)
    else this.states.delete(key)
  }

  /** Salve: Alle Feuerbälle fliegen mit ihrem Rest-Q als normale Feuerbälle in Schussrichtung weiter. */
  release(key: object, direction: Phaser.Math.Vector2): void {
    const list = this.states.get(key)
    if (!list) return
    this.states.delete(key)
    for (const state of list) this.system.materials.fire?.release(state.fireball, direction)
  }

  /** Wirbel endet oder wird abgebrochen: alle Feuerbälle erlöschen ohne Explosion. */
  end(key: object): void {
    const list = this.states.get(key)
    if (!list) return
    this.states.delete(key)
    for (const state of list) this.system.materials.fire?.fizzle(state.fireball)
  }

  /** Fängt jeden freien Feuerball im Wirbelvolumen. */
  private captureAll(geometry: VortexGeometry, known: readonly FireState[]): FireState[] {
    const fire = this.system.materials.fire
    if (!fire) return []
    const added: FireState[] = []
    for (const substance of this.system.registry.ofKind('fire')) {
      const fireball = substance as Fireball
      if (fireball.captured || known.some((s) => s.fireball === fireball)) continue
      const dx = (fireball.body.position.x - geometry.x) / (geometry.radius + 12)
      const dy = (fireball.body.position.y - geometry.centerY) / (geometry.height * 0.55)
      if (dx * dx + dy * dy > 1 || !fire.capture(fireball)) continue
      added.push({
        fireball, q0: fireball.heatJ, elapsedMs: 0, durationMs: Math.max(1, geometry.remainingMs),
        angle: Math.atan2(dy, dx), tickMs: 0,
      })
    }
    return added
  }

  /** Der Feuerball hat keine Gravitation: eine weiche Federführung zur Umlaufbahn genügt. */
  private steer(state: FireState, geometry: VortexGeometry, dtMs: number): void {
    state.angle += ORBIT_RAD_PER_S * geometry.direction * (dtMs / 1000)
    const rx = Math.max(10, geometry.radius * 0.55)
    const ry = Math.max(6, geometry.height * 0.22)
    const targetX = geometry.x + Math.cos(state.angle) * rx
    const targetY = geometry.centerY + Math.sin(state.angle) * ry
    const body = state.fireball.body
    this.scene.matter.body.setVelocity(body, { x: (targetX - body.position.x) * FOLLOW, y: (targetY - body.position.y) * FOLLOW })
  }

  private tick(state: FireState, q: number, geometry: VortexGeometry, rocks: readonly MatterJS.BodyType[]): void {
    const damage = vortexTickDamage(q, state.q0)
    for (const body of this.scene.matter.world.getAllBodies()) {
      if (!isEnemy(body)) continue
      if (Math.abs(body.position.x - geometry.x) > geometry.radius * 1.25 ||
        Math.abs(body.position.y - geometry.centerY) > geometry.height * 0.6) continue
      if (damageEnemy(body, damage, 'fire')) {
        impactRing(this.scene, body.position.x, body.position.y, TICK_COLOR)
        steamOffEnemy(this.scene, body)
      }
    }
    const heatJ = vortexRockHeatJ(q)
    for (const rockBody of rocks) {
      const substance = this.system.registry.get(rockBody)
      if (substance) this.system.heatSubstance(substance, heatJ, { x: rockBody.position.x, y: rockBody.position.y })
    }
  }
}
