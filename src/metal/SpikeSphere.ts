import Phaser from 'phaser'
import { ARMOR_MASK, COLLISION_CATEGORY } from '../config/collision.ts'
import { METAL } from '../config/metal.ts'
import { GRAVITY_MS2, PHYSICS_FPS, metersPerSecondToMatter } from '../config/physics.ts'
import { damageEnemy, isEnemy } from '../combat/damage.ts'
import { burst, dust } from '../effects/particles.ts'
import { flash, hitStopOnce, impactRing, shockwaveRing } from '../effects/impact.ts'
import { screenShake } from '../effects/juice.ts'
import type { Player } from '../entities/Player.ts'
import { METAL_DARK, METAL_LIGHT, METAL_MID, SPARK_COLORS, type ArmorPlates } from './ArmorPlates.ts'
import { spikeCount, spikeDamage, spikeDirections, spikeSpeedMs } from './spikes.ts'

const DT = 1 / PHYSICS_FPS
const SPIKE_LENGTH_PX = 11
const SPIKE_WIDTH_PX = 3
/** Bahnen der Kugel: Neigung (rad) und Abflachung je Band – im 2D-Bild entsteht eine Kugel. */
const BANDS = [{ tilt: -0.9, flat: 0.35 }, { tilt: 0.15, flat: 0.25 }, { tilt: 1.05, flat: 0.4 }] as const
const ORBIT_RADIUS = { min: 22, max: 40 }
const ORBIT_SPEED = { min: 4, max: 11 }
const ORBIT_FOLLOW = 0.6
/** Spitzen fallen im Flug mit abgeschwächter Schwerkraft (flacher Bogen). */
const FLIGHT_GRAVITY = 0.35
const MAX_FLIGHT_MS = 2000
const CRUMBLE_MS = 600
const FLIGHT_MASK = (COLLISION_CATEGORY.enemy | COLLISION_CATEGORY.world) >>> 0

type SpikeState = 'orbit' | 'flight' | 'stuck' | 'falling'

interface Spike {
  body: MatterJS.BodyType
  state: SpikeState
  phase: number
  band: number
  /** Tiefe auf der Kugel (−1 hinten … 1 vorn), nur für die Darstellung. */
  depth: number
  bornAt: number
  until: number
  damage: number
  readonly hit: Set<MatterJS.BodyType>
}

/** Aufgeladener Metallangriff: Rüstung zerlegt sich in kreisende Spitzen, die beim Loslassen ausbrechen. */
export class SpikeSphere {
  private readonly scene: Phaser.Scene
  private readonly player: Player
  private readonly plates: ArmorPlates
  private readonly view: Phaser.GameObjects.Graphics
  private spikes: Spike[] = []
  private charging?: { elapsed: number; progress: number; spin: number; nextShakeAt: number }
  private shifted?: { x: number; y: number }

  constructor(scene: Phaser.Scene, player: Player, plates: ArmorPlates) {
    this.scene = scene
    this.player = player
    this.plates = plates
    this.view = scene.add.graphics().setDepth(13)
    scene.matter.world.on(Phaser.Physics.Matter.Events.BEFORE_UPDATE, this.step, this)
    scene.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.draw, this)
  }

  get isCharging(): boolean { return this.charging !== undefined }
  get chargeProgress(): number | undefined { return this.charging?.progress }

  /** Nur mit angelegter Rüstung: die Platten lösen sich und werden zu Spitzen. */
  beginCharge(): boolean {
    if (this.charging || !this.plates.equipped) return false
    const starts = this.plates.detach()
    const now = this.scene.time.now
    starts.forEach((start, index) => {
      const spike = this.createSpike(start.x, start.y, index)
      this.scene.matter.body.setVelocity(spike.body, { x: start.vx, y: start.vy })
      spike.bornAt = now
    })
    const center = this.center()
    burst(this.scene, center.x, center.y, SPARK_COLORS, 14, 90)
    screenShake(this.scene, 0.002, 100)
    this.charging = { elapsed: 0, progress: 0, spin: 0, nextShakeAt: 0 }
    return true
  }

  /** Loslassen: Hälfte im Fächer zur Maus, Rest rundum. Die Rüstung ist damit verbraucht. */
  release(aimRad: number): boolean {
    const charge = this.charging
    if (!charge) return false
    this.charging = undefined
    const orbiting = this.spikes.filter((spike) => spike.state === 'orbit')
    const directions = spikeDirections(orbiting.length, aimRad, METAL.fanHalfRad)
    const speed = metersPerSecondToMatter(spikeSpeedMs(charge.progress))
    const damage = spikeDamage(charge.progress)
    const now = this.scene.time.now
    orbiting.forEach((spike, index) => {
      const angle = directions[index]
      spike.state = 'flight'
      spike.until = now + MAX_FLIGHT_MS
      spike.damage = damage
      spike.hit.clear()
      spike.body.collisionFilter.mask = FLIGHT_MASK
      this.scene.matter.body.setAngle(spike.body, angle)
      this.scene.matter.body.setVelocity(spike.body, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed })
    })
    const center = this.center()
    flash(this.scene, center.x, center.y, 18)
    shockwaveRing(this.scene, center.x, center.y, 16, 70 + charge.progress * 40, 240, METAL_LIGHT)
    hitStopOnce(this.scene, 40)
    screenShake(this.scene, 0.006 + charge.progress * 0.006, 180)
    return true
  }

  /** Abbruch beim Laden (Elementwechsel, Fokusverlust, Tod): Spitzen fallen und zerbröseln, Rüstung ist weg. */
  cancelCharge(): void {
    if (!this.charging) return
    this.charging = undefined
    const now = this.scene.time.now
    for (const spike of this.spikes) {
      if (spike.state !== 'orbit') continue
      spike.state = 'falling'
      spike.until = now + CRUMBLE_MS
      spike.body.collisionFilter.mask = COLLISION_CATEGORY.world
    }
  }

  /** Teleport: kreisende Spitzen reisen mit. */
  shift(dx: number, dy: number): void {
    if (!this.charging) return
    for (const spike of this.spikes) {
      if (spike.state !== 'orbit') continue
      this.scene.matter.body.setPosition(spike.body, { x: spike.body.position.x + dx, y: spike.body.position.y + dy })
    }
    this.shifted = { x: dx, y: dy }
  }

  /** Neue Anker liegen vor. */
  anchorsRefreshed(): void { this.shifted = undefined }

  destroy(): void {
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.BEFORE_UPDATE, this.step, this)
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.draw, this)
    for (const spike of this.spikes) this.scene.matter.world?.remove(spike.body)
    this.spikes = []
    this.charging = undefined
    this.view.destroy()
  }

  private center(): { x: number; y: number } {
    const chest = this.player.getArmorAnchors().find((anchor) => anchor.id === 'chest')
    const base = chest ?? { x: this.player.body.position.x, y: this.player.body.position.y - 6 }
    const shift = this.shifted ?? { x: 0, y: 0 }
    return { x: base.x + shift.x, y: base.y + shift.y }
  }

  private createSpike(x: number, y: number, index: number): Spike {
    const body = this.scene.matter.add.rectangle(x, y, SPIKE_LENGTH_PX, SPIKE_WIDTH_PX, {
      label: 'metal-spike',
      mass: METAL.spikeMassKg,
      ignoreGravity: true,
      frictionAir: 0,
      friction: 0.2,
      restitution: 0.1,
      collisionFilter: { category: COLLISION_CATEGORY.armor, mask: ARMOR_MASK, group: 0 },
    })
    this.scene.matter.body.setInertia(body, Infinity)
    const spike: Spike = {
      body, state: 'orbit', phase: (index * 2.39996) % (Math.PI * 2), band: index % BANDS.length, depth: 0,
      bornAt: this.scene.time.now, until: Infinity, damage: METAL.orbitDamage, hit: new Set(),
    }
    this.spikes.push(spike)
    return spike
  }

  private step(): void {
    const now = this.scene.time.now
    const charge = this.charging
    if (charge) this.orbit(charge, now)
    const gravity = metersPerSecondToMatter(GRAVITY_MS2 * FLIGHT_GRAVITY * DT)
    for (const spike of [...this.spikes]) {
      if (spike.state === 'flight') {
        this.scene.matter.body.setVelocity(spike.body, { x: spike.body.velocity.x, y: spike.body.velocity.y + gravity })
        // Spitze zeigt in Flugrichtung.
        this.scene.matter.body.setAngle(spike.body, Math.atan2(spike.body.velocity.y, spike.body.velocity.x))
        if (now >= spike.until) this.crumble(spike)
      } else if (spike.state === 'falling') {
        spike.body.ignoreGravity = false
        if (now >= spike.until) this.crumble(spike)
      } else if (spike.state === 'stuck' && now >= spike.until) {
        this.crumble(spike)
      }
    }
  }

  /** Spitzen kreisen auf verkippten Bahnen, teilen sich mit wachsender Ladung, Kugel wird schneller und weiter. */
  private orbit(charge: NonNullable<SpikeSphere['charging']>, now: number): void {
    charge.elapsed = Math.min(METAL.chargeMs, charge.elapsed + DT * 1000)
    charge.progress = charge.elapsed / METAL.chargeMs
    const q = charge.progress
    const orbiting = this.spikes.filter((spike) => spike.state === 'orbit')
    // Teilen: neue Spitzen entstehen an bestehenden, bis die Ladung erreicht ist.
    const wanted = spikeCount(q)
    for (let i = orbiting.length; i < wanted && orbiting.length; i++) {
      const parent = orbiting[i % orbiting.length]
      const child = this.createSpike(parent.body.position.x, parent.body.position.y, this.spikes.length)
      orbiting.push(child)
      burst(this.scene, parent.body.position.x, parent.body.position.y, SPARK_COLORS, 3, 50)
    }
    const center = this.center()
    const radius = Phaser.Math.Linear(ORBIT_RADIUS.min, ORBIT_RADIUS.max, q)
    charge.spin += Phaser.Math.Linear(ORBIT_SPEED.min, ORBIT_SPEED.max, q) * DT
    const playerVelocity = this.player.body.velocity
    for (const spike of orbiting) {
      const band = BANDS[spike.band]
      const a = spike.phase + charge.spin * (spike.band === 1 ? -1 : 1)
      const u = Math.cos(a) * radius, v = Math.sin(a) * radius * band.flat
      const tx = center.x + u * Math.cos(band.tilt) - v * Math.sin(band.tilt)
      const ty = center.y + u * Math.sin(band.tilt) + v * Math.cos(band.tilt)
      spike.depth = Math.sin(a)
      // Einschwingen in den ersten 300 ms, damit die Platten sichtbar auf die Bahn gerissen werden.
      const settle = Math.min(1, (now - spike.bornAt) / 300)
      this.scene.matter.body.setVelocity(spike.body, {
        x: playerVelocity.x + (tx - spike.body.position.x) * ORBIT_FOLLOW * settle,
        y: playerVelocity.y + (ty - spike.body.position.y) * ORBIT_FOLLOW * settle,
      })
      // Spitze zeigt tangential.
      this.scene.matter.body.setAngle(spike.body, Math.atan2(ty - spike.body.position.y, tx - spike.body.position.x))
    }
    if (q > 0.35 && now >= charge.nextShakeAt) {
      screenShake(this.scene, 0.0006 + q * 0.0016, 100)
      charge.nextShakeAt = now + 150
    }
  }

  private crumble(spike: Spike): void {
    this.spikes = this.spikes.filter((entry) => entry !== spike)
    dust(this.scene, spike.body.position.x, spike.body.position.y, 4, 40)
    burst(this.scene, spike.body.position.x, spike.body.position.y, [METAL_MID, METAL_DARK], 4, 40)
    this.scene.time.delayedCall(0, () => this.scene.matter.world?.remove(spike.body))
  }

  private onCollision(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    for (const pair of event.pairs) {
      this.contact(pair.bodyA.parent, pair.bodyB.parent)
      this.contact(pair.bodyB.parent, pair.bodyA.parent)
    }
  }

  private contact(body: MatterJS.BodyType, other: MatterJS.BodyType): void {
    const spike = this.spikes.find((entry) => entry.body === body)
    if (!spike) return
    if (isEnemy(other)) {
      if (spike.hit.has(other) || (spike.state !== 'orbit' && spike.state !== 'flight')) return
      spike.hit.add(other)
      if (damageEnemy(other, spike.damage, 'metal')) {
        impactRing(this.scene, other.position.x, other.position.y, METAL_LIGHT)
        burst(this.scene, other.position.x, other.position.y, SPARK_COLORS, 8, 100)
      }
      // Rückstoß in Flug- bzw. Umlaufrichtung.
      const push = spike.state === 'flight' ? 0.5 : 0.25
      this.scene.matter.body.setVelocity(other, { x: other.velocity.x + body.velocity.x * push, y: other.velocity.y + body.velocity.y * push })
      return
    }
    // Gelände oder Erdblock: Spitze bleibt stecken, glüht kurz nach, zerbröselt später.
    if (spike.state === 'flight' && !other.isSensor && (other.isStatic || other.label === 'rock')) {
      spike.state = 'stuck'
      spike.until = this.scene.time.now + METAL.spikeStickMs
      this.scene.matter.body.setStatic(spike.body, true)
      burst(this.scene, body.position.x, body.position.y, SPARK_COLORS, 5, 70)
    }
  }

  private draw(): void {
    const g = this.view.clear()
    // Hintere Spitzen zuerst und dunkler, vordere hell: so wirkt die Bahn räumlich.
    const sorted = [...this.spikes].sort((a, b) => a.depth - b.depth)
    for (const spike of sorted) {
      const { x, y } = spike.body.position
      const angle = spike.body.angle
      const behind = spike.state === 'orbit' && spike.depth < 0
      const scale = behind ? 0.75 : 1
      const len = SPIKE_LENGTH_PX * scale, half = SPIKE_WIDTH_PX * scale / 2
      const cos = Math.cos(angle), sin = Math.sin(angle)
      const point = (u: number, v: number) => new Phaser.Math.Vector2(Math.round(x + u * cos - v * sin), Math.round(y + u * sin + v * cos))
      const tip = point(len / 2 + 2, 0), left = point(-len / 2, -half), right = point(-len / 2, half)
      g.fillStyle(behind ? METAL_DARK : METAL_MID).fillPoints([tip, left, right], true)
      if (!behind) {
        g.lineStyle(1, METAL_LIGHT, 0.9).lineBetween(left.x, left.y, tip.x, tip.y)
      }
      if (spike.state === 'stuck') g.fillStyle(0xff8a1f, 0.6).fillCircle(Math.round(x), Math.round(y), 2)
    }
  }
}
