import Phaser from 'phaser'
import type { Attack } from '../attacks/Attack.ts'
import { EarthRockAttack } from '../attacks/EarthRockAttack.ts'
import { AirGustAttack } from '../attacks/AirGustAttack.ts'
import { FireballAttack } from '../attacks/FireballAttack.ts'
import { WaterJetAttack } from '../attacks/WaterJetAttack.ts'
import { ELEMENTS, type ElementId, type ElementInfo } from '../config/elements.ts'
import type { Player } from '../entities/Player.ts'

const AIM_LINE_LENGTH_PX = 28
const AIM_LINE_ALPHA = 0.6
const RETICLE_RADIUS_PX = 3
const HUD_X = 28
const HUD_Y = 505
const HUD_SPACING_PX = 110
const INACTIVE_ALPHA = 0.75
/** Tasten 1-4, gleiche Reihenfolge wie ELEMENTS. */
const ELEMENT_KEY_NAMES = ['ONE', 'TWO', 'THREE', 'FOUR'] as const

/** Elementwahl (1-4), Zielen mit der Maus, Angriff mit Linksklick. */
export class ElementController {
  private readonly scene: Phaser.Scene
  private readonly player: Player
  private readonly attacks: Partial<Record<ElementId, Attack>>
  private readonly nextReadyAt = new Map<ElementId, number>()
  private readonly hudTexts: Phaser.GameObjects.Text[]
  private readonly aimGraphics: Phaser.GameObjects.Graphics
  private selected: ElementInfo = ELEMENTS[0]

  constructor(scene: Phaser.Scene, player: Player) {
    this.scene = scene
    this.player = player
    this.attacks = {
      earth: new EarthRockAttack(scene),
      fire: new FireballAttack(scene),
      water: new WaterJetAttack(scene),
      air: new AirGustAttack(scene, player.body),
    }

    const keyboard = scene.input.keyboard
    if (!keyboard) {
      throw new Error('Keyboard input is not available')
    }
    ELEMENT_KEY_NAMES.forEach((keyName, index) => {
      keyboard.on(`keydown-${keyName}`, () => this.select(ELEMENTS[index]))
    })
    scene.input.mouse?.disableContextMenu()

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

  update(timeMs: number): void {
    this.player.setGliding(this.selected.id === 'air' && this.player.isJumpHeld())

    const pointer = this.scene.input.activePointer
    const target = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2
    const origin = this.player.aimAt(target, this.selected.color)
    const direction = target.clone().subtract(origin)
    if (direction.lengthSq() === 0) {
      return
    }
    direction.normalize()

    this.drawAim(origin, direction, target)
    if (pointer.leftButtonDown()) {
      this.tryAttack(origin, direction, timeMs)
    }
  }

  get selectedElement(): ElementId {
    return this.selected.id
  }

  private select(element: ElementInfo): void {
    this.selected = element
    this.refreshHud()
  }

  private tryAttack(origin: Phaser.Math.Vector2, direction: Phaser.Math.Vector2, timeMs: number): void {
    const attack = this.attacks[this.selected.id]
    if (!attack || timeMs < (this.nextReadyAt.get(this.selected.id) ?? 0)) {
      return
    }
    attack.execute(origin, direction)
    this.player.cast(this.selected.id)
    this.nextReadyAt.set(this.selected.id, timeMs + attack.cooldownMs)
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
    for (const keyName of ELEMENT_KEY_NAMES) {
      this.scene.input.keyboard?.removeAllListeners(`keydown-${keyName}`)
    }
    for (const attack of Object.values(this.attacks)) {
      attack?.destroy()
    }
  }
}

const hexColor = (color: number): string => `#${color.toString(16).padStart(6, '0')}`
