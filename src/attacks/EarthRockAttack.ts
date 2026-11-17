import Phaser from 'phaser'
import type { Attack } from './Attack.ts'
import { matterToMetersPerSecond, metersPerSecondToMatter, metersToPixels } from '../config/physics.ts'
import { burst } from '../effects/particles.ts'
import { screenShake } from '../effects/juice.ts'

const ROCK_SIZE_M = 0.45
const ROCK_MASS_KG = 15
const ROCK_COLOR = 0x7a6a55
const ROCK_OUTLINE = 0x4a3f33
const SPAWN_DISTANCE_M = 0.3
const ROCK_LIFETIME_MS = 10_000
const SPIN_RAD_PER_STEP = 0.12
const IMPACT_MIN_SPEED_MS = 5
const IMPACT_SHAKE_PER_MS = 0.0006
const MAX_IMPACT_SHAKE = 0.02
const DUST_COLORS = [0xd9c3a0, 0xb08a5a, 0x6b5a45]

/** Schleudert einen Felsbrocken mit realer Masse; Tempo folgt aus der Startenergie (E = ½mv²). */
export class EarthRockAttack implements Attack {
  readonly name = 'Felswurf'
  readonly cooldownMs = 600
  readonly energyJoules = 1700

  private readonly scene: Phaser.Scene
  private readonly rocks = new Map<MatterJS.BodyType, Phaser.GameObjects.Rectangle>()

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    scene.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
  }

  execute(origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): void {
    const spawnX = (origin.x ?? 0) + direction.x * metersToPixels(SPAWN_DISTANCE_M)
    const spawnY = (origin.y ?? 0) + direction.y * metersToPixels(SPAWN_DISTANCE_M)
    const size = metersToPixels(ROCK_SIZE_M)

    const shape = this.scene.add.rectangle(spawnX, spawnY, size, size, ROCK_COLOR)
    shape.setStrokeStyle(1, ROCK_OUTLINE).setDepth(5)
    const body = this.scene.matter.add.rectangle(spawnX, spawnY, size, size, {
      label: 'rock',
      mass: ROCK_MASS_KG,
      friction: 0.5,
      restitution: 0.1,
    })
    this.scene.matter.add.gameObject(shape, body)

    const speedMs = Math.sqrt((2 * this.energyJoules) / ROCK_MASS_KG)
    const speed = metersPerSecondToMatter(speedMs)
    this.scene.matter.body.setVelocity(body, { x: direction.x * speed, y: direction.y * speed })
    this.scene.matter.body.setAngularVelocity(body, SPIN_RAD_PER_STEP * Math.sign(direction.x || 1))

    this.rocks.set(body, shape)
    this.scene.time.delayedCall(ROCK_LIFETIME_MS, () => this.remove(body))
  }

  destroy(): void {
    this.scene.matter.world.off(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
    for (const body of [...this.rocks.keys()]) {
      this.remove(body)
    }
  }

  private onCollision(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    for (const pair of event.pairs) {
      for (const body of [pair.bodyA.parent, pair.bodyB.parent]) {
        const shape = this.rocks.get(body)
        if (shape) {
          this.impact(body, shape)
        }
      }
    }
  }

  /** Aufprall: Staub und Wackeln wachsen mit der Aufprallgeschwindigkeit. */
  private impact(body: MatterJS.BodyType, shape: Phaser.GameObjects.Rectangle): void {
    const speedMs = matterToMetersPerSecond(body.speed)
    if (speedMs < IMPACT_MIN_SPEED_MS) {
      return
    }
    burst(this.scene, shape.x, shape.y, DUST_COLORS, Math.round(speedMs * 1.5), speedMs * 12)
    screenShake(this.scene, Math.min(MAX_IMPACT_SHAKE, speedMs * IMPACT_SHAKE_PER_MS), 100)
  }

  private remove(body: MatterJS.BodyType): void {
    const shape = this.rocks.get(body)
    if (!shape) {
      return
    }
    this.rocks.delete(body)
    this.scene.matter.world.remove(body)
    shape.destroy()
  }
}
