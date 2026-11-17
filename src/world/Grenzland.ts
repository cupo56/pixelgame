import Phaser from 'phaser'

export const WORLD = { width: 4800, height: 1820, surface: 900 } as const
export const CAMP = { x: 360, y: 870 }
export const LIFT = { x: 3020, bottom: 870, top: 390 }
export const LANDMARKS = [
  { id: 'grove', name: 'Der alte Hain', x: 1080, y: 860, color: 0xa5ce7a },
  { id: 'cave', name: 'Die Kristallgrotte', x: 2260, y: 1440, color: 0x69d9de },
  { id: 'sky', name: 'Die stille Himmelsinsel', x: 3610, y: 380, color: 0xf2d899 },
] as const

/** Handgebaute erste Region; Dekorationen haben keine Physikkörper. */
export class Grenzland {
  private readonly scene: Phaser.Scene
  private readonly art: Phaser.GameObjects.Graphics

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.art = scene.add.graphics().setDepth(-5)
    this.background()
    this.terrain()
    this.settlement()
    this.details()
  }

  private background(): void {
    const g = this.art
    const bands = [0x101e31, 0x172b40, 0x20394b, 0x2e4c59, 0x456361]
    bands.forEach((color, i) => g.fillStyle(color).fillRect(0, i * 180, WORLD.width, 181))
    g.fillStyle(0x10232c).fillRect(0, 900, WORLD.width, 920)
    g.fillStyle(0x091b25).fillRect(0, 1170, WORLD.width, 650)
    for (let i = 0; i < 95; i++) {
      g.fillStyle(0xd9e4cf, 0.25 + (i % 3) * 0.15).fillRect((i * 383 + 41) % WORLD.width, (i * 137 + 26) % 570, 2, 2)
    }
    g.fillStyle(0xf2e5be).fillCircle(790, 360, 32)
    g.fillStyle(0x20394b).fillCircle(803, 351, 29)
    for (let i = 0; i < 18; i++) {
      const x = i * 320
      g.fillStyle(0x29464e).fillTriangle(x - 170, 900, x + 150, 460 + (i % 4) * 65, x + 480, 900)
      g.fillStyle(0x355658).fillTriangle(x - 60, 900, x + 160, 650 + (i % 3) * 45, x + 400, 900)
    }
    for (let i = 0; i < 14; i++) {
      const height = 60 + (i * 37) % 130
      g.fillStyle(0x263f48).fillRect(3910 + i * 52, 850 - height, 36, height)
      g.fillStyle(0xb2ad77, 0.35).fillRect(3920 + i * 52, 866 - height, 4, 12)
    }
  }

  private platform(x: number, top: number, width: number, height: number, moss = true): void {
    this.scene.matter.add.rectangle(x + width / 2, top + height / 2, width, height, {
      isStatic: true, friction: 0.8, label: 'terrain',
    })
    const g = this.art
    g.fillStyle(moss ? 0x344647 : 0x24353e).fillRect(x, top, width, height)
    g.fillStyle(moss ? 0x60836a : 0x49606a).fillRect(x, top, width, 5)
    g.fillStyle(moss ? 0x9bad76 : 0x6c8991).fillRect(x, top, width, 2)
    g.fillStyle(0x162e35, 0.6)
    for (let dx = 14; dx < width - 5; dx += 37) {
      for (let dy = 18; dy < Math.min(height, 150); dy += 29) g.fillRect(x + dx, top + dy, 11, 3)
    }
    if (moss) {
      g.fillStyle(0x779568)
      for (let dx = 4; dx < width; dx += 19) g.fillRect(x + dx, top - 4 - dx % 7, 2, 7 + dx % 7)
    }
  }

  private terrain(): void {
    this.platform(0, 900, 1480, 180)
    // Niedrige Stufen passen zur vorhandenen Sprunghöhe von 19 Pixeln.
    for (let i = 0; i < 34; i++) this.platform(1480 + i * 18, 900 + i * 17, 18, 650 - i * 17, false)
    this.platform(2092, 1478, 680, 100, false)
    this.platform(2250, 900, 2550, 190)
    this.platform(2750, 1080, 70, 400, false)
    this.platform(2910, 420, 360, 54)
    this.platform(3350, 412, 440, 68)
    this.platform(3870, 400, 260, 44)
    const g = this.art
    for (const [x, y, width] of [[2910, 474, 360], [3350, 480, 440], [3870, 444, 260]]) {
      g.fillStyle(0x263f48).fillTriangle(x, y, x + width, y, x + width * 0.55, y + 100)
      for (let i = 0; i < 5; i++) g.fillStyle(0x547c70).fillRect(x + 20 + i * 29, y - 2, 2, 14 + i * 5)
    }
    this.scene.matter.add.rectangle(-25, 910, 50, WORLD.height * 2, { isStatic: true })
    this.scene.matter.add.rectangle(WORLD.width + 25, 910, 50, WORLD.height * 2, { isStatic: true })
    this.scene.matter.add.rectangle(2400, 1840, 4800, 40, { isStatic: true })
    this.scene.matter.add.rectangle(4745, 845, 50, 110, { isStatic: true, label: 'sealed-gate' })
  }

  private label(x: number, y: number, text: string, color = '#c1cebd', size = 11): void {
    this.scene.add.text(x, y, text, {
      fontFamily: 'monospace', fontSize: `${size}px`, color, lineSpacing: 5,
      backgroundColor: '#132a30', padding: { x: 8, y: 5 },
    }).setOrigin(0.5, 1).setDepth(2)
  }

  private settlement(): void {
    const g = this.art
    for (const x of [130, 530]) {
      g.fillStyle(0x344b4a).fillRect(x, 819, 95, 81)
      g.fillStyle(0x203b40).fillTriangle(x - 14, 819, x + 46, 772, x + 110, 819)
      g.fillStyle(0x8caa87).fillRect(x - 14, 817, 124, 4)
      g.fillStyle(0x182e35).fillRect(x + 39, 855, 24, 45)
      g.fillStyle(0xeac58a).fillRect(x + 12, 843, 14, 20)
      g.fillStyle(0x947554).fillRect(x + 84, 786, 10, 24)
    }
    this.label(386, 772, 'GRENZWACHT', '#e5d8af', 15)
    this.label(790, 847, 'ALTER HAIN →\nKRISTALLGROTTE ↘')
    this.label(2630, 842, '↑ HIMMELSINSELN\n← GROTTE')
    this.label(4430, 842, 'EISENSTADT →\nDer Weg ist noch versiegelt.')
    g.fillStyle(0x778c81).fillRect(328, 888, 62, 12)
    g.fillStyle(0x5c4537).fillRect(343, 881, 33, 7)
    const flame = this.scene.add.rectangle(360, 873, 9, 19, 0xffc776).setDepth(3)
    this.scene.tweens.add({ targets: flame, scaleY: 0.6, alpha: 0.65, duration: 480, yoyo: true, repeat: -1 })
    this.label(360, 946, 'LAGER · R zum Rückruf', '#e4c28d')
    for (const y of [420, 900]) {
      g.fillStyle(0x405b61).fillRect(LIFT.x - 28, y - 7, 56, 7)
      g.fillStyle(0xb5d6c2).fillRect(LIFT.x - 24, y - 9, 48, 2)
      this.label(LIFT.x, y - 65, 'E · AUFZUG', '#b6d5c4')
    }
    g.lineStyle(1, 0x8db3b5, 0.3).lineBetween(LIFT.x - 25, 425, LIFT.x - 25, 892)
    g.lineBetween(LIFT.x + 25, 425, LIFT.x + 25, 892)
    this.label(3310, 800, 'AUFWIND\n4 Luft + Sprung halten', '#c4dce0')
    this.label(2520, 1420, 'E · RUNENAUFZUG\nzur Oberfläche', '#9bcdd0')
    g.fillStyle(0x69d9de, 0.25).fillRect(2490, 1469, 60, 9)
  }

  private details(): void {
    const g = this.art
    // Zerbrochene Säulen und ein alter Torbogen geben der Insel einen erkennbaren Ort.
    for (const [x, height] of [[3400, 83], [3500, 104], [3720, 66]]) {
      g.fillStyle(0x526c70).fillRect(x, 412 - height, 20, height)
      g.fillStyle(0x8ca69b).fillRect(x - 4, 412 - height, 28, 6)
      g.fillStyle(0x344f59).fillRect(x + 12, 418 - height, 4, height - 6)
      g.fillStyle(0x719186).fillRect(x - 5, 404, 30, 8)
      for (let y = 430 - height; y < 400; y += 19) g.fillStyle(0x2d4953).fillRect(x, y, 20, 2)
    }
    g.fillStyle(0x526c70).fillRect(3495, 298, 112, 12)
    g.fillStyle(0x91a999).fillRect(3491, 294, 120, 4)
    g.fillStyle(0x9fbdb1).fillRect(3543, 318, 6, 12)
    // Ferne Felsrippen hinter den Kristallen.
    for (let i = 0; i < 11; i++) {
      const x = 2110 + i * 60
      g.fillStyle(0x102a34).fillTriangle(x - 40, 1478, x + 12, 1240 + i % 3 * 31, x + 70, 1478)
      g.fillStyle(0x19323b).fillTriangle(x, 1478, x + 12, 1240 + i % 3 * 31, x + 33, 1478)
    }
    for (const x of [50, 715, 920, 1180, 1340, 2390, 2790, 3320, 3740, 4180, 4650]) {
      const height = 88 + x % 67
      g.fillStyle(0x394e47).fillRect(x, 900 - height, 10, height)
      g.fillStyle(0x2b4946).fillRect(x - 28, 900 - height - 35, 65, 47)
      g.fillStyle(0x3e6253).fillRect(x - 45, 900 - height - 16, 96, 34)
      g.fillStyle(0x54785b).fillRect(x - 23, 900 - height - 38, 48, 9)
    }
    for (let i = 0; i < 22; i++) {
      const x = 2100 + (i * 47) % 640
      const y = 1468 - (i % 3) * 3
      const h = 12 + (i * 13) % 36
      g.fillStyle(0x53b4bc, 0.15).fillCircle(x, y - h / 2, h)
      g.fillStyle(i % 2 ? 0x72bec6 : 0x437d96).fillTriangle(x - 6, y, x + 6, y, x + 2, y - h)
      g.fillStyle(0xb2e7db).fillRect(x + 1, y - h + 4, 2, h - 5)
    }
    for (let i = 0; i < 15; i++) {
      const y = 470 + i * 27
      const wind = this.scene.add.rectangle(3290 + i % 3 * 16, y, 2, 10, 0xb6dfde, 0.35)
      this.scene.tweens.add({ targets: wind, y: y - 85, alpha: 0, duration: 1100 + i * 40, repeat: -1 })
    }
    g.fillStyle(0x465b5d).fillRect(4700, 780, 20, 120)
    g.fillStyle(0x465b5d).fillRect(4770, 780, 20, 120)
    g.fillStyle(0x6c8075).fillRect(4690, 770, 110, 16)
    g.fillStyle(0xaccac4, 0.2).fillRect(4720, 790, 50, 110)
  }
}
