import Phaser from 'phaser'
import { COMBAT } from '../config/combat.ts'
import { metersPerSecondToMatter, metersToPixels } from '../config/physics.ts'
import { damageEnemy, freezeEnemy } from '../combat/damage.ts'
import { applyWet } from '../combat/status.ts'
import { burst } from '../effects/particles.ts'
import { screenShake } from '../effects/juice.ts'
import { impactRing } from '../effects/impact.ts'
import { REACTIONS as R } from '../config/reactions.ts'
import type { ReactionSystem } from '../materials/ReactionSystem.ts'

const CHARGE_MS = 2000
const EXTEND_MS = 240
const RETRACT_MS = 180
const COLORS = [0xe1faff, 0x8dd8ff, 0x3fa7ff]

export interface WaterPose {
  center: Phaser.Math.Vector2
  hand: Phaser.Math.Vector2
  support: Phaser.Math.Vector2
  phase: number
  prone: number
}

interface Charge {
  elapsed: number
  progress: number
}

interface Whip {
  origin: Phaser.Math.Vector2
  direction: Phaser.Math.Vector2
  charge: number
  elapsed: number
  range: number
  width: number
  damage: number
  view: Phaser.GameObjects.Graphics
  probe: MatterJS.BodyType
  points: Phaser.Math.Vector2[]
  hitTargets: Set<MatterJS.BodyType>
}

/** Sichtbares Wasserband und Treffer verwenden dieselbe, an Hindernissen gekürzte Kurve. */
export class WaterWhipAttack {
  readonly cooldownMs = 650
  private readonly scene: Phaser.Scene
  private readonly getPose: () => WaterPose
  private readonly system: ReactionSystem
  private readonly back: Phaser.GameObjects.Graphics
  private readonly front: Phaser.GameObjects.Graphics
  private readonly label: Phaser.GameObjects.Text
  private charging?: Charge
  private readonly whips = new Set<Whip>()

  constructor(scene: Phaser.Scene, getPose: () => WaterPose, system: ReactionSystem) {
    this.scene = scene
    this.getPose = getPose
    this.system = system
    this.back = scene.add.graphics().setDepth(8).setVisible(false)
    this.front = scene.add.graphics().setDepth(14).setVisible(false)
    this.label = scene.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#d8f8ff',
      backgroundColor: '#14303d', padding: { x: 3, y: 2 },
    }).setOrigin(0.5, 1).setDepth(16).setVisible(false)
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.update, this)
  }

  get isCharging(): boolean { return this.charging !== undefined }
  get chargeProgress(): number | undefined { return this.charging?.progress }

  beginCharge(): boolean {
    if (this.charging || this.whips.size) return false
    this.charging = { elapsed: 0, progress: 0 }
    return true
  }

  release(origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): boolean {
    if (!this.charging) return false
    const charge = this.charging.progress
    this.cancelCharge()
    const aim = direction.clone()
    if (aim.lengthSq() < 0.01) aim.set(1, 0)
    aim.normalize()
    const width = 3 + charge * 5
    this.whips.add({
      origin: new Phaser.Math.Vector2(origin.x ?? 0, origin.y ?? 0), direction: aim,
      charge, elapsed: 0, range: metersToPixels(3 + charge * 4), width,
      damage: Math.round(Phaser.Math.Linear(COMBAT.waterWhipDamage, COMBAT.chargedWaterWhipDamage, charge)),
      view: this.scene.add.graphics().setDepth(14),
      probe: this.scene.matter.bodies.circle(0, 0, width / 2), points: [], hitTargets: new Set(),
    })
    screenShake(this.scene, 0.001 + charge * 0.002, 80)
    return true
  }

  cancelCharge(): void {
    this.charging = undefined
    if (this.back.scene) this.back.clear().setVisible(false)
    if (this.front.scene) this.front.clear().setVisible(false)
    if (this.label.scene) this.label.setVisible(false)
  }

  cancel(): void {
    this.cancelCharge()
    for (const whip of this.whips) whip.view.destroy()
    this.whips.clear()
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.update, this)
    this.cancel()
    this.back.destroy()
    this.front.destroy()
    this.label.destroy()
  }

  private update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50)
    const pose = this.getPose()
    if (this.charging) {
      this.charging.elapsed = Math.min(CHARGE_MS, this.charging.elapsed + dt)
      this.charging.progress = this.charging.elapsed / CHARGE_MS
      this.drawCharge(pose, this.charging.progress)
    }
    for (const whip of this.whips) {
      if (whip.origin.distance(pose.hand) > metersToPixels(2)) {
        whip.view.destroy()
        this.whips.delete(whip)
        continue
      }
      whip.origin.copy(pose.hand)
      const bodies = this.scene.matter.world.getAllBodies().filter((body) =>
        body.label !== 'player' && body.label !== 'water' && (!body.isSensor || body.label === 'fireball'),
      )
      // Kleine Zeitschritte verhindern ausgelassene Treffer beim schnellen Vorschnellen.
      for (let remaining = dt; remaining > 0;) {
        const step = Math.min(8, remaining)
        remaining -= step
        whip.elapsed += step
        this.traceWhip(whip, bodies)
      }
      this.drawWhip(whip)
      if (whip.elapsed >= EXTEND_MS + RETRACT_MS) {
        whip.view.destroy()
        this.whips.delete(whip)
      }
    }
  }

  private drawCharge(pose: WaterPose, charge: number): void {
    this.back.setVisible(true).clear()
    this.front.setVisible(true).clear()
    const radius = 22 + charge * 26
    const height = radius * Phaser.Math.Linear(0.55, 0.1, pose.prone)
    const span = Math.PI * (0.8 + charge * 1.6)
    const width = 2 + charge * 4
    let previous: Phaser.Math.Vector2 | undefined
    for (let i = 0; i <= 64; i++) {
      const angle = pose.phase + i / 64 * span
      const point = new Phaser.Math.Vector2(
        pose.center.x + Math.cos(angle) * radius,
        pose.center.y + Math.sin(angle) * height + Math.sin(angle * 3 + pose.phase) * 2 * (1 - pose.prone),
      )
      const g = Math.sin(angle) > 0 ? this.front : this.back
      if (previous) {
        g.lineStyle(width + 2, 0x195b8a, 0.65).lineBetween(previous.x, previous.y, point.x, point.y)
        g.lineStyle(width, charge >= 1 ? 0x8adfff : 0x4bb5f0, 0.85).lineBetween(previous.x, previous.y, point.x, point.y)
        g.lineStyle(1, 0xe7fbff, 0.85).lineBetween(previous.x, previous.y - 1, point.x, point.y - 1)
      }
      previous = point
    }
    // Begrenzte Anzahl kleiner Tropfen, die von außen in das Wasserband strömen.
    for (let i = 0; i < 10 + Math.floor(charge * 22); i++) {
      const t = (this.scene.time.now * 0.00065 + i * 0.618) % 1
      const angle = i * 2.4 + pose.phase * 0.4
      const r = radius + 24 * (1 - t)
      const x = pose.center.x + Math.cos(angle) * r
      const y = pose.center.y + Math.sin(angle) * r * Phaser.Math.Linear(0.5, 0.08, pose.prone)
      this.front.fillStyle(0xb9edff, t * 0.8).fillCircle(x, y, 1 + charge * 0.7)
    }
    this.front.fillStyle(0xdffaff, 0.8).fillCircle(pose.hand.x, pose.hand.y, 2)
    this.front.fillCircle(pose.support.x, pose.support.y, 2)
    this.label.setVisible(true).setPosition(pose.center.x, pose.center.y - height - 18)
      .setText(charge >= 1 ? 'MAX · EISFESSEL' : `WASSER ${Math.floor(charge * 100)}%`)
  }

  private traceWhip(whip: Whip, bodies: MatterJS.BodyType[]): void {
    const outward = Math.min(1, whip.elapsed / EXTEND_MS)
    const extension = whip.elapsed <= EXTEND_MS ? 1 - (1 - outward) ** 2
      : Math.max(0, 1 - (whip.elapsed - EXTEND_MS) / RETRACT_MS)
    const length = whip.range * extension
    const side = Math.sign(whip.direction.x) || 1
    const normal = new Phaser.Math.Vector2(whip.direction.y * side, -whip.direction.x * side)
    const bend = (12 + whip.charge * 22) * Math.sin(Math.PI * extension / 2)
    const count = Math.max(1, Math.ceil(length / 2))
    const points: Phaser.Math.Vector2[] = []
    for (let i = 0; i <= count; i++) {
      const t = i / count
      const offset = Math.sin(Math.PI * t) * (bend + Math.sin(t * Math.PI * 3 - whip.elapsed * 0.015) * 4 * whip.charge)
      const point = whip.origin.clone().add(whip.direction.clone().scale(length * t)).add(normal.clone().scale(offset))
      this.scene.matter.body.setPosition(whip.probe, point)
      const hits = (this.scene.matter.intersectBody(whip.probe, bodies) as MatterJS.BodyType[])
        .map((body) => body.parent)
      // Solide Hindernisse begrenzen sowohl die Zeichnung als auch den Schadensbereich.
      const wall = hits.find((body) => body.isStatic || body.label === 'rock')
      if (wall) {
        if (!whip.hitTargets.has(wall)) {
          whip.hitTargets.add(wall)
          burst(this.scene, point.x, point.y, COLORS, 8, 55)
        }
        break
      }
      points.push(point)
      for (const body of hits) {
        if (whip.hitTargets.has(body)) continue
        // Die Peitsche trifft Stoffe als Wassermasse (löscht Feuer, nässt Erde).
        if (this.system.whipContact(body, whip.charge >= 1 ? R.chargedWhipWaterKg : R.whipWaterKg, point)) { whip.hitTargets.add(body); continue }
        if (!damageEnemy(body, whip.damage, 'water')) continue
        impactRing(this.scene, body.position.x, body.position.y, 0x3fa7ff)
        applyWet(body, this.scene.time.now)
        whip.hitTargets.add(body)
        const push = metersPerSecondToMatter(3 + whip.charge * 3)
        this.scene.matter.body.setVelocity(body, {
          x: body.velocity.x + whip.direction.x * push,
          y: body.velocity.y + whip.direction.y * push,
        })
        if (whip.charge >= 1) freezeEnemy(body, COMBAT.waterFreezeMs)
        burst(this.scene, point.x, point.y, COLORS, 12, 85)
        screenShake(this.scene, 0.002 + whip.charge * 0.002, 80)
      }
    }
    whip.points = points
  }

  private drawWhip(whip: Whip): void {
    const g = whip.view.clear()
    const alpha = Math.min(1, (EXTEND_MS + RETRACT_MS - whip.elapsed) / 70)
    const points = whip.points
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i]
      const width = whip.width * (1 - i / points.length * 0.65)
      g.lineStyle(width + 2, 0x185b89, alpha * 0.6).lineBetween(a.x, a.y, b.x, b.y)
      g.lineStyle(width, whip.charge >= 1 ? 0x96e5ff : 0x4cb6ef, alpha).lineBetween(a.x, a.y, b.x, b.y)
      g.lineStyle(1, 0xeaffff, alpha * 0.85).lineBetween(a.x, a.y - 1, b.x, b.y - 1)
    }
    const tip = points.at(-1)
    if (tip) g.fillStyle(0xdffbff, alpha).fillCircle(tip.x, tip.y, 2 + whip.charge * 2)
  }
}
