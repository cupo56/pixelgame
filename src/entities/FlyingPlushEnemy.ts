import Phaser from 'phaser'
import { Health } from '../combat/Health.ts'
import { registerEnemy, unregisterEnemy } from '../combat/damage.ts'
import { COLLISION_CATEGORY } from '../config/collision.ts'
import { COMBAT } from '../config/combat.ts'
import { PHYSICS_FPS } from '../config/physics.ts'
import { burst } from '../effects/particles.ts'

const RADIUS = 14
const OUTLINE = 0x51415e
const WING = 0x80628f
const MEMBRANE = 0xb190b9
const ICE_COLORS = [0xe5fcff, 0x9edfff, 0x60a8d6]

/** Flauschiger Testgegner: patrouilliert fliegend, reagiert aber physisch auf Treffer. */
export class FlyingPlushEnemy {
  readonly body: MatterJS.BodyType
  readonly health = new Health(COMBAT.enemyHealth)
  private readonly scene: Phaser.Scene
  private readonly graphics: Phaser.GameObjects.Graphics
  private readonly healthText: Phaser.GameObjects.Text
  private readonly home: { x: number; y: number }
  private readonly color: number
  private phase: number
  private flashUntil = 0
  private knockbackUntil = 0
  private frozenUntil = 0
  private freezeDuration = 1
  private removal?: Phaser.Time.TimerEvent
  private destroyed = false

  constructor(scene: Phaser.Scene, x: number, y: number, color: number, index: number) {
    this.scene = scene
    this.home = { x, y }
    this.color = color
    this.phase = index * 1.7
    this.body = scene.matter.add.circle(x, y, RADIUS, {
      label: 'plush-bat', mass: 8, ignoreGravity: true,
      frictionAir: 0.025, friction: 0.1, restitution: 0.35,
      collisionFilter: {
        category: COLLISION_CATEGORY.enemy,
        mask: COLLISION_CATEGORY.world | COLLISION_CATEGORY.player | COLLISION_CATEGORY.water |
          COLLISION_CATEGORY.ice | COLLISION_CATEGORY.sand | COLLISION_CATEGORY.metal,
        group: 0,
      },
    })
    scene.matter.body.setInertia(this.body, Infinity)
    this.graphics = scene.add.graphics().setDepth(12)
    this.healthText = scene.add.text(x, y - 46, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#f2e9df', align: 'center',
      backgroundColor: '#192733', padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 1).setDepth(13)
    registerEnemy(this.body, (amount) => this.takeDamage(amount), (duration) => this.freeze(duration), (duration) => {
      if (this.destroyed || !this.health.alive) return false
      this.knockbackUntil = Math.max(this.knockbackUntil, this.scene.time.now + duration)
      return true
    })
    scene.matter.world.on(Phaser.Physics.Matter.Events.BEFORE_UPDATE, this.fly, this)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
    this.render()
  }

  takeDamage(amount: number): boolean {
    if (!this.health.hurt(amount)) return false
    this.flashUntil = this.scene.time.now + 130
    this.knockbackUntil = this.scene.time.now + 220
    if (!this.health.alive) {
      if (this.isFrozen) burst(this.scene, this.body.position.x, this.body.position.y, ICE_COLORS, 14, 75)
      this.frozenUntil = 0
      unregisterEnemy(this.body)
      this.body.collisionFilter.mask = 0
      this.graphics.setVisible(false)
      this.healthText.setVisible(false)
      burst(this.scene, this.body.position.x, this.body.position.y, [this.color, 0xf3e6dd, MEMBRANE], 14, 65)
      // Erst nach der Kollisionsverarbeitung aus der Physikwelt nehmen.
      this.removal = this.scene.time.delayedCall(0, () => this.destroy())
    }
    return true
  }

  get isFrozen(): boolean { return this.scene.time.now < this.frozenUntil }

  freeze(durationMs: number): boolean {
    if (this.destroyed || !this.health.alive || !Number.isFinite(durationMs) || durationMs <= 0) return false
    this.frozenUntil = Math.max(this.frozenUntil, this.scene.time.now + durationMs)
    this.freezeDuration = this.frozenUntil - this.scene.time.now
    burst(this.scene, this.body.position.x, this.body.position.y, ICE_COLORS, 12, 45)
    return true
  }

  render(): void {
    if (this.destroyed || !this.health.alive) return
    const { x, y } = this.body.position
    const g = this.graphics
    g.setPosition(Math.round(x), Math.round(y)).clear()
    const frozen = this.isFrozen
    const flap = frozen ? -0.35 : Math.sin(this.scene.time.now * 0.014 + this.phase)
    for (const side of [-1, 1]) {
      const spread = 0.82 + flap * 0.16
      const points = [
        { x: 9, y: -4 }, { x: 20 * spread, y: -10 + flap * 5 },
        { x: 38 * spread, y: -19 + flap * 15 }, { x: 33 * spread, y: 4 + flap * 8 },
        { x: 27 * spread, y: 0 + flap * 5 }, { x: 22 * spread, y: 12 + flap * 5 },
        { x: 17 * spread, y: 6 }, { x: 9, y: 8 },
      ].map((point) => new Phaser.Math.Vector2(point.x * side, point.y))
      g.fillStyle(WING).fillPoints(points, true)
      g.lineStyle(1, OUTLINE).strokePoints(points, true)
      g.lineStyle(1, MEMBRANE).lineBetween(side * 10, -2, points[2].x, points[2].y)
      g.lineBetween(side * 10, 1, points[3].x, points[3].y)
      g.lineBetween(side * 10, 3, points[5].x, points[5].y)
    }
    const fur = this.scene.time.now < this.flashUntil ? 0xfff8ef : frozen ? 0xc5eaf2 : this.color
    // Kleine Wollbögen bilden die weiche Silhouette rund um den Körper.
    g.fillStyle(OUTLINE).fillCircle(0, 0, RADIUS + 1)
    for (let i = 0; i < 11; i++) {
      const angle = i / 11 * Math.PI * 2
      const px = Math.cos(angle) * 11, py = Math.sin(angle) * 11
      g.fillStyle(OUTLINE).fillCircle(px, py, 4.5)
      g.fillStyle(fur).fillCircle(px, py, 3.5)
    }
    g.fillStyle(fur).fillCircle(0, 0, 13)
    g.fillStyle(0xf0e2da, 0.55).fillEllipse(0, 5, 17, 12)
    g.fillStyle(0xf7eee4, 0.7).fillCircle(-5, -8, 3)
    // Knopfaugen und eine kurze Naht machen den Plüschcharakter lesbar.
    for (const eyeX of [-5, 5]) {
      g.fillStyle(0x302839).fillCircle(eyeX, -2, 2.8)
      g.lineStyle(1, 0xece0d4).lineBetween(eyeX - 1, -3, eyeX + 1, -1)
      g.lineBetween(eyeX + 1, -3, eyeX - 1, -1)
    }
    g.fillStyle(0xe594a0, 0.65).fillEllipse(-9, 3, 4, 2).fillEllipse(9, 3, 4, 2)
    g.lineStyle(1, OUTLINE).lineBetween(-3, 4, 0, 6).lineBetween(0, 6, 3, 4)
    g.lineStyle(1, 0x93758d).lineBetween(-5, 10, 5, 10)
    for (const stitch of [-3, 0, 3]) g.lineBetween(stitch, 8, stitch + 1, 12)
    if (frozen) {
      const ice = [[-19, -14], [-8, -24], [16, -20], [24, 1], [13, 22], [-14, 21], [-24, 3]]
        .map(([px, py]) => new Phaser.Math.Vector2(px, py))
      g.fillStyle(0x92d5ef, 0.3).fillPoints(ice, true)
      g.lineStyle(2, 0xd8f9ff, 0.9).strokePoints(ice, true)
      g.lineStyle(1, 0xf0ffff, 0.75).lineBetween(-8, -21, -3, -11).lineBetween(-3, -11, -10, -4)
      g.lineBetween(18, 5, 7, 11).lineBetween(7, 11, 13, 19)
      g.lineBetween(-21, 4, -14, 7)
      g.fillStyle(0x9de6ff).fillRect(-17, -30, 34 * (this.frozenUntil - this.scene.time.now) / this.freezeDuration, 2)
    }
    g.fillStyle(0x14222c).fillRect(-18, -39, 36, 5)
    g.fillStyle(0xdca2ad).fillRect(-17, -38, 34 * this.health.current / this.health.max, 3)
    this.healthText.setPosition(Math.round(x), Math.round(y - 43)).setText(`${this.health.current} / ${this.health.max}${frozen ? '\nEIS' : ''}`)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.frozenUntil = 0
    this.removal?.remove()
    unregisterEnemy(this.body)
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.BEFORE_UPDATE, this.fly, this)
    this.scene.matter.world?.remove(this.body)
    this.graphics.destroy()
    this.healthText.destroy()
  }

  private fly(): void {
    if (!this.health.alive || this.destroyed) return
    if (this.isFrozen) {
      // Flugsteuerung pausiert; neue Treffer dürfen den dynamischen Körper weiterhin stoßen.
      if (this.scene.time.now >= this.knockbackUntil) this.scene.matter.body.setVelocity(this.body, {
        x: this.body.velocity.x * 0.82, y: this.body.velocity.y * 0.82,
      })
      return
    }
    if (this.frozenUntil > 0) {
      this.frozenUntil = 0
      burst(this.scene, this.body.position.x, this.body.position.y, ICE_COLORS, 10, 40)
    }
    this.phase += 1 / PHYSICS_FPS
    if (this.scene.time.now < this.knockbackUntil) return
    const targetX = this.home.x + Math.sin(this.phase * 1.15) * 65
    const targetY = this.home.y + Math.sin(this.phase * 1.8) * 16
    const vx = Phaser.Math.Clamp((targetX - this.body.position.x) * 2.8, -85, 85) / PHYSICS_FPS
    const vy = Phaser.Math.Clamp((targetY - this.body.position.y) * 3.2, -65, 65) / PHYSICS_FPS
    this.scene.matter.body.setVelocity(this.body, {
      x: Phaser.Math.Linear(this.body.velocity.x, vx, 0.12),
      y: Phaser.Math.Linear(this.body.velocity.y, vy, 0.12),
    })
  }
}
