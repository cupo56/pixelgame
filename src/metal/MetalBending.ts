import Phaser from 'phaser'
import { METAL } from '../config/metal.ts'
import { PHYSICS_FPS, metersPerSecondToMatter, metersToPixels } from '../config/physics.ts'
import { REACTIONS as R } from '../config/reactions.ts'
import { burst, dust } from '../effects/particles.ts'
import { flash, hitStopOnce, shockwaveRing } from '../effects/impact.ts'
import { screenShake } from '../effects/juice.ts'
import type { MetalBlock, MetalMaterial } from '../materials/MetalMaterial.ts'
import type { Player } from '../entities/Player.ts'
import { METAL_LIGHT, SPARK_COLORS, type ArmorPlates } from './ArmorPlates.ts'

const DT = 1 / PHYSICS_FPS
/** Aufwärtsimpuls beim Losreißen (m/s) und Drehung (rad/Schritt). */
const TEAR_UP_MS = 3.2
const TEAR_SPIN = 0.18
/** Seitlicher Spiralanteil beim Anziehen, relativ zum Tempo. */
const SPIRAL = 0.55
/** Klumpen glühen beim Anziehen bis zu dieser Temperatur auf. */
const PULL_GLOW_C = 1100
/** Spätestens nach dieser Zeit wird verschmolzen, auch wenn ein Klumpen hängt. */
const MAX_PULL_MS = 2600
const REFERENCE_MASS_KG = 225

interface Lump {
  block: MetalBlock
  spiral: number
}

interface Blob {
  x: number
  y: number
  radius: number
}

type Phase = 'idle' | 'tearing' | 'pulling' | 'fusing'

/** Bändigen: Klumpen losreißen, mit Federkraft spiralförmig zur Figur ziehen, zur Rüstung verschmelzen. */
export class MetalBending {
  private readonly scene: Phaser.Scene
  private readonly metal: MetalMaterial
  private readonly player: Player
  private readonly plates: ArmorPlates
  private readonly view: Phaser.GameObjects.Graphics
  private lumps: Lump[] = []
  private blobs: Blob[] = []
  private phase: Phase = 'idle'
  private elapsed = 0
  private fuseMass = 0

  constructor(scene: Phaser.Scene, metal: MetalMaterial, player: Player, plates: ArmorPlates) {
    this.scene = scene
    this.metal = metal
    this.player = player
    this.plates = plates
    this.view = scene.add.graphics().setDepth(12)
    scene.matter.world.on(Phaser.Physics.Matter.Events.BEFORE_UPDATE, this.step, this)
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.draw, this)
  }

  get active(): boolean { return this.phase !== 'idle' }

  /** false, wenn kein Klumpen in Reichweite oder schon Rüstung angelegt ist. */
  begin(): boolean {
    if (this.active || this.plates.equipped) return false
    const { x, y } = this.player.body.position
    const found = this.metal.inRange(x, y, metersToPixels(METAL.bendRangeM))
    if (!found.length) return false
    this.lumps = found.map((block, index) => ({ block, spiral: index % 2 === 0 ? 1 : -1 }))
    for (const { block } of this.lumps) {
      this.metal.claim(block)
      // Losreißen: Ruck nach oben, Drehung, Staub am Boden.
      this.scene.matter.body.setVelocity(block.body, { x: block.body.velocity.x * 0.3, y: -metersPerSecondToMatter(TEAR_UP_MS) })
      this.scene.matter.body.setAngularVelocity(block.body, TEAR_SPIN * (Math.random() < 0.5 ? -1 : 1))
      dust(this.scene, block.body.position.x, block.body.bounds.max.y, 14, 70)
      burst(this.scene, block.body.position.x, block.body.position.y, SPARK_COLORS, 6, 60)
    }
    screenShake(this.scene, 0.003, 120)
    this.phase = 'tearing'
    this.elapsed = 0
    return true
  }

  /** Abbruch vor dem Verschmelzen: Klumpen fallen als normale Klumpen zu Boden. Beim Verschmelzen wird fertig angelegt. */
  cancel(): void {
    if (this.phase === 'fusing') {
      this.finishFuse()
      return
    }
    for (const { block } of this.lumps) this.metal.release(block)
    this.reset()
  }

  /** Tod oder Absturz: nichts wird angelegt. Verschmelzendes Metall ist verloren, noch fliegende Klumpen fallen. */
  abort(): void {
    if (this.phase !== 'fusing') for (const { block } of this.lumps) this.metal.release(block)
    this.reset()
  }

  destroy(): void {
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.BEFORE_UPDATE, this.step, this)
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.draw, this)
    this.lumps = []
    this.blobs = []
    this.phase = 'idle'
    this.view.destroy()
  }

  private reset(): void {
    this.lumps = []
    this.blobs = []
    this.phase = 'idle'
    this.elapsed = 0
    if (this.view.scene) this.view.clear()
  }

  /** Ziel ist die Brust der Figur. */
  private target(): { x: number; y: number } {
    const chest = this.player.getArmorAnchors().find((anchor) => anchor.id === 'chest')
    return chest ?? { x: this.player.body.position.x, y: this.player.body.position.y - 6 }
  }

  private step(): void {
    if (this.phase === 'idle') return
    this.elapsed += DT * 1000
    // Klumpen, die zwischenzeitlich verschwunden sind (z. B. Szenenwechsel), aussortieren.
    this.lumps = this.lumps.filter(({ block }) => this.metal.all().includes(block))
    if (this.phase === 'tearing') {
      for (const { block } of this.lumps) {
        // Kurz schwebend abbremsen, damit das Losreißen lesbar ist.
        this.scene.matter.body.setVelocity(block.body, { x: block.body.velocity.x * 0.92, y: block.body.velocity.y * 0.94 })
      }
      if (this.elapsed >= METAL.tearUpMs) { this.phase = 'pulling'; this.elapsed = 0 }
      return
    }
    if (this.phase === 'pulling') this.pull()
    else if (this.phase === 'fusing') this.fuse()
  }

  /** Feder-Dämpfer-Steuerung zur Brust mit seitlichem Spiralanteil; schwere Klumpen folgen träger. */
  private pull(): void {
    if (!this.lumps.length) { this.reset(); return }
    const target = this.target()
    const fuseDistance = metersToPixels(METAL.fuseDistanceM)
    let allClose = true
    for (const { block, spiral } of this.lumps) {
      const dx = target.x - block.body.position.x, dy = target.y - block.body.position.y
      const distance = Math.hypot(dx, dy)
      if (distance > fuseDistance) allClose = false
      const nx = distance > 0 ? dx / distance : 0, ny = distance > 0 ? dy / distance : 0
      // Tempo nimmt in der Nähe ab, damit die Klumpen nicht durchschießen.
      const speed = metersPerSecondToMatter(METAL.pullSpeedMs) * Math.min(1, distance / (fuseDistance * 3))
      const swirl = distance > fuseDistance * 1.5 ? SPIRAL * speed * spiral : 0
      const desired = { x: nx * speed - ny * swirl + this.player.body.velocity.x, y: ny * speed + nx * swirl + this.player.body.velocity.y }
      const response = 1 - Math.exp(-(METAL.pullResponse / Math.cbrt(Math.max(1, block.massKg) / REFERENCE_MASS_KG)) * DT)
      this.scene.matter.body.setVelocity(block.body, {
        x: Phaser.Math.Linear(block.body.velocity.x, desired.x, response),
        y: Phaser.Math.Linear(block.body.velocity.y, desired.y, response),
      })
      // Reibungshitze: die Klumpen glühen auf, je näher sie kommen.
      block.temperatureC = Math.max(block.temperatureC, Math.min(PULL_GLOW_C, R.ambientC + PULL_GLOW_C * (this.elapsed / 900)))
    }
    if (allClose || this.elapsed >= MAX_PULL_MS) this.startFuse()
  }

  /** Klumpen werden zu glühenden Tropfen, die um den Torso zusammenfließen. */
  private startFuse(): void {
    this.blobs = this.lumps.map(({ block }) => ({
      x: block.body.position.x, y: block.body.position.y, radius: Math.max(3, block.edgePx * 0.6),
    }))
    this.fuseMass = this.lumps.reduce((sum, { block }) => sum + block.massKg, 0)
    for (const { block } of this.lumps) this.metal.consume(block)
    this.lumps = []
    const target = this.target()
    flash(this.scene, target.x, target.y, 14)
    burst(this.scene, target.x, target.y, SPARK_COLORS, 16, 110)
    this.phase = 'fusing'
    this.elapsed = 0
  }

  private fuse(): void {
    const target = this.target()
    const t = Math.min(1, this.elapsed / METAL.fuseMs)
    // Tropfen ziehen sich auf eine Umlaufbahn um den Torso und schrumpfen zur Brust.
    this.blobs.forEach((blob, index) => {
      const angle = this.elapsed * 0.02 + (index / Math.max(1, this.blobs.length)) * Math.PI * 2
      const orbit = 14 * (1 - t)
      const goalX = target.x + Math.cos(angle) * orbit, goalY = target.y + Math.sin(angle) * orbit * 0.8
      blob.x = Phaser.Math.Linear(blob.x, goalX, 0.25)
      blob.y = Phaser.Math.Linear(blob.y, goalY, 0.25)
    })
    if (t >= 1) this.finishFuse()
  }

  /** Platten rasten nacheinander ein: Brust zuerst, dann Arme, dann Beine. */
  private finishFuse(): void {
    this.reset()
    this.plates.equip()
    const order = ['chest', 'upperArmFront', 'upperArmBack', 'foreArmFront', 'thighFront', 'thighBack', 'shinFront', 'shinBack']
    const anchors = this.player.getArmorAnchors()
    order.forEach((id, index) => {
      this.scene.time.delayedCall(index * 45, () => {
        const anchor = (this.player.getArmorAnchors().find((entry) => entry.id === id) ?? anchors.find((entry) => entry.id === id))
        if (anchor) burst(this.scene, anchor.x, anchor.y, SPARK_COLORS, 5 + Math.round(Math.cbrt(this.fuseMass / REFERENCE_MASS_KG) * 3), 80)
      })
    })
    const { x, y } = this.player.body.position
    shockwaveRing(this.scene, x, y - 4, 10, 46, 260, METAL_LIGHT)
    hitStopOnce(this.scene, 35)
    screenShake(this.scene, 0.004, 140)
  }

  private draw(): void {
    if (this.phase !== 'fusing') {
      if (this.phase === 'idle' && this.view.scene) this.view.clear()
      if (this.phase === 'pulling' || this.phase === 'tearing') this.drawTethers()
      return
    }
    const g = this.view.clear()
    for (const blob of this.blobs) {
      const radius = blob.radius * (1 - 0.5 * Math.min(1, this.elapsed / METAL.fuseMs))
      g.fillStyle(0xff8a1f, 0.35).fillCircle(Math.round(blob.x), Math.round(blob.y), radius + 2)
      g.fillStyle(0xffe28a).fillCircle(Math.round(blob.x), Math.round(blob.y), radius)
      g.fillStyle(0xffffff, 0.9).fillCircle(Math.round(blob.x - radius * 0.3), Math.round(blob.y - radius * 0.3), Math.max(1, radius * 0.3))
    }
  }

  /** Feine Kraftlinien von der Hand zu den gebändigten Klumpen. */
  private drawTethers(): void {
    const g = this.view.clear()
    const hand = this.player.getCastOrigin()
    for (const { block } of this.lumps) {
      const flicker = 0.35 + Math.random() * 0.4
      g.lineStyle(1, METAL_LIGHT, flicker).lineBetween(Math.round(hand.x), Math.round(hand.y), Math.round(block.body.position.x), Math.round(block.body.position.y))
    }
  }
}
