import Phaser from 'phaser'
import { GROUND_AIM } from '../config/wall.ts'
import { metersToPixels } from '../config/physics.ts'
import { wallPlacementX } from './wallRules.ts'

export interface GroundSpot {
  x: number
  groundY: number
  terrain: MatterJS.BodyType
}

/**
 * Boden unter der Maus für Erd-Angriffe (Mauer und Erdblock): waagerecht auf die Reichweite begrenzt,
 * mindestens `minDistancePx` vom Spieler entfernt, Boden höchstens 5 m über oder unter den Füßen.
 * Liegt die Maus in der Luft, gilt der nächste tragende Boden darunter. `widthPx` muss auf die Fläche passen.
 */
export const findGroundSpot = (
  scene: Phaser.Scene, playerBody: MatterJS.BodyType, target: Phaser.Math.Vector2, widthPx: number, minDistancePx: number,
): GroundSpot | undefined => {
  const vertices = playerBody.vertices
  if (!vertices?.length) return undefined
  const footY = Math.max(...vertices.map((v) => v.y))
  const reachPx = metersToPixels(GROUND_AIM.reachM)
  const facing = Math.sign(target.x - playerBody.position.x) || 1
  const clampedX = Phaser.Math.Clamp(target.x, playerBody.position.x - reachPx, playerBody.position.x + reachPx)
  const x = wallPlacementX(clampedX, playerBody.position.x, minDistancePx, reachPx, facing)
  let best: GroundSpot | undefined
  let bestScore = Infinity
  for (const body of scene.matter.world.getAllBodies()) {
    if (!body.isStatic || body.isSensor || body.label !== 'terrain') continue
    const { min, max } = body.bounds
    if (x - widthPx / 2 < min.x + 1 || x + widthPx / 2 > max.x - 1) continue
    if (Math.abs(min.y - footY) > metersToPixels(GROUND_AIM.verticalReachM)) continue
    // Der Boden, der der Maus senkrecht am nächsten liegt (Maus in der Luft: Boden darunter bevorzugt).
    const score = Math.abs(min.y - target.y) + (min.y < target.y - metersToPixels(1) ? 40 : 0)
    if (score < bestScore) { best = { x, groundY: min.y, terrain: body }; bestScore = score }
  }
  return best
}
