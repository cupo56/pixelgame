import type Phaser from 'phaser'
import { metersPerSecondToMatter, metersToPixels } from '../config/physics.ts'

interface Point {
  x: number
  y: number
}

/** Druckwelle: Impuls (N·s) nimmt linear mit der Entfernung ab, Δv = Impuls / Masse. */
export const applyBlast = (
  scene: Phaser.Scene,
  center: Point,
  radiusM: number,
  impulseNs: number,
): void => {
  const radiusPx = metersToPixels(radiusM)
  for (const body of scene.matter.world.getAllBodies()) {
    if (body.isStatic || body.label === 'player') {
      continue
    }
    const dx = body.position.x - center.x
    const dy = body.position.y - center.y
    const distance = Math.hypot(dx, dy)
    if (distance > radiusPx) {
      continue
    }
    const falloff = 1 - distance / radiusPx
    const dirX = distance > 0 ? dx / distance : 0
    const dirY = distance > 0 ? dy / distance : -1
    const deltaV = metersPerSecondToMatter((impulseNs * falloff) / body.mass)
    scene.matter.body.setVelocity(body, {
      x: body.velocity.x + dirX * deltaV,
      y: body.velocity.y + dirY * deltaV,
    })
  }
}
