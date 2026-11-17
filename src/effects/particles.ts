import type Phaser from 'phaser'
import { GRAVITY_MS2, PIXELS_PER_METER } from '../config/physics.ts'

export const SPARK_TEXTURE = 'spark'
const SPARK_SIZE_PX = 3
const BURST_LIFESPAN_MS = { min: 300, max: 700 }
const BURST_CLEANUP_MS = 900

/** Kleines weißes Quadrat als Partikelbild (passt zum Pixel-Look). */
export const createSparkTexture = (scene: Phaser.Scene): void => {
  if (scene.textures.exists(SPARK_TEXTURE)) {
    return
  }
  const graphics = scene.make.graphics({}, false)
  graphics.fillStyle(0xffffff, 1)
  graphics.fillRect(0, 0, SPARK_SIZE_PX, SPARK_SIZE_PX)
  graphics.generateTexture(SPARK_TEXTURE, SPARK_SIZE_PX, SPARK_SIZE_PX)
  graphics.destroy()
}

const RAD_TO_DEG = 180 / Math.PI

/** Streifen in einem Kegel um die Zielrichtung (Wind). Winkel in Radiant. */
export const coneBurst = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  aimRad: number,
  halfAngleRad: number,
  colors: number[],
  count: number,
  maxSpeedPx: number,
): void => {
  const aimDeg = aimRad * RAD_TO_DEG
  const halfDeg = halfAngleRad * RAD_TO_DEG
  const emitter = scene.add.particles(x, y, SPARK_TEXTURE, {
    lifespan: { min: 200, max: 450 },
    angle: { min: aimDeg - halfDeg, max: aimDeg + halfDeg },
    speed: { min: maxSpeedPx * 0.4, max: maxSpeedPx },
    scale: { start: 1.6, end: 0.3 },
    alpha: { start: 0.9, end: 0 },
    color: colors,
    emitting: false,
  })
  emitter.setDepth(20)
  emitter.explode(count)
  scene.time.delayedCall(BURST_CLEANUP_MS, () => emitter.destroy())
}

export const DUST_COLORS = [0xd9c3a0, 0xb08a5a, 0x6b5a45]

/** Aufgewirbelter Erdstaub: fliegt nach oben weg und fällt mit Erdbeschleunigung. */
export const dust = (scene: Phaser.Scene, x: number, y: number, count: number, maxSpeedPx: number): void => {
  const emitter = scene.add.particles(x, y, SPARK_TEXTURE, {
    lifespan: { min: 250, max: 600 },
    angle: { min: 195, max: 345 },
    speed: { min: maxSpeedPx * 0.3, max: maxSpeedPx },
    gravityY: GRAVITY_MS2 * PIXELS_PER_METER,
    scale: { start: 1.1, end: 0.2 },
    alpha: { start: 0.8, end: 0 },
    color: DUST_COLORS,
    emitting: false,
  }).setDepth(6)
  emitter.explode(count)
  scene.time.delayedCall(BURST_CLEANUP_MS, () => emitter.destroy())
}

export const STEAM_COLORS = [0xffffff, 0xdfe7ec, 0xa9b6bf]

/** Dampf: helle, nicht additive Wolke, die aufsteigt und sich ausdehnt. */
export const steam = (scene: Phaser.Scene, x: number, y: number, count: number): void => {
  const emitter = scene.add.particles(x, y, SPARK_TEXTURE, {
    lifespan: { min: 700, max: 1200 },
    angle: { min: 240, max: 300 },
    speed: { min: 15, max: 45 },
    gravityY: -40,
    scale: { start: 1, end: 2.2 },
    alpha: { start: 0.7, end: 0 },
    color: STEAM_COLORS,
    emitting: false,
  }).setDepth(18)
  emitter.explode(count)
  scene.time.delayedCall(1300, () => emitter.destroy())
}

/** Einmalige Funken-/Staubexplosion; Partikel fallen mit echter Erdbeschleunigung. */
export const burst = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  colors: number[],
  count: number,
  maxSpeedPx: number,
): void => {
  const emitter = scene.add.particles(x, y, SPARK_TEXTURE, {
    lifespan: BURST_LIFESPAN_MS,
    speed: { min: maxSpeedPx * 0.3, max: maxSpeedPx },
    scale: { start: 1.5, end: 0 },
    color: colors,
    blendMode: 'ADD',
    gravityY: GRAVITY_MS2 * PIXELS_PER_METER,
    emitting: false,
  })
  emitter.setDepth(20)
  emitter.explode(count)
  scene.time.delayedCall(BURST_CLEANUP_MS, () => emitter.destroy())
}
