import Phaser from 'phaser'
import type { Attack } from './Attack.ts'
import { COLLISION_CATEGORY, WATER_GROUP, WATER_MASK } from '../config/collision.ts'
import { matterToMetersPerSecond, metersPerSecondToMatter, metersToPixels } from '../config/physics.ts'
import { burst } from '../effects/particles.ts'

const DROPLET_RADIUS_M = 0.08
const DROPLET_MASS_KG = 0.15
const DROPLETS_PER_BURST = 5
const SPREAD_RAD = 0.1
const SPEED_JITTER = 0.1
const SPAWN_DISTANCE_M = 0.12
const MAX_DROPLETS = 160
const LIFETIME_MS = 4000
const SPLASH_MIN_SPEED_MS = 3
const SPLASH_CHANCE = 0.35
const WATER_COLOR = 0x3fa7ff
const SPLASH_COLORS = [0xbfe6ff, 0x3fa7ff, 0x1b6fc2]

/** Strahl aus einzelnen Tropfen mit echter Flugbahn; gedrückt halten = Dauerstrahl. */
export class WaterJetAttack implements Attack {
  readonly name = 'Wasserstrahl'
  readonly cooldownMs = 90
  /** Pro Tropfen; ergibt ca. 14 m/s Mündungsgeschwindigkeit. */
  readonly energyJoules = 15

  private readonly scene: Phaser.Scene
  /** Einfügereihenfolge = Alter; der älteste Tropfen wird bei Überlauf entfernt. */
  private readonly droplets = new Map<MatterJS.BodyType, Phaser.GameObjects.Arc>()

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    scene.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
  }

  execute(origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): void {
    const aim = Math.atan2(direction.y, direction.x)
    const baseSpeedMs = Math.sqrt((2 * this.energyJoules) / DROPLET_MASS_KG)
    for (let i = 0; i < DROPLETS_PER_BURST; i++) {
      const angle = aim + Phaser.Math.FloatBetween(-SPREAD_RAD, SPREAD_RAD)
      const speedMs = baseSpeedMs * Phaser.Math.FloatBetween(1 - SPEED_JITTER, 1 + SPEED_JITTER)
      this.spawnDroplet(origin, angle, speedMs)
    }
  }

  destroy(): void {
    this.scene.matter.world.off(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
    for (const body of [...this.droplets.keys()]) {
      this.remove(body)
    }
  }

  private spawnDroplet(origin: Phaser.Types.Math.Vector2Like, angle: number, speedMs: number): void {
    const distancePx = metersToPixels(SPAWN_DISTANCE_M)
    const x = (origin.x ?? 0) + Math.cos(angle) * distancePx
    const y = (origin.y ?? 0) + Math.sin(angle) * distancePx
    const radiusPx = metersToPixels(DROPLET_RADIUS_M)

    const body = this.scene.matter.add.circle(x, y, radiusPx, {
      label: 'water',
      mass: DROPLET_MASS_KG,
      friction: 0,
      restitution: 0.05,
      collisionFilter: { category: COLLISION_CATEGORY.water, mask: WATER_MASK, group: WATER_GROUP },
    })
    const shape = this.scene.add.circle(x, y, radiusPx, WATER_COLOR).setDepth(6)
    this.scene.matter.add.gameObject(shape, body)

    const speed = metersPerSecondToMatter(speedMs)
    this.scene.matter.body.setVelocity(body, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed })

    this.droplets.set(body, shape)
    if (this.droplets.size > MAX_DROPLETS) {
      const oldest = this.droplets.keys().next().value
      if (oldest) {
        this.remove(oldest)
      }
    }
    this.scene.time.delayedCall(LIFETIME_MS, () => this.remove(body))
  }

  private onCollision(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    for (const pair of event.pairs) {
      this.splash(pair.bodyA.parent, pair.bodyB.parent)
      this.splash(pair.bodyB.parent, pair.bodyA.parent)
    }
  }

  /** Tropfen gibt beim Aufprall seinen Impuls ab und zerspritzt. */
  private splash(candidate: MatterJS.BodyType, other: MatterJS.BodyType): void {
    const shape = this.droplets.get(candidate)
    if (!shape || other.isSensor) {
      return
    }
    const speedMs = matterToMetersPerSecond(candidate.speed)
    if (speedMs >= SPLASH_MIN_SPEED_MS && Math.random() < SPLASH_CHANCE) {
      burst(this.scene, shape.x, shape.y, SPLASH_COLORS, 3, speedMs * 8)
    }
    this.droplets.delete(candidate)
    // Entfernen erst nach dem Physikschritt, damit der Impuls noch übertragen wird.
    this.scene.time.delayedCall(0, () => this.dispose(candidate, shape))
  }

  private remove(body: MatterJS.BodyType): void {
    const shape = this.droplets.get(body)
    if (!shape) {
      return
    }
    this.droplets.delete(body)
    this.dispose(body, shape)
  }

  private dispose(body: MatterJS.BodyType, shape: Phaser.GameObjects.Arc): void {
    this.scene.matter.world.remove(body)
    shape.destroy()
  }
}
