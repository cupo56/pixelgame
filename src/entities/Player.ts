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
import { StickFigureView } from './StickFigureView.ts'

const PHYSICS_DT = 1 / PHYSICS_FPS
const GROUND_PROBE_PX = 2
const GROUND_PROBE_INSET_PX = 1

interface MoveKeys {
  left: Phaser.Input.Keyboard.Key
  right: Phaser.Input.Keyboard.Key
  walk: Phaser.Input.Keyboard.Key
  jump: readonly Phaser.Input.Keyboard.Key[]
}

/** Bewegt sich mit echter Beschleunigung/Reibung; Physik läuft im festen 60-Hz-Schritt. */
export class Player {
  readonly body: MatterJS.BodyType
  private readonly view: StickFigureView
  private readonly keys: MoveKeys
  private readonly scene: Phaser.Scene
  private grounded = false
  private gliding = false
  private coyote = 0
  private jumpBuffer = 0
  private jumpCut = false
  private previousFall = 0
  private landing = 0

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
      jump: [keyboard.addKey(KeyCodes.W), keyboard.addKey(KeyCodes.SPACE)],
    }

    this.body = scene.matter.add.rectangle(
      x,
      y,
      metersToPixels(PLAYER.widthM),
      metersToPixels(PLAYER.heightM),
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
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
  }

  /** Pro Frame: Zeichnen anhand des aktuellen Physikzustands. */
  render(deltaMs: number): void {
    this.view.draw(
      {
        x: this.body.position.x,
        y: this.body.position.y,
        speedMs: matterToMetersPerSecond(this.body.velocity.x),
        grounded: this.grounded,
        verticalMs: matterToMetersPerSecond(this.body.velocity.y),
        landing: this.landing,
        gliding: this.gliding,
      },
      deltaMs / 1000,
    )
  }

  aimAt(target: Phaser.Math.Vector2, color: number): Phaser.Math.Vector2 {
    return this.view.aimAt(this.body.position.x, this.body.position.y, target, color)
  }

  cast(element: string): void { this.view.cast(element) }

  isJumpHeld(): boolean {
    return this.keys.jump.some((key) => key.isDown)
  }

  /** Gleiten bremst nur das Fallen auf eine geringe Sinkgeschwindigkeit. */
  setGliding(active: boolean): void {
    this.gliding = active
  }

  private destroy(): void {
    this.scene.matter.world.off(Phaser.Physics.Matter.Events.BEFORE_UPDATE, this.step, this)
    this.view.destroy()
  }

  /** Läuft vor jedem Physikschritt. */
  private step(): void {
    const wasGrounded = this.grounded
    this.grounded = this.body.velocity.y >= -0.1 && this.isGrounded()
    this.landing = Math.max(0, this.landing - PHYSICS_DT * 4)
    if (this.grounded && !wasGrounded) this.landing = Math.min(1, this.previousFall / 7)
    this.previousFall = matterToMetersPerSecond(this.body.velocity.y)
    this.coyote = this.grounded ? PLAYER.coyoteSeconds : Math.max(0, this.coyote - PHYSICS_DT)
    this.jumpBuffer = this.jumpPressed() ? PLAYER.jumpBufferSeconds : Math.max(0, this.jumpBuffer - PHYSICS_DT)
    const direction = Number(this.keys.right.isDown) - Number(this.keys.left.isDown)
    const speedMs = matterToMetersPerSecond(this.body.velocity.x)

    const nextSpeedMs = this.grounded
      ? this.groundSpeed(speedMs, direction)
      : this.airSpeed(speedMs, direction)
    this.scene.matter.body.setVelocity(this.body, {
      x: metersPerSecondToMatter(nextSpeedMs),
      y: this.body.velocity.y,
    })

    if (this.gliding && !this.grounded) {
      this.limitFallSpeed()
    }

    if (this.coyote > 0 && this.jumpBuffer > 0) {
      this.coyote = 0
      this.jumpBuffer = 0
      this.grounded = false
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

  /** Mit Eingabe: Beschleunigen. Ohne Eingabe: Haftreibung bremst bis zum Stillstand. */
  private groundSpeed(speedMs: number, direction: number): number {
    if (direction === 0) {
      return approach(speedMs, 0, PLAYER.stopDecelMs2 * PHYSICS_DT)
    }
    const braking = Math.sign(speedMs) === -direction ? PLAYER.stopDecelMs2 : 0
    return approach(
      speedMs,
      direction * (this.keys.walk.isDown ? PLAYER.walkSpeedMs : PLAYER.maxSpeedMs),
      (PLAYER.groundAccelMs2 + braking) * PHYSICS_DT,
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
  private isGrounded(): boolean {
    const { min, max } = this.body.bounds
    const probe = {
      min: { x: min.x + GROUND_PROBE_INSET_PX, y: max.y },
      max: { x: max.x - GROUND_PROBE_INSET_PX, y: max.y + GROUND_PROBE_PX },
    }
    const others = this.scene.matter.world
      .getAllBodies()
      .filter((body) => body !== this.body && !body.isSensor)
    return this.scene.matter.query.region(others, probe).length > 0
  }
}

/** Bewegt `value` um höchstens `maxDelta` auf `target` zu, ohne darüber hinaus zu schießen. */
const approach = (value: number, target: number, maxDelta: number): number => {
  const diff = target - value
  return Math.abs(diff) <= maxDelta ? target : value + Math.sign(diff) * maxDelta
}
