import Phaser from 'phaser'
import type { ElementId } from '../config/elements.ts'

export interface FigurePose {
  x: number
  y: number
  speedMs: number
  verticalMs: number
  grounded: boolean
  landing: number
  gliding: boolean
  prone: number
  hurt: boolean
}

type Point = { x: number; y: number }
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const mixPoint = (a: Point, b: Point, t: number): Point => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) })
const FRONT_COLOR = 0xe5ecdf
const BACK_COLOR = 0x93aaa4
const MOVING_SPEED_MS = 0.15

/** Simple stick figure with articulated limbs; hand pose is shared with attacks. */
export class StickFigureView {
  private readonly graphics: Phaser.GameObjects.Graphics
  private phase = 0
  private elapsed = 0
  private aimFacing = 1
  private moveFacing = 1
  private target = new Phaser.Math.Vector2(1000, 0)
  private hand = new Phaser.Math.Vector2()
  private shoulder = new Phaser.Math.Vector2()
  private color = 0xb08a5a
  private pulse = 0
  private castStrength = 1
  private bob = 0
  private lean = 0
  private prone = 0
  private earthCharge: number | null = null
  private earthAmount = 0
  private earthBlend = 0
  private fireCharge: number | null = null
  private chargeAmount = 0
  private chargePose = 0
  private fireRelease = 0
  private waterCharge: number | null = null
  private waterBlend = 0
  private waterRelease = 0
  private airCharge: number | null = null
  private airAmount = 0
  private airBlend = 0
  private airPhase = 0
  private readonly airCenter = new Phaser.Math.Vector2()
  private attackElement: ElementId | null = null
  private attackTime = 0
  private attackDuration = 0.35
  private readonly waterCenter = new Phaser.Math.Vector2()
  private readonly frontHand = new Phaser.Math.Vector2()
  private readonly supportHand = new Phaser.Math.Vector2()

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(10)
  }

  aimAt(x: number, y: number, target: Phaser.Math.Vector2, color: number, prone = this.prone): Phaser.Math.Vector2 {
    this.target.copy(target)
    this.color = color
    this.prone = prone
    if (Math.abs(target.x - x) > 5) this.aimFacing = Math.sign(target.x - x)
    const waterSway = Math.sin(this.elapsed * 3.6) * 2.5 * this.waterWeight * (1 - prone)
    const thrust = this.fireRelease * 5 + this.waterRelease * 3 + this.attackWeight *
      (this.attackElement === 'earth' ? 7 : this.attackElement === 'fire' ? 5 : this.attackElement === 'air' ? 4 : 2)
    this.shoulder.set(
      x + mix(this.lean + this.aimFacing * (2 - this.firePose * 3 + thrust) + waterSway, this.moveFacing * 11, prone),
      y + mix(-12 + this.bob + this.firePose * 4 + this.waterWeight * 2 + this.earthBlend * (8 - this.earthAmount * 3) + this.airBlend * 2, 23, prone),
    )
    const direction = target.clone().subtract(this.shoulder)
    if (direction.lengthSq() < 1) direction.set(this.aimFacing, 0)
    direction.normalize()
    const reach = 20 - this.pulse * this.castStrength * 5
    this.hand.copy(this.shoulder).add(direction.clone().scale(reach))
    if (this.firePose > 0) {
      // Kugel an der hinteren Hüfte sammeln; beim Abschuss beide Hände vorstrecken.
      const cup = this.fireRelease > 0
        ? { x: this.shoulder.x + direction.x * 24, y: Math.min(this.shoulder.y + direction.y * 24, y + 10) }
        : mixPoint({ x: x - this.aimFacing * 11, y: y - 1 }, { x: x + this.moveFacing * 18, y: y + 10 }, prone)
      this.hand.set(mix(this.hand.x, cup.x, this.firePose), mix(this.hand.y, cup.y, this.firePose))
    }
    const gap = (this.fireRelease > 0 ? 3 : 5 + this.chargeAmount * 7) * this.firePose * mix(1, 0.6, prone)
    this.frontHand.set(this.hand.x + direction.y * gap, this.hand.y - direction.x * gap)
    this.supportHand.set(this.hand.x - direction.y * gap, this.hand.y + direction.x * gap)
    this.waterCenter.set(x + this.moveFacing * 10 * prone, y + mix(-4, 20, prone))
    if (this.waterWeight > 0) {
      const phase = this.elapsed * 3.6
      const forward = this.waterRelease > 0
        ? { x: this.shoulder.x + direction.x * 24, y: Math.min(this.shoulder.y + direction.y * 24, y + 17) }
        : { x: this.waterCenter.x + this.aimFacing * (7 + Math.cos(phase) * 11), y: this.waterCenter.y + Math.sin(phase) * mix(10, 4, prone) }
      const support = this.waterRelease > 0
        ? { x: this.shoulder.x - this.aimFacing * 12, y: this.shoulder.y + mix(12, -5, prone) }
        : { x: this.waterCenter.x - this.aimFacing * (7 + Math.cos(phase) * 11), y: this.waterCenter.y - Math.sin(phase) * mix(10, 4, prone) }
      this.frontHand.set(mix(this.frontHand.x, forward.x, this.waterWeight), mix(this.frontHand.y, forward.y, this.waterWeight))
      this.supportHand.set(mix(this.supportHand.x, support.x, this.waterWeight), mix(this.supportHand.y, support.y, this.waterWeight))
      this.hand.copy(this.frontHand)
    }
    if (this.earthBlend > 0) {
      // Tiefer Stand: beide Handflächen heben sich mit dem wachsenden Block.
      const tremor = Math.sin(this.elapsed * 34) * this.earthAmount * 0.45
      const forward = mixPoint(
        { x: x + this.aimFacing * (15 + this.earthAmount * 4), y: y + mix(13, -13, this.earthAmount) + tremor },
        { x: this.shoulder.x + this.aimFacing * 13, y: y + mix(25, 12, this.earthAmount) + tremor }, prone,
      )
      const support = mixPoint(
        { x: x + this.aimFacing * 5, y: y + mix(15, -8, this.earthAmount) - tremor },
        { x: this.shoulder.x + this.aimFacing * 4, y: y + mix(26, 16, this.earthAmount) - tremor }, prone,
      )
      this.blendHands(forward, support, this.earthBlend)
    }
    this.airCenter.set(x + mix(this.aimFacing * 11, this.moveFacing * 16, prone), y + mix(-5, 17, prone))
    if (this.airBlend > 0) {
      const rx = 9 + this.airAmount * 3, ry = mix(10 + this.airAmount * 2, 5, prone)
      const dx = Math.cos(this.airPhase) * rx * this.aimFacing, dy = Math.sin(this.airPhase) * ry
      this.blendHands({ x: this.airCenter.x + dx, y: this.airCenter.y + dy },
        { x: this.airCenter.x - dx, y: this.airCenter.y - dy }, this.airBlend)
      this.hand.set((this.frontHand.x + this.supportHand.x) / 2, (this.frontHand.y + this.supportHand.y) / 2)
    }
    if (this.attackElement) this.strikeHands(direction, y, prone)
    return this.hand.clone()
  }

  get castOrigin(): Phaser.Math.Vector2 { return this.hand.clone() }

  get waterPose() {
    return { center: this.waterCenter.clone(), hand: this.hand.clone(), support: this.supportHand.clone(), phase: this.elapsed * 3.6, prone: this.prone }
  }

  get airPose() {
    return { center: this.airCenter.clone(), front: this.frontHand.clone(), support: this.supportHand.clone(), phase: this.airPhase, prone: this.prone }
  }

  setAirCharge(progress: number | null): void {
    if (progress !== null && this.airCharge === null) this.resetCastPose()
    this.airCharge = progress
    if (progress !== null) this.airAmount = Phaser.Math.Clamp(progress, 0, 1)
  }

  setEarthCharge(progress: number | null): void {
    if (progress !== null && this.earthCharge === null) this.resetCastPose()
    this.earthCharge = progress
    if (progress !== null) this.earthAmount = Phaser.Math.Clamp(progress, 0, 1)
  }

  setWaterCharge(progress: number | null): void {
    if (progress !== null && this.waterCharge === null) this.resetCastPose()
    this.waterCharge = progress
  }
  private get waterWeight(): number { return Math.max(this.waterBlend, this.waterRelease) }
  private get guidedHands(): number { return Math.max(this.earthBlend, this.firePose, this.waterWeight, this.airBlend, this.attackWeight) }

  /** Kurzer, klarer Impuls; danach weich in die Lauf-/Ruhepose zurückkehren. */
  private get attackWeight(): number {
    return this.attackElement ? 1 - Phaser.Math.SmoothStep(this.attackTime / this.attackDuration, 0.18, 1) : 0
  }

  setFireCharge(progress: number | null): void {
    if (progress !== null && this.fireCharge === null) this.resetCastPose()
    this.fireCharge = progress
    if (progress !== null) this.chargeAmount = Phaser.Math.Clamp(progress, 0, 1)
  }

  private get firePose(): number { return Math.max(this.chargePose, this.fireRelease) }

  resetCastPose(): void {
    this.earthCharge = this.fireCharge = this.waterCharge = this.airCharge = null
    this.earthBlend = this.chargePose = this.waterBlend = this.airBlend = 0
    this.fireRelease = this.waterRelease = 0
    this.attackElement = null
    this.pulse = 0
  }

  cast(element: string): void {
    this.resetCastPose()
    this.pulse = 1
    this.castStrength = element === 'water' ? 0.25 : element.startsWith('earth') ? 1.3 : 0.85
    if (element === 'fire-charged') {
      this.fireRelease = 1
    }
    if (element === 'water-charged') {
      this.waterRelease = 1
    }
    if (element === 'earth' || element === 'earth-charged' || element === 'fire' || element === 'water' || element === 'air' || element === 'air-charged') {
      this.attackElement = element === 'earth-charged' ? 'earth' : element === 'air-charged' ? 'air' : element
      this.attackTime = 0
      this.attackDuration = element === 'air-charged' ? 0.55 : element === 'earth-charged' ? 0.48 : element === 'earth' ? 0.34 : element === 'fire' ? 0.24 : element === 'water' ? 0.32 : 0.42
    }
  }

  private blendHands(front: Point, support: Point, weight: number): void {
    this.frontHand.set(mix(this.frontHand.x, front.x, weight), mix(this.frontHand.y, front.y, weight))
    this.supportHand.set(mix(this.supportHand.x, support.x, weight), mix(this.supportHand.y, support.y, weight))
    this.hand.copy(this.frontHand)
  }

  private strikeHands(direction: Phaser.Math.Vector2, y: number, prone: number): void {
    // Die Querachse spiegelt sich mit dem Ziel, damit beide Hände links/rechts
    // dieselbe Rolle behalten. In Bauchlage bleiben die Handflächen über Boden.
    const across = { x: -direction.y * this.aimFacing, y: direction.x * this.aimFacing }
    const palm = (reach: number, offset: number): Point => ({
      x: this.shoulder.x + direction.x * reach + across.x * offset,
      y: Math.min(y + 25, this.shoulder.y + direction.y * reach + across.y * offset * mix(1, 0.5, prone)),
    })
    let front: Point, support: Point
    switch (this.attackElement) {
      case 'earth': // Schwerer, kurzer Stoß aus beiden Armen.
        front = palm(24, -3)
        support = palm(16, 8)
        break
      case 'fire': // Gerader Fauststoß, die zweite Hand bleibt in Deckung.
        front = palm(25, 0)
        support = { x: this.shoulder.x - this.aimFacing * 7, y: this.shoulder.y + mix(11, -5, prone) }
        break
      case 'water': { // Führende Hand streicht durch einen Bogen, Gegenarm zieht zurück.
        const sweep = Math.sin(Math.min(1, this.attackTime / this.attackDuration) * Math.PI)
        front = palm(23, -sweep * 7)
        support = { x: this.shoulder.x - this.aimFacing * 11, y: this.shoulder.y + mix(12 - sweep * 5, -4, prone) }
        break
      }
      default: // Luft: offener, breiter Doppelhandstoß.
        front = palm(23, -7)
        support = palm(21, 8)
    }
    this.blendHands(front, support, this.attackWeight)
    if (this.attackElement === 'air') this.hand.set((this.frontHand.x + this.supportHand.x) / 2, (this.frontHand.y + this.supportHand.y) / 2)
  }

  draw(p: FigurePose, seconds: number): void {
    const dt = Math.min(seconds, 0.05)
    this.elapsed += dt
    this.pulse = Math.max(0, this.pulse - dt * 5)
    this.earthBlend = mix(this.earthBlend, this.earthCharge !== null ? 1 : 0, 1 - Math.exp(-18 * dt))
    if (this.earthCharge === null && this.earthBlend < 0.002) this.earthBlend = 0
    this.chargePose = mix(this.chargePose, this.fireCharge !== null ? 1 : 0, 1 - Math.exp(-22 * dt))
    if (this.fireCharge === null && this.chargePose < 0.002) this.chargePose = 0
    this.fireRelease = Math.max(0, this.fireRelease - dt * 6)
    this.waterBlend = mix(this.waterBlend, this.waterCharge !== null ? 1 : 0, 1 - Math.exp(-16 * dt))
    if (this.waterCharge === null && this.waterBlend < 0.002) this.waterBlend = 0
    this.waterRelease = Math.max(0, this.waterRelease - dt * 2.5)
    this.airBlend = mix(this.airBlend, this.airCharge !== null ? 1 : 0, 1 - Math.exp(-18 * dt))
    if (this.airCharge === null && this.airBlend < 0.002) this.airBlend = 0
    this.airPhase += dt * (4 + this.airAmount * 7)
    this.attackTime += dt
    if (this.attackTime >= this.attackDuration) this.attackElement = null
    const speed = Math.abs(p.speedMs)
    // Legs follow actual travel, independently of the mouse. Keep the last
    // direction at rest so tiny residual velocities cannot flip the stance.
    if (speed > MOVING_SPEED_MS) this.moveFacing = Math.sign(p.speedMs)
    const move = Phaser.Math.Clamp(speed / 2.2, 0, 1)
    const run = Phaser.Math.Clamp((speed - 2.2) / 3.8, 0, 1)
    if (p.grounded) this.phase += speed * dt * Math.PI * 2 / mix(1.5, 2.5, run)
    const cycle = this.phase
    const desiredBob = p.grounded ? Math.cos(cycle * 2) * mix(0.6, 1.6, run) * move + p.landing * 5 : 0
    this.bob = mix(this.bob, desiredBob, 1 - Math.exp(-20 * dt))
    this.lean = mix(this.lean, p.speedMs * 0.5, 1 - Math.exp(-12 * dt))
    this.aimAt(p.x, p.y, this.target, this.color, p.prone)
    const brace = Math.max(this.earthBlend, this.firePose, this.waterWeight * 0.65, this.airBlend * 0.65,
      this.attackWeight * (this.attackElement === 'earth' ? 0.85 : this.attackElement === 'air' ? 0.7 : 0.45)) * (1 - p.prone)
    const sway = Math.sin(this.elapsed * 3.6) * 2.5 * this.waterWeight * (1 - move) * (1 - p.prone)
    const standingHip = { x: p.x - this.aimFacing * brace * 2 - sway, y: p.y + 5 + this.bob + brace * 6 + this.earthBlend * 2 }
    const proneHip = { x: p.x - this.moveFacing * 5, y: p.y + 25 }
    const hip = mixPoint(standingHip, proneHip, p.prone)
    const shoulder = this.shoulder
    const g = this.graphics
    g.clear()
    g.setAlpha(p.hurt && Math.sin(this.elapsed * 45) > 0 ? 0.35 : 1)
    if (p.grounded) {
      const shadowWidth = mix(32, 62, p.prone)
      g.fillStyle(0x07151f, 0.3).fillRect(Math.round(p.x - shadowWidth / 2), Math.round(p.y + 28), shadowWidth, 3)
    }
    const leg = (offset: number, back: boolean) => {
      const phase = cycle + offset
      let foot: Point
      if (p.grounded) {
        const stride = mix(7, 13, run) * move
        // The lifted foot swings forward; the planted foot travels backward
        // relative to the hip. Mirror the entire cycle when moving left.
        foot = { x: p.x - Math.cos(phase) * stride * this.moveFacing, y: p.y + 27 - Math.max(0, Math.sin(phase)) * mix(5, 12, run) * move }
        if (speed <= MOVING_SPEED_MS) foot.x = p.x + (back ? -4 : 4) * this.moveFacing
      } else {
        const rise = Phaser.Math.Clamp(-p.verticalMs / 4.3, 0, 1)
        foot = { x: p.x + this.moveFacing * (back ? -8 : 7), y: p.y + 24 - (back ? 3 : 12) * rise - (p.gliding ? 5 : 0) }
      }
      const planted = p.grounded ? brace * (1 - move) : 0
      foot = mixPoint(foot, { x: p.x + this.aimFacing * (back ? -15 - this.earthBlend * 3 : 14 + this.earthBlend * 3), y: p.y + 27 }, planted)
      const footFacing = planted > 0.5 ? this.aimFacing : this.moveFacing
      const standingKnee = this.joint(standingHip, foot, 13, 13, -footFacing)
      const proneFoot = {
        x: p.x - this.moveFacing * ((back ? 26 : 24) + Math.cos(phase) * move),
        y: p.y + 27 - Math.max(0, Math.sin(phase)) * move,
      }
      const proneKnee = this.joint(proneHip, proneFoot, 13, 13, this.moveFacing)
      const knee = mixPoint(standingKnee, proneKnee, p.prone)
      foot = mixPoint(foot, proneFoot, p.prone)
      const color = back ? BACK_COLOR : FRONT_COLOR
      this.segment(hip, knee, 3, color)
      this.segment(knee, foot, 3, color)
      this.segment(foot, { x: foot.x + footFacing * mix(5, -2, p.prone), y: foot.y }, 3, color)
    }
    leg(Math.PI, true)
    // Free arm counter-swings while the front hand keeps aiming.
    const freeShoulder = { x: shoulder.x - this.moveFacing * 2, y: shoulder.y + 2 }
    const freeHand = mixPoint(mixPoint(
      { x: freeShoulder.x + Math.cos(cycle) * 9 * move * this.moveFacing - this.moveFacing * 3, y: freeShoulder.y + (p.gliding && !p.grounded ? 3 : 18) },
      { x: p.x + this.moveFacing * (23 - Math.cos(cycle) * 2 * move), y: p.y + 27 },
      p.prone,
    ), this.supportHand, this.guidedHands)
    const freeElbow = mixPoint(mixPoint(
      this.joint(freeShoulder, freeHand, 11, 11, this.moveFacing),
      { x: p.x + this.moveFacing * 14, y: p.y + 27 },
      p.prone,
    ), this.joint(freeShoulder, freeHand, 12, 13, -this.aimFacing), this.guidedHands)
    this.segment(freeShoulder, freeElbow, 3, BACK_COLOR)
    this.segment(freeElbow, freeHand, 3, BACK_COLOR)
    if (this.guidedHands > 0.1) this.rect(freeHand.x - 2, freeHand.y - 2, 4, 4, FRONT_COLOR)
    this.segment(hip, shoulder, 4, FRONT_COLOR)
    leg(0, false)
    const headX = shoulder.x + this.moveFacing * 10 * p.prone
    const headY = shoulder.y - mix(10, 2, p.prone) + Math.sin(this.elapsed * 2) * 0.35 * (1 - p.prone)
    this.segment(shoulder, { x: headX - this.moveFacing * 5 * p.prone, y: headY + 6 * (1 - p.prone) }, 3, FRONT_COLOR)
    g.lineStyle(3, FRONT_COLOR).strokeCircle(Math.round(headX), Math.round(headY), 6)
    const elbow = this.joint(shoulder, this.frontHand, 12, 11 + this.guidedHands * 2, this.aimFacing)
    this.segment(shoulder, elbow, 3, FRONT_COLOR)
    this.segment(elbow, this.frontHand, 3, FRONT_COLOR)
    this.rect(this.frontHand.x - 2, this.frontHand.y - 2, 4, 4, FRONT_COLOR)
    this.rect(this.frontHand.x - 1, this.frontHand.y - 1, 3, 3, this.color)
    if (this.pulse > 0) {
      const r = 4 + this.pulse * 4
      g.lineStyle(1, this.color, this.pulse).strokeRect(Math.round(this.hand.x - r), Math.round(this.hand.y - r), r * 2, r * 2)
    }
  }

  private joint(a: Point, b: Point, upper: number, lower: number, bend: number): Point {
    const dx = b.x - a.x, dy = b.y - a.y
    const distance = Math.max(0.01, Math.hypot(dx, dy))
    const d = Math.min(upper + lower - 0.01, distance)
    const along = (upper * upper - lower * lower + d * d) / (2 * d)
    const h = Math.sqrt(Math.max(0, upper * upper - along * along)) * bend
    return { x: a.x + dx / distance * along - dy / distance * h, y: a.y + dy / distance * along + dx / distance * h }
  }

  private rect(x: number, y: number, width: number, height: number, color: number): void {
    this.graphics.fillStyle(color).fillRect(Math.round(x), Math.round(y), width, height)
  }

  /** Stamp square pixels along a bone; avoids antialiased vector limbs. */
  private segment(a: Point, b: Point, width: number, color: number): void {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)))
    for (let i = 0; i <= steps; i++) this.rect(mix(a.x, b.x, i / steps) - width / 2, mix(a.y, b.y, i / steps) - width / 2, width, width, color)
  }

  destroy(): void { this.graphics.destroy() }
}
