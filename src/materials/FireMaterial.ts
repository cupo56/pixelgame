import Phaser from 'phaser'
import { COMBAT } from '../config/combat.ts'
import { REACTIONS as R } from '../config/reactions.ts'
import { metersPerSecondToMatter, metersToPixels } from '../config/physics.ts'
import { applyBlast } from '../attacks/explosion.ts'
import { EMBER_COLORS, SMOKE_COLORS, SPARK_TEXTURE, burst, embers, smoke } from '../effects/particles.ts'
import { flash, hitStopOnce, shockwaveRing } from '../effects/impact.ts'
import { scorchDecal } from '../effects/decals.ts'
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
  /** Dauerhafte Emitter je Feuerball (statt eines neuen Emitters pro Frame). */
  readonly smokeTrail: Phaser.GameObjects.Particles.ParticleEmitter
  readonly emberTrail: Phaser.GameObjects.Particles.ParticleEmitter
  readonly seed: number
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
    // Normaler Blend: additiv würde der geladene Kern zu einem weißen Klecks ausbrennen.
    const core = this.scene.add.graphics().setDepth(16)
    const smokeTrail = this.scene.add.particles(0, 0, SPARK_TEXTURE, {
      follow: body.position,
      lifespan: { min: 900, max: 1400 }, angle: { min: 250, max: 290 }, speed: { min: 10, max: 20 }, gravityY: -25,
      scale: { start: 1.4, end: 2.8 }, alpha: { start: 0.55, end: 0 }, color: SMOKE_COLORS,
      frequency: 40, quantity: 1 + Math.round(charge),
    }).setDepth(17)
    const emberTrail = this.scene.add.particles(0, 0, SPARK_TEXTURE, {
      follow: body.position,
      lifespan: { min: 500, max: 1100 }, speed: { min: 40, max: 140 }, gravityY: 9.81 * 32 * 0.6,
      scale: { start: 1, end: 0.2 }, alpha: { start: 1, end: 0 }, color: EMBER_COLORS, blendMode: 'ADD',
      frequency: 90, quantity: 1 + Math.round(charge * 2),
    }).setDepth(18)
    const fireball: Fireball = {
      kind: 'fire', body, emitter, core, bodyRadiusPx, smokeTrail, emberTrail, seed: Math.random() * 1000,
      expiry: this.scene.time.delayedCall(MAX_FLIGHT_MS, () => this.explode(fireball)),
      temperatureC: 900, massKg: BALL_MASS_KG, wetnessKg: 0, heatJ, restingMs: 0, createdAt: this.scene.time.now,
      remove: () => {
        this.fireballs.delete(fireball)
        emitter.destroy()
        core.destroy()
        // Schleppen auslaufen lassen: nicht mehr emittieren, nach der längsten Lebensdauer entfernen.
        smokeTrail.stop(); emberTrail.stop()
        this.scene.time.delayedCall(1500, () => { smokeTrail.destroy(); emberTrail.destroy() })
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
  explode(substance: Substance, scorch = false, direct?: MatterJS.BodyType): void {
    const fireball = substance as Fireball
    if (!this.fireballs.has(fireball)) return
    const charge = fireChargeFraction(fireball.heatJ)
    const { x, y } = fireball.body.position
    const radius = this.radiusPx(fireball.heatJ)
    flash(this.scene, x, y, radius * 2.5)
    shockwaveRing(this.scene, x, y, radius, radius * 3 + charge * 30, 220, 0xffd27a)
    burst(this.scene, x, y, FIRE_COLORS, Math.round(40 + charge * 60), 160 + charge * 100)
    smoke(this.scene, x, y - radius, Math.round(8 + charge * 14), 40)
    embers(this.scene, x, y, Math.round(6 + charge * 14))
    if (scorch) scorchDecal(this.scene, x, y + radius, 10 + charge * 22)
    if (charge >= 0.5) hitStopOnce(this.scene, 50)
    applyBlast(this.scene, { x, y }, BLAST_RADIUS_M + charge * 1.5, BLAST_IMPULSE_NS * (1 + charge * 1.5),
      Math.round(Phaser.Math.Linear(COMBAT.fireDamage, COMBAT.chargedFireDamage, charge)))
    screenShake(this.scene, BLAST_SHAKE * (1 + charge * 0.65), 160)
    // Die Explosion heizt Stoffe im Radius (Erde glüht, Sand schmilzt, Metall erhitzt).
    this.system.heatArea({ x, y }, BLAST_RADIUS_M + charge * 1.5, fireball.heatJ, direct, radius * 1.5)
    this.system.remove(fireball)
  }

  /** Erlöschen im Wasser: nur Dampf, keine Druckwelle. */
  quench(substance: Substance): void {
    const fireball = substance as Fireball
    if (!this.fireballs.has(fireball)) return
    steamCloud(this.scene, fireball.body.position.x, fireball.body.position.y, R.dropletMassKg * 3)
    // Zischen: kurze, schnelle weiße Funken.
    burst(this.scene, fireball.body.position.x, fireball.body.position.y, [0xffffff, 0xdfe7ec], 8, 110)
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

  /** Flammenkern aus flackernden Zungen entgegen der Flugrichtung, additiver Hitzeschein. */
  private drawOne(fireball: Fireball): void {
    const g = fireball.core
    const now = this.scene.time.now
    const charge = fireChargeFraction(fireball.heatJ)
    const radius = this.radiusPx(fireball.heatJ) * (1 + Math.sin(now * 0.035 + fireball.seed) * 0.08)
    const { x: vx, y: vy } = fireball.body.velocity
    const speed = Math.hypot(vx, vy)
    const back = speed > 0.01 ? { x: -vx / speed, y: -vy / speed } : { x: -1, y: 0 }
    const side = { x: -back.y, y: back.x }
    g.setPosition(fireball.body.position.x, fireball.body.position.y).clear()
    g.fillStyle(0xff6a0e, 0.22).fillCircle(0, 0, radius * 1.8)
    const tongues = 3 + Math.round(charge)
    for (let i = 0; i < tongues; i++) {
      const phase = now * 0.02 + fireball.seed + i * 2.1
      const spread = ((i / (tongues - 1)) - 0.5) * radius * 1.2
      const length = radius * (1.3 + 0.5 * Math.sin(phase)) + Math.round(Math.random() * 2)
      const baseX = side.x * spread, baseY = side.y * spread
      const tip = { x: baseX + back.x * length + (Math.random() - 0.5) * 2, y: baseY + back.y * length + (Math.random() - 0.5) * 2 }
      const points = [
        new Phaser.Math.Vector2(baseX + side.x * radius * 0.35, baseY + side.y * radius * 0.35),
        new Phaser.Math.Vector2(Math.round(tip.x), Math.round(tip.y)),
        new Phaser.Math.Vector2(baseX - side.x * radius * 0.35, baseY - side.y * radius * 0.35),
      ]
      g.fillStyle(i % 2 ? 0xff9a1f : 0xd6360b, 0.85).fillPoints(points, true)
    }
    g.fillStyle(0xff7a12).fillCircle(0, 0, radius)
    g.fillStyle(0xffb03a).fillCircle(back.x * -radius * 0.12, back.y * -radius * 0.12, radius * 0.7)
    g.fillStyle(0xffe6a3).fillCircle(back.x * -radius * 0.2, back.y * -radius * 0.2, radius * 0.42)
    g.fillStyle(0xfff8e0).fillCircle(back.x * -radius * 0.28, back.y * -radius * 0.28, radius * 0.18)
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
    this.explode(fireball, other.isStatic, other)
  }
}
