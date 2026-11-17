import Phaser from 'phaser'
import { ALL_CATEGORIES, COLLISION_CATEGORY } from '../config/collision.ts'
import { COMBAT } from '../config/combat.ts'
import { REACTIONS as R } from '../config/reactions.ts'
import { matterToMetersPerSecond, metersPerSecondToMatter } from '../config/physics.ts'
import { damageEnemy, isEnemy } from '../combat/damage.ts'
import { dust } from '../effects/particles.ts'
import { screenShake } from '../effects/juice.ts'
import { approachAmbient, glowFraction, sandWettingThresholdKg, solidHeatingK } from './thermo.ts'
import { mix } from './MetalMaterial.ts'
import type { Substance } from './Substance.ts'
import type { ReactionSystem } from './ReactionSystem.ts'

const ROCK_LIFETIME_MS = 10_000
const OWNER_GRACE_MS = 220
const IMPACT_MIN_SPEED_MS = 3
/** Elementkombination: Windschub skaliert mit Fläche/Masse, also 1/Kantenlänge. */
const AIR_BOOST_MS = 18
const AIR_MAX_SPEED_MS = 30
const AIR_LIFT_MS = 4.5
/** Masse des 0,5-m-Referenzblocks, auf die der Windschub bezogen ist. */
const REFERENCE_MASS_KG = 0.5 ** 3 * R.earthDensityKgM3
export const LAUNCH_MASK = (ALL_CATEGORIES & ~COLLISION_CATEGORY.player) >>> 0
const ROCK_COLOR = 0x947653
const WET_ROCK_COLOR = 0x5e4b3a

export interface Rock extends Substance {
  readonly kind: 'earth'
  readonly shape: Phaser.GameObjects.Rectangle
  readonly edgeM: number
  readonly charge: number
  expiresAt: number
  solidToPlayerAt: number
  damage: number
  hitTargets: Set<MatterJS.BodyType>
  inTornado: boolean
  readonly lastBurnAt: Map<MatterJS.BodyType, number>
}

/** Geworfene Erdblöcke: Lebenszeit, Aufprall, Windschub und Wirbel-Aufnahme. */
export class EarthMaterial {
  private readonly scene: Phaser.Scene
  private readonly system: ReactionSystem
  private readonly playerBody: MatterJS.BodyType
  private readonly rocks = new Set<Rock>()
  private readonly offStep: () => void

  constructor(scene: Phaser.Scene, system: ReactionSystem, playerBody: MatterJS.BodyType) {
    this.scene = scene
    this.system = system
    this.playerBody = playerBody
    system.attach('earth', this)
    this.offStep = system.onStep(this.step.bind(this))
    system.setWindHandler('earth', (s, direction, strength) => this.pushWithAir(s as Rock, direction, strength))
    system.setCaptureHandlers('earth', (s) => this.capture(s as Rock), (s) => this.release(s as Rock))
    system.setWhipHandler('earth', (s, waterKg) => { this.wet(s, waterKg); return true })
    system.setHeatHandler('earth', (s, heatJ) => this.heat(s as Rock, heatJ))
    scene.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
  }

  /** Übernimmt einen frisch gestarteten Block (Körper + Rechteck) aus EarthRockAttack. */
  adopt(body: MatterJS.BodyType, shape: Phaser.GameObjects.Rectangle, charge: number, edgeM: number): Substance {
    const now = this.scene.time.now
    // Matter skaliert die Drehträgheit nicht mit der mass-Option; Quadrat: I = m·a²/6.
    const edgePx = body.bounds.max.x - body.bounds.min.x
    this.scene.matter.body.setInertia(body, (body.mass * edgePx * edgePx) / 6)
    const rock: Rock = {
      kind: 'earth', body, shape, edgeM, charge,
      temperatureC: R.ambientC, massKg: body.mass, wetnessKg: 0, heatJ: 0, restingMs: 0, createdAt: now,
      expiresAt: now + ROCK_LIFETIME_MS, solidToPlayerAt: now + OWNER_GRACE_MS,
      damage: Math.round(Phaser.Math.Linear(COMBAT.earthDamage, COMBAT.chargedEarthDamage, charge)),
      hitTargets: new Set(), inTornado: false, lastBurnAt: new Map(),
      remove: () => {
        this.rocks.delete(rock)
        this.scene.matter.world?.remove(body)
        shape.destroy()
      },
    }
    this.rocks.add(rock)
    this.system.registry.register(rock)
    return rock
  }

  /** Nässe aufnehmen; ab der Oberflächenschwelle zerfällt der Block zu Sand. */
  wet(substance: Substance, waterKg: number): void {
    const rock = substance as Rock
    if (!this.rocks.has(rock)) return
    rock.wetnessKg += waterKg
    const threshold = sandWettingThresholdKg(rock.edgeM)
    this.recolor(rock)
    if (rock.wetnessKg >= threshold) this.system.materials.sand?.fromEarth(rock, rock.edgeM)
  }

  private heat(rock: Rock, heatJ: number): void {
    if (!this.rocks.has(rock)) return
    rock.temperatureC = Math.min(R.solidMaxC, rock.temperatureC + solidHeatingK(heatJ, 1, rock.massKg))
    this.recolor(rock)
  }

  /** Farbe aus Nässe (dunkler) und Hitze (dunkelrot → orange → gelb). */
  private recolor(rock: Rock): void {
    const wet = Math.min(1, rock.wetnessKg / sandWettingThresholdKg(rock.edgeM))
    const glow = glowFraction(rock.temperatureC, R.earthGlowC, R.earthWhiteC)
    const base = mix(ROCK_COLOR, WET_ROCK_COLOR, wet)
    rock.shape.setFillStyle(glow < 0.5 ? mix(base, 0x7a1e0a, glow * 2) : mix(0xff8a1f, 0xffe28a, (glow - 0.5) * 2))
  }

  destroy(): void {
    this.offStep()
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
    for (const rock of [...this.rocks]) this.system.remove(rock)
  }

  private capture(rock: Rock): boolean {
    if (rock.inTornado) return false
    rock.inTornado = true
    rock.hitTargets.clear()
    rock.expiresAt = Infinity
    rock.solidToPlayerAt = Infinity
    rock.body.collisionFilter.mask = LAUNCH_MASK
    return true
  }

  private release(rock: Rock): void {
    rock.inTornado = false
    rock.hitTargets.clear()
    rock.expiresAt = this.scene.time.now + ROCK_LIFETIME_MS
    rock.solidToPlayerAt = this.scene.time.now + OWNER_GRACE_MS
  }

  /** Vorhandenen Schwung erhalten; Luft kann denselben Block erneut als Geschoss nutzen. */
  private pushWithAir(rock: Rock, direction: Phaser.Math.Vector2, strength: number): void {
    if (strength <= 0) return
    const body = rock.body
    const deltaV = metersPerSecondToMatter(AIR_BOOST_MS * Math.cbrt(REFERENCE_MASS_KG / body.mass) * strength)
    let vx = body.velocity.x + direction.x * deltaV
    let vy = body.velocity.y + direction.y * deltaV
    const supportY = direction.y < 0.65 ? this.supportY(body) : undefined
    if (supportY !== undefined) {
      // Bodenreibung darf den Stoß nicht sofort schlucken. Leicht anheben, außer beim Zielen nach unten.
      vy = Math.min(vy, -metersPerSecondToMatter(AIR_LIFT_MS * Math.sqrt(strength)))
      dust(this.scene, body.position.x, supportY, 12, 60)
    }
    // Wiederholte Stöße bleiben kontrollierbar, ohne bestehendes höheres Tempo abzubremsen.
    const limit = Math.max(metersPerSecondToMatter(AIR_MAX_SPEED_MS), Math.hypot(body.velocity.x, body.velocity.y))
    const speed = Math.hypot(vx, vy)
    if (speed > limit) { vx *= limit / speed; vy *= limit / speed }
    this.scene.matter.body.setVelocity(body, { x: vx, y: vy })
    rock.hitTargets.clear()
    rock.expiresAt = this.scene.time.now + ROCK_LIFETIME_MS
  }

  private supportY(body: MatterJS.BodyType): number | undefined {
    const vertices = body.vertices
    if (!vertices?.length) return undefined
    const bottom = Math.max(...vertices.map((v) => v.y))
    const width = Math.max(...vertices.map((v) => v.x)) - Math.min(...vertices.map((v) => v.x))
    const probe = this.scene.matter.bodies.rectangle(body.position.x, bottom + 1, Math.max(2, width - 4), 4)
    const supports = this.scene.matter.world.getAllBodies().filter((other) =>
      other !== body && !other.isSensor && (other.isStatic || this.system.registry.kindOf(other) === 'earth') &&
      other.bounds.min.y >= bottom - 4,
    )
    return this.scene.matter.overlap(probe, supports) ? bottom : undefined
  }

  private step(dtS: number, now: number): void {
    for (const rock of [...this.rocks]) {
      if (rock.temperatureC > R.ambientC) {
        rock.temperatureC = approachAmbient(rock.temperatureC, R.earthCoolingKPerS, dtS)
        this.recolor(rock)
      }
      if (now >= rock.expiresAt) this.system.remove(rock)
      else if (now >= rock.solidToPlayerAt && rock.body.collisionFilter.mask === LAUNCH_MASK &&
        !this.scene.matter.overlap(rock.body, [this.playerBody])) {
        // Kurzer Schutz beim Abschuss; danach bleibt der Block ein festes Hindernis.
        rock.body.collisionFilter.mask = ALL_CATEGORIES
      }
    }
  }

  private onCollision(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    for (const pair of event.pairs) {
      this.impact(pair.bodyA.parent, pair.bodyB.parent)
      this.impact(pair.bodyB.parent, pair.bodyA.parent)
    }
  }

  private impact(body: MatterJS.BodyType, other: MatterJS.BodyType): void {
    const rock = this.system.registry.get(body)
    if (rock?.kind !== 'earth' || other.isSensor) return
    const earth = rock as Rock
    // Glühende Erde verbrennt Gegner bei Berührung.
    if (earth.temperatureC >= R.earthGlowC && isEnemy(other) &&
      this.scene.time.now - (earth.lastBurnAt.get(other) ?? -Infinity) >= R.glowContactIntervalMs &&
      damageEnemy(other, R.glowContactDamage)) earth.lastBurnAt.set(other, this.scene.time.now)
    const speedMs = matterToMetersPerSecond(Math.hypot(body.velocity.x - other.velocity.x, body.velocity.y - other.velocity.y))
    if (speedMs < IMPACT_MIN_SPEED_MS) return
    if (!earth.hitTargets.has(other) && damageEnemy(other, earth.damage)) earth.hitTargets.add(other)
    const energy = 0.5 * body.mass * speedMs ** 2
    dust(this.scene, body.position.x, body.position.y, Math.min(32, Math.round(energy / 900) + 6), Math.min(150, speedMs * 10))
    screenShake(this.scene, Math.min(0.018, energy / 1_500_000), 100)
  }
}
