import Phaser from 'phaser'
import type { Attack } from '../attacks/Attack.ts'
import { EarthRockAttack } from '../attacks/EarthRockAttack.ts'
import { AirGustAttack } from '../attacks/AirGustAttack.ts'
import { FireballAttack } from '../attacks/FireballAttack.ts'
import { WaterJetAttack } from '../attacks/WaterJetAttack.ts'
import { ELEMENTS, type ElementId, type ElementInfo } from '../config/elements.ts'
import type { Player } from '../entities/Player.ts'
import { progression } from '../progression/Progression.ts'
import { ReactionSystem } from '../materials/ReactionSystem.ts'
import { EarthMaterial } from '../materials/EarthMaterial.ts'
import { FireMaterial } from '../materials/FireMaterial.ts'
import { WaterMaterial } from '../materials/WaterMaterial.ts'
import { Puddle } from '../materials/Puddle.ts'
import { IceMaterial } from '../materials/IceMaterial.ts'
import { SandMaterial } from '../materials/SandMaterial.ts'
import { MetalMaterial } from '../materials/MetalMaterial.ts'

const AIM_LINE_LENGTH_PX = 28
const AIM_LINE_ALPHA = 0.6
const RETICLE_RADIUS_PX = 3
const HUD_X = 28
const HUD_Y = 505
const HUD_SPACING_PX = 110
const INACTIVE_ALPHA = 0.75
/** Wie bei Erde: kurzes Tippen wirft, ab 180 ms Haltezeit beginnt die Aufladung. */
const HOLD_CHARGE_DELAY_MS = 180
/** Tasten 1-4, gleiche Reihenfolge wie ELEMENTS. */
const ELEMENT_KEY_NAMES = ['ONE', 'TWO', 'THREE', 'FOUR'] as const

/** Elementwahl (Mausrad / 1-4), Zielen mit der Maus, Angriff mit Linksklick. */
export class ElementController {
  private readonly scene: Phaser.Scene
  private readonly player: Player
  /** Zentrales Reaktionssystem aller Stoffe; für Browserprüfungen öffentlich. */
  readonly system: ReactionSystem
  private readonly earthMaterial: EarthMaterial
  private readonly fireMaterial: FireMaterial
  private readonly waterMaterial: WaterMaterial
  private readonly puddles: Puddle
  private readonly ice: IceMaterial
  private readonly sand: SandMaterial
  private readonly metal: MetalMaterial
  private readonly earth: EarthRockAttack
  private readonly fire: FireballAttack
  private readonly water: WaterJetAttack
  private readonly air: AirGustAttack
  private readonly attacks: Partial<Record<ElementId, Attack>>
  private readonly nextReadyAt = new Map<ElementId, number>()
  private readonly hudTexts: Phaser.GameObjects.Text[]
  private readonly aimGraphics: Phaser.GameObjects.Graphics
  private selected: ElementInfo = ELEMENTS[0]
  private heldCast?: { element: 'fire' | 'water' | 'air'; pressedAt: number }

  constructor(scene: Phaser.Scene, player: Player) {
    this.scene = scene
    this.player = player
    this.system = new ReactionSystem(scene)
    this.earthMaterial = new EarthMaterial(scene, this.system, player.body)
    this.fireMaterial = new FireMaterial(scene, this.system)
    this.puddles = new Puddle(scene, this.system)
    this.ice = new IceMaterial(scene, this.system)
    this.sand = new SandMaterial(scene, this.system)
    this.metal = new MetalMaterial(scene, this.system, player.body)
    this.waterMaterial = new WaterMaterial(scene, this.system, this.puddles)
    this.earth = new EarthRockAttack(scene, player.body, this.earthMaterial, (charge) => {
      // Kleine/teilgeladene Blöcke brauchen nach dem Loslassen noch Zeit zum Anheben.
      if (this.selected.id === 'earth') player.cast(charge > 0 ? 'earth-charged' : 'earth')
    })
    this.fire = new FireballAttack(scene, this.fireMaterial, () => player.getCastOrigin())
    this.water = new WaterJetAttack(scene, this.waterMaterial, () => player.getWaterPose(), this.system)
    this.air = new AirGustAttack(scene, player.body, this.system, () => player.getAirPose())
    this.attacks = {
      earth: this.earth,
      fire: this.fire,
      water: this.water,
      air: this.air,
    }

    const keyboard = scene.input.keyboard
    if (!keyboard) {
      throw new Error('Keyboard input is not available')
    }
    ELEMENT_KEY_NAMES.forEach((keyName, index) => {
      keyboard.on(`keydown-${keyName}`, () => this.select(ELEMENTS[index]))
    })
    scene.input.mouse?.disableContextMenu()
    // Ereignisse erfassen auch Klicks, die vollständig zwischen zwei Frames liegen.
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.pressAttack, this)
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.releaseAttack, this)
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.releaseAttack, this)
    scene.input.on(Phaser.Input.Events.POINTER_WHEEL, this.cycleElement, this)
    scene.game.events.on(Phaser.Core.Events.BLUR, this.cancelPreparedAttack, this)

    this.aimGraphics = scene.add.graphics().setDepth(50)
    this.hudTexts = ELEMENTS.map((element, index) =>
      scene.add
        .text(HUD_X + index * HUD_SPACING_PX, HUD_Y, this.hudLabel(element, index), {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: hexColor(element.color),
        })
        .setScrollFactor(0)
        .setDepth(100),
    )
    this.refreshHud()
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
  }

  update(): void {
    this.player.setGliding(this.selected.id === 'air' && this.player.isJumpHeld())
    this.beginPendingCharge()
    this.player.setEarthCharge(this.selected.id === 'earth' ? this.earth.chargeProgress ?? null : null)
    this.player.setFireCharge(this.fire.chargeProgress ?? null)
    this.player.setWaterCharge(this.water.chargeProgress ?? null)
    this.player.setAirCharge(this.air.chargeProgress ?? null)

    const pointer = this.scene.input.activePointer
    const target = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2
    const origin = this.player.aimAt(target, this.selected.color)
    const direction = target.clone().subtract(origin)
    if (direction.lengthSq() === 0) {
      return
    }
    direction.normalize()
    for (const attack of Object.values(this.attacks)) attack?.updateAim?.(origin, direction)

    this.drawAim(origin, direction, target)
  }

  get selectedElement(): ElementId {
    return this.selected.id
  }

  cancelPreparedAttack(): void {
    this.earth.cancel()
    this.cancelChargedCasts()
    this.water.cancel()
    this.air.cancel()
    this.player.resetCastPose()
  }

  /** Menüs verwerfen gehaltene Eingaben, bereits gestartete Angriffe pausieren mit der Welt. */
  cancelCharging(): void {
    this.earth.cancelCharge()
    this.cancelChargedCasts()
    this.player.resetCastPose()
  }

  private cancelChargedCasts(): void {
    this.heldCast = undefined
    this.fire.cancelCharge()
    this.water.cancelCharge()
    this.air.cancelCharge()
    this.player.setFireCharge(null)
    this.player.setWaterCharge(null)
    this.player.setAirCharge(null)
  }

  private beginPendingCharge(): void {
    const held = this.heldCast
    if (!held || held.element !== this.selected.id || this.scene.time.now - held.pressedAt < HOLD_CHARGE_DELAY_MS ||
      this.scene.time.now < (this.nextReadyAt.get(held.element) ?? 0)) return
    const attack = this.chargedAttack(held.element)
    if (!attack.isCharging && attack.beginCharge()) {
      if (held.element === 'fire') this.player.setFireCharge(0)
      else if (held.element === 'water') this.player.setWaterCharge(0)
      else this.player.setAirCharge(0)
    }
  }

  private pressAttack(pointer: Phaser.Input.Pointer): void {
    if (pointer.button !== 0) return
    if (this.selected.id !== 'earth') {
      this.heldCast ??= { element: this.selected.id, pressedAt: this.scene.time.now }
      return
    }
    const target = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2
    const origin = this.player.aimAt(target, this.selected.color)
    const direction = target.clone().subtract(origin)
    if (direction.lengthSq() < 1) return
    direction.normalize()
    if (this.scene.time.now < (this.nextReadyAt.get('earth') ?? 0)) return
    if (this.earth.begin(origin, direction)) {
      this.nextReadyAt.set('earth', this.scene.time.now + this.earth.cooldownMs * progression.cooldownMultiplier('earth'))
    }
  }

  private releaseAttack(pointer: Phaser.Input.Pointer): void {
    if (pointer.button !== 0) return
    if (this.selected.id !== 'earth') {
      if (this.heldCast?.element !== this.selected.id) return
      this.beginPendingCharge()
      this.heldCast = undefined
      const attack = this.chargedAttack(this.selected.id)
      const charged = attack.isCharging
      this.player.setFireCharge(null)
      this.player.setWaterCharge(null)
      this.player.setAirCharge(null)
      if (charged && this.selected.id !== 'air') this.player.cast(`${this.selected.id}-charged`)
      const target = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2
      const origin = this.player.aimAt(target, this.selected.color)
      const direction = target.clone().subtract(origin)
      if (charged && attack.release(origin, direction)) {
        if (this.selected.id === 'air') this.player.cast('air-charged')
        const cooldown = this.selected.id === 'water' ? this.water.chargedCooldownMs : this.selected.id === 'air' ? this.air.chargedCooldownMs : this.fire.cooldownMs
        this.nextReadyAt.set(this.selected.id, this.scene.time.now + cooldown * progression.cooldownMultiplier(this.selected.id))
      } else if (!charged && direction.lengthSq() > 0) {
        this.tryAttack(this.scene.time.now)
      } else {
        this.player.resetCastPose()
      }
      return
    }
    if (this.selected.id !== 'earth') return
    const target = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2
    const origin = this.player.aimAt(target, this.selected.color)
    this.earth.updateAim(origin, target.clone().subtract(origin))
    if (this.earth.release()) {
      this.nextReadyAt.set('earth', this.scene.time.now + this.earth.cooldownMs * progression.cooldownMultiplier('earth'))
    }
  }

  private chargedAttack(element: 'fire' | 'water' | 'air'): FireballAttack | WaterJetAttack | AirGustAttack {
    return element === 'fire' ? this.fire : element === 'water' ? this.water : this.air
  }

  private cycleElement(
    _pointer: Phaser.Input.Pointer,
    _over: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
  ): void {
    if (deltaY === 0) return
    const index = ELEMENTS.findIndex((element) => element.id === this.selected.id)
    const next = (index + Math.sign(deltaY) + ELEMENTS.length) % ELEMENTS.length
    this.select(ELEMENTS[next])
  }

  private select(element: ElementInfo): void {
    if (element.id !== this.selected.id) {
      this.earth.cancelCharge()
      this.cancelChargedCasts()
      this.player.resetCastPose()
    }
    this.selected = element
    this.refreshHud()
  }

  private tryAttack(timeMs: number): void {
    if (this.selected.id === 'fire' && (this.fire.isCharging || this.heldCast?.element === 'fire')) return
    if (this.selected.id === 'water' && (this.water.isCharging || this.heldCast?.element === 'water')) return
    if (this.selected.id === 'air' && (this.air.isCharging || this.heldCast?.element === 'air')) return
    const attack = this.attacks[this.selected.id]
    if (!attack || timeMs < (this.nextReadyAt.get(this.selected.id) ?? 0)) {
      return
    }
    this.player.cast(this.selected.id)
    // Auch normale Geschosse beginnen an der Hand der neuen Angriffshaltung.
    const target = this.scene.input.activePointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2
    const origin = this.player.aimAt(target, this.selected.color)
    const direction = target.clone().subtract(origin).normalize()
    if (attack.execute(origin, direction) === false) {
      this.player.resetCastPose()
      return
    }
    this.nextReadyAt.set(this.selected.id, timeMs + attack.cooldownMs * progression.cooldownMultiplier(this.selected.id))
  }

  private drawAim(
    origin: Phaser.Math.Vector2,
    direction: Phaser.Math.Vector2,
    target: Phaser.Math.Vector2,
  ): void {
    const g = this.aimGraphics
    g.clear()
    g.lineStyle(1, this.selected.color, AIM_LINE_ALPHA)
    g.lineBetween(
      origin.x,
      origin.y,
      origin.x + direction.x * AIM_LINE_LENGTH_PX,
      origin.y + direction.y * AIM_LINE_LENGTH_PX,
    )
    g.strokeCircle(target.x, target.y, RETICLE_RADIUS_PX)
  }

  private hudLabel(element: ElementInfo, index: number): string {
    return `${index + 1} ${element.label}${element.implemented ? '' : ' (bald)'}`
  }

  private refreshHud(): void {
    this.hudTexts.forEach((text, index) => {
      const active = ELEMENTS[index].id === this.selected.id
      text.setText(`${active ? '›' : ' '} ${this.hudLabel(ELEMENTS[index], index)}`)
      text.setAlpha(active ? 1 : INACTIVE_ALPHA)
    })
  }

  private destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.pressAttack, this)
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.releaseAttack, this)
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.releaseAttack, this)
    this.scene.input.off(Phaser.Input.Events.POINTER_WHEEL, this.cycleElement, this)
    this.scene.game.events.off(Phaser.Core.Events.BLUR, this.cancelPreparedAttack, this)
    this.cancelChargedCasts()
    for (const keyName of ELEMENT_KEY_NAMES) {
      this.scene.input.keyboard?.removeAllListeners(`keydown-${keyName}`)
    }
    for (const attack of Object.values(this.attacks)) {
      attack?.destroy()
    }
    this.earthMaterial.destroy()
    this.fireMaterial.destroy()
    this.waterMaterial.destroy()
    this.puddles.destroy()
    this.ice.destroy()
    this.sand.destroy()
    this.metal.destroy()
    this.system.destroy()
  }
}

const hexColor = (color: number): string => `#${color.toString(16).padStart(6, '0')}`
