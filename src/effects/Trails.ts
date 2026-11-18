import Phaser from 'phaser'
import { GRAVITY_MS2, PIXELS_PER_METER } from '../config/physics.ts'
import { EMBER_COLORS, SMOKE_COLORS, SPARK_TEXTURE, createSparkTexture } from './particles.ts'
import { pruneTrail, type TrailPoint } from './trailMath.ts'

export interface TrailStyle {
  color: number
  /** Breite am Kopf in Pixeln; zum Ende hin dünner. */
  widthPx: number
  /** Wie lange ein Schleppenpunkt sichtbar bleibt. */
  lifeMs: number
}

interface Track extends TrailStyle {
  body: MatterJS.BodyType
  points: TrailPoint[]
  /** Bis wann neue Punkte aufgenommen werden. */
  until: number
}

const FROST_COLORS = [0xffffff, 0xe5fcff, 0x9edfff]
const instances = new WeakMap<Phaser.Scene, Trails>()

/**
 * Bewegungsschleppen und Dauerpartikel für Kombos (Meteor, Salve, Hagel). Eine Instanz je Szene mit
 * einer gemeinsamen Grafik und festen Emittern, damit im Flug keine Objekte je Frame entstehen.
 */
export class Trails {
  private readonly scene: Phaser.Scene
  private readonly graphics: Phaser.GameObjects.Graphics
  private readonly tracks = new Map<MatterJS.BodyType, Track>()
  private readonly embers: Phaser.GameObjects.Particles.ParticleEmitter
  private readonly smoke: Phaser.GameObjects.Particles.ParticleEmitter
  private readonly frost: Phaser.GameObjects.Particles.ParticleEmitter

  static of(scene: Phaser.Scene): Trails {
    let trails = instances.get(scene)
    if (!trails) {
      trails = new Trails(scene)
      instances.set(scene, trails)
    }
    return trails
  }

  private constructor(scene: Phaser.Scene) {
    this.scene = scene
    createSparkTexture(scene)
    this.graphics = scene.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD)
    this.embers = scene.add.particles(0, 0, SPARK_TEXTURE, {
      lifespan: { min: 220, max: 520 }, speed: { min: 10, max: 45 },
      scale: { start: 1.2, end: 0 }, color: EMBER_COLORS, blendMode: 'ADD',
      gravityY: GRAVITY_MS2 * PIXELS_PER_METER * 0.25, emitting: false,
    }).setDepth(9)
    this.smoke = scene.add.particles(0, 0, SPARK_TEXTURE, {
      lifespan: { min: 450, max: 900 }, speed: { min: 4, max: 16 }, angle: { min: 240, max: 300 },
      scale: { start: 1.4, end: 3 }, alpha: { start: 0.55, end: 0 }, color: SMOKE_COLORS,
      gravityY: -18, emitting: false,
    }).setDepth(4)
    this.frost = scene.add.particles(0, 0, SPARK_TEXTURE, {
      lifespan: { min: 120, max: 260 }, speed: { min: 15, max: 60 },
      scale: { start: 1.3, end: 0 }, color: FROST_COLORS, blendMode: 'ADD', emitting: false,
    }).setDepth(20)
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.draw, this)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
  }

  /** Nimmt `durationMs` lang Schleppenpunkte des Körpers auf; erneuter Aufruf verlängert. */
  follow(body: MatterJS.BodyType, style: TrailStyle, durationMs: number): void {
    const until = this.scene.time.now + durationMs
    const track = this.tracks.get(body)
    if (track) {
      track.until = Math.max(track.until, until)
      track.color = style.color; track.widthPx = style.widthPx; track.lifeMs = style.lifeMs
      return
    }
    this.tracks.set(body, { ...style, body, points: [], until })
  }

  emitEmbers(x: number, y: number, count: number): void { this.embers.emitParticleAt(x, y, count) }
  emitSmoke(x: number, y: number, count: number): void { this.smoke.emitParticleAt(x, y, count) }
  emitFrost(x: number, y: number, count: number): void { this.frost.emitParticleAt(x, y, count) }

  private draw(): void {
    const now = this.scene.time.now
    const g = this.graphics.clear()
    for (const [body, track] of this.tracks) {
      if (now < track.until) track.points.push({ x: body.position.x, y: body.position.y, at: now })
      track.points = pruneTrail(track.points, now, track.lifeMs)
      if (track.points.length === 0 && now >= track.until) {
        this.tracks.delete(body)
        continue
      }
      const points = track.points
      // Zwei Durchgänge: breiter, blasser Schein und schmaler, heller Kern; zum Ende hin dünner.
      for (const [scale, opacity] of [[1.8, 0.22], [1, 0.8]] as const) {
        for (let i = 1; i < points.length; i++) {
          const t = 0.35 + 0.65 * (i / (points.length - 1 || 1))
          const fade = Math.max(0, 1 - (now - points[i].at) / track.lifeMs)
          g.lineStyle(Math.max(1, track.widthPx * t * scale), track.color, fade * opacity)
            .lineBetween(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y)
        }
      }
    }
  }

  private destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.draw, this)
    instances.delete(this.scene)
    this.tracks.clear()
    this.graphics.destroy()
    this.embers.destroy(); this.smoke.destroy(); this.frost.destroy()
  }
}
