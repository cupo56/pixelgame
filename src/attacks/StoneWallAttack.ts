import Phaser from 'phaser'
import { isEnemy } from '../combat/damage.ts'
import { registerShotTarget, unregisterShotTarget } from '../combat/shotTargets.ts'
import { ALL_CATEGORIES, COLLISION_CATEGORY } from '../config/collision.ts'
import { AIR_DRAG, matterToMetersPerSecond, metersPerSecondToMatter, metersToPixels } from '../config/physics.ts'
import { WALL } from '../config/wall.ts'
import { findGroundSpot, type GroundSpot } from '../earth/groundSpot.ts'
import { drawWall } from '../earth/wallDraw.ts'
import {
  clampThrowDirection, wallEquivalentEdgeM, wallGrowthProgress, wallHeightAt, wallMassKg, wallTakeDamage,
} from '../earth/wallRules.ts'
import { crackDecal } from '../effects/decals.ts'
import { screenShake } from '../effects/juice.ts'
import { burst, dust } from '../effects/particles.ts'
import type { EarthMaterial, Rock } from '../materials/EarthMaterial.ts'
import type { ReactionSystem } from '../materials/ReactionSystem.ts'

const STONE_COLORS = [0xd9c3a0, 0xb08a5a, 0x6b5a45]
const ROCK_COLOR = 0x947653
const MARKER_COLOR = 0xe0c08a
const MARKER_INVALID = 0xd96a5c

type State = 'idle' | 'growing' | 'standing' | 'kicking' | 'thrown' | 'sinking'

interface Hooks {
  /** Löst die Trittanimation aus (`facing`: Richtung zur Mauer). */
  kick: (facing: number) => void
}

type Placement = GroundSpot

/**
 * Steinmauer: rechte Taste halten lässt sie Lage für Lage aus dem Boden steigen, ein Rechtsklick tritt sie
 * zur Maus. Die stehende Mauer ist ein schwerer Erd-Stoff (`Rock`), alle Kombos wirken also ohne Sonderfall.
 */
export class StoneWallAttack {
  private readonly scene: Phaser.Scene
  private readonly playerBody: MatterJS.BodyType
  private readonly earth: EarthMaterial
  private readonly system: ReactionSystem
  private readonly hooks: Hooks
  private readonly view: Phaser.GameObjects.Graphics
  private readonly marker: Phaser.GameObjects.Graphics
  private state: State = 'idle'
  private placement?: Placement
  private growMs = 0
  private heightM = 0
  private lastClearHeightM = 0
  private rock?: Rock
  private health: number = WALL.health
  private lifetimeEndsAt = 0
  private cooldownEndsAt = 0
  private kickAt = 0
  private throwDirection = { x: 1, y: 0 }
  private thrownAt = 0
  private noGravityUntil = 0
  private thrownSettled = false
  private sinkMs = 0
  private sinkPose?: { x: number; groundY: number; heightPx: number; color: number }
  private nextDustAt = 0

  constructor(scene: Phaser.Scene, playerBody: MatterJS.BodyType, earth: EarthMaterial, system: ReactionSystem, hooks: Hooks) {
    this.scene = scene
    this.playerBody = playerBody
    this.earth = earth
    this.system = system
    this.hooks = hooks
    this.view = scene.add.graphics().setDepth(5)
    this.marker = scene.add.graphics().setDepth(6)
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this)
    scene.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
  }

  get currentState(): State { return this.state }
  get isGrowing(): boolean { return this.state === 'growing' }
  /** Wachsfortschritt 0..1 für die Figur; sonst undefined. */
  get raiseProgress(): number | undefined {
    return this.state === 'growing' ? wallGrowthProgress(this.growMs, WALL.chargeMs) : undefined
  }
  /** Nur für Browserprüfungen. */
  get wallBody(): MatterJS.BodyType | undefined { return this.rock?.body }
  get wallHealth(): number { return this.health }

  /** Rechte Taste gedrückt: stehende Mauer treten oder eine neue bändigen. */
  press(target: Phaser.Math.Vector2): boolean {
    const now = this.scene.time.now
    if (this.state === 'standing' && this.rock) return this.startKick(target, now)
    if (this.state !== 'idle' || now < this.cooldownEndsAt) return false
    const placement = this.findPlacement(target)
    if (!placement) return false
    this.placement = placement
    this.state = 'growing'
    this.growMs = 0
    this.heightM = 0
    this.lastClearHeightM = 0
    this.nextDustAt = 0
    this.marker.clear()
    crackDecal(this.scene, placement.x, placement.groundY, 16)
    dust(this.scene, placement.x, placement.groundY - 2, 10, 70)
    return true
  }

  /** Rechte Taste losgelassen: die Mauer bleibt in der erreichten Höhe stehen (oder entfällt, wenn zu niedrig). */
  release(): void {
    if (this.state !== 'growing') return
    if (this.heightM >= WALL.minHeightM) this.finishGrowing()
    else this.abortGrowing()
  }

  /** Elementwechsel, Pause oder Fokusverlust: ein laufendes Wachsen bricht ab, eine stehende Mauer bleibt. */
  cancelGrowing(): void {
    if (this.state === 'growing') this.abortGrowing()
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this)
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
    this.removeRock()
    this.view.destroy()
    this.marker.destroy()
  }

  /**
   * Zielzeichen am Boden: zeigt, wo die Mauer entstünde (Mausposition, auf den Boden darunter gelegt).
   * Nur im Erdmodus und solange keine Mauer steht oder wächst; `target` undefined blendet es aus.
   */
  updateAim(target?: Phaser.Math.Vector2): void {
    this.marker.clear()
    if (!target || this.state !== 'idle') return
    const place = this.findPlacement(target)
    const width = metersToPixels(WALL.widthM)
    const ready = this.scene.time.now >= this.cooldownEndsAt
    const x = place?.x ?? target.x
    const y = place?.groundY ?? target.y
    const valid = !!place && ready
    const color = valid ? MARKER_COLOR : MARKER_INVALID
    const g = this.marker
    if (!place) {
      g.lineStyle(1, color, 0.7).strokeCircle(target.x, target.y, 4)
      return
    }
    // Fußabdruck der Mauer mit Pfeilen nach oben und einem Geisterumriss von 1 m Höhe; blinkt leicht.
    const pulse = 0.6 + 0.25 * Math.sin(this.scene.time.now * 0.008)
    g.lineStyle(1, color, 0.3 * pulse).strokeRect(Math.round(x - width / 2), Math.round(y - metersToPixels(WALL.minHeightM)), Math.round(width), metersToPixels(WALL.minHeightM))
    g.lineStyle(2, color, pulse).lineBetween(x - width / 2, y - 1, x + width / 2, y - 1)
    g.lineStyle(1, color, pulse)
    g.lineBetween(x - width / 2, y - 1, x - width / 2, y - 7).lineBetween(x + width / 2, y - 1, x + width / 2, y - 7)
    for (const dx of [-width / 4, width / 4]) {
      g.lineBetween(x + dx, y - 4, x + dx, y - 12).lineBetween(x + dx - 3, y - 9, x + dx, y - 12).lineBetween(x + dx + 3, y - 9, x + dx, y - 12)
    }
  }

  /** Boden unter der Maus (siehe `findGroundSpot`), frei von Hindernissen für die Mindesthöhe. */
  private findPlacement(target: Phaser.Math.Vector2): Placement | undefined {
    const spot = findGroundSpot(this.scene, this.playerBody, target, metersToPixels(WALL.widthM), metersToPixels(WALL.minDistanceM))
    return spot && this.isClear(spot, WALL.minHeightM) ? spot : undefined
  }

  /** Frei von Spieler, Gegnern, Erde, Metall und anderem Gelände über der Wuchsfläche. */
  private isClear(place: Placement, heightM: number): boolean {
    const width = metersToPixels(WALL.widthM)
    const height = metersToPixels(heightM)
    const probe = this.scene.matter.bodies.rectangle(place.x, place.groundY - height / 2 - 1, width, height - 2)
    const obstacles = this.scene.matter.world.getAllBodies().filter((body) => {
      if (body === place.terrain || body.isSensor) return false
      if (body === this.playerBody || body.isStatic || isEnemy(body)) return true
      const kind = this.system.registry.kindOf(body)
      return kind === 'earth' || kind === 'metal'
    })
    return !this.scene.matter.overlap(probe, obstacles)
  }

  private update(_time: number, deltaMs: number): void {
    const now = this.scene.time.now
    const dt = Math.min(deltaMs, 50)
    const seconds = now / 1000
    switch (this.state) {
      case 'growing': this.updateGrowing(dt, seconds, now); break
      case 'standing':
      case 'kicking':
      case 'thrown': this.updateStanding(now, dt, seconds); break
      case 'sinking': this.updateSinking(dt, seconds); break
      default: break
    }
  }

  private updateGrowing(dt: number, seconds: number, now: number): void {
    const place = this.placement
    if (!place) return
    this.growMs += dt
    const progress = wallGrowthProgress(this.growMs, WALL.chargeMs)
    const wanted = wallHeightAt(progress, WALL.maxHeightM)
    if (wanted >= 0.3 && !this.isClear(place, wanted)) {
      // Decke oder Hindernis: die Mauer bleibt in der letzten freien Höhe stehen (oder entfällt, wenn sie zu niedrig wäre).
      if (this.lastClearHeightM < WALL.minHeightM) {
        this.abortGrowing()
        return
      }
      this.heightM = this.lastClearHeightM
      this.finishGrowing()
      return
    }
    this.heightM = wanted
    this.lastClearHeightM = wanted
    drawWall(this.view, {
      x: place.x, groundY: place.groundY, widthPx: metersToPixels(WALL.widthM), heightPx: metersToPixels(wanted),
      courseHPx: metersToPixels(WALL.courseM), tremor: 1, sink: 0, health: 1, color: ROCK_COLOR, seconds,
    })
    if (now >= this.nextDustAt) {
      this.nextDustAt = now + 90
      dust(this.scene, place.x + (Math.random() - 0.5) * metersToPixels(WALL.widthM), place.groundY - 1, 3, 50)
      screenShake(this.scene, 0.0018, 60)
    }
    if (progress >= 1) this.finishGrowing()
  }

  private abortGrowing(): void {
    const place = this.placement
    this.state = 'idle'
    this.placement = undefined
    this.view.clear()
    if (place) dust(this.scene, place.x, place.groundY - 2, 8, 50)
    this.cooldownEndsAt = this.scene.time.now + 600
  }

  private finishGrowing(): void {
    const place = this.placement
    if (!place) return
    const heightM = this.heightM
    const width = metersToPixels(WALL.widthM)
    const height = metersToPixels(heightM)
    const centerY = place.groundY - height / 2
    const body = this.scene.matter.add.rectangle(place.x, centerY, width, height, {
      label: 'rock',
      mass: wallMassKg(WALL.widthM, heightM, WALL.depthM),
      friction: 1, frictionStatic: 1, frictionAir: AIR_DRAG, restitution: 0.02,
      collisionFilter: { category: COLLISION_CATEGORY.world, mask: ALL_CATEGORIES, group: 0 },
    })
    // Nur seitliche Verschiebung und Fallen, kein Umkippen: die Mauer bleibt aufrecht.
    this.scene.matter.body.setInertia(body, Infinity)
    const shape = this.scene.add.rectangle(place.x, centerY, width, height, ROCK_COLOR).setAlpha(0)
    this.scene.matter.add.gameObject(shape, body)
    const rock = this.earth.adopt(body, shape, 0, wallEquivalentEdgeM(WALL.widthM, heightM)) as Rock
    this.scene.matter.body.setInertia(body, Infinity)
    rock.damage = WALL.damage
    rock.customView = true
    rock.expiresAt = Infinity
    rock.solidToPlayerAt = Infinity
    this.rock = rock
    this.health = WALL.health
    this.lifetimeEndsAt = this.scene.time.now + WALL.lifetimeMs
    registerShotTarget(body, (damage) => this.takeHit(damage))
    this.state = 'standing'
    this.placement = undefined
    dust(this.scene, place.x, place.groundY - 2, 18, 90)
    screenShake(this.scene, 0.004, 110)
  }

  private startKick(target: Phaser.Math.Vector2, now: number): boolean {
    const rock = this.rock
    if (!rock) return false
    const side = Math.sign(rock.body.position.x - this.playerBody.position.x) || 1
    const dx = Math.max(Math.abs(target.x - rock.body.position.x), 1)
    this.throwDirection = clampThrowDirection(side * dx, target.y - rock.body.position.y, WALL.throwAngleDeg, side)
    this.kickAt = now + WALL.kickDelayMs
    this.state = 'kicking'
    this.hooks.kick(side)
    return true
  }

  private launch(rock: Rock, now: number): void {
    const body = rock.body
    body.friction = 0.04
    body.frictionStatic = 0
    ;(body as MatterJS.BodyType & { ignoreGravity?: boolean }).ignoreGravity = true
    this.noGravityUntil = now + WALL.throwNoGravityMs
    this.thrownAt = now
    this.thrownSettled = false
    const speed = metersPerSecondToMatter(WALL.throwSpeedMs)
    this.scene.matter.body.setVelocity(body, { x: this.throwDirection.x * speed, y: this.throwDirection.y * speed })
    rock.hitTargets.clear()
    this.state = 'thrown'
    const baseY = body.bounds.max.y
    // Staubwelle läuft vom Fuß des Spielers zur Mauer, dazu Erdstoß am Mauerfuß.
    const fromX = this.playerBody.position.x
    for (let i = 1; i <= 5; i++) dust(this.scene, Phaser.Math.Linear(fromX, body.position.x, i / 5), baseY - 1, 3, 55)
    dust(this.scene, body.position.x, baseY - 1, 14, 100)
    screenShake(this.scene, 0.006, 140)
  }

  private updateStanding(now: number, dt: number, seconds: number): void {
    const rock = this.rock
    if (!rock) return
    // Die Substanz ist weg (Sand oder Metall durch Reaktionen): die Mauer ist keine Mauer mehr.
    if (!this.system.registry.get(rock.body)) {
      this.clearWall(false)
      return
    }
    if (this.state === 'kicking' && now >= this.kickAt) this.launch(rock, now)
    if (this.state === 'thrown') this.updateThrown(rock, now)
    const body = rock.body
    const width = body.bounds.max.x - body.bounds.min.x
    const height = body.bounds.max.y - body.bounds.min.y
    drawWall(this.view, {
      x: body.position.x, groundY: body.bounds.max.y, widthPx: width, heightPx: height,
      courseHPx: metersToPixels(WALL.courseM), tremor: 0, sink: 0, health: this.health / WALL.health,
      color: rock.shape.fillColor, seconds,
    })
    if (this.state === 'thrown' && now - this.thrownAt > 100 && Math.random() < 0.5) {
      dust(this.scene, body.position.x - Math.sign(body.velocity.x) * width / 2, body.bounds.max.y - 1, 1, 40)
    }
    if (now >= this.lifetimeEndsAt && matterToMetersPerSecond(body.speed) < 0.3) this.startSinking(rock, dt)
  }

  private updateThrown(rock: Rock, now: number): void {
    const body = rock.body
    const bodyExt = body as MatterJS.BodyType & { ignoreGravity?: boolean }
    if (bodyExt.ignoreGravity && now >= this.noGravityUntil) {
      bodyExt.ignoreGravity = false
      body.friction = 0.4
    }
    // Zur Ruhe gekommen: sie bleibt als Hindernis liegen, bis sie versinkt (ein zweiter Tritt ist nicht vorgesehen).
    if (!this.thrownSettled && now - this.thrownAt > 400 && matterToMetersPerSecond(body.speed) < 0.3) {
      this.thrownSettled = true
      body.friction = 1
      body.frictionStatic = 1
    }
  }

  private takeHit(damage: number): void {
    const rock = this.rock
    if (!rock) return
    const result = wallTakeDamage(this.health, damage)
    this.health = result.health
    this.lifetimeEndsAt = Math.max(this.lifetimeEndsAt, this.scene.time.now + WALL.lifetimeMs)
    const { x, y } = rock.body.position
    burst(this.scene, x + (Math.random() - 0.5) * metersToPixels(WALL.widthM), y + (Math.random() - 0.5) * (rock.body.bounds.max.y - rock.body.bounds.min.y) * 0.6, STONE_COLORS, 5, 45)
    screenShake(this.scene, 0.002, 60)
    if (result.broken) this.shatter()
  }

  private onCollision(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    const rock = this.rock
    if (!rock || this.state !== 'thrown') return
    for (const pair of event.pairs) {
      const a = pair.bodyA.parent, b = pair.bodyB.parent
      const other = a === rock.body ? b : b === rock.body ? a : undefined
      if (!other || !other.isStatic || other.isSensor) continue
      const speedMs = matterToMetersPerSecond(Math.hypot(rock.body.velocity.x - other.velocity.x, rock.body.velocity.y - other.velocity.y))
      if (speedMs >= WALL.shatterSpeedMs) {
        // Erst nach der Kollisionsverarbeitung zerlegen (Wucht-Schaden an Gegnern ist dann bereits verbucht).
        this.scene.time.delayedCall(0, () => this.shatter())
        return
      }
    }
  }

  /** Mauer bricht in Brocken. */
  private shatter(): void {
    const rock = this.rock
    if (!rock) return
    const { x, y } = rock.body.position
    const height = rock.body.bounds.max.y - rock.body.bounds.min.y
    for (let i = 0; i < 6; i++) {
      burst(this.scene, x + (Math.random() - 0.5) * metersToPixels(WALL.widthM), y + (i / 5 - 0.5) * height, STONE_COLORS, 6, 90)
    }
    dust(this.scene, x, rock.body.bounds.max.y - 2, 22, 120)
    crackDecal(this.scene, x, rock.body.bounds.max.y, 22)
    screenShake(this.scene, 0.008, 140)
    this.clearWall(true)
  }

  private startSinking(rock: Rock, _dt: number): void {
    const body = rock.body
    this.sinkPose = {
      x: body.position.x, groundY: body.bounds.max.y, heightPx: body.bounds.max.y - body.bounds.min.y, color: rock.shape.fillColor,
    }
    this.sinkMs = 0
    this.clearWall(false, true)
    this.state = 'sinking'
  }

  private updateSinking(dt: number, seconds: number): void {
    const pose = this.sinkPose
    if (!pose) {
      this.state = 'idle'
      return
    }
    this.sinkMs += dt
    const t = Math.min(1, this.sinkMs / WALL.sinkMs)
    drawWall(this.view, {
      x: pose.x, groundY: pose.groundY, widthPx: metersToPixels(WALL.widthM), heightPx: pose.heightPx,
      courseHPx: metersToPixels(WALL.courseM), tremor: 0, sink: t * t, health: this.health / WALL.health, color: pose.color, seconds,
    })
    if (Math.random() < 0.35) dust(this.scene, pose.x + (Math.random() - 0.5) * metersToPixels(WALL.widthM), pose.groundY - 1, 2, 35)
    if (t >= 1) {
      this.view.clear()
      this.sinkPose = undefined
      this.state = 'idle'
      this.cooldownEndsAt = this.scene.time.now + WALL.cooldownMs
    }
  }

  /** Entfernt Körper und Substanz; `keepView` lässt die Grafik für die Versinke-Animation stehen. */
  private clearWall(crumbled: boolean, keepView = false): void {
    this.removeRock()
    if (!keepView) {
      this.view.clear()
      this.state = 'idle'
      this.cooldownEndsAt = this.scene.time.now + (crumbled ? WALL.cooldownMs : 1500)
    }
  }

  private removeRock(): void {
    const rock = this.rock
    if (!rock) return
    this.rock = undefined
    unregisterShotTarget(rock.body)
    if (this.system.registry.get(rock.body)) this.system.remove(rock)
  }
}
