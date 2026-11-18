import Phaser from 'phaser'
import { COLLISION_CATEGORY, ICE_GROUP, ICE_MASK } from '../config/collision.ts'
import { COMBOS } from '../config/combos.ts'
import { REACTIONS as R } from '../config/reactions.ts'
import { matterToMetersPerSecond, metersPerSecondToMatter, metersToPixels } from '../config/physics.ts'
import { damageEnemy } from '../combat/damage.ts'
import { chillEnemy } from '../combat/status.ts'
import { drawIceSheet, drawIceShard, fadeOut } from '../effects/decals.ts'
import { burst } from '../effects/particles.ts'
import { impactRing } from '../effects/impact.ts'
import { Trails } from '../effects/Trails.ts'
import { approachAmbient } from './thermo.ts'
import { steamCloud } from './SteamEffect.ts'
import type { Substance } from './Substance.ts'
import type { ReactionSystem } from './ReactionSystem.ts'
import type { PuddleState } from './Puddle.ts'

const SHARD_RADIUS_M = 0.08
/** Ab dieser Geschwindigkeit gilt ein gefrierender Tropfen als Hagelkorn im Flug. */
const HAIL_STREAK_MIN_SPEED_MS = 2
const SHEET_HEIGHT_PX = 3
export const ICE_COLORS = [0xe5fcff, 0x9edfff, 0x60a8d6]

export interface IceShard extends Substance {
  readonly kind: 'ice'
  readonly view: Phaser.GameObjects.Graphics
  readonly seed: number
  inVortex: boolean
}

export interface IceSheet extends Substance {
  readonly kind: 'ice'
  readonly view: Phaser.GameObjects.Graphics
  readonly x: number
  readonly y: number
  readonly widthPx: number
  readonly frozenAt: number
}

/** Eis: Scherben aus gefrorenen Tropfen, Eisflächen aus gefrorenen Pfützen; beides schmilzt wieder. */
export class IceMaterial {
  private readonly scene: Phaser.Scene
  private readonly system: ReactionSystem
  private readonly shards = new Set<IceShard>()
  private readonly sheets = new Set<IceSheet>()
  private readonly offStep: () => void

  constructor(scene: Phaser.Scene, system: ReactionSystem) {
    this.scene = scene
    this.system = system
    system.attach('ice', this)
    this.offStep = system.onStep(this.step.bind(this))
    system.setWindHandler('ice', (s, direction, strength) => this.push(s, direction, strength))
    system.setCaptureHandlers('ice', (s) => this.capture(s), (s) => this.release(s))
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.draw, this)
    scene.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
  }

  /** Tropfen gefriert an Ort und Stelle; Geschwindigkeit bleibt erhalten. */
  fromDroplet(water: Substance): Substance | undefined {
    const { x, y } = water.body.position
    const velocity = { x: water.body.velocity.x, y: water.body.velocity.y }
    const temperatureC = Math.min(R.iceStartC, water.temperatureC)
    this.system.remove(water)
    if (!this.system.reserve('ice')) return undefined
    const radiusPx = metersToPixels(SHARD_RADIUS_M)
    const body = this.scene.matter.add.circle(x, y, radiusPx, {
      label: 'ice',
      mass: R.dropletMassKg,
      friction: 0.02,
      frictionStatic: 0.05,
      restitution: 0.3,
      collisionFilter: { category: COLLISION_CATEGORY.ice, mask: ICE_MASK, group: ICE_GROUP },
    })
    this.scene.matter.body.setVelocity(body, velocity)
    const view = this.scene.add.graphics().setDepth(6)
    const shard: IceShard = {
      kind: 'ice', body, view, seed: Math.random() * Math.PI * 2, inVortex: false,
      temperatureC, massKg: R.dropletMassKg, wetnessKg: 0, heatJ: 0, restingMs: 0, createdAt: this.scene.time.now,
      remove: () => {
        this.shards.delete(shard)
        view.destroy()
        this.scene.time.delayedCall(0, () => this.scene.matter.world?.remove(body))
      },
    }
    this.shards.add(shard)
    this.system.registry.register(shard)
    // Gefrieren im Flug (Hagel): heller Funke und ein kurzer Windstreifen hinter der Scherbe.
    const trails = Trails.of(this.scene)
    const inFlight = matterToMetersPerSecond(Math.hypot(velocity.x, velocity.y)) >= HAIL_STREAK_MIN_SPEED_MS
    trails.emitFrost(x, y, inFlight ? 5 : 3)
    if (inFlight) trails.follow(body, { color: 0xe5fcff, widthPx: 2, lifeMs: 140 }, 180)
    return shard
  }

  /** Pfütze gefriert zur glatten, festen Platte. */
  sheetFromPuddle(puddle: PuddleState): void {
    const { x, y, widthPx, massKg, temperatureC } = puddle
    this.system.remove(puddle)
    const body = this.scene.matter.add.rectangle(x, y - SHEET_HEIGHT_PX / 2, widthPx, SHEET_HEIGHT_PX, {
      label: 'ice-sheet', isStatic: true, friction: 0, frictionStatic: 0,
      collisionFilter: { category: COLLISION_CATEGORY.ice, mask: 0xffffffff, group: 0 },
    })
    const view = this.scene.add.graphics().setDepth(5)
    const sheet: IceSheet = {
      kind: 'ice', body, view, x, y, widthPx, frozenAt: this.scene.time.now, budgeted: false,
      temperatureC: Math.min(R.iceStartC, temperatureC), massKg, wetnessKg: 0, heatJ: 0, restingMs: 1,
      createdAt: this.scene.time.now,
      remove: () => {
        this.sheets.delete(sheet)
        this.scene.matter.world?.remove(body)
        if (view.scene) fadeOut(this.scene, view)
      },
    }
    this.sheets.add(sheet)
    this.system.registry.register(sheet)
    drawIceSheet(view, x, y, widthPx)
    burst(this.scene, x, y - 2, ICE_COLORS, 10, 35)
  }

  /** Scherbe → Tropfen, Fläche → Pfütze. */
  melt(substance: Substance, withSteam = false): void {
    const { water, puddle } = this.system.materials
    if (this.shards.has(substance as IceShard)) {
      const { x, y } = substance.body.position
      const { x: vx, y: vy } = substance.body.velocity
      if (withSteam) steamCloud(this.scene, x, y, substance.massKg * 0.3)
      this.system.remove(substance)
      const speed = matterToMetersPerSecond(Math.hypot(vx, vy))
      const droplet = water?.spawnDroplet(x, y, Math.atan2(vy, vx), speed)
      if (droplet) droplet.temperatureC = R.waterFreezeC + 1
      return
    }
    const sheet = substance as IceSheet
    if (!this.sheets.has(sheet)) return
    if (withSteam) steamCloud(this.scene, sheet.x, sheet.y - 4, sheet.massKg * 0.3)
    this.system.remove(sheet)
    puddle?.absorb(sheet.x, sheet.y, sheet.massKg, R.waterFreezeC + 1)
  }

  /** Scherbe zerspringt in Eispartikel. */
  shatter(substance: Substance): void {
    if (!this.shards.has(substance as IceShard)) return
    burst(this.scene, substance.body.position.x, substance.body.position.y, ICE_COLORS, 10, 70)
    this.system.remove(substance)
  }

  destroy(): void {
    this.offStep()
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.draw, this)
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
    for (const shard of [...this.shards]) this.system.remove(shard)
    for (const sheet of [...this.sheets]) this.system.remove(sheet)
  }

  private capture(s: Substance): boolean {
    const shard = s as IceShard
    if (!this.shards.has(shard) || shard.inVortex) return false
    shard.inVortex = true
    return true
  }

  private release(s: Substance): void {
    const shard = s as IceShard
    if (this.shards.has(shard)) shard.inVortex = false
  }

  /** Scherben sind leicht: der Wind trägt sie mit, bis zur Tragegeschwindigkeit. */
  private push(s: Substance, direction: Phaser.Math.Vector2, strength: number): void {
    if (!this.shards.has(s as IceShard)) return
    const deltaV = metersPerSecondToMatter(R.gustCarrySpeedMs * strength)
    this.scene.matter.body.setVelocity(s.body, {
      x: s.body.velocity.x + direction.x * deltaV,
      y: s.body.velocity.y + direction.y * deltaV,
    })
  }

  private step(dtS: number, now: number): void {
    for (const shard of [...this.shards]) {
      shard.temperatureC = approachAmbient(shard.temperatureC, R.iceWarmingKPerS, dtS)
      if (shard.temperatureC > R.waterFreezeC) this.melt(shard)
    }
    for (const sheet of [...this.sheets]) {
      if (now - sheet.frozenAt >= R.iceSheetMeltMs) this.melt(sheet)
    }
  }

  private draw(): void {
    for (const shard of this.shards) drawIceShard(shard.view, shard.body.position.x, shard.body.position.y, shard.body.angle + shard.seed)
  }

  private onCollision(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    for (const pair of event.pairs) {
      this.impact(pair.bodyA.parent, pair.bodyB.parent)
      this.impact(pair.bodyB.parent, pair.bodyA.parent)
    }
  }

  private impact(body: MatterJS.BodyType, other: MatterJS.BodyType): void {
    const shard = this.system.registry.get(body)
    if (!shard || !this.shards.has(shard as IceShard) || other.isSensor) return
    const speedMs = matterToMetersPerSecond(Math.hypot(body.velocity.x - other.velocity.x, body.velocity.y - other.velocity.y))
    if (speedMs >= R.iceShardDamageSpeedMs && damageEnemy(other, R.iceShardDamage, 'water')) {
      impactRing(this.scene, other.position.x, other.position.y, 0x9edfff)
      // Eisscherben sind Kältetreffer: ein nasser Gegner friert fest.
      chillEnemy(other, COMBOS.shardChillStrength, this.scene.time.now)
    }
    if (speedMs >= R.iceShardShatterSpeedMs) this.shatter(shard)
  }
}
