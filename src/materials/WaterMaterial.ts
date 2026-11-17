import Phaser from 'phaser'
import { COLLISION_CATEGORY, WATER_GROUP, WATER_MASK } from '../config/collision.ts'
import { COMBAT } from '../config/combat.ts'
import { REACTIONS as R } from '../config/reactions.ts'
import { matterToMetersPerSecond, metersPerSecondToMatter, metersToPixels } from '../config/physics.ts'
import { damageEnemy } from '../combat/damage.ts'
import { burst } from '../effects/particles.ts'
import { steamCloud } from './SteamEffect.ts'
import { kindOfLabel, type Substance } from './Substance.ts'
import type { ReactionSystem } from './ReactionSystem.ts'

const DROPLET_RADIUS_M = 0.08
const LIFETIME_MS = 4000
const SPLASH_MIN_SPEED_MS = 3
const SPLASH_CHANCE = 0.35
const WATER_COLOR = 0x3fa7ff
export const WATER_COLORS = [0xbfe6ff, 0x3fa7ff, 0x1b6fc2]

export interface Droplet extends Substance {
  readonly kind: 'water'
  readonly shape: Phaser.GameObjects.Arc
  readonly expiry: Phaser.Time.TimerEvent
}

/** Wassertropfen: echte Körper mit Masse, Temperatur und begrenzter Lebenszeit. */
export class WaterMaterial {
  private readonly scene: Phaser.Scene
  private readonly system: ReactionSystem
  private readonly droplets = new Set<Droplet>()

  constructor(scene: Phaser.Scene, system: ReactionSystem) {
    this.scene = scene
    this.system = system
    system.attach('water', this)
    scene.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
  }

  spawnDroplet(x: number, y: number, angle: number, speedMs: number): Substance | undefined {
    if (!this.system.reserve('water')) return undefined
    const radiusPx = metersToPixels(DROPLET_RADIUS_M)
    const body = this.scene.matter.add.circle(x, y, radiusPx, {
      label: 'water',
      mass: R.dropletMassKg,
      friction: 0,
      restitution: 0.05,
      collisionFilter: { category: COLLISION_CATEGORY.water, mask: WATER_MASK, group: WATER_GROUP },
    })
    const shape = this.scene.add.circle(x, y, radiusPx, WATER_COLOR).setDepth(6)
    this.scene.matter.add.gameObject(shape, body)
    const speed = metersPerSecondToMatter(speedMs)
    this.scene.matter.body.setVelocity(body, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed })

    const droplet: Droplet = {
      kind: 'water', body, shape,
      expiry: this.scene.time.delayedCall(LIFETIME_MS, () => this.system.remove(droplet)),
      temperatureC: R.waterStartC, massKg: R.dropletMassKg, wetnessKg: 0, heatJ: 0, restingMs: 0,
      createdAt: this.scene.time.now,
      remove: () => {
        this.droplets.delete(droplet)
        droplet.expiry.remove()
        // Entfernen erst nach dem Physikschritt, damit der Impuls noch übertragen wird.
        this.scene.time.delayedCall(0, () => {
          this.scene.matter.world?.remove(body)
          shape.destroy()
        })
      },
    }
    this.droplets.add(droplet)
    this.system.registry.register(droplet)
    return droplet
  }

  /** Tropfen verdampft: Dampfwolke, Körper weg. */
  evaporate(droplet: Substance): void {
    if (!this.droplets.has(droplet as Droplet)) return
    steamCloud(this.scene, droplet.body.position.x, droplet.body.position.y, droplet.massKg)
    this.system.remove(droplet)
  }

  destroy(): void {
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
    for (const droplet of [...this.droplets]) this.system.remove(droplet)
  }

  private onCollision(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    for (const pair of event.pairs) {
      this.splash(pair.bodyA.parent, pair.bodyB.parent)
      this.splash(pair.bodyB.parent, pair.bodyA.parent)
    }
  }

  /** Tropfen gibt beim Aufprall auf Gegner seinen Impuls ab und zerspritzt; auf Gelände bleibt er liegen. */
  private splash(candidate: MatterJS.BodyType, other: MatterJS.BodyType): void {
    const droplet = this.system.registry.get(candidate)
    if (droplet?.kind !== 'water' || !this.droplets.has(droplet as Droplet) || other.isSensor) return
    // Stoffpaare regelt die Reaktionstabelle (Label greift auch nach Abmeldung im selben Schritt).
    if (this.system.registry.get(other) || kindOfLabel(other.label)) return
    const speedMs = matterToMetersPerSecond(candidate.speed)
    if (speedMs >= SPLASH_MIN_SPEED_MS && Math.random() < SPLASH_CHANCE) {
      burst(this.scene, candidate.position.x, candidate.position.y, WATER_COLORS, 3, speedMs * 8)
    }
    if (other.isStatic) return
    damageEnemy(other, COMBAT.waterDamage)
    this.system.remove(droplet)
  }
}
