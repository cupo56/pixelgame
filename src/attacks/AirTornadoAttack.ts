import Phaser from 'phaser'
import { COMBAT } from '../config/combat.ts'
import { COMBOS } from '../config/combos.ts'
import { chillEnemy } from '../combat/status.ts'
import { FireVortex } from '../combos/FireVortex.ts'
import { GRAVITY_MS2, PHYSICS_FPS, metersPerSecondToMatter, metersToPixels } from '../config/physics.ts'
import { damageEnemy, holdEnemyInWind, isEnemy } from '../combat/damage.ts'
import { EMBER_COLORS, burst, coneBurst } from '../effects/particles.ts'
import { Trails } from '../effects/Trails.ts'
import { mix } from '../materials/MetalMaterial.ts'
import { screenShake } from '../effects/juice.ts'
import { impactRing, shockwaveRing } from '../effects/impact.ts'
import type { ReactionSystem } from '../materials/ReactionSystem.ts'

const CHARGE_MS = 2000
const MAX_STEP = metersToPixels(0.6)
const COLORS = [0xf1ffff, 0xcfe9f2, 0x8fc4d6]
const DT = 1 / PHYSICS_FPS
/** Feuerwirbel: Luftfarben werden zu diesen Glutfarben (hell bis dunkel, wie COLORS). */
const FIRE_COLORS = [0xffe9a0, 0xff9a1f, 0xd6360b]
const VOLLEY_TRAIL = { color: 0xe9ffff, widthPx: 4, lifeMs: 260 }

export interface AirPose {
  center: Phaser.Math.Vector2
  front: Phaser.Math.Vector2
  support: Phaser.Math.Vector2
  phase: number
  prone: number
}

interface Ground { x: number; y: number; body: MatterJS.BodyType }
interface Charge { elapsed: number; progress: number; nextShake: number }
interface Orbit { angle: number; extent: number; rock: boolean; elapsed: number }
interface Tornado {
  x: number
  y: number
  direction: number
  charge: number
  elapsed: number
  duration: number
  height: number
  radius: number
  speed: number
  phase: number
  back: Phaser.GameObjects.Graphics
  front: Phaser.GameObjects.Graphics
  captured: Map<MatterJS.BodyType, Orbit>
  seen: Set<MatterJS.BodyType>
}

/** Bodenwirbel: Umlaufbahnen steuern Geschwindigkeiten, nie die Körperpositionen. */
export class AirTornadoAttack {
  readonly cooldownMs = 1000
  private readonly scene: Phaser.Scene
  private readonly player: MatterJS.BodyType
  private readonly getPose: () => AirPose
  private readonly system: ReactionSystem
  private readonly back: Phaser.GameObjects.Graphics
  private readonly front: Phaser.GameObjects.Graphics
  private readonly label: Phaser.GameObjects.Text
  private readonly aim = new Phaser.Math.Vector2(1, 0)
  private readonly probe: MatterJS.BodyType
  private charging?: Charge
  private readonly tornadoes = new Set<Tornado>()
  private readonly fireVortex: FireVortex

  constructor(scene: Phaser.Scene, player: MatterJS.BodyType, getPose: () => AirPose, system: ReactionSystem) {
    this.scene = scene
    this.player = player
    this.getPose = getPose
    this.system = system
    this.fireVortex = new FireVortex(scene, system)
    this.back = scene.add.graphics().setDepth(8).setVisible(false)
    this.front = scene.add.graphics().setDepth(14).setVisible(false)
    this.label = scene.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#e0f7ff',
      backgroundColor: '#16303a', padding: { x: 3, y: 2 },
    }).setOrigin(0.5, 1).setDepth(16).setVisible(false)
    // Wiederverwendete Abfrageform, kein zusätzlicher Kollisionskörper in der Welt.
    this.probe = scene.matter.bodies.rectangle(0, 0, 1, 1)
    scene.matter.world.on(Phaser.Physics.Matter.Events.BEFORE_UPDATE, this.step, this)
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.update, this)
  }

  get isCharging(): boolean { return this.charging !== undefined }
  get chargeProgress(): number | undefined { return this.charging?.progress }

  updateAim(_origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): void {
    if (direction.lengthSq() > 0) this.aim.copy(direction).normalize()
  }

  beginCharge(): boolean {
    if (this.charging || this.tornadoes.size >= 2) return false
    this.charging = { elapsed: 0, progress: 0, nextShake: 0 }
    return true
  }

  release(origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): boolean {
    if (!this.charging) return false
    this.updateAim(origin, direction)
    const charge = this.charging.progress
    const terrain = this.terrain()
    const source = this.findSource(charge, terrain)
    this.cancelCharge()
    if (!source) return false
    const side = Math.abs(this.aim.x) > 0.03 ? Math.sign(this.aim.x) : Math.sign((origin.x ?? 0) - this.player.position.x) || 1
    const tornado: Tornado = {
      x: source.x, y: source.y, direction: side, charge, elapsed: 0,
      duration: 1600 + charge * 1600, height: 88 + charge * 72, radius: 26 + charge * 22,
      speed: metersToPixels(2.5 + charge), phase: 0,
      back: this.scene.add.graphics().setDepth(7), front: this.scene.add.graphics().setDepth(14),
      captured: new Map(), seen: new Set(),
    }
    this.tornadoes.add(tornado)
    burst(this.scene, source.x, source.y - 3, [0xd8c6a8, ...COLORS], 24, 80)
    screenShake(this.scene, 0.003 + charge * 0.004, 180)
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
    for (const tornado of [...this.tornadoes]) this.finish(tornado, false)
  }

  /**
   * Salve (Steinhagel): Hat ein Wirbel Blöcke gefangen, werden sie zur Maus geschleudert. Jeder Block erhält
   * den vollen Windschub aus `ReactionSystem.applyWind` (massenabhängig, mit Wucht-Schaden); der Wirbel endet.
   * @returns true, wenn mindestens ein Block gefangen war; sonst wirkt der Klick als normaler Windstoß.
   */
  volley(direction: Phaser.Math.Vector2): boolean {
    const tornado = [...this.tornadoes].find((candidate) => [...candidate.captured.values()].some((orbit) => orbit.rock))
    if (!tornado) return false
    let fired = 0
    const trails = Trails.of(this.scene)
    for (const [body, orbit] of [...tornado.captured]) {
      this.releaseBody(tornado, body, orbit, false)
      if (!orbit.rock || fired >= COMBOS.volleyMaxBodies) continue
      // Die Umlaufbewegung wird verworfen, damit der Block genau zur Maus fliegt.
      this.scene.matter.body.setVelocity(body, { x: 0, y: 0 })
      if (this.system.applyWind(body, direction, 1, 'gust')) {
        fired++
        trails.follow(body, { ...VOLLEY_TRAIL, widthPx: Math.max(3, this.extent(body) * 0.7) }, 450)
      }
    }
    // Der Wirbel entlädt sich: Druckring am Kern und Luftstreifen in Schussrichtung.
    const coreY = tornado.y - tornado.height * 0.53
    shockwaveRing(this.scene, tornado.x, coreY, tornado.radius * 0.5, tornado.radius * 1.8, 260, this.fireVortex.intensity(tornado) > 0 ? FIRE_COLORS[1] : COLORS[0])
    coneBurst(this.scene, tornado.x, coreY, Math.atan2(direction.y, direction.x), 0.3, COLORS, 26, 320)
    // Ein Feuerball im Wirbel fliegt mit Rest-Q als normaler Feuerball in Schussrichtung weiter.
    this.fireVortex.release(tornado, direction)
    burst(this.scene, tornado.x, tornado.y - tornado.height * 0.4, COLORS, 18, 95)
    this.finish(tornado, false)
    return true
  }

  destroy(): void {
    this.scene.matter.world?.off(Phaser.Physics.Matter.Events.BEFORE_UPDATE, this.step, this)
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.update, this)
    this.cancel()
    this.back.destroy(); this.front.destroy(); this.label.destroy()
  }

  private terrain(): MatterJS.BodyType[] {
    return this.scene.matter.world.getAllBodies().filter(body => body.isStatic && !body.isSensor)
  }

  private groundAt(x: number, y: number, drop: number, terrain: MatterJS.BodyType[]): Ground | undefined {
    const ground = terrain.filter(body => body.label === 'terrain' && Math.abs(body.angle) < 0.001 &&
      body.bounds.min.x <= x && body.bounds.max.x >= x && body.bounds.min.y >= y - MAX_STEP && body.bounds.min.y <= y + drop)
      .sort((a, b) => Math.abs(a.bounds.min.y - y) - Math.abs(b.bounds.min.y - y))[0]
    return ground ? { x, y: ground.bounds.min.y, body: ground } : undefined
  }

  private clearColumn(ground: Ground, height: number, radius: number, terrain: MatterJS.BodyType[]): boolean {
    // Die breite Windflanke darf zusammenhängende Treppen umströmen. Die Basis
    // prüft jede Stufe separat; hohe Wände, Decken und Lücken bleiben Hindernisse.
    const supports = new Set([ground.body])
    for (const side of [-1, 1]) {
      let previous = ground
      for (let distance = 4; distance < radius + 4; distance += 4) {
        const next = this.groundAt(ground.x + side * Math.min(radius, distance), previous.y, MAX_STEP, terrain)
        if (!next) break
        supports.add(next.body)
        previous = next
      }
    }
    const h = height - 2, w = radius * 2
    const old = this.probe.bounds
    this.scene.matter.body.scale(this.probe, w / (old.max.x - old.min.x), h / (old.max.y - old.min.y))
    this.scene.matter.body.setPosition(this.probe, { x: ground.x, y: ground.y - h / 2 - 1 })
    return !this.scene.matter.overlap(this.probe, terrain.filter(body => !supports.has(body)))
  }

  private findSource(charge: number, terrain: MatterJS.BodyType[]): Ground | undefined {
    const vertices = this.player.vertices
    if (!vertices?.length) return undefined
    const footY = Math.max(...vertices.map(v => v.y))
    const halfWidth = (Math.max(...vertices.map(v => v.x)) - Math.min(...vertices.map(v => v.x))) / 2
    const side = Math.abs(this.aim.x) > 0.03 ? Math.sign(this.aim.x) : Math.sign(this.getPose().center.x - this.player.position.x) || 1
    for (const x of [this.player.position.x + side * (halfWidth + 24), this.player.position.x]) {
      const ground = this.groundAt(x, footY, metersToPixels(4), terrain)
      if (ground && this.clearColumn(ground, 88 + charge * 72, 26 + charge * 22, terrain)) return ground
    }
    return undefined
  }

  private step(): void {
    if (!this.tornadoes.size) return
    const bodies = this.scene.matter.world.getAllBodies()
    const present = new Set(bodies)
    const terrain = bodies.filter(body => body.isStatic && !body.isSensor)
    for (const tornado of [...this.tornadoes]) {
      tornado.elapsed += DT * 1000
      tornado.phase += DT * 13
      const growth = Phaser.Math.SmoothStep(tornado.elapsed, 0, 240)
      const nextX = tornado.x + tornado.direction * tornado.speed * DT * growth
      const ground = this.groundAt(nextX, tornado.y, MAX_STEP, terrain)
      if (!ground || !this.clearColumn(ground, tornado.height, tornado.radius, terrain) || tornado.elapsed >= tornado.duration) {
        this.finish(tornado, true)
        continue
      }
      tornado.x = ground.x; tornado.y = ground.y
      const centerY = tornado.y - tornado.height * 0.53
      if (growth > 0.8) for (const body of bodies) {
        if (body === this.player || body.isStatic || body.isSensor || tornado.seen.has(body) || tornado.captured.size >= 12) continue
        if ([...this.tornadoes].some(other => other !== tornado && other.captured.has(body))) continue
        const rock = this.system.canCapture(body)
        if (!rock && !isEnemy(body)) continue
        const extent = this.extent(body)
        const dx = (body.position.x - tornado.x) / (tornado.radius + extent * 0.6)
        const dy = (body.position.y - centerY) / (tornado.height * 0.55 + extent)
        if (dx * dx + dy * dy > 1 || extent * 2 + 12 > tornado.height) continue
        if (this.scene.matter.query.ray(terrain, { x: tornado.x, y: centerY }, body.position, 2).length) continue
        if (rock ? !this.system.capture(body) : !damageEnemy(body, Math.round(Phaser.Math.Linear(COMBAT.tornadoDamage, COMBAT.chargedTornadoDamage, tornado.charge)), 'air')) continue
        tornado.seen.add(body)
        if (!rock) {
          impactRing(this.scene, body.position.x, body.position.y, COLORS[1])
          // Der Wirbel kühlt beim Einfangen: ein nasser Gegner friert fest.
          chillEnemy(body, COMBOS.vortexChillStrength, this.scene.time.now)
        }
        if (!rock && !isEnemy(body)) continue
        tornado.captured.set(body, { angle: Math.atan2(dy, dx), extent, rock, elapsed: 0 })
      }
      for (const [body, orbit] of tornado.captured) {
        if (!present.has(body) || (orbit.rock ? !this.system.canCapture(body) : !isEnemy(body))) {
          tornado.captured.delete(body)
          continue
        }
        orbit.elapsed += DT * 1000
        const escaped = Math.abs(body.position.x - tornado.x) > tornado.radius + orbit.extent + 80 ||
          body.position.y < tornado.y - tornado.height - 80 || body.position.y > tornado.y + 20
        if (escaped || (!orbit.rock && orbit.elapsed > 700 + tornado.charge * 450)) {
          this.releaseBody(tornado, body, orbit, true)
          continue
        }
        if (!orbit.rock) holdEnemyInWind(body, 150)
        const massScale = Math.cbrt(Math.max(225, body.mass) / 225)
        const angularSpeed = (5.2 + tornado.charge * 1.6) / Math.sqrt(massScale) * tornado.direction
        orbit.angle += angularSpeed * DT
        const rx = Math.max(12, tornado.radius - orbit.extent * 0.5)
        const ry = Math.max(6, Math.min(tornado.height * 0.29, tornado.height * 0.47 - orbit.extent - 5))
        const targetX = tornado.x + Math.cos(orbit.angle) * rx
        const targetY = centerY + Math.sin(orbit.angle) * ry
        // Zielgeschwindigkeit aus Tangente + Vorwärtsbewegung, weich und massenabhängig nachführen.
        const vx = tornado.direction * tornado.speed - Math.sin(orbit.angle) * rx * angularSpeed + (targetX - body.position.x) * 9
        const vy = Math.cos(orbit.angle) * ry * angularSpeed + (targetY - body.position.y) * 9
        const response = 1 - Math.exp(-18 / Math.sqrt(massScale) * DT)
        let nextVX = Phaser.Math.Linear(body.velocity.x, vx / PHYSICS_FPS, response)
        let nextVY = Phaser.Math.Linear(body.velocity.y, vy / PHYSICS_FPS, response)
        if (orbit.rock) nextVY -= metersPerSecondToMatter(GRAVITY_MS2 * DT)
        const cap = metersPerSecondToMatter(14), speed = Math.hypot(nextVX, nextVY)
        if (speed > cap) { nextVX *= cap / speed; nextVY *= cap / speed }
        this.scene.matter.body.setVelocity(body, { x: nextVX, y: nextVY })
        if (orbit.rock && body.inertia !== Infinity) this.scene.matter.body.setAngularVelocity(body, angularSpeed / PHYSICS_FPS * 0.45)
      }
      // Feuerwirbel: Ein Feuerball im Wirbel kreist mit, brennt ab und heizt die gefangenen Blöcke.
      const rocks = [...tornado.captured].filter(([, orbit]) => orbit.rock).map(([body]) => body)
      this.fireVortex.update(tornado, {
        x: tornado.x, centerY, radius: tornado.radius, height: tornado.height, direction: tornado.direction,
        open: growth > 0.8, remainingMs: tornado.duration - tornado.elapsed,
      }, DT * 1000, rocks)
    }
  }

  private extent(body: MatterJS.BodyType): number {
    return body.vertices?.length ? Math.max(...body.vertices.map(v => Math.hypot(v.x - body.position.x, v.y - body.position.y))) :
      Math.max(body.bounds.max.x - body.bounds.min.x, body.bounds.max.y - body.bounds.min.y) / 2
  }

  private releaseBody(tornado: Tornado, body: MatterJS.BodyType, orbit: Orbit, throwOut: boolean): void {
    tornado.captured.delete(body)
    if (orbit.rock) this.system.release(body)
    else holdEnemyInWind(body, 400)
    if (!throwOut) return
    const massScale = Math.cbrt(Math.max(225, body.mass) / 225)
    const kick = metersPerSecondToMatter((3 + tornado.charge * 3) / Math.sqrt(massScale))
    let vx = body.velocity.x + tornado.direction * kick
    let vy = Math.min(body.velocity.y, -kick * 0.55)
    const speed = Math.hypot(vx, vy), cap = metersPerSecondToMatter(18)
    if (speed > cap) { vx *= cap / speed; vy *= cap / speed }
    this.scene.matter.body.setVelocity(body, { x: vx, y: vy })
  }

  private finish(tornado: Tornado, throwOut: boolean): void {
    // Ein Feuerball im Wirbel erlischt ohne Explosion (bei der Salve wurde er vorher freigelassen).
    this.fireVortex.end(tornado)
    for (const [body, orbit] of tornado.captured) this.releaseBody(tornado, body, orbit, throwOut)
    if (throwOut) burst(this.scene, tornado.x, tornado.y - tornado.height * 0.4, COLORS, 18, 95)
    tornado.back.destroy(); tornado.front.destroy()
    this.tornadoes.delete(tornado)
  }

  private update(_time: number, deltaMs: number): void {
    const charge = this.charging
    if (charge) {
      charge.elapsed += Math.min(deltaMs, 50)
      charge.progress = Math.min(1, charge.elapsed / CHARGE_MS)
      this.drawCharge(charge)
      if (charge.progress > 0.65 && charge.elapsed >= charge.nextShake) {
        screenShake(this.scene, 0.001 + charge.progress * 0.001, 100)
        charge.nextShake = charge.elapsed + 200
      }
    }
    for (const tornado of this.tornadoes) this.drawTornado(tornado)
  }

  private drawCharge(charge: Charge): void {
    const pose = this.getPose(), q = charge.progress, radius = 12 + q * 16
    const floor = (this.player.vertices?.length ? Math.max(...this.player.vertices.map(v => v.y)) : this.player.bounds.max.y) - 2
    this.back.clear().setVisible(true); this.front.clear().setVisible(true)
    this.back.fillStyle(0x9ad8e6, 0.08 + q * 0.06).fillCircle(pose.center.x, pose.center.y, radius)
    this.front.fillStyle(0xe9ffff, 0.08).fillCircle(pose.center.x, pose.center.y, radius * 0.45)
    // Mehrere geneigte Ströme umkreisen die Hände vor und hinter der Figur.
    for (let band = 0; band < 4; band++) {
      let previous: { x: number; y: number } | undefined
      for (let i = 0; i <= 36; i++) {
        const a = pose.phase * (1.5 + band * 0.18) + band * 1.7 + i / 36 * Math.PI * 1.55
        const r = radius * (0.7 + band * 0.13)
        const px = Math.cos(a) * r, py = Math.sin(a) * r * (0.36 + band * 0.12)
        const tilt = band * 0.75 - 1.1
        const point = { x: pose.center.x + px * Math.cos(tilt) - py * Math.sin(tilt),
          y: Math.min(floor, pose.center.y + px * Math.sin(tilt) + py * Math.cos(tilt)) }
        if (previous) {
          const g = Math.sin(a) > 0 ? this.front : this.back
          g.lineStyle(1 + q * 0.7, COLORS[band % 3], (0.15 + i / 36 * 0.7) * (0.5 + q * 0.5))
            .lineBetween(previous.x, previous.y, point.x, point.y)
        }
        previous = point
      }
    }
    for (let i = 0; i < 24 + q * 26; i++) {
      const t = (i * 0.137 + charge.elapsed * 0.00055) % 1
      const a = i * 2.4 + pose.phase * (0.7 + t), r = radius + (1 - t) * (30 + q * 25)
      const x = pose.center.x + Math.cos(a) * r, y = Math.min(floor, pose.center.y + Math.sin(a) * r * 0.65)
      this.back.fillStyle(i % 4 ? 0xcfe9f2 : 0xc4b793, t * 0.75).fillRect(x, y, 1 + q, 1 + q)
    }
    for (const hand of [pose.front, pose.support]) this.front.lineStyle(1, 0xeaffff, 0.8).strokeCircle(hand.x, hand.y, 3 + q * 2)
    const source = this.findSource(q, this.terrain())
    if (source) this.back.lineStyle(1, 0xcfe9f2, 0.3 + q * 0.4).strokeEllipse(source.x, source.y - 1, 18 + q * 20, 5)
    this.label.setVisible(true).setPosition(pose.center.x, pose.center.y - radius - 13)
      .setText(!source ? 'KEIN FREIER BODEN' : q >= 1 ? 'MAX · WIRBELSTURM' : `LUFT ${Math.floor(q * 100)}%`)
  }

  private drawTornado(tornado: Tornado): void {
    const growth = Phaser.Math.SmoothStep(tornado.elapsed, 0, 240)
    const alpha = Math.min(1, (tornado.duration - tornado.elapsed) / 260)
    const height = tornado.height * growth
    const back = tornado.back.clear(), front = tornado.front.clear()
    // Feuerwirbel: Farben glühen mit dem Wärmeinhalt der gefangenen Feuerbälle.
    const fire = this.fireVortex.intensity(tornado)
    const tint = (i: number) => fire > 0 ? mix(COLORS[i], FIRE_COLORS[i], Math.min(1, 0.45 + fire * 0.55)) : COLORS[i]
    const silhouette: Phaser.Math.Vector2[] = []
    for (const side of [-1, 1]) for (let j = 0; j <= 12; j++) {
      const t = side < 0 ? j / 12 : 1 - j / 12
      const radius = (7 + (tornado.radius - 7) * t ** 0.7) * growth
      silhouette.push(new Phaser.Math.Vector2(tornado.x + side * radius, tornado.y - t * height))
    }
    back.fillStyle(fire > 0 ? mix(0x9bbdc6, 0xff6a1a, 0.4 + fire * 0.4) : 0x9bbdc6, alpha * (0.12 + fire * 0.1)).fillPoints(silhouette, true)
    back.fillStyle(0x102b35, alpha * 0.22).fillEllipse(tornado.x, tornado.y - 1, tornado.radius * 1.4, 9)
    for (let strand = 0; strand < 6; strand++) {
      let previous: { x: number; y: number } | undefined
      for (let i = 0; i <= 64; i++) {
        const t = i / 64, a = t * Math.PI * 6 - tornado.phase + strand * Math.PI / 3
        const radius = (7 + (tornado.radius - 7) * t ** 0.7) * growth
        const point = { x: tornado.x + Math.cos(a) * radius, y: tornado.y - t * height + Math.sin(a) * radius * 0.15 }
        if (previous) {
          const g = Math.sin(a) > 0 ? front : back
          g.lineStyle(strand % 2 ? 1 : 2, tint(strand % 3), alpha * (Math.sin(a) > 0 ? 0.7 : 0.25))
            .lineBetween(previous.x, previous.y, point.x, point.y)
        }
        previous = point
      }
    }
    for (let i = 0; i < 36; i++) {
      const t = (i / 36 + tornado.elapsed * 0.0006) % 1
      const a = tornado.phase * 1.4 + i * 2.4, r = (8 + t * tornado.radius) * growth
      const g = Math.sin(a) > 0 ? front : back
      g.fillStyle(fire > 0 ? EMBER_COLORS[i % 3] : i % 3 ? 0xc6dce1 : 0xbfae90, alpha * (1 - t) * 0.8)
        .fillRect(tornado.x + Math.cos(a) * r, tornado.y - t * height, 2, 2)
    }
    if (fire > 0) this.drawFireVortex(tornado, height, growth, alpha, fire)
  }

  /** Funken an den Rändern und Hitzeflimmern über dem Kern des Feuerwirbels. */
  private drawFireVortex(tornado: Tornado, height: number, growth: number, alpha: number, fire: number): void {
    const front = tornado.front
    const sparks = Math.round(8 + fire * 14)
    for (let i = 0; i < sparks; i++) {
      const t = (i * 0.173 + tornado.elapsed * 0.0011) % 1
      const side = i % 2 ? 1 : -1
      const radius = (7 + (tornado.radius - 7) * t ** 0.7) * growth
      const flicker = Math.sin(tornado.phase * 3 + i * 1.9) * 3
      front.fillStyle(EMBER_COLORS[i % 3], alpha * (1 - t * 0.7))
        .fillRect(tornado.x + side * (radius + 2 + flicker), tornado.y - t * height - (1 - t) * 4, 1 + (i % 2), 1 + (i % 2))
    }
    // Flimmern: blasse, wellige Linien steigen über der Spitze auf und vergehen.
    const top = tornado.y - height
    for (let line = 0; line < 4; line++) {
      const rise = (tornado.elapsed * 0.03 + line * 9) % 36
      const y = top - rise
      const width = tornado.radius * (0.9 - rise / 60)
      let previous: { x: number; y: number } | undefined
      for (let i = 0; i <= 10; i++) {
        const x = tornado.x - width + (i / 10) * width * 2
        const point = { x, y: y + Math.sin(i * 1.3 + tornado.phase * 2 + line) * 1.5 }
        if (previous) front.lineStyle(1, 0xfff1c8, alpha * fire * 0.28 * (1 - rise / 36)).lineBetween(previous.x, previous.y, point.x, point.y)
        previous = point
      }
    }
  }
}
