import Phaser from 'phaser'
import { COLLISION_CATEGORY, WATER_GROUP, WATER_MASK } from '../config/collision.ts'
import { COMBAT } from '../config/combat.ts'
import { REACTIONS as R } from '../config/reactions.ts'
import { matterToMetersPerSecond, metersPerSecondToMatter, metersToPixels } from '../config/physics.ts'
import { damageEnemy } from '../combat/damage.ts'
import { burst } from '../effects/particles.ts'
import { impactRing } from '../effects/impact.ts'
import { steamCloud } from './SteamEffect.ts'
import { coolWater } from './thermo.ts'
import { kindOfLabel, type Substance } from './Substance.ts'
import type { ReactionSystem } from './ReactionSystem.ts'
import type { Puddle } from './Puddle.ts'

const DROPLET_RADIUS_M = 0.08
const LIFETIME_MS = 4000
const SPLASH_MIN_SPEED_MS = 3
const SPLASH_CHANCE = 0.35
/** Unterhalb dieser Geschwindigkeit gilt ein Tropfen am Boden als ruhend. */
const RESTING_SPEED_MS = 0.2
const WATER_COLOR = 0x3fa7ff
const WATER_DEEP = 0x1b6fc2
const WATER_SHINE = 0xdffbff
/** Benachbarte Tropfen werden bis zu dieser Entfernung zu einem Strahl verbunden. */
const LINK_DISTANCE_PX = 14
export const WATER_COLORS = [0xbfe6ff, 0x3fa7ff, 0x1b6fc2]

export interface Droplet extends Substance {
  readonly kind: 'water'
  readonly radiusPx: number
  readonly expiry: Phaser.Time.TimerEvent
  /** Zeitpunkt des letzten Geländekontakts (ms), für die Ruheerkennung. */
  groundedAt: number
  /** Im Wirbelsturm gefangen: wird dort laufend gekühlt. */
  inVortex: boolean
}

/** Wassertropfen: echte Körper mit Masse, Temperatur und begrenzter Lebenszeit; ruhend werden sie zur Pfütze. */
export class WaterMaterial {
  private readonly scene: Phaser.Scene
  private readonly system: ReactionSystem
  private readonly puddles: Puddle
  private readonly droplets = new Set<Droplet>()
  /** Eine gemeinsame Zeichenfläche für alle Tropfen und ihre Verbindungen. */
  private readonly layer: Phaser.GameObjects.Graphics
  private readonly offStep: () => void

  constructor(scene: Phaser.Scene, system: ReactionSystem, puddles: Puddle) {
    this.scene = scene
    this.system = system
    this.puddles = puddles
    this.layer = scene.add.graphics().setDepth(6)
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.draw, this)
    system.attach('water', this)
    this.offStep = system.onStep(this.step.bind(this))
    system.setWindHandler('water', (s, direction, strength) => this.wind(s, direction, strength))
    system.setCaptureHandlers('water', (s) => this.capture(s), (s) => this.release(s))
    scene.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
    scene.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_ACTIVE, this.onContact, this)
  }

  spawnDroplet(x: number, y: number, angle: number, speedMs: number): Substance | undefined {
    if (!this.system.reserve('water')) return undefined
    const radiusPx = metersToPixels(DROPLET_RADIUS_M)
    const body = this.scene.matter.add.circle(x, y, radiusPx, {
      label: 'water',
      mass: R.dropletMassKg,
      // Wasser rollt nicht meterweit: Reibung lässt Tropfen am Boden liegen bleiben.
      friction: 0.4,
      frictionStatic: 0.5,
      restitution: 0.05,
      collisionFilter: { category: COLLISION_CATEGORY.water, mask: WATER_MASK, group: WATER_GROUP },
    })
    // Ohne Rotation rutscht der Tropfen und wird von der Reibung gestoppt, statt endlos zu rollen.
    this.scene.matter.body.setInertia(body, Infinity)
    const speed = metersPerSecondToMatter(speedMs)
    this.scene.matter.body.setVelocity(body, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed })

    const droplet: Droplet = {
      kind: 'water', body, radiusPx, groundedAt: -Infinity, inVortex: false,
      expiry: this.scene.time.delayedCall(LIFETIME_MS, () => this.system.remove(droplet)),
      temperatureC: R.waterStartC, massKg: R.dropletMassKg, wetnessKg: 0, heatJ: 0, restingMs: 0,
      createdAt: this.scene.time.now,
      remove: () => {
        this.droplets.delete(droplet)
        droplet.expiry.remove()
        // Entfernen erst nach dem Physikschritt, damit der Impuls noch übertragen wird.
        this.scene.time.delayedCall(0, () => this.scene.matter.world?.remove(body))
      },
    }
    this.droplets.add(droplet)
    this.system.registry.register(droplet)
    return droplet
  }

  /** Tropfen wird von einem Festkörper aufgenommen: kleiner Spritzer, Körper weg. */
  splashAway(droplet: Substance): void {
    if (!this.droplets.has(droplet as Droplet)) return
    burst(this.scene, droplet.body.position.x, droplet.body.position.y, WATER_COLORS, 3, 50)
    this.system.remove(droplet)
  }

  /** Tropfen verdampft: Dampfwolke, Körper weg. */
  evaporate(droplet: Substance): void {
    if (!this.droplets.has(droplet as Droplet)) return
    steamCloud(this.scene, droplet.body.position.x, droplet.body.position.y, droplet.massKg)
    this.system.remove(droplet)
  }

  destroy(): void {
    this.offStep()
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.draw, this)
    this.layer.destroy()
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.COLLISION_ACTIVE, this.onContact, this)
    for (const droplet of [...this.droplets]) this.system.remove(droplet)
  }

  /** Wind trägt Tropfen mit und kühlt sie; ≤ 0 °C → Eisscherbe. Pfützen werden nur gekühlt. */
  private wind(s: Substance, direction: Phaser.Math.Vector2, strength: number): void {
    const deltaK = R.gustCoolingK * strength
    if (s.body.label === 'puddle') {
      this.puddles.cool(s, deltaK)
      return
    }
    const droplet = s as Droplet
    if (!this.droplets.has(droplet)) return
    const deltaV = metersPerSecondToMatter(R.gustCarrySpeedMs * strength)
    this.scene.matter.body.setVelocity(droplet.body, {
      x: droplet.body.velocity.x + direction.x * deltaV,
      y: droplet.body.velocity.y + direction.y * deltaV,
    })
    this.chill(droplet, deltaK)
  }

  private chill(droplet: Droplet, deltaK: number): void {
    const result = coolWater(droplet.temperatureC, deltaK)
    droplet.temperatureC = result.tempC
    if (result.frozen) this.system.materials.ice?.fromDroplet(droplet)
  }

  private capture(s: Substance): boolean {
    const droplet = s as Droplet
    if (!this.droplets.has(droplet) || droplet.inVortex) return false
    droplet.inVortex = true
    return true
  }

  private release(s: Substance): void {
    const droplet = s as Droplet
    if (this.droplets.has(droplet)) droplet.inVortex = false
  }

  /** Tropfen als in Flugrichtung gestreckte Ellipsen mit Glanzpunkt; nahe Nachbarn werden zum Strahl verbunden. */
  private draw(): void {
    const g = this.layer.clear()
    const list = [...this.droplets]
    g.lineStyle(2, WATER_COLOR, 0.8)
    for (let i = 0; i < list.length; i++) {
      const a = list[i].body.position
      let best: MatterJS.Vector | undefined
      let bestDistance = LINK_DISTANCE_PX
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j].body.position
        const distance = Math.hypot(b.x - a.x, b.y - a.y)
        if (distance < bestDistance) { best = b; bestDistance = distance }
      }
      if (best) g.lineBetween(Math.round(a.x), Math.round(a.y), Math.round(best.x), Math.round(best.y))
    }
    for (const droplet of list) {
      const { x, y } = droplet.body.position
      const { x: vx, y: vy } = droplet.body.velocity
      const speedMs = matterToMetersPerSecond(Math.hypot(vx, vy))
      const r = droplet.radiusPx
      const length = r * 2 * (1 + Math.min(2.5, speedMs / 6))
      const angle = Math.atan2(vy, vx)
      g.fillStyle(WATER_DEEP, 0.9)
      this.ellipse(g, x, y, length + 1, r * 2 + 1, angle)
      g.fillStyle(WATER_COLOR, 1)
      this.ellipse(g, x, y, length, r * 2, angle)
      g.fillStyle(WATER_SHINE, 0.95).fillRect(Math.round(x - r * 0.6), Math.round(y - r * 0.7), 1, 1)
    }
  }

  private ellipse(g: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number, angle: number): void {
    const points: Phaser.Math.Vector2[] = []
    const cos = Math.cos(angle), sin = Math.sin(angle)
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * Math.PI * 2
      const px = Math.cos(t) * width / 2, py = Math.sin(t) * height / 2
      points.push(new Phaser.Math.Vector2(Math.round(x + px * cos - py * sin), Math.round(y + px * sin + py * cos)))
    }
    g.fillPoints(points, true)
  }

  /** Ruhende Tropfen am Boden sammeln sich nach puddleRestMs zur Pfütze; gefangene Tropfen kühlen aus. */
  private step(dtS: number, now: number): void {
    for (const droplet of [...this.droplets]) {
      if (droplet.inVortex) {
        this.chill(droplet, R.vortexCoolingKPerS * dtS)
        if (!this.droplets.has(droplet)) continue
      }
      const grounded = now - droplet.groundedAt <= 50
      const slow = matterToMetersPerSecond(droplet.body.speed) < RESTING_SPEED_MS
      droplet.restingMs = grounded && slow ? droplet.restingMs + dtS * 1000 : 0
      if (droplet.restingMs < R.puddleRestMs) continue
      const bottom = droplet.body.bounds.max.y
      this.puddles.absorb(droplet.body.position.x, bottom, droplet.massKg, droplet.temperatureC)
      this.system.remove(droplet)
    }
  }

  private onContact(event: Phaser.Physics.Matter.Events.CollisionActiveEvent): void {
    const now = this.scene.time.now
    for (const pair of event.pairs) {
      this.touchGround(pair.bodyA.parent, pair.bodyB.parent, now)
      this.touchGround(pair.bodyB.parent, pair.bodyA.parent, now)
    }
  }

  private touchGround(candidate: MatterJS.BodyType, other: MatterJS.BodyType, now: number): void {
    if (!other.isStatic || other.isSensor) return
    const droplet = this.system.registry.get(candidate)
    if (droplet?.kind === 'water' && this.droplets.has(droplet as Droplet)) (droplet as Droplet).groundedAt = now
  }

  private onCollision(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    const now = this.scene.time.now
    for (const pair of event.pairs) {
      this.splash(pair.bodyA.parent, pair.bodyB.parent, now)
      this.splash(pair.bodyB.parent, pair.bodyA.parent, now)
    }
  }

  /** Tropfen gibt beim Aufprall auf Gegner seinen Impuls ab und zerspritzt; auf Gelände bleibt er liegen. */
  private splash(candidate: MatterJS.BodyType, other: MatterJS.BodyType, now: number): void {
    const droplet = this.system.registry.get(candidate)
    if (droplet?.kind !== 'water' || !this.droplets.has(droplet as Droplet) || other.isSensor) return
    // Stoffpaare regelt die Reaktionstabelle (Label greift auch nach Abmeldung im selben Schritt).
    if (this.system.registry.get(other) || kindOfLabel(other.label)) return
    const speedMs = matterToMetersPerSecond(candidate.speed)
    if (speedMs >= SPLASH_MIN_SPEED_MS && Math.random() < SPLASH_CHANCE) {
      burst(this.scene, candidate.position.x, candidate.position.y, WATER_COLORS, 3, speedMs * 8)
    }
    if (other.isStatic) {
      (droplet as Droplet).groundedAt = now
      return
    }
    if (damageEnemy(other, COMBAT.waterDamage)) impactRing(this.scene, candidate.position.x, candidate.position.y, WATER_COLOR)
    this.system.remove(droplet)
  }
}
