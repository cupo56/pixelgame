import Phaser from 'phaser'
import type { Attack } from './Attack.ts'
import { COLLISION_CATEGORY } from '../config/collision.ts'
import { AIR_DRAG, GRAVITY_MS2, PIXELS_PER_METER, matterToMetersPerSecond, metersPerSecondToMatter, metersToPixels } from '../config/physics.ts'
import { SPARK_TEXTURE } from '../effects/particles.ts'
import { screenShake } from '../effects/juice.ts'
import { damageEnemy } from '../combat/damage.ts'
import { COMBAT } from '../config/combat.ts'

const ROCK_SIZE_M = 0.5
const CHARGED_SIZE_M = 1.5
const CHARGE_DELAY_MS = 180
const CHARGE_MS = 2200
const CHARGED_SPEED_MS = 10
const EARTH_DENSITY_KG_M3 = 1800
const ROCK_MASS_KG = ROCK_SIZE_M ** 3 * EARTH_DENSITY_KG_M3
const ROCK_COLOR = 0x947653
const ROCK_OUTLINE = 0x4a3f33
const LIFT_MS = 260
const HOLD_MS = 80
const GROUND_REACH_M = 1.75
const SIDE_REACH_M = 2.5
const CONTROL_REACH_M = 4
const ROCK_LIFETIME_MS = 10_000
const OWNER_GRACE_MS = 220
const SPIN_RAD_PER_STEP = 0.025
const IMPACT_MIN_SPEED_MS = 3
/** Elementkombination: Windschub skaliert mit Fläche/Masse, also 1/Kantenlänge. */
const AIR_BOOST_MS = 18
const AIR_MAX_SPEED_MS = 30
const AIR_LIFT_MS = 4.5
const DUST_COLORS = [0xd9c3a0, 0xb08a5a, 0x6b5a45]
const ALL_CATEGORIES = 0xffffffff
const LAUNCH_MASK = (ALL_CATEGORIES & ~COLLISION_CATEGORY.player) >>> 0

interface GroundSource {
  x: number
  y: number
  body: MatterJS.BodyType
}

interface Lift {
  source: GroundSource
  shape: Phaser.GameObjects.Rectangle
  mode: 'waiting' | 'quick' | 'charging' | 'releasing'
  handY: number
  launchY: number
  centerY: number
  size: number
  charge: number
  elapsed: number
  releaseStartY: number
  releaseDurationMs: number
  nextDustAt: number
  nextShakeAt: number
  blocked: boolean
}

interface Rock {
  shape: Phaser.GameObjects.Rectangle
  expiresAt: number
  solidToPlayerAt: number
  damage: number
  hitTargets: Set<MatterJS.BodyType>
  inTornado?: boolean
}

interface Effect {
  view: Phaser.GameObjects.Graphics | Phaser.GameObjects.Particles.ParticleEmitter
  expiresAt: number
  fade: boolean
}

/** Hebt Erde aus echtem Gelände; erst beim Abschuss übernimmt die Flugphysik. */
export class EarthRockAttack implements Attack {
  readonly name = 'Erdstoß'
  readonly cooldownMs = 650
  /** Verdichteter Erdblock: 225 kg; 24 kJ ergeben etwa 14,6 m/s. */
  readonly energyJoules = 24_000

  private readonly scene: Phaser.Scene
  private readonly playerBody: MatterJS.BodyType
  private readonly onLaunch: (charge: number) => void
  private readonly aim = new Phaser.Math.Vector2(1, 0)
  private readonly rocks = new Map<MatterJS.BodyType, Rock>()
  private readonly effects = new Set<Effect>()
  private readonly chargeGraphics: Phaser.GameObjects.Graphics
  private readonly chargeText: Phaser.GameObjects.Text
  private lifting?: Lift

  constructor(scene: Phaser.Scene, playerBody: MatterJS.BodyType, onLaunch: (charge: number) => void) {
    this.scene = scene
    this.playerBody = playerBody
    this.onLaunch = onLaunch
    this.chargeGraphics = scene.add.graphics().setDepth(15).setVisible(false)
    this.chargeText = scene.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#ead7b2',
      backgroundColor: '#29251f', padding: { x: 3, y: 2 },
    }).setOrigin(0.5, 1).setDepth(16).setVisible(false)
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.update, this)
    scene.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
  }

  updateAim(_origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): void {
    if (direction.lengthSq() > 0) this.aim.copy(direction).normalize()
  }

  /** Die Hebehaltung bleibt bis zum tatsächlichen Abschuss bestehen. */
  get chargeProgress(): number | undefined {
    const lift = this.lifting
    return lift && (lift.mode === 'charging' || lift.mode === 'releasing') ? lift.charge : undefined
  }

  execute(origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): boolean {
    if (!this.begin(origin, direction)) return false
    return this.release()
  }

  /** Linke Maustaste: kurzes Tippen bleibt ein Wurf, längeres Halten lädt auf. */
  begin(origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): boolean {
    if (this.lifting) return false
    this.updateAim(origin, direction)
    const source = this.findGround(origin)
    if (!source) return false
    const size = metersToPixels(ROCK_SIZE_M)
    // Auch in Bauchlage muss der ganze rotierende Block über die Oberfläche passen.
    const launchY = Math.min(origin.y ?? this.playerBody.position.y, source.y - size / Math.SQRT2 - 2)
    if (!this.clearLiftPath(source, launchY, size)) return false

    const shape = this.scene.add.rectangle(source.x, source.y - 0.5, size, 1, ROCK_COLOR)
      .setStrokeStyle(1, ROCK_OUTLINE).setDepth(5).setVisible(false)
    this.lifting = {
      source, shape, launchY, handY: origin.y ?? this.playerBody.position.y,
      mode: 'waiting', centerY: source.y + size / 2, size, charge: 0, elapsed: 0,
      releaseStartY: 0, releaseDurationMs: 0, nextDustAt: 0, nextShakeAt: 0, blocked: false,
    }
    this.crackGround(source)
    this.dust(source.x, source.y - 2, 16, 75)
    screenShake(this.scene, 0.002, 90)
    return true
  }

  release(): boolean {
    const lift = this.lifting
    if (!lift || (lift.mode !== 'waiting' && lift.mode !== 'charging')) return false
    if (lift.mode === 'waiting') {
      lift.mode = 'quick'
    } else {
      // Teilweise freigelegte Blöcke steigen vor dem Wurf noch ganz aus dem Boden.
      lift.mode = 'releasing'
      lift.releaseStartY = lift.centerY
      lift.releaseDurationMs = Phaser.Math.Clamp((lift.centerY - lift.launchY) * 8, 0, 180)
    }
    lift.elapsed = 0
    this.hideCharge()
    return true
  }

  cancel(): void {
    this.lifting?.shape.destroy()
    this.lifting = undefined
    this.hideCharge()
  }

  cancelCharge(): void {
    // Ein bereits losgelassener Wurf wird auch beim schnellen Elementwechsel fertig.
    if (this.lifting?.mode === 'waiting' || this.lifting?.mode === 'charging') this.cancel()
  }

  isRock(body: MatterJS.BodyType): boolean { return this.rocks.has(body) }

  captureInTornado(body: MatterJS.BodyType): boolean {
    const rock = this.rocks.get(body)
    if (!rock || rock.inTornado) return false
    rock.inTornado = true
    rock.hitTargets.clear()
    rock.expiresAt = Infinity
    rock.solidToPlayerAt = Infinity
    body.collisionFilter.mask = LAUNCH_MASK
    return true
  }

  releaseFromTornado(body: MatterJS.BodyType): void {
    const rock = this.rocks.get(body)
    if (!rock) return
    rock.inTornado = false
    rock.hitTargets.clear()
    rock.expiresAt = this.scene.time.now + ROCK_LIFETIME_MS
    rock.solidToPlayerAt = this.scene.time.now + OWNER_GRACE_MS
  }

  /** Vorhandenen Schwung erhalten; Luft kann denselben Block erneut als Geschoss nutzen. */
  pushWithAir(body: MatterJS.BodyType, direction: Phaser.Math.Vector2, strength: number): boolean {
    const rock = this.rocks.get(body)
    if (!rock) return false
    if (strength <= 0) return true
    const deltaV = metersPerSecondToMatter(AIR_BOOST_MS * Math.cbrt(ROCK_MASS_KG / body.mass) * strength)
    let vx = body.velocity.x + direction.x * deltaV
    let vy = body.velocity.y + direction.y * deltaV
    const supportY = direction.y < 0.65 ? this.supportY(body) : undefined
    if (supportY !== undefined) {
      // Bodenreibung darf den Stoß nicht sofort schlucken. Leicht anheben, außer beim Zielen nach unten.
      vy = Math.min(vy, -metersPerSecondToMatter(AIR_LIFT_MS * Math.sqrt(strength)))
      this.dust(body.position.x, supportY, 12, 60)
    }
    // Wiederholte Stöße bleiben kontrollierbar, ohne bestehendes höheres Tempo abzubremsen.
    const limit = Math.max(metersPerSecondToMatter(AIR_MAX_SPEED_MS), Math.hypot(body.velocity.x, body.velocity.y))
    const speed = Math.hypot(vx, vy)
    if (speed > limit) { vx *= limit / speed; vy *= limit / speed }
    this.scene.matter.body.setVelocity(body, { x: vx, y: vy })
    rock.hitTargets.clear()
    rock.expiresAt = this.scene.time.now + ROCK_LIFETIME_MS
    return true
  }

  private supportY(body: MatterJS.BodyType): number | undefined {
    const vertices = body.vertices
    if (!vertices?.length) return undefined
    const bottom = Math.max(...vertices.map((v) => v.y))
    const width = Math.max(...vertices.map((v) => v.x)) - Math.min(...vertices.map((v) => v.x))
    const probe = this.scene.matter.bodies.rectangle(body.position.x, bottom + 1, Math.max(2, width - 4), 4)
    const supports = this.scene.matter.world.getAllBodies().filter((other) =>
      other !== body && !other.isSensor && (other.isStatic || this.rocks.has(other)) && other.bounds.min.y >= bottom - 4,
    )
    return this.scene.matter.overlap(probe, supports) ? bottom : undefined
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.update, this)
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
    this.cancel()
    for (const body of [...this.rocks.keys()]) this.remove(body)
    for (const effect of this.effects) effect.view.destroy()
    this.effects.clear()
    this.chargeGraphics.destroy()
    this.chargeText.destroy()
  }

  private findGround(origin: Phaser.Types.Math.Vector2Like): GroundSource | undefined {
    const size = metersToPixels(ROCK_SIZE_M)
    const vertices = this.playerBody.vertices
    if (!vertices?.length) return undefined
    const footY = Math.max(...vertices.map((v) => v.y))
    const halfWidth = (Math.max(...vertices.map((v) => v.x)) - Math.min(...vertices.map((v) => v.x))) / 2
    const side = Math.abs(this.aim.x) > 0.1 ? Math.sign(this.aim.x) : Math.sign((origin.x ?? 0) - this.playerBody.position.x) || 1
    // Platz für den ausgewachsenen Block reservieren, auch wenn der Klick kurz bleibt.
    const spacing = halfWidth + metersToPixels(CHARGED_SIZE_M) / 2 + 12
    const preferredX = this.playerBody.position.x + side * spacing
    let best: GroundSource | undefined
    let bestScore = Infinity
    for (const body of this.scene.matter.world.getAllBodies()) {
      // Wände, Sensoren und bereits geworfene Steine sind keine Bodenquelle.
      if (!body.isStatic || body.isSensor || body.label !== 'terrain') continue
      const { min, max } = body.bounds
      if (max.x - min.x < size + 2 || max.y - min.y < size) continue
      if (min.y < footY - metersToPixels(0.5) || min.y > footY + metersToPixels(GROUND_REACH_M)) continue
      for (const candidateX of [preferredX, this.playerBody.position.x - side * spacing]) {
        const x = Phaser.Math.Clamp(candidateX, min.x + size / 2 + 1, max.x - size / 2 - 1)
        const distanceX = Math.abs(x - this.playerBody.position.x)
        if (distanceX < halfWidth + size / 2 + 2 || distanceX > metersToPixels(SIDE_REACH_M)) continue
        const source = { x, y: min.y, body }
        const launchY = Math.min(origin.y ?? this.playerBody.position.y, min.y - size / Math.SQRT2 - 2)
        if (!this.clearLiftPath(source, launchY, size)) continue
        const score = Math.abs(x - preferredX) + Math.abs(min.y - footY) * 0.5
        if (score < bestScore) { best = source; bestScore = score }
      }
    }
    return best
  }

  private clearLiftPath(source: GroundSource, launchY: number, size: number): boolean {
    const { min, max } = source.body.bounds
    if (source.x - size / 2 < min.x + 1 || source.x + size / 2 > max.x - 1 || max.y - min.y < size) return false
    const top = launchY - size / 2 - 1
    const bottom = source.y - 0.5
    const probe = this.scene.matter.bodies.rectangle(source.x, (top + bottom) / 2, size + 2, bottom - top)
    const obstacles = this.scene.matter.world.getAllBodies().filter((body) =>
      body !== source.body && body !== this.playerBody && !body.isSensor,
    )
    return !this.scene.matter.overlap(probe, obstacles)
  }

  private update(_time: number, deltaMs: number): void {
    const now = this.scene.time.now
    const lift = this.lifting
    if (lift) {
      const distance = Phaser.Math.Distance.Between(lift.source.x, lift.source.y, this.playerBody.position.x, this.playerBody.position.y)
      if (distance > metersToPixels(CONTROL_REACH_M) || !this.clearLiftPath(lift.source, lift.launchY, lift.size)) {
        this.cancel()
      } else {
        this.updateLift(lift, Math.min(deltaMs, 50), now)
      }
    }
    for (const [body, rock] of this.rocks) {
      if (now >= rock.expiresAt) this.remove(body)
      else if (now >= rock.solidToPlayerAt && body.collisionFilter.mask === LAUNCH_MASK && !this.scene.matter.overlap(body, [this.playerBody])) {
        // Kurzer Schutz beim Abschuss; danach bleibt der Block ein festes Hindernis.
        body.collisionFilter.mask = ALL_CATEGORIES
      }
    }
    for (const effect of this.effects) {
      if (now >= effect.expiresAt) {
        effect.view.destroy()
        this.effects.delete(effect)
      } else if (effect.fade) effect.view.setAlpha(Math.min(1, (effect.expiresAt - now) / 500))
    }
  }

  private updateLift(lift: Lift, deltaMs: number, now: number): void {
    lift.elapsed += deltaMs
    if (lift.mode === 'waiting') {
      if (lift.elapsed < CHARGE_DELAY_MS) return
      lift.mode = 'charging'
      lift.elapsed = 0
    }

    if (lift.mode === 'charging') {
      const charge = Math.min(1, lift.charge + deltaMs / CHARGE_MS)
      const size = metersToPixels(Phaser.Math.Linear(ROCK_SIZE_M, CHARGED_SIZE_M, charge))
      const launchY = Math.min(lift.handY, lift.source.y - size / Math.SQRT2 - 2)
      // Nur tatsächlich formbare Masse zählt als Aufladung und später als Schaden.
      lift.blocked = !this.clearLiftPath(lift.source, launchY, size)
      if (!lift.blocked) {
        lift.charge = charge
        lift.size = size
        lift.launchY = launchY
      }
      const eased = lift.charge ** 2 * (3 - 2 * lift.charge)
      lift.centerY = Phaser.Math.Linear(lift.source.y + lift.size / 2, lift.launchY, eased)
      this.showLift(lift, Math.sin(now * 0.06) * (0.2 + lift.charge * 0.6))
      this.drawCharge(lift)
      if (now >= lift.nextDustAt) {
        this.gatherDust(lift)
        lift.nextDustAt = now + 100 - lift.charge * 25
      }
      if (now >= lift.nextShakeAt) {
        screenShake(this.scene, 0.001 + lift.charge * 0.003, 120)
        lift.nextShakeAt = now + 125
      }
      // Auch bei voller Ladung wartet der Block ausdrücklich auf das Loslassen.
      return
    }

    const duration = lift.mode === 'quick' ? LIFT_MS : lift.releaseDurationMs
    const t = duration > 0 ? Math.min(1, lift.elapsed / duration) : 1
    const startY = lift.mode === 'quick' ? lift.source.y + lift.size / 2 : lift.releaseStartY
    lift.centerY = Phaser.Math.Linear(startY, lift.launchY, 1 - (1 - t) ** 3)
    this.showLift(lift)
    if (lift.elapsed >= duration + (lift.mode === 'quick' ? HOLD_MS : 0)) this.launch(lift, now)
  }

  private showLift(lift: Lift, jitterX = 0): void {
    const top = lift.centerY - lift.size / 2
    const bottom = Math.min(lift.source.y, lift.centerY + lift.size / 2)
    const height = Math.max(0.1, bottom - top)
    // Nur die freigelegte Scheibe zeichnen; der Rest steckt noch in der Erde.
    lift.shape.setVisible(bottom > top)
      .setSize(lift.size, height)
      .setPosition(lift.source.x + jitterX, bottom - height / 2)
  }

  private drawCharge(lift: Lift): void {
    const g = this.chargeGraphics
    const x = lift.source.x
    const y = Math.min(lift.source.y, lift.centerY - lift.size / 2) - 9
    g.setVisible(true).clear()
    g.fillStyle(0x29251f, 0.9).fillRect(x - 25, y - 1, 50, 6)
    g.fillStyle(lift.charge >= 1 ? 0xe4c278 : 0xad885b).fillRect(x - 24, y, 48 * lift.charge, 4)
    g.lineStyle(1, ROCK_OUTLINE)
    const spread = lift.size * 0.75
    g.lineBetween(x - spread, lift.source.y + 1, x + spread, lift.source.y + 1)
    g.lineBetween(x - spread * 0.7, lift.source.y, x - spread, lift.source.y + 7)
    g.lineBetween(x + spread * 0.5, lift.source.y + 1, x + spread * 0.8, lift.source.y + 5)
    this.chargeText.setVisible(true).setPosition(x, y - 4)
      .setText(lift.blocked ? 'ZU ENG · LOSLASSEN' : lift.charge >= 1 ? 'MAX · LOSLASSEN' : `ERDE ${Math.floor(lift.charge * 100)}%`)
  }

  private hideCharge(): void {
    // Beim Szenenwechsel kann die Display-Liste bereits zerstört worden sein.
    if (this.chargeGraphics.scene) this.chargeGraphics.clear().setVisible(false)
    if (this.chargeText.scene) this.chargeText.setVisible(false)
  }

  private launch(lift: Lift, now: number): void {
    this.lifting = undefined
    this.hideCharge()
    const size = lift.size
    const mass = (size / PIXELS_PER_METER) ** 3 * EARTH_DENSITY_KG_M3
    lift.shape.setVisible(true).setSize(size, size).setPosition(lift.source.x, lift.launchY)
    const body = this.scene.matter.add.rectangle(lift.source.x, lift.launchY, size, size, {
      label: 'rock',
      mass,
      friction: 0.65,
      frictionStatic: 0.9,
      frictionAir: AIR_DRAG,
      restitution: 0.08,
      collisionFilter: { category: COLLISION_CATEGORY.world, mask: LAUNCH_MASK, group: 0 },
    })
    this.scene.matter.add.gameObject(lift.shape, body)
    const speed = metersPerSecondToMatter(Phaser.Math.Linear(Math.sqrt(2 * this.energyJoules / ROCK_MASS_KG), CHARGED_SPEED_MS, lift.charge))
    this.scene.matter.body.setVelocity(body, { x: this.aim.x * speed, y: this.aim.y * speed })
    this.scene.matter.body.setAngularVelocity(body, SPIN_RAD_PER_STEP / (1 + lift.charge * 2) * Math.sign(this.aim.x || 1))
    this.rocks.set(body, {
      shape: lift.shape, expiresAt: now + ROCK_LIFETIME_MS, solidToPlayerAt: now + OWNER_GRACE_MS,
      damage: Math.round(Phaser.Math.Linear(COMBAT.earthDamage, COMBAT.chargedEarthDamage, lift.charge)), hitTargets: new Set(),
    })
    this.dust(lift.source.x, lift.launchY, Math.round(5 + lift.charge * 25), 30 + lift.charge * 60)
    screenShake(this.scene, 0.0025 + lift.charge * 0.006, 100)
    this.onLaunch(lift.charge)
  }

  private gatherDust(lift: Lift): void {
    const emitter = this.scene.add.particles(lift.source.x, lift.source.y - 3, SPARK_TEXTURE, {
      x: { min: -lift.size * 0.75, max: lift.size * 0.75 },
      y: { min: -3, max: 3 },
      lifespan: { min: 650, max: 1100 },
      angle: { min: 195, max: 345 },
      speed: { min: 20, max: 45 + lift.charge * 30 },
      gravityY: GRAVITY_MS2 * PIXELS_PER_METER * 0.25,
      scale: { start: 1.5 + lift.charge * 1.8, end: 0.2 },
      alpha: { start: 0.65, end: 0 }, color: DUST_COLORS, emitting: false,
    }).setDepth(6)
    emitter.explode(Math.round(3 + lift.charge * 5))
    this.effects.add({ view: emitter, expiresAt: this.scene.time.now + 1250, fade: false })
  }

  private crackGround(source: GroundSource): void {
    const g = this.scene.add.graphics().setDepth(4)
    const { x, y } = source
    g.lineStyle(2, ROCK_OUTLINE).lineBetween(x - 15, y + 1, x + 14, y + 1)
    g.lineStyle(1, 0xd0ae78).lineBetween(x - 13, y - 1, x - 5, y - 2)
    g.lineStyle(1, ROCK_OUTLINE).lineBetween(x - 9, y + 1, x - 13, y + 6)
    g.lineBetween(x + 6, y + 1, x + 11, y + 5)
    this.effects.add({ view: g, expiresAt: this.scene.time.now + 1000, fade: true })
  }

  private dust(x: number, y: number, count: number, speed: number): void {
    const emitter = this.scene.add.particles(x, y, SPARK_TEXTURE, {
      lifespan: { min: 250, max: 600 },
      angle: { min: 195, max: 345 },
      speed: { min: speed * 0.3, max: speed },
      gravityY: GRAVITY_MS2 * PIXELS_PER_METER,
      scale: { start: 1.1, end: 0.2 },
      alpha: { start: 0.8, end: 0 },
      color: DUST_COLORS,
      emitting: false,
    }).setDepth(6)
    emitter.explode(count)
    this.effects.add({ view: emitter, expiresAt: this.scene.time.now + 700, fade: false })
  }

  private onCollision(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    for (const pair of event.pairs) {
      this.impact(pair.bodyA.parent, pair.bodyB.parent)
      this.impact(pair.bodyB.parent, pair.bodyA.parent)
    }
  }

  private impact(body: MatterJS.BodyType, other: MatterJS.BodyType): void {
    const rock = this.rocks.get(body)
    if (!rock || other.isSensor) return
    const speedMs = matterToMetersPerSecond(Math.hypot(body.velocity.x - other.velocity.x, body.velocity.y - other.velocity.y))
    if (speedMs < IMPACT_MIN_SPEED_MS) return
    if (!rock.hitTargets.has(other) && damageEnemy(other, rock.damage)) rock.hitTargets.add(other)
    const energy = 0.5 * body.mass * speedMs ** 2
    this.dust(body.position.x, body.position.y, Math.min(32, Math.round(energy / 900) + 6), Math.min(150, speedMs * 10))
    screenShake(this.scene, Math.min(0.018, energy / 1_500_000), 100)
  }

  private remove(body: MatterJS.BodyType): void {
    const rock = this.rocks.get(body)
    if (!rock) return
    this.rocks.delete(body)
    this.scene.matter.world?.remove(body)
    rock.shape.destroy()
  }
}
