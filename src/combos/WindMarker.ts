import Phaser from 'phaser'
import { HALF_ANGLE_RAD as GUST_HALF_ANGLE_RAD, RANGE_M as GUST_RANGE_M } from '../attacks/AirGustAttack.ts'
import { airBoostSpeedMs } from '../combat/wucht.ts'
import { metersToPixels } from '../config/physics.ts'
import type { ReactionSystem } from '../materials/ReactionSystem.ts'

const MARKER_COLOR = 0xcfe9f2
const CORNER_PX = 4
const PADDING_PX = 3
/** Pfeillänge je m/s erwarteter Austrittsgeschwindigkeit, gedeckelt. */
const ARROW_PX_PER_MS = 2.2
const ARROW_MAX_PX = 60
const ARROW_HEAD_PX = 4

/**
 * Anzeige im Luftmodus: Jeder Erdblock im Windstoßkegel zur Maus bekommt vier Eckklammern und einen Pfeil,
 * dessen Länge der erwarteten Austrittsgeschwindigkeit entspricht. Die Markierung zeigt nur, sie lenkt nichts.
 * Ein einziges Graphics-Objekt, das nur gezeichnet wird, solange Luft gewählt ist.
 */
export class WindMarker {
  private readonly system: ReactionSystem
  private readonly graphics: Phaser.GameObjects.Graphics

  constructor(scene: Phaser.Scene, system: ReactionSystem) {
    this.system = system
    this.graphics = scene.add.graphics().setDepth(7)
  }

  /** `direction` muss normalisiert sein (wie beim Windstoß). */
  update(active: boolean, origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): void {
    const g = this.graphics
    g.clear()
    if (!active) return
    const originX = origin.x ?? 0
    const originY = origin.y ?? 0
    const rangePx = metersToPixels(GUST_RANGE_M)
    const minCos = Math.cos(GUST_HALF_ANGLE_RAD)
    for (const rock of this.system.registry.ofKind('earth')) {
      const body = rock.body
      const dx = body.position.x - originX
      const dy = body.position.y - originY
      const distance = Math.hypot(dx, dy)
      if (distance === 0 || distance > rangePx || (dx * direction.x + dy * direction.y) / distance < minCos) continue
      this.drawBrackets(g, body)
      this.drawArrow(g, body, direction, airBoostSpeedMs(body.mass, 1 - distance / rangePx))
    }
  }

  destroy(): void {
    this.graphics.destroy()
  }

  private drawBrackets(g: Phaser.GameObjects.Graphics, body: MatterJS.BodyType): void {
    const left = Math.round(body.bounds.min.x) - PADDING_PX
    const right = Math.round(body.bounds.max.x) + PADDING_PX
    const top = Math.round(body.bounds.min.y) - PADDING_PX
    const bottom = Math.round(body.bounds.max.y) + PADDING_PX
    g.lineStyle(1, MARKER_COLOR, 0.9)
    for (const [x, sx] of [[left, 1], [right, -1]] as const) {
      for (const [y, sy] of [[top, 1], [bottom, -1]] as const) {
        g.lineBetween(x, y, x + sx * CORNER_PX, y).lineBetween(x, y, x, y + sy * CORNER_PX)
      }
    }
  }

  private drawArrow(g: Phaser.GameObjects.Graphics, body: MatterJS.BodyType, direction: Phaser.Math.Vector2, speedMs: number): void {
    const length = Math.min(ARROW_MAX_PX, speedMs * ARROW_PX_PER_MS)
    if (length < 4) return
    const half = (body.bounds.max.x - body.bounds.min.x) / 2
    const startX = body.position.x + direction.x * half
    const startY = body.position.y + direction.y * half
    const endX = startX + direction.x * length
    const endY = startY + direction.y * length
    g.lineStyle(1, MARKER_COLOR, 0.9).lineBetween(Math.round(startX), Math.round(startY), Math.round(endX), Math.round(endY))
    // Pfeilspitze: zwei kurze Striche schräg zurück.
    for (const side of [-1, 1]) {
      const angle = Math.atan2(direction.y, direction.x) + Math.PI + side * 0.5
      g.lineBetween(Math.round(endX), Math.round(endY),
        Math.round(endX + Math.cos(angle) * ARROW_HEAD_PX), Math.round(endY + Math.sin(angle) * ARROW_HEAD_PX))
    }
  }
}
