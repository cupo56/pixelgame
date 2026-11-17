import Phaser from 'phaser'

export interface FigurePose {
  x: number
  y: number
  speedMs: number
  verticalMs: number
  grounded: boolean
  landing: number
  gliding: boolean
}

type Point = { x: number; y: number }
const mix = (a: number, b: number, t: number) => a + (b - a) * t

/** Pixel silhouette with articulated knees/elbows; hand pose is shared with attacks. */
export class StickFigureView {
  private readonly graphics: Phaser.GameObjects.Graphics
  private phase = 0
  private elapsed = 0
  private facing = 1
  private target = new Phaser.Math.Vector2(1000, 0)
  private hand = new Phaser.Math.Vector2()
  private shoulder = new Phaser.Math.Vector2()
  private color = 0xb08a5a
  private pulse = 0
  private castStrength = 1
  private bob = 0
  private lean = 0

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(10)
  }

  aimAt(x: number, y: number, target: Phaser.Math.Vector2, color: number): Phaser.Math.Vector2 {
    this.target.copy(target)
    this.color = color
    if (Math.abs(target.x - x) > 5) this.facing = Math.sign(target.x - x)
    this.shoulder.set(x + this.lean + this.facing * 2, y - 12 + this.bob)
    const direction = target.clone().subtract(this.shoulder)
    if (direction.lengthSq() < 1) direction.set(this.facing, 0)
    direction.normalize()
    const reach = 20 - this.pulse * this.castStrength * 5
    this.hand.copy(this.shoulder).add(direction.scale(reach))
    return this.hand.clone()
  }

  cast(element: string): void {
    this.pulse = 1
    this.castStrength = element === 'water' ? 0.25 : element === 'earth' ? 1.3 : 0.85
  }

  draw(p: FigurePose, seconds: number): void {
    const dt = Math.min(seconds, 0.05)
    this.elapsed += dt
    this.pulse = Math.max(0, this.pulse - dt * 5)
    const speed = Math.abs(p.speedMs)
    const move = Phaser.Math.Clamp(speed / 2.2, 0, 1)
    const run = Phaser.Math.Clamp((speed - 2.2) / 3.8, 0, 1)
    if (p.grounded) this.phase += speed * dt * Math.PI * 2 / mix(1.5, 2.5, run)
    const cycle = this.phase
    const desiredBob = p.grounded ? Math.cos(cycle * 2) * mix(0.6, 1.6, run) * move + p.landing * 5 : 0
    this.bob = mix(this.bob, desiredBob, 1 - Math.exp(-20 * dt))
    this.lean = mix(this.lean, p.speedMs * 0.5 - this.facing * this.pulse * 1.5, 1 - Math.exp(-12 * dt))
    this.aimAt(p.x, p.y, this.target, this.color)
    const hip = { x: p.x, y: p.y + 5 + this.bob }
    const shoulder = this.shoulder
    const g = this.graphics
    g.clear()
    if (p.grounded) {
      g.fillStyle(0x07151f, 0.3).fillRect(Math.round(p.x - 16), Math.round(p.y + 28), 32, 3)
    }
    const leg = (offset: number, back: boolean) => {
      const phase = cycle + offset
      let foot: Point
      if (p.grounded) {
        const stride = mix(7, 13, run) * move
        foot = { x: p.x + Math.cos(phase) * stride, y: p.y + 27 - Math.max(0, Math.sin(phase)) * mix(5, 12, run) * move }
        if (speed < 0.15) foot.x = p.x + (back ? -4 : 4)
      } else {
        const rise = Phaser.Math.Clamp(-p.verticalMs / 4.3, 0, 1)
        foot = { x: p.x + this.facing * (back ? -8 : 7), y: p.y + 24 - (back ? 3 : 12) * rise - (p.gliding ? 5 : 0) }
      }
      const knee = this.joint(hip, foot, 13, 13, -this.facing)
      this.segment(hip, knee, 7, back ? 0x293b4e : 0x40576a)
      this.segment(knee, foot, 6, back ? 0x253446 : 0x34495c)
      this.rect(foot.x - 3, foot.y - 3, 8, 5, back ? 0x151f2c : 0x202d3b)
      this.rect(foot.x - 3 + this.facing * 2, foot.y + 1, 7, 2, 0x83928c)
    }
    leg(Math.PI, true)
    // Free arm counter-swings while the front hand keeps aiming.
    const freeShoulder = { x: shoulder.x - this.facing * 4, y: shoulder.y + 2 }
    const freeHand = { x: freeShoulder.x - Math.cos(cycle) * 9 * move - this.facing * 3, y: freeShoulder.y + (p.gliding && !p.grounded ? 3 : 18) }
    const freeElbow = this.joint(freeShoulder, freeHand, 11, 11, this.facing)
    this.segment(freeShoulder, freeElbow, 6, 0x304b50)
    this.segment(freeElbow, freeHand, 5, 0x946e55)
    this.segment(hip, shoulder, 13, 0x172832)
    this.segment({ x: hip.x, y: hip.y - 2 }, { x: shoulder.x, y: shoulder.y + 2 }, 10, 0x54786d)
    this.segment({ x: hip.x - 3, y: hip.y - 3 }, { x: shoulder.x - 3, y: shoulder.y + 2 }, 3, 0x789688)
    this.rect(hip.x - 7, hip.y - 2, 14, 4, 0x5d4538)
    this.rect(hip.x + 1, hip.y - 2, 3, 3, 0xc4ad76)
    leg(0, false)
    const headX = shoulder.x + this.facing * 1
    const headY = shoulder.y - 12 + Math.sin(this.elapsed * 2) * 0.35
    this.rect(headX - 3, headY + 7, 6, 5, 0xaf8060)
    this.rect(headX - 6, headY - 3, 12, 12, 0x192633)
    this.rect(headX - 4, headY, 9, 8, 0xd5ab7f)
    this.rect(headX + this.facing * 5 - 1, headY + 2, 3, 4, 0xd5ab7f)
    this.rect(headX - 6, headY - 4, 11, 5, 0x283343)
    this.rect(headX - this.facing * 4 - 1, headY - 1, 3, 6, 0x283343)
    this.rect(headX + this.facing * 3, headY + 2, 2, 2, 0x18252b)
    this.rect(shoulder.x - 6, shoulder.y - 1, 12, 4, 0x9cb5a2)
    const elbow = this.joint(shoulder, this.hand, 12, 11, this.facing)
    this.segment(shoulder, elbow, 7, 0x789688)
    this.segment(elbow, this.hand, 5, 0xd5ab7f)
    this.rect(elbow.x - 3, elbow.y - 2, 6, 4, 0x3c5657)
    this.rect(this.hand.x - 3, this.hand.y - 3, 6, 6, 0xe5bd90)
    this.rect(this.hand.x - 1, this.hand.y - 1, 3, 3, this.color)
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
