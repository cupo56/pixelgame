import Phaser from 'phaser'
import {
  AIR_DRAG,
  PHYSICS_FPS,
  matterToMetersPerSecond,
  metersPerSecondToMatter,
  metersToPixels,
} from '../config/physics.ts'
import { COLLISION_CATEGORY } from '../config/collision.ts'
import { JUMP_SPEED_MS, PLAYER } from '../config/player.ts'
import { StickFigureView, type ArmorAnchor } from './StickFigureView.ts'
import { Health } from '../combat/Health.ts'
import { Armor } from '../combat/Armor.ts'
import { COMBAT } from '../config/combat.ts'
import { REACTIONS } from '../config/reactions.ts'

const PHYSICS_DT = 1 / PHYSICS_FPS
const GROUND_PROBE_PX = 2
const GROUND_PROBE_INSET_PX = 1
const COLLISION_TOLERANCE_PX = 0.25

interface MoveKeys {
  left: Phaser.Input.Keyboard.Key
  right: Phaser.Input.Keyboard.Key
  walk: Phaser.Input.Keyboard.Key
  prone: Phaser.Input.Keyboard.Key
  jump: readonly Phaser.Input.Keyboard.Key[]
}

/** Bewegt sich mit echter Beschleunigung/Reibung; Physik läuft im festen 60-Hz-Schritt. */
export class Player {
  readonly body: MatterJS.BodyType
  readonly health = new Health(PLAYER.maxHealth)
  /** Metallrüstung: fängt Schaden vor dem Leben ab. */
  readonly armor = new Armor()
  private protectedUntil = 0
  private readonly view: StickFigureView
  private readonly keys: MoveKeys
  private readonly scene: Phaser.Scene
  private grounded = false
  private followSteps = false
  private gliding = false
  private coyote = 0
  private jumpBuffer = 0
  private jumpCut = false
  private previousFall = 0
  private landing = 0
  private prone = 0
  private bodyWidth = metersToPixels(PLAYER.widthM)
  private bodyHeight = metersToPixels(PLAYER.heightM)

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene
    const keyboard = scene.input.keyboard
    if (!keyboard) {
      throw new Error('Keyboard input is not available')
    }
    const { KeyCodes } = Phaser.Input.Keyboard
    this.keys = {
      left: keyboard.addKey(KeyCodes.A),
      right: keyboard.addKey(KeyCodes.D),
      walk: keyboard.addKey(KeyCodes.SHIFT),
      prone: keyboard.addKey(KeyCodes.S),
      jump: [keyboard.addKey(KeyCodes.W), keyboard.addKey(KeyCodes.SPACE)],
    }

    this.body = scene.matter.add.rectangle(
      x,
      y,
      this.bodyWidth,
      this.bodyHeight,
      {
        label: 'player',
        mass: PLAYER.massKg,
        friction: 0,
        frictionStatic: 0,
        frictionAir: AIR_DRAG,
        collisionFilter: { category: COLLISION_CATEGORY.player, mask: 0xffffffff, group: 0 },
      },
    )
    // Unendliche Trägheit: Der Körper kippt nicht um.
    scene.matter.body.setInertia(this.body, Infinity)
    this.view = new StickFigureView(scene)

    scene.matter.world.on(Phaser.Physics.Matter.Events.BEFORE_UPDATE, this.step, this)
    scene.matter.world.on(Phaser.Physics.Matter.Events.AFTER_UPDATE, this.stepDown, this)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
  }

  /** Pro Frame: Zeichnen anhand des aktuellen Physikzustands. */
  render(deltaMs: number): void {
    this.view.draw(
      {
        x: this.body.position.x,
        y: this.poseY,
        speedMs: matterToMetersPerSecond(this.body.velocity.x),
        grounded: this.grounded,
        verticalMs: matterToMetersPerSecond(this.body.velocity.y),
        landing: this.landing,
        gliding: this.gliding,
        prone: this.prone,
        hurt: this.scene.time.now < this.protectedUntil && this.health.current < this.health.max,
      },
      deltaMs / 1000,
    )
  }

  aimAt(target: Phaser.Math.Vector2, color: number): Phaser.Math.Vector2 {
    return this.view.aimAt(this.body.position.x, this.poseY, target, color, this.prone)
  }

  /** Die Zeichnung bleibt beim Ändern der Körperhöhe am Boden verankert. */
  private get poseY(): number {
    return this.body.position.y + this.bodyHeight / 2 - metersToPixels(PLAYER.heightM) / 2
  }

  cast(element: string): void { this.view.cast(element) }

  resetCastPose(): void { this.view.resetCastPose() }
  setWallRaise(progress: number | null): void { this.view.setWallRaise(progress) }
  kickWall(facing: number): void { this.view.kick(facing) }
  setEarthCharge(progress: number | null): void { this.view.setEarthCharge(progress) }
  setFireCharge(progress: number | null): void { this.view.setFireCharge(progress) }
  setWaterCharge(progress: number | null): void { this.view.setWaterCharge(progress) }
  setAirCharge(progress: number | null): void { this.view.setAirCharge(progress) }
  getWaterPose() { return this.view.waterPose }
  getAirPose() { return this.view.airPose }

  getCastOrigin(): Phaser.Math.Vector2 { return this.view.castOrigin }

  /** Schaden geht zuerst in die Rüstung, der Rest ins Leben; danach kurze Schutzzeit. */
  takeDamage(amount: number): boolean {
    if (this.scene.time.now < this.protectedUntil || !Number.isFinite(amount) || amount <= 0 || !this.health.alive) return false
    const rest = this.armor.absorb(amount)
    if (rest > 0) this.health.hurt(rest)
    this.protectedUntil = this.scene.time.now + COMBAT.playerProtectionMs
    return true
  }

  getArmorAnchors(): ArmorAnchor[] { return this.view.armorAnchors() }

  restoreHealth(): void {
    this.health.restore()
    this.protectedUntil = this.scene.time.now + COMBAT.playerProtectionMs
  }

  isJumpHeld(): boolean {
    return this.keys.jump.some((key) => key.isDown)
  }

  /** Gleiten bremst nur das Fallen auf eine geringe Sinkgeschwindigkeit. */
  setGliding(active: boolean): void {
    this.gliding = active
  }

  private destroy(): void {
    // Phaser kann die Physikwelt vor den Spielobjekten herunterfahren.
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.BEFORE_UPDATE, this.step, this)
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.AFTER_UPDATE, this.stepDown, this)
    this.view.destroy()
  }

  /** Läuft vor jedem Physikschritt. */
  private step(): void {
    const wasGrounded = this.grounded
    const obstacles = this.solidBodies()
    this.grounded = this.body.velocity.y >= -0.1 && (this.isGrounded(obstacles) || this.hasStaticStepSupport(obstacles))
    this.followSteps = this.grounded
    this.updateStance()
    this.landing = Math.max(0, this.landing - PHYSICS_DT * 4)
    if (this.grounded && !wasGrounded) this.landing = Math.min(1, this.previousFall / 7)
    this.previousFall = matterToMetersPerSecond(this.body.velocity.y)
    this.coyote = this.grounded ? PLAYER.coyoteSeconds : Math.max(0, this.coyote - PHYSICS_DT)
    this.jumpBuffer = this.jumpPressed() ? PLAYER.jumpBufferSeconds : Math.max(0, this.jumpBuffer - PHYSICS_DT)
    // Kein gepufferter Absprung aus der Bauchlage oder bei gehaltenem S.
    if (this.prone > 0 || this.keys.prone.isDown) this.jumpBuffer = 0
    const direction = Number(this.keys.right.isDown) - Number(this.keys.left.isDown)
    const speedMs = matterToMetersPerSecond(this.body.velocity.x)

    const nextSpeedMs = this.grounded
      ? this.groundSpeed(speedMs, direction, this.groundFriction(obstacles))
      : this.airSpeed(speedMs, direction)
    this.scene.matter.body.setVelocity(this.body, {
      x: metersPerSecondToMatter(nextSpeedMs),
      y: this.body.velocity.y,
    })
    this.stepUp(direction, nextSpeedMs)

    if (this.gliding && !this.grounded) {
      this.limitFallSpeed()
    }

    if (this.coyote > 0 && this.jumpBuffer > 0) {
      this.coyote = 0
      this.jumpBuffer = 0
      this.grounded = false
      this.followSteps = false
      this.jumpCut = true
      this.scene.matter.body.setVelocity(this.body, {
        x: this.body.velocity.x,
        y: -metersPerSecondToMatter(JUMP_SPEED_MS),
      })
    }
    if (this.jumpCut && !this.isJumpHeld() && this.body.velocity.y < 0) {
      this.scene.matter.body.setVelocity(this.body, { x: this.body.velocity.x, y: this.body.velocity.y * 0.55 })
      this.jumpCut = false
    }
  }

  /** Vor der Seitenkollision eine niedrige Stufe betreten, ohne Sprungimpuls. */
  private stepUp(direction: number, speedMs: number): void {
    const dx = metersPerSecondToMatter(speedMs)
    if (!this.grounded || this.prone > 0 || this.jumpBuffer > 0 || direction * dx <= 0) return

    const { x, y } = this.body.position
    const footY = y + this.bodyHeight / 2
    const leadingX = x + direction * this.bodyWidth / 2
    const nextLeadingX = leadingX + dx
    const obstacles = this.solidBodies()
    const steps = obstacles.filter((body) => {
      const rise = footY - body.bounds.min.y
      return body.isStatic && rise > COLLISION_TOLERANCE_PX && rise <= metersToPixels(PLAYER.stepHeightM) &&
        body.bounds.min.x <= Math.max(leadingX, nextLeadingX) &&
        body.bounds.max.x >= Math.min(leadingX, nextLeadingX)
    }).sort((a, b) => b.bounds.min.y - a.bounds.min.y)

    for (const step of steps) {
      const rise = footY - step.bounds.min.y + 0.1
      const nextY = y - rise
      // Erst aufwärts, dann vorwärts: beide Wege müssen für den ganzen Körper frei sein.
      const vertical = this.scene.matter.bodies.rectangle(
        x, y - rise / 2, this.bodyWidth - COLLISION_TOLERANCE_PX * 2,
        this.bodyHeight + rise - COLLISION_TOLERANCE_PX * 2,
      )
      const horizontal = this.scene.matter.bodies.rectangle(
        x + dx / 2, nextY, this.bodyWidth + Math.abs(dx) - COLLISION_TOLERANCE_PX * 2,
        this.bodyHeight - COLLISION_TOLERANCE_PX * 2,
      )
      if (this.scene.matter.overlap([vertical, horizontal], obstacles)) continue
      this.scene.matter.body.setPosition(this.body, { x, y: nextY })
      this.scene.matter.body.setVelocity(this.body, { x: this.body.velocity.x, y: 0 })
      return
    }
  }

  /** Nach der horizontalen Bewegung auf die nächste niedrige Stufe absetzen. */
  private stepDown(): void {
    if (!this.followSteps || this.prone > 0 || this.body.velocity.y < 0 || Math.abs(this.body.velocity.x) < 0.001) return
    const obstacles = this.solidBodies()
    if (this.isGrounded(obstacles) || this.hasStaticStepSupport(obstacles)) return

    const { x, y } = this.body.position
    const footY = y + this.bodyHeight / 2
    const halfWidth = this.bodyWidth / 2 - GROUND_PROBE_INSET_PX
    const steps = obstacles.filter((body) => {
      const drop = body.bounds.min.y - footY
      return body.isStatic && body.angle === 0 && body.vertices?.length === 4 &&
        drop > COLLISION_TOLERANCE_PX && drop <= metersToPixels(PLAYER.stepHeightM) &&
        body.bounds.min.x < x + halfWidth && body.bounds.max.x > x - halfWidth
    }).sort((a, b) => a.bounds.min.y - b.bounds.min.y)

    for (const step of steps) {
      const drop = step.bounds.min.y - footY - 0.1
      const path = this.scene.matter.bodies.rectangle(
        x, y + drop / 2, this.bodyWidth - COLLISION_TOLERANCE_PX * 2,
        this.bodyHeight + drop - COLLISION_TOLERANCE_PX * 2,
      )
      // Die ganze Figur muss die obere Kante verlassen haben, bevor sie absinkt.
      if (this.scene.matter.overlap(path, obstacles)) continue
      this.scene.matter.body.setPosition(this.body, { x, y: y + drop })
      this.scene.matter.body.setVelocity(this.body, { x: this.body.velocity.x, y: 0 })
      this.grounded = true
      this.previousFall = 0
      return
    }
    // Ein echter Abgrund beendet die Bodenfolge sofort, auch wenn später Boden näher kommt.
    this.grounded = false
    this.followSteps = false
  }

  /** Auch der letzte schmale Kontakt am Stufenrand trägt den Körper noch. */
  private hasStaticStepSupport(obstacles: MatterJS.BodyType[]): boolean {
    const { x, y } = this.body.position
    const footY = y + this.bodyHeight / 2
    return obstacles.some((body) => body.isStatic && body.angle === 0 && body.vertices?.length === 4 &&
      body.bounds.min.y >= footY - COLLISION_TOLERANCE_PX &&
      body.bounds.min.y <= footY + GROUND_PROBE_PX &&
      body.bounds.min.x < x + this.bodyWidth / 2 && body.bounds.max.x > x - this.bodyWidth / 2,
    )
  }

  private updateStance(): void {
    const wantsProne = this.keys.prone.isDown && (this.grounded || this.prone > 0)
    const target = wantsProne ? 1 : 0
    if (this.prone === target) return
    const standingWidth = metersToPixels(PLAYER.widthM)
    const standingHeight = metersToPixels(PLAYER.heightM)
    // Unter einer Decke unten bleiben, bis die ganze stehende Figur Platz hat.
    if (!wantsProne && !this.canFit(standingWidth, standingHeight)) return
    const duration = wantsProne ? PLAYER.proneDownSeconds : PLAYER.proneUpSeconds
    const next = approach(this.prone, target, PHYSICS_DT / duration)
    const width = standingWidth + (metersToPixels(PLAYER.proneWidthM) - standingWidth) * next
    const height = standingHeight + (metersToPixels(PLAYER.proneHeightM) - standingHeight) * next
    // Auch die seitliche Ausdehnung beim Hinlegen darf keine Wand durchdringen.
    if (!this.canFit(width, height)) return
    const y = this.stanceCenterY(height)
    this.scene.matter.body.scale(this.body, width / this.bodyWidth, height / this.bodyHeight)
    this.scene.matter.body.setPosition(this.body, { x: this.body.position.x, y })
    this.scene.matter.body.setMass(this.body, PLAYER.massKg)
    this.scene.matter.body.setInertia(this.body, Infinity)
    this.bodyWidth = width
    this.bodyHeight = height
    this.prone = next
  }

  private stanceCenterY(height: number): number {
    return this.body.position.y + (this.grounded ? (this.bodyHeight - height) / 2 : 0)
  }

  private canFit(width: number, height: number): boolean {
    // Kleine Toleranz für den üblichen Kontakt mit dem Boden.
    const probe = this.scene.matter.bodies.rectangle(
      this.body.position.x, this.stanceCenterY(height), width - 0.5, height - 0.5,
    )
    return !this.scene.matter.overlap(probe, this.solidBodies())
  }

  /** Abfragen beachten dieselben Masken wie die tatsächlichen Körperkontakte. */
  private solidBodies(): MatterJS.BodyType[] {
    const filter = this.body.collisionFilter
    return this.scene.matter.world.getAllBodies().filter((body) =>
      body !== this.body && !body.isSensor &&
      (filter.mask & body.collisionFilter.category) !== 0 &&
      (body.collisionFilter.mask & filter.category) !== 0,
    )
  }

  private limitFallSpeed(): void {
    const fallMs = matterToMetersPerSecond(this.body.velocity.y)
    if (fallMs <= PLAYER.glideFallSpeedMs) {
      return
    }
    const limitedMs = approach(fallMs, PLAYER.glideFallSpeedMs, PLAYER.glideDecelMs2 * PHYSICS_DT)
    this.scene.matter.body.setVelocity(this.body, {
      x: this.body.velocity.x,
      y: metersPerSecondToMatter(limitedMs),
    })
  }

  /** Reibungsfaktor des Untergrunds (1 = normal, Eis ≈ 0,08); skaliert Bremsen und Beschleunigen am Boden. */
  private groundFriction(obstacles: MatterJS.BodyType[]): number {
    const ice = obstacles.filter((body) => body.label === 'ice-sheet')
    if (!ice.length) return 1
    const probe = this.scene.matter.bodies.rectangle(
      this.body.position.x,
      this.body.position.y + this.bodyHeight / 2 + GROUND_PROBE_PX / 2,
      this.bodyWidth - GROUND_PROBE_INSET_PX * 2,
      GROUND_PROBE_PX,
    )
    return this.scene.matter.overlap(probe, ice) ? REACTIONS.iceFriction : 1
  }

  /** Mit Eingabe: Beschleunigen. Ohne Eingabe: Haftreibung bremst bis zum Stillstand. */
  private groundSpeed(speedMs: number, direction: number, friction = 1): number {
    if (direction === 0) {
      return approach(speedMs, 0, PLAYER.stopDecelMs2 * friction * PHYSICS_DT)
    }
    const braking = Math.sign(speedMs) === -direction ? PLAYER.stopDecelMs2 * friction : 0
    const uprightSpeed = this.keys.walk.isDown ? PLAYER.walkSpeedMs : PLAYER.maxSpeedMs
    const targetSpeed = uprightSpeed + (PLAYER.crawlSpeedMs - uprightSpeed) * this.prone
    return approach(
      speedMs,
      direction * targetSpeed,
      (PLAYER.groundAccelMs2 * friction + braking) * PHYSICS_DT,
    )
  }

  /** In der Luft bleibt der Impuls erhalten, nur schwache Steuerung. */
  private airSpeed(speedMs: number, direction: number): number {
    if (direction === 0) {
      return speedMs
    }
    const target = direction * (this.keys.walk.isDown ? PLAYER.walkSpeedMs : PLAYER.maxSpeedMs)
    const alreadyFaster = Math.sign(speedMs) === direction && Math.abs(speedMs) >= PLAYER.maxSpeedMs
    return alreadyFaster ? speedMs : approach(speedMs, target, PLAYER.airAccelMs2 * PHYSICS_DT)
  }

  private jumpPressed(): boolean {
    return this.keys.jump.some((key) => Phaser.Input.Keyboard.JustDown(key))
  }

  /** Prüft einen schmalen Streifen unter den Füßen auf feste Körper. */
  private isGrounded(obstacles = this.solidBodies()): boolean {
    // Matter erweitert body.bounds um die Geschwindigkeit. Diese Vorschau kann
    // eine Wand neben einer fallenden Figur fälschlich als Boden melden.
    const probe = this.scene.matter.bodies.rectangle(
      this.body.position.x,
      this.body.position.y + this.bodyHeight / 2 + GROUND_PROBE_PX / 2,
      this.bodyWidth - GROUND_PROBE_INSET_PX * 2,
      GROUND_PROBE_PX,
    )
    return this.scene.matter.overlap(probe, obstacles)
  }
}

/** Bewegt `value` um höchstens `maxDelta` auf `target` zu, ohne darüber hinaus zu schießen. */
const approach = (value: number, target: number, maxDelta: number): number => {
  const diff = target - value
  return Math.abs(diff) <= maxDelta ? target : value + Math.sign(diff) * maxDelta
}
