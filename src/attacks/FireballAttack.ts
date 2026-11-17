import Phaser from 'phaser'
import type { Attack } from './Attack.ts'
import { applyBlast } from './explosion.ts'
import { metersPerSecondToMatter, metersToPixels } from '../config/physics.ts'
import { SPARK_TEXTURE, burst } from '../effects/particles.ts'
import { screenShake } from '../effects/juice.ts'

const BALL_RADIUS_M = 0.15
const BALL_MASS_KG = 0.5
const SPAWN_DISTANCE_M = 0.18
const MAX_FLIGHT_MS = 3000
const BLAST_RADIUS_M = 3
const BLAST_IMPULSE_NS = 250
const BLAST_SHAKE = 0.012
const FIRE_COLORS = [0xfff3a0, 0xff9a1f, 0xd6360b, 0x3a1a14]
const STEAM_COLORS = [0xffffff, 0xbfc9d1, 0x7f8a94]

interface Flight {
  readonly emitter: Phaser.GameObjects.Particles.ParticleEmitter
}

/** Feuerball ohne Gravitation (Magie), der beim ersten Treffer eine Druckwelle auslöst. */
export class FireballAttack implements Attack {
  readonly name = 'Feuerball'
  readonly cooldownMs = 450
  readonly energyJoules = 100

  private readonly scene: Phaser.Scene
  private readonly flights = new Map<MatterJS.BodyType, Flight>()

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    scene.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
  }

  execute(origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): void {
    const spawnX = (origin.x ?? 0) + direction.x * metersToPixels(SPAWN_DISTANCE_M)
    const spawnY = (origin.y ?? 0) + direction.y * metersToPixels(SPAWN_DISTANCE_M)
    const body = this.scene.matter.add.circle(spawnX, spawnY, metersToPixels(BALL_RADIUS_M), {
      label: 'fireball',
      mass: BALL_MASS_KG,
      isSensor: true,
      ignoreGravity: true,
      frictionAir: 0,
    })

    const speedMs = Math.sqrt((2 * this.energyJoules) / BALL_MASS_KG)
    const speed = metersPerSecondToMatter(speedMs)
    this.scene.matter.body.setVelocity(body, { x: direction.x * speed, y: direction.y * speed })

    const emitter = this.scene.add.particles(0, 0, SPARK_TEXTURE, {
      follow: body.position,
      lifespan: { min: 200, max: 450 },
      speed: { min: 5, max: 30 },
      scale: { start: 2.2, end: 0 },
      color: FIRE_COLORS,
      blendMode: 'ADD',
      frequency: 12,
      quantity: 2,
    })
    emitter.setDepth(15)

    this.flights.set(body, { emitter })
    this.scene.time.delayedCall(MAX_FLIGHT_MS, () => this.explode(body))
  }

  destroy(): void {
    this.scene.matter.world.off(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
    for (const body of [...this.flights.keys()]) {
      this.remove(body)
    }
  }

  private onCollision(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    for (const pair of event.pairs) {
      this.checkHit(pair.bodyA.parent, pair.bodyB.parent)
      this.checkHit(pair.bodyB.parent, pair.bodyA.parent)
    }
  }

  private checkHit(candidate: MatterJS.BodyType, other: MatterJS.BodyType): void {
    if (!this.flights.has(candidate) || other.isSensor || other.label === 'player') {
      return
    }
    if (other.label === 'water') {
      this.fizzle(candidate)
      return
    }
    this.explode(candidate)
  }

  /** Wasser löscht den Feuerball: nur Dampf, keine Druckwelle. */
  private fizzle(body: MatterJS.BodyType): void {
    if (!this.flights.has(body)) {
      return
    }
    burst(this.scene, body.position.x, body.position.y, STEAM_COLORS, 25, 70)
    this.retire(body)
  }

  private explode(body: MatterJS.BodyType): void {
    if (!this.flights.has(body)) {
      return
    }
    const { x, y } = body.position
    burst(this.scene, x, y, FIRE_COLORS, 40, 160)
    applyBlast(this.scene, { x, y }, BLAST_RADIUS_M, BLAST_IMPULSE_NS)
    screenShake(this.scene, BLAST_SHAKE, 160)
    this.retire(body)
  }

  /** Sofort aus der Verwaltung nehmen (verhindert Doppeltreffer), Körper erst nach dem Physikschritt löschen. */
  private retire(body: MatterJS.BodyType): void {
    const flight = this.flights.get(body)
    if (!flight) {
      return
    }
    this.flights.delete(body)
    flight.emitter.destroy()
    this.scene.time.delayedCall(0, () => this.scene.matter.world.remove(body))
  }

  private remove(body: MatterJS.BodyType): void {
    const flight = this.flights.get(body)
    if (!flight) {
      return
    }
    this.flights.delete(body)
    flight.emitter.destroy()
    this.scene.matter.world.remove(body)
  }
}
