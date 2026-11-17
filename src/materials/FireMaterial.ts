import Phaser from 'phaser'
import { COMBAT } from '../config/combat.ts'
import { REACTIONS as R } from '../config/reactions.ts'
import { metersPerSecondToMatter, metersToPixels } from '../config/physics.ts'
import { applyBlast } from '../attacks/explosion.ts'
import { SPARK_TEXTURE, burst } from '../effects/particles.ts'
import { screenShake } from '../effects/juice.ts'
import { steamCloud } from './SteamEffect.ts'
import { fireChargeFraction, quenchFire, windFeedHeat } from './thermo.ts'
import { kindOfLabel, type Substance } from './Substance.ts'
import type { ReactionSystem } from './ReactionSystem.ts'

const BALL_RADIUS_M = 0.15
const CHARGED_RADIUS_M = 0.45
const BALL_MASS_KG = 0.5
/** Kinetische Startenergie; ergibt 20 m/s unabhängig von der Aufladung. */
const LAUNCH_ENERGY_J = 100
const SPAWN_DISTANCE_M = 0.18
const MAX_FLIGHT_MS = 3000
const BLAST_RADIUS_M = 3
const BLAST_IMPULSE_NS = 250
const BLAST_SHAKE = 0.012
export const FIRE_COLORS = [0xfff3a0, 0xff9a1f, 0xd6360b, 0x3a1a14]

export interface Fireball extends Substance {
  readonly kind: 'fire'
  readonly emitter: Phaser.GameObjects.Particles.ParticleEmitter
  readonly core: Phaser.GameObjects.Graphics
  readonly expiry: Phaser.Time.TimerEvent
  /** Aktueller Körperradius; wächst mit Q, wenn Wind das Feuer nährt. */
  bodyRadiusPx: number
}

/** Feuerbälle: Flug ohne Gravitation (Magie), Explosion beim ersten festen Treffer, Erlöschen im Wasser. */
export class FireMaterial {
  private readonly scene: Phaser.Scene
  private readonly system: ReactionSystem
  private readonly fireballs = new Set<Fireball>()

  constructor(scene: Phaser.Scene, system: ReactionSystem) {
    this.scene = scene
    this.system = system
    system.attach('fire', this)
    system.setWhipHandler('fire', (s, waterKg) => this.douse(s as Fireball, waterKg))
    system.setWindHandler('fire', (s, direction, strength) => this.feed(s as Fireball, direction, strength))
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.draw, this)
    scene.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
  }

  spawn(origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2, heatJ: number): Substance | undefined {
    if (!this.system.reserve('fire')) return undefined
    const charge = fireChargeFraction(heatJ)
    const spawnX = (origin.x ?? 0) + direction.x * metersToPixels(SPAWN_DISTANCE_M)
    const spawnY = (origin.y ?? 0) + direction.y * metersToPixels(SPAWN_DISTANCE_M)
    const bodyRadiusPx = this.radiusPx(heatJ)
    const body = this.scene.matter.add.circle(spawnX, spawnY, bodyRadiusPx, {
      label: 'fireball',
      mass: BALL_MASS_KG,
      isSensor: true,
      ignoreGravity: true,
      frictionAir: 0,
    })
    const speed = metersPerSecondToMatter(Math.sqrt((2 * LAUNCH_ENERGY_J) / BALL_MASS_KG))
    this.scene.matter.body.setVelocity(body, { x: direction.x * speed, y: direction.y * speed })

    const emitter = this.scene.add.particles(0, 0, SPARK_TEXTURE, {
      follow: body.position,
      lifespan: { min: 200, max: 450 },
      speed: { min: 5, max: 30 },
      scale: { start: 2.2 + charge * 2.5, end: 0 },
      color: FIRE_COLORS,
      blendMode: 'ADD',
      frequency: 12,
      quantity: 2 + Math.round(charge * 3),
    }).setDepth(15)
    const core = this.scene.add.graphics().setDepth(16).setBlendMode(Phaser.BlendModes.ADD)
    const fireball: Fireball = {
      kind: 'fire', body, emitter, core, bodyRadiusPx,
      expiry: this.scene.time.delayedCall(MAX_FLIGHT_MS, () => this.explode(fireball)),
      temperatureC: 900, massKg: BALL_MASS_KG, wetnessKg: 0, heatJ, restingMs: 0, createdAt: this.scene.time.now,
      remove: () => {
        this.fireballs.delete(fireball)
        emitter.destroy()
        core.destroy()
        fireball.expiry.remove()
        // Körper erst nach dem Physikschritt löschen, damit laufende Kollisionen sauber enden.
        this.scene.time.delayedCall(0, () => this.scene.matter.world?.remove(body))
      },
    }
    this.fireballs.add(fireball)
    this.system.registry.register(fireball)
    this.drawOne(fireball)
    return fireball
  }

  /** Explosion: Schaden, Radius und Impuls folgen dem aktuellen Wärmeinhalt. */
  explode(substance: Substance): void {
    const fireball = substance as Fireball
    if (!this.fireballs.has(fireball)) return
    const charge = fireChargeFraction(fireball.heatJ)
    const { x, y } = fireball.body.position
    burst(this.scene, x, y, FIRE_COLORS, Math.round(40 + charge * 60), 160 + charge * 100)
    applyBlast(this.scene, { x, y }, BLAST_RADIUS_M + charge * 1.5, BLAST_IMPULSE_NS * (1 + charge * 1.5),
      Math.round(Phaser.Math.Linear(COMBAT.fireDamage, COMBAT.chargedFireDamage, charge)))
    screenShake(this.scene, BLAST_SHAKE * (1 + charge * 0.65), 160)
    // Die Explosion heizt Stoffe im Radius (Erde glüht, Sand schmilzt, Metall erhitzt).
    this.system.heatArea({ x, y }, BLAST_RADIUS_M + charge * 1.5, fireball.heatJ)
    this.system.remove(fireball)
  }

  /** Erlöschen im Wasser: nur Dampf, keine Druckwelle. */
  quench(substance: Substance): void {
    const fireball = substance as Fireball
    if (!this.fireballs.has(fireball)) return
    steamCloud(this.scene, fireball.body.position.x, fireball.body.position.y, R.dropletMassKg * 3)
    this.system.remove(fireball)
  }

  /** Abprallen an Metall: Geschwindigkeit an der Blockkante spiegeln, ein Fünftel der Wärme bleibt im Metall. */
  bounce(substance: Substance, metal: Substance, point: { x: number; y: number }): void {
    const fireball = substance as Fireball
    if (!this.fireballs.has(fireball)) return
    const body = fireball.body
    // Der schnelle Feuerball steckt beim Erkennen oft schon tief im Block; die Anflugachse
    // (relative Geschwindigkeit) ist deshalb verlässlicher als der Kontaktpunkt.
    const rvx = body.velocity.x - metal.body.velocity.x, rvy = body.velocity.y - metal.body.velocity.y
    const horizontal = Math.abs(rvx) >= Math.abs(rvy)
    const vx = horizontal ? -body.velocity.x : body.velocity.x
    const vy = horizontal ? body.velocity.y : -body.velocity.y
    this.scene.matter.body.setVelocity(body, { x: vx * 0.8, y: vy * 0.8 })
    // Aus dem Block herausziehen, damit er nicht in der nächsten Kollision erneut spiegelt.
    const half = (metal.body.bounds.max.x - metal.body.bounds.min.x) / 2 + metersToPixels(BALL_RADIUS_M)
    if (horizontal) this.scene.matter.body.setPosition(body, { x: metal.body.position.x + Math.sign(vx || 1) * half, y: body.position.y })
    else this.scene.matter.body.setPosition(body, { x: body.position.x, y: metal.body.position.y + Math.sign(vy || 1) * half })
    const lost = fireball.heatJ * R.fireMetalBounceLoss
    fireball.heatJ -= lost
    this.system.heatSubstance(metal, lost, point)
    burst(this.scene, point.x, point.y, FIRE_COLORS, 10, 90)
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.draw, this)
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
    for (const fireball of [...this.fireballs]) this.system.remove(fireball)
  }

  /** Wind nährt das Feuer: Schub in Windrichtung, mehr Q, größerer Körper. */
  private feed(fireball: Fireball, direction: Phaser.Math.Vector2, strength: number): void {
    if (!this.fireballs.has(fireball)) return
    const body = fireball.body
    const deltaV = metersPerSecondToMatter(R.gustCarrySpeedMs * strength)
    this.scene.matter.body.setVelocity(body, { x: body.velocity.x + direction.x * deltaV, y: body.velocity.y + direction.y * deltaV })
    fireball.heatJ = windFeedHeat(fireball.heatJ, strength)
    const radius = this.radiusPx(fireball.heatJ)
    if (radius > fireball.bodyRadiusPx * 1.02) {
      this.scene.matter.body.scale(body, radius / fireball.bodyRadiusPx, radius / fireball.bodyRadiusPx)
      fireball.bodyRadiusPx = radius
    }
    burst(this.scene, body.position.x, body.position.y, FIRE_COLORS, Math.round(6 + strength * 10), 60)
  }

  /** Peitsche oder Pfütze: eine Wassermasse trifft auf einmal. */
  private douse(fireball: Fireball, waterKg: number): boolean {
    const result = quenchFire(fireball.heatJ, waterKg)
    fireball.heatJ = result.heatJ
    steamCloud(this.scene, fireball.body.position.x, fireball.body.position.y, waterKg)
    if (result.extinguished) this.quench(fireball)
    return true
  }

  private radiusPx(heatJ: number): number {
    return metersToPixels(Phaser.Math.Linear(BALL_RADIUS_M, CHARGED_RADIUS_M, fireChargeFraction(heatJ)))
  }

  private draw(): void {
    for (const fireball of this.fireballs) this.drawOne(fireball)
  }

  private drawOne(fireball: Fireball): void {
    const g = fireball.core
    const radius = this.radiusPx(fireball.heatJ) * (1 + Math.sin(this.scene.time.now * 0.035) * 0.08)
    g.setPosition(fireball.body.position.x, fireball.body.position.y).clear()
    g.fillStyle(0xff6a0e, 0.18).fillCircle(0, 0, radius * 1.7)
    g.fillStyle(0xffa120, 0.9).fillCircle(0, 0, radius)
    g.fillStyle(0xffe6a3).fillCircle(0, 0, radius * 0.6)
  }

  private onCollision(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    for (const pair of event.pairs) {
      this.checkHit(pair.bodyA.parent, pair.bodyB.parent)
      this.checkHit(pair.bodyB.parent, pair.bodyA.parent)
    }
  }

  private checkHit(candidate: MatterJS.BodyType, other: MatterJS.BodyType): void {
    const fireball = this.system.registry.get(candidate)
    if (fireball?.kind !== 'fire' || other.isSensor || other.label === 'player') return
    // Stoffpaare mit eigener Reaktion (Wasser) regelt die Reaktionstabelle. Das Label greift auch,
    // wenn der Tropfen in derselben Kollision bereits verdampft und abgemeldet wurde.
    const kind = this.system.registry.kindOf(other) ?? kindOfLabel(other.label)
    if (kind === 'water' || kind === 'metal' || (kind === 'ice' && other.label === 'ice')) return
    this.explode(fireball)
  }
}
