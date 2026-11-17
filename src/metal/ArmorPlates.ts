import Phaser from 'phaser'
import { ARMOR_MASK, COLLISION_CATEGORY } from '../config/collision.ts'
import { COMBAT } from '../config/combat.ts'
import { METAL } from '../config/metal.ts'
import { isEnemy } from '../combat/damage.ts'
import { burst, dust } from '../effects/particles.ts'
import { hitStopOnce, impactRing } from '../effects/impact.ts'
import { screenShake } from '../effects/juice.ts'
import type { Player } from '../entities/Player.ts'
import type { ArmorAnchor, ArmorAnchorId } from '../entities/StickFigureView.ts'

export const METAL_DARK = 0x4a4f57
export const METAL_MID = 0x7d858f
export const METAL_LIGHT = 0xc9ced6
export const SPARK_COLORS = [0xffffff, 0xffe28a, 0xc9ced6]

/** Plattenbreite je Segment (px); die Länge folgt dem Segment. */
const PLATE_WIDTH: Record<ArmorAnchorId, number> = {
  chest: 8, upperArmFront: 5, foreArmFront: 4, upperArmBack: 5, thighFront: 5, shinFront: 4, thighBack: 5, shinBack: 4,
}
/** Platten sind kürzer als das Segment, damit Gelenke sichtbar bleiben. */
const LENGTH_FACTOR = 0.78
/** Masse nur für Stöße mit Gegnern; der Spieler spürt sie nie (keine Kollision mit ihm). */
const PLATE_MASS_KG = 40
/** Eindrückweg nach einem Treffer (px) und Rückfedern (1/s). */
const DENT_PX = 4
const DENT_RECOVER = 9

export interface Plate {
  readonly id: ArmorAnchorId
  readonly body: MatterJS.BodyType
  readonly width: number
  length: number
  /** Eindrückung entlang der Segment-Normalen, federt zurück. */
  dent: number
  /** Ankerlage im vorigen Schritt: daraus folgt die Eigenbewegung des Segments. */
  lastAnchor?: { x: number; y: number }
}

/** Rüstung aus echten Physikplatten, die der Figur folgen und nur mit Gegnern kollidieren. */
export class ArmorPlates {
  private readonly scene: Phaser.Scene
  private readonly player: Player
  private readonly view: Phaser.GameObjects.Graphics
  private plates: Plate[] = []

  constructor(scene: Phaser.Scene, player: Player) {
    this.scene = scene
    this.player = player
    this.view = scene.add.graphics().setDepth(11)
    scene.matter.world.on(Phaser.Physics.Matter.Events.BEFORE_UPDATE, this.step, this)
    scene.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.draw, this)
  }

  get equipped(): boolean { return this.plates.length > 0 }

  /** Aktuelle Plattenkörper (für Bändigen und Sphäre). */
  get bodies(): readonly Plate[] { return this.plates }

  /** Legt alle Platten auf ihre Anker und gibt der Figur die volle Rüstung. */
  equip(): void {
    this.removeBodies()
    for (const anchor of this.player.getArmorAnchors()) this.plates.push(this.createPlate(anchor))
    this.player.armor.equip(METAL.armorPoints)
  }

  /**
   * Löst die Platten als Startpunkte für die Spitzen-Sphäre. Die Rüstung zählt ab hier nicht mehr.
   * Liefert Lage, Winkel und Geschwindigkeit jeder Platte.
   */
  detach(): { x: number; y: number; angle: number; vx: number; vy: number }[] {
    const starts = this.plates.map(({ body }) => ({
      x: body.position.x, y: body.position.y, angle: body.angle, vx: body.velocity.x, vy: body.velocity.y,
    }))
    this.removeBodies()
    this.player.armor.clear()
    return starts
  }

  /** Platten bersten: Splitter nach außen, Metall ist danach weg. */
  shatter(quiet = false): void {
    if (!this.equipped) return
    const center = this.player.body.position
    for (const { body } of this.plates) {
      const dx = body.position.x - center.x, dy = body.position.y - center.y
      const length = Math.hypot(dx, dy) || 1
      burst(this.scene, body.position.x + dx / length * 3, body.position.y + dy / length * 3, [METAL_LIGHT, METAL_MID, METAL_DARK], 8, 120)
      dust(this.scene, body.position.x, body.position.y, 3, 50)
    }
    if (!quiet) {
      impactRing(this.scene, center.x, center.y, METAL_LIGHT)
      screenShake(this.scene, 0.004, 140)
      hitStopOnce(this.scene, 40)
    }
    this.removeBodies()
    this.player.armor.clear()
  }

  /** Teleport (Rückruf, Aufzug): alle Platten springen um denselben Versatz wie die Figur mit. */
  shift(dx: number, dy: number): void {
    for (const { body } of this.plates) {
      this.scene.matter.body.setPosition(body, { x: body.position.x + dx, y: body.position.y + dy })
      this.scene.matter.body.setVelocity(body, { x: 0, y: 0 })
    }
    this.shifted = { x: dx, y: dy }
  }

  destroy(): void {
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.BEFORE_UPDATE, this.step, this)
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.draw, this)
    this.removeBodies()
    this.view.destroy()
  }

  /** Nach einem Teleport stammen die Anker noch vom letzten Bild am alten Ort: bis zum nächsten Bild versetzen. */
  private shifted?: { x: number; y: number }

  private createPlate(anchor: ArmorAnchor): Plate {
    const width = PLATE_WIDTH[anchor.id]
    const length = Math.max(4, anchor.length * LENGTH_FACTOR)
    const body = this.scene.matter.add.rectangle(anchor.x, anchor.y, length, width, {
      label: 'armor-plate',
      mass: PLATE_MASS_KG,
      ignoreGravity: true,
      frictionAir: 0,
      friction: 0,
      restitution: 0.2,
      angle: anchor.angle,
      collisionFilter: { category: COLLISION_CATEGORY.armor, mask: ARMOR_MASK, group: 0 },
    })
    this.scene.matter.body.setInertia(body, Infinity)
    return { id: anchor.id, body, width, length, dent: 0 }
  }

  private removeBodies(): void {
    const bodies = this.plates.map((plate) => plate.body)
    this.plates = []
    if (this.view.scene) this.view.clear()
    // Erst nach dem Physikschritt entfernen, weil equip/shatter auch aus Kollisionen heraus laufen.
    this.scene.time.delayedCall(0, () => { for (const body of bodies) this.scene.matter.world?.remove(body) })
  }

  /** Jeder Physikschritt: Platten per Zielgeschwindigkeit an ihre Anker ziehen, Rüstung bei 0 bersten lassen. */
  private step(): void {
    if (!this.equipped) return
    if (!this.player.armor.active) {
      this.shatter()
      return
    }
    const shift = this.shifted ?? { x: 0, y: 0 }
    const anchors = new Map(this.player.getArmorAnchors().map((anchor) => [anchor.id, { ...anchor, x: anchor.x + shift.x, y: anchor.y + shift.y }]))
    const playerVelocity = this.player.body.velocity
    for (const plate of this.plates) {
      const anchor = anchors.get(plate.id)
      if (!anchor) continue
      plate.dent = Math.max(0, plate.dent - DENT_RECOVER * plate.dent / 60)
      plate.length = Math.max(4, anchor.length * LENGTH_FACTOR)
      // Eindrückung quer zum Segment.
      const nx = -Math.sin(anchor.angle), ny = Math.cos(anchor.angle)
      const tx = anchor.x + nx * plate.dent, ty = anchor.y + ny * plate.dent
      // Eigenbewegung des Segments (Beinschwung) seit dem letzten Bild, damit die Platte nicht hinterherhängt.
      const limb = plate.lastAnchor && !this.shifted
        ? { x: anchor.x - plate.lastAnchor.x, y: anchor.y - plate.lastAnchor.y }
        : { x: playerVelocity.x, y: playerVelocity.y }
      plate.lastAnchor = { x: anchor.x, y: anchor.y }
      const dx = tx - plate.body.position.x, dy = ty - plate.body.position.y
      if (Math.hypot(dx, dy) > METAL.plateSnapPx) {
        this.scene.matter.body.setPosition(plate.body, { x: tx, y: ty })
        this.scene.matter.body.setVelocity(plate.body, limb)
      } else {
        this.scene.matter.body.setVelocity(plate.body, { x: limb.x + dx * METAL.plateSpring, y: limb.y + dy * METAL.plateSpring })
      }
      this.scene.matter.body.setAngle(plate.body, anchor.angle)
    }
  }

  /** Neue Anker liegen vor: Teleport-Versatz nicht mehr nötig. */
  anchorsRefreshed(): void { this.shifted = undefined }

  private onCollision(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    for (const pair of event.pairs) {
      this.hit(pair.bodyA.parent, pair.bodyB.parent)
      this.hit(pair.bodyB.parent, pair.bodyA.parent)
    }
  }

  /** Gegner prallt an einer Platte ab: Schaden geht in die Rüstung, Platte wird eingedrückt. */
  private hit(body: MatterJS.BodyType, other: MatterJS.BodyType): void {
    const plate = this.plates.find((entry) => entry.body === body)
    if (!plate || !isEnemy(other)) return
    plate.dent = DENT_PX
    const { x, y } = body.position
    burst(this.scene, x, y, SPARK_COLORS, 10, 110)
    this.player.takeDamage(COMBAT.contactDamage)
  }

  private draw(): void {
    const g = this.view.clear()
    if (!this.equipped) return
    const wear = 1 - this.player.armor.current / Math.max(1, this.player.armor.max)
    for (const plate of this.plates) {
      const { x, y } = plate.body.position
      const angle = plate.body.angle
      const cos = Math.cos(angle), sin = Math.sin(angle)
      const corner = (u: number, v: number) => new Phaser.Math.Vector2(Math.round(x + u * cos - v * sin), Math.round(y + u * sin + v * cos))
      const hl = plate.length / 2, hw = plate.width / 2
      g.fillStyle(METAL_DARK).fillPoints([corner(-hl, -hw), corner(hl, -hw), corner(hl, hw), corner(-hl, hw)], true)
      g.fillStyle(METAL_MID).fillPoints([corner(-hl + 1, -hw + 1), corner(hl - 1, -hw + 1), corner(hl - 1, hw - 1), corner(-hl + 1, hw - 1)], true)
      // Helle Oberkante als Glanz.
      const a = corner(-hl + 1, -hw + 1), b = corner(hl - 1, -hw + 1)
      g.lineStyle(1, METAL_LIGHT, 0.95).lineBetween(a.x, a.y, b.x, b.y)
      // Risse nehmen mit dem Verschleiß zu.
      const cracks = Math.round(wear * 3)
      for (let i = 0; i < cracks; i++) {
        const u = -hl + (i + 1) * (plate.length / (cracks + 1))
        const c1 = corner(u, -hw), c2 = corner(u + 1.5, hw)
        g.lineStyle(1, 0x1f2328, 0.9).lineBetween(c1.x, c1.y, c2.x, c2.y)
      }
    }
  }
}
