import Phaser from 'phaser'
import { COMBAT } from '../config/combat.ts'
import { COLLISION_CATEGORY, ENEMY_SHOT_MASK } from '../config/collision.ts'
import { metersPerSecondToMatter, metersToPixels } from '../config/physics.ts'
import { nextShotDelayMs } from '../earth/wallRules.ts'
import { burst } from '../effects/particles.ts'
import { screenShake } from '../effects/juice.ts'
import type { FlyingPlushEnemy } from '../entities/FlyingPlushEnemy.ts'
import type { Player } from '../entities/Player.ts'
import { shotTarget } from './shotTargets.ts'

const RADIUS_PX = 5
const SHOT_COLOR = 0xe594a0
const SHOT_OUTLINE = 0x51415e
const SHOT_MASS = 0.4

interface Shot {
  readonly body: MatterJS.BodyType
  readonly view: Phaser.GameObjects.Arc
  readonly expiresAt: number
}

/** Gegner schießen Plüschbälle auf den Spieler. Mauer und Gelände fangen sie ab, der Spieler nimmt Schaden. */
export class EnemyShots {
  private readonly scene: Phaser.Scene
  private readonly player: Player
  private readonly enemies: () => readonly FlyingPlushEnemy[]
  private readonly shots = new Map<MatterJS.BodyType, Shot>()
  private readonly nextAt = new WeakMap<FlyingPlushEnemy, number>()

  constructor(scene: Phaser.Scene, player: Player, enemies: () => readonly FlyingPlushEnemy[]) {
    this.scene = scene
    this.player = player
    this.enemies = enemies
    scene.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
  }

  /** Je Frame: Schusszeitgeber der Gegner, Lebensdauer und Anzeige der Geschosse. */
  update(): void {
    const now = this.scene.time.now
    for (const enemy of this.enemies()) {
      if (!enemy.health.alive || enemy.isFrozen) continue
      const due = this.nextAt.get(enemy)
      if (due === undefined) {
        this.nextAt.set(enemy, now + nextShotDelayMs(Math.random(), COMBAT.shotIntervalMinMs, COMBAT.shotIntervalMaxMs))
        continue
      }
      if (now < due) continue
      this.nextAt.set(enemy, now + nextShotDelayMs(Math.random(), COMBAT.shotIntervalMinMs, COMBAT.shotIntervalMaxMs))
      this.fireAt(enemy.body.position, this.player.body.position)
    }
    for (const shot of [...this.shots.values()]) {
      if (now >= shot.expiresAt) this.remove(shot, false)
      else shot.view.setPosition(shot.body.position.x, shot.body.position.y)
    }
  }

  /** Schuss in gerader Linie; zu weit entfernte Ziele werden ignoriert. Öffentlich für Browserprüfungen. */
  fireAt(from: { x: number; y: number }, to: { x: number; y: number }): boolean {
    const dx = to.x - from.x, dy = to.y - from.y
    const distance = Math.hypot(dx, dy)
    if (distance < 1 || distance > metersToPixels(COMBAT.shotRangeM)) return false
    const body = this.scene.matter.add.circle(from.x, from.y, RADIUS_PX, {
      label: 'enemy-shot', mass: SHOT_MASS, ignoreGravity: true, frictionAir: 0, friction: 0, restitution: 0,
      collisionFilter: { category: COLLISION_CATEGORY.enemyShot, mask: ENEMY_SHOT_MASK, group: 0 },
    })
    const speed = metersPerSecondToMatter(COMBAT.shotSpeedMs)
    this.scene.matter.body.setVelocity(body, { x: dx / distance * speed, y: dy / distance * speed })
    const view = this.scene.add.circle(from.x, from.y, RADIUS_PX, SHOT_COLOR).setStrokeStyle(1, SHOT_OUTLINE).setDepth(11)
    this.shots.set(body, { body, view, expiresAt: this.scene.time.now + COMBAT.shotLifetimeMs })
    return true
  }

  get count(): number { return this.shots.size }

  private onCollision(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    for (const pair of event.pairs) {
      for (const [mine, other] of [[pair.bodyA.parent, pair.bodyB.parent], [pair.bodyB.parent, pair.bodyA.parent]] as const) {
        const shot = this.shots.get(mine)
        if (!shot) continue
        if (other === this.player.body) {
          if (this.player.takeDamage(COMBAT.shotDamage)) screenShake(this.scene, 0.002, 70)
        } else {
          shotTarget(other)?.(COMBAT.shotDamage)
        }
        this.remove(shot, true)
      }
    }
  }

  private remove(shot: Shot, hit: boolean): void {
    if (!this.shots.delete(shot.body)) return
    if (hit) burst(this.scene, shot.body.position.x, shot.body.position.y, [SHOT_COLOR, 0xf3e6dd], 6, 40)
    // Erst nach der Kollisionsverarbeitung aus der Physikwelt nehmen.
    this.scene.time.delayedCall(0, () => this.scene.matter.world?.remove(shot.body))
    shot.view.destroy()
  }

  destroy(): void {
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.COLLISION_START, this.onCollision, this)
    for (const shot of [...this.shots.values()]) {
      this.scene.matter.world?.remove(shot.body)
      shot.view.destroy()
    }
    this.shots.clear()
  }
}
