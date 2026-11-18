import Phaser from 'phaser'
import type { Attack } from '../attacks/Attack.ts'
import { EarthRockAttack } from '../attacks/EarthRockAttack.ts'
import { StoneWallAttack } from '../attacks/StoneWallAttack.ts'
import { AirGustAttack } from '../attacks/AirGustAttack.ts'
import { FireballAttack } from '../attacks/FireballAttack.ts'
import { WaterJetAttack } from '../attacks/WaterJetAttack.ts'
import { ELEMENTS, type ElementId, type ElementInfo } from '../config/elements.ts'
import type { Player } from '../entities/Player.ts'
import { progression } from '../progression/Progression.ts'
import { ReactionSystem } from '../materials/ReactionSystem.ts'
import { HudBar } from '../ui/HudBar.ts'
import { WindMarker } from '../combos/WindMarker.ts'
import { EarthMaterial } from '../materials/EarthMaterial.ts'
import { FireMaterial } from '../materials/FireMaterial.ts'
import { WaterMaterial } from '../materials/WaterMaterial.ts'
import { Puddle } from '../materials/Puddle.ts'
import { IceMaterial } from '../materials/IceMaterial.ts'
import { SandMaterial } from '../materials/SandMaterial.ts'
import { MetalMaterial } from '../materials/MetalMaterial.ts'
import { ArmorPlates } from '../metal/ArmorPlates.ts'
import { MetalBending } from '../metal/MetalBending.ts'
import { MetalAttack } from '../attacks/MetalAttack.ts'
import { SpikeSphere } from '../metal/SpikeSphere.ts'

const AIM_LINE_LENGTH_PX = 28
const AIM_LINE_ALPHA = 0.6
const RETICLE_RADIUS_PX = 3
/** Wie bei Erde: kurzes Tippen wirft, ab 180 ms Haltezeit beginnt die Aufladung. */
const HOLD_CHARGE_DELAY_MS = 180
/** Tasten 1-5, gleiche Reihenfolge wie ELEMENTS. */
const ELEMENT_KEY_NAMES = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'] as const

/** Elemente mit gehaltenem Angriff (alle außer Erde, das eigene Hebelogik hat). */
type ChargedElement = 'fire' | 'water' | 'air' | 'metal'

/** Elementwahl (Mausrad / 1-5), Zielen mit der Maus, Angriff mit Linksklick. */
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
  /** Rüstungsplatten aus gebändigtem Metall; für Browserprüfungen öffentlich. */
  readonly metalPlates: ArmorPlates
  private readonly earth: EarthRockAttack
  /** Steinmauer (rechte Taste, Erde); für Browserprüfungen öffentlich. */
  readonly wall: StoneWallAttack
  private readonly fire: FireballAttack
  private readonly water: WaterJetAttack
  private readonly air: AirGustAttack
  private readonly metalAttack: MetalAttack
  private readonly attacks: Partial<Record<ElementId, Attack>>
  private readonly nextReadyAt = new Map<ElementId, number>()
  private readonly hud = HudBar.get()
  private readonly aimGraphics: Phaser.GameObjects.Graphics
  private selected: ElementInfo = ELEMENTS[0]
  private heldCast?: { element: ChargedElement; pressedAt: number }
  private readonly windMarker: WindMarker

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
    this.metalPlates = new ArmorPlates(scene, player)
    this.waterMaterial = new WaterMaterial(scene, this.system, this.puddles)
    this.earth = new EarthRockAttack(scene, player.body, this.earthMaterial, (charge) => {
      // Kleine/teilgeladene Blöcke brauchen nach dem Loslassen noch Zeit zum Anheben.
      if (this.selected.id === 'earth') player.cast(charge > 0 ? 'earth-charged' : 'earth')
    })
    this.wall = new StoneWallAttack(scene, player.body, this.earthMaterial, this.system, { kick: (facing) => player.kickWall(facing) })
    this.fire = new FireballAttack(scene, this.fireMaterial, () => player.getCastOrigin())
    this.water = new WaterJetAttack(scene, this.waterMaterial, () => player.getWaterPose(), this.system)
    this.air = new AirGustAttack(scene, player.body, this.system, () => player.getAirPose())
    this.metalAttack = new MetalAttack(new MetalBending(scene, this.metal, player, this.metalPlates), new SpikeSphere(scene, player, this.metalPlates))
    this.attacks = {
      earth: this.earth,
      fire: this.fire,
      water: this.water,
      air: this.air,
      metal: this.metalAttack,
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
    scene.game.events.on(Phaser.Core.Events.BLUR, this.onBlur, this)

    this.aimGraphics = scene.add.graphics().setDepth(50)
    this.windMarker = new WindMarker(scene, this.system)
    this.refreshHud()
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
  }

  update(): void {
    this.player.setGliding(this.selected.id === 'air' && this.player.isJumpHeld())
    this.beginPendingCharge()
    this.player.setEarthCharge(this.selected.id === 'earth' ? this.earth.chargeProgress ?? null : null)
    this.player.setWallRaise(this.selected.id === 'earth' ? this.wall.raiseProgress ?? null : null)
    this.player.setFireCharge(this.fire.chargeProgress ?? null)
    this.player.setWaterCharge(this.water.chargeProgress ?? null)
    this.player.setAirCharge(this.air.chargeProgress ?? this.metalAttack.chargeProgress ?? null)

    const pointer = this.scene.input.activePointer
    const target = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2
    // Erde: Zielzeichen für die Mauer am Boden unter der Maus.
    this.wall.updateAim(this.selected.id === 'earth' ? target : undefined)
    this.earth.setMouse(target)
    const origin = this.player.aimAt(target, this.selected.color)
    const direction = target.clone().subtract(origin)
    if (direction.lengthSq() === 0) {
      this.windMarker.update(false, origin, direction)
      return
    }
    direction.normalize()
    // Luft: Erdblöcke im Windstoßkegel zeigen Klammern und Pfeil (nur Anzeige, lenkt nichts).
    this.windMarker.update(this.selected.id === 'air', origin, direction)
    for (const attack of Object.values(this.attacks)) attack?.updateAim?.(origin, direction)

    this.drawAim(origin, direction, target)
  }

  /** Teleport: angelegtes Metall und eine kreisende Spitzen-Sphäre reisen mit (Versatz in px). */
  afterTeleport(dx: number, dy: number): void {
    this.metalPlates.shift(dx, dy)
    this.metalAttack.teleport(dx, dy)
  }

  /** Absturz oder Tod: Rüstung und eine geladene Sphäre sind verloren. */
  loseMetal(): void {
    this.metalAttack.abortBending()
    this.metalPlates.shatter(true)
    if (this.metalAttack.isCharging) {
      this.metalAttack.cancelCharge()
      if (this.heldCast?.element === 'metal') this.heldCast = undefined
    }
  }

  /** Nach dem Zeichnen der Figur liegen frische Anker vor. */
  afterRender(): void {
    this.metalPlates.anchorsRefreshed()
    this.metalAttack.anchorsRefreshed()
  }

  get selectedElement(): ElementId {
    return this.selected.id
  }

  /** Fokusverlust bricht alles ab, auch eine geladene Metall-Sphäre. */
  private onBlur(): void { this.cancelPreparedAttack(false) }

  /**
   * Bricht vorbereitete Angriffe ab (Fokusverlust). Beim Teleport bleibt eine kreisende
   * Metall-Sphäre samt gehaltener Taste erhalten; das Bändigen bricht ab.
   */
  cancelPreparedAttack(teleport = false): void {
    this.earth.cancel()
    this.wall.cancelGrowing()
    this.cancelChargedCasts(teleport)
    this.water.cancel()
    this.air.cancel()
    if (!teleport) this.metalAttack.cancel()
    if (!this.metalAttack.isCharging) this.player.resetCastPose()
  }

  /** Menüs verwerfen gehaltene Eingaben, bereits gestartete Angriffe pausieren mit der Welt. */
  cancelCharging(): void {
    this.earth.cancelCharge()
    this.wall.cancelGrowing()
    // Eine bereits laufende Metall-Sphäre friert mit der Szene ein und läuft nach dem Menü weiter;
    // ein nur angetippter Klick ohne laufende Ladung wird verworfen.
    this.cancelChargedCasts(this.metalAttack.isCharging)
    if (!this.metalAttack.isCharging) this.player.resetCastPose()
  }

  private cancelChargedCasts(keepMetal = false): void {
    if (!(keepMetal && this.heldCast?.element === 'metal')) this.heldCast = undefined
    if (!keepMetal) this.metalAttack.cancelCharge()
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
      else if (held.element === 'air') this.player.setAirCharge(0)
    }
  }

  private pressAttack(pointer: Phaser.Input.Pointer): void {
    if (pointer.button === 2) {
      // Rechte Taste: Steinmauer bändigen oder (stehend) zur Maus treten. Nur im Erdmodus.
      if (this.selected.id === 'earth') this.wall.press(pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2)
      return
    }
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
    if (this.earth.begin(origin, direction, target)) {
      this.nextReadyAt.set('earth', this.scene.time.now + this.earth.cooldownMs * progression.cooldownMultiplier('earth'))
    }
  }

  private releaseAttack(pointer: Phaser.Input.Pointer): void {
    if (pointer.button === 2) {
      this.wall.release()
      return
    }
    if (pointer.button !== 0) return
    if (this.selected.id !== 'earth') {
      if (this.heldCast?.element !== this.selected.id) return
      this.beginPendingCharge()
      const heldMs = this.scene.time.now - this.heldCast.pressedAt
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
        const cooldown = this.selected.id === 'water' ? this.water.chargedCooldownMs : this.selected.id === 'air' ? this.air.chargedCooldownMs
          : this.selected.id === 'metal' ? this.metalAttack.chargedCooldownMs : this.fire.cooldownMs
        this.nextReadyAt.set(this.selected.id, this.scene.time.now + cooldown * progression.cooldownMultiplier(this.selected.id))
      } else if (!charged && this.selected.id === 'metal' && heldMs >= HOLD_CHARGE_DELAY_MS) {
        // Metall: Halten ohne Rüstung startet nichts, auch kein Bändigen beim Loslassen.
        this.player.resetCastPose()
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
    this.earth.setMouse(target)
    if (this.earth.release()) {
      this.nextReadyAt.set('earth', this.scene.time.now + this.earth.cooldownMs * progression.cooldownMultiplier('earth'))
    }
  }

  private chargedAttack(element: ChargedElement): FireballAttack | WaterJetAttack | AirGustAttack | MetalAttack {
    return element === 'fire' ? this.fire : element === 'water' ? this.water : element === 'air' ? this.air : this.metalAttack
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
      this.metalAttack.cancel()
      this.earth.cancelCharge()
      this.wall.cancelGrowing()
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
    if (this.selected.id === 'metal' && (this.metalAttack.isCharging || this.heldCast?.element === 'metal')) return
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


  private refreshHud(): void {
    this.hud.selectElement(this.selected.id)
  }

  private destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.pressAttack, this)
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.releaseAttack, this)
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.releaseAttack, this)
    this.scene.input.off(Phaser.Input.Events.POINTER_WHEEL, this.cycleElement, this)
    this.scene.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this)
    this.cancelChargedCasts()
    for (const keyName of ELEMENT_KEY_NAMES) {
      this.scene.input.keyboard?.removeAllListeners(`keydown-${keyName}`)
    }
    for (const attack of Object.values(this.attacks)) {
      attack?.destroy()
    }
    this.windMarker.destroy()
    this.wall.destroy()
    this.earthMaterial.destroy()
    this.fireMaterial.destroy()
    this.waterMaterial.destroy()
    this.puddles.destroy()
    this.ice.destroy()
    this.sand.destroy()
    this.metal.destroy()
    this.metalPlates.destroy()
    this.system.destroy()
  }
}

