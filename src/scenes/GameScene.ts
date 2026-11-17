import Phaser from 'phaser'
import { ElementController } from '../elements/ElementController.ts'
import { Player } from '../entities/Player.ts'
import { FlyingPlushEnemy } from '../entities/FlyingPlushEnemy.ts'
import { COMBAT, TEST_ENEMIES } from '../config/combat.ts'
import { CAMP, Grenzland, LANDMARKS, LIFT, WORLD } from '../world/Grenzland.ts'

const SAVE_KEY = 'elements.grenzland.v1'

export class GameScene extends Phaser.Scene {
  private player!: Player
  private elements!: ElementController
  private enemies: FlyingPlushEnemy[] = []
  private healthText!: Phaser.GameObjects.Text
  private healthBar!: Phaser.GameObjects.Graphics
  private enemyText!: Phaser.GameObjects.Text
  private shownHealth = -1
  private regionText!: Phaser.GameObjects.Text
  private progressText!: Phaser.GameObjects.Text
  private hintText!: Phaser.GameObjects.Text
  private map!: Phaser.GameObjects.Container
  private mapPlayer!: Phaser.GameObjects.Arc
  private interact!: Phaser.Input.Keyboard.Key
  private recall!: Phaser.Input.Keyboard.Key
  private mapKey!: Phaser.Input.Keyboard.Key
  private testReset!: Phaser.Input.Keyboard.Key
  private markers: { id: string; view: Phaser.GameObjects.Container }[] = []
  private found = new Set<string>()
  private toastUntil = 0
  private saveAvailable = true

  constructor() { super('GameScene') }

  create(): void {
    this.markers = []
    this.found = new Set()
    this.saveAvailable = true
    this.toastUntil = 0
    this.shownHealth = -1
    this.loadProgress()
    new Grenzland(this)
    this.player = new Player(this, CAMP.x, CAMP.y)
    this.elements = new ElementController(this, this.player)
    this.enemies = TEST_ENEMIES.map((enemy, index) => new FlyingPlushEnemy(this, enemy.x, enemy.y, enemy.color, index))
    this.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_START, this.onEnemyContact, this)
    this.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_ACTIVE, this.onEnemyContact, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.matter.world?.off(Phaser.Physics.Matter.Events.COLLISION_START, this.onEnemyContact, this)
      this.matter.world?.off(Phaser.Physics.Matter.Events.COLLISION_ACTIVE, this.onEnemyContact, this)
    })
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height)
    this.cameras.main.startFollow(this.player.body.position, true, 0.09, 0.09, 0, 35)
    this.cameras.main.setDeadzone(120, 50)
    const keyboard = this.input.keyboard!
    this.interact = keyboard.addKey('E')
    this.recall = keyboard.addKey('R')
    this.mapKey = keyboard.addKey('TAB')
    this.testReset = keyboard.addKey('T')
    keyboard.addCapture(['SPACE', 'TAB'])
    this.createHud()
    this.createMarkers()
    this.createMap()
    this.toast('Rechts vom Lager: fliegende Plüschgegner · je 30 LP · T startet den Test neu.', 6000)
  }

  update(time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.testReset)) {
      this.scene.restart()
      return
    }
    if (!this.player.health.alive) {
      this.player.restoreHealth()
      this.travel(CAMP.x, CAMP.y)
      this.toast('Zurück am Lager · Leben aufgefüllt. Mit T kannst du die Testgegner neu starten.')
    }
    this.elements.update()
    this.player.render(delta)
    for (const enemy of this.enemies) enemy.render()
    this.refreshHealth()
    const { x, y } = this.player.body.position
    this.regionText.setText(y > 1080 ? '02 / DIE KRISTALLGROTTE' : y < 620 ? '03 / DIE HIMMELSINSELN' : '01 / DAS GRENZLAND')
    if (Phaser.Input.Keyboard.JustDown(this.mapKey)) this.map.setVisible(!this.map.visible)
    this.mapPlayer.setPosition(190 + x / WORLD.width * 580, 120 + y / WORLD.height * 240)
    if (Phaser.Input.Keyboard.JustDown(this.recall) || y > WORLD.height - 70) {
      this.player.restoreHealth()
      this.travel(CAMP.x, CAMP.y)
      this.toast('Zurück am Lagerfeuer. Deine Entdeckungen bleiben erhalten.')
    }
    const nearLift = Math.abs(x - LIFT.x) < 65 && (Math.abs(y - LIFT.bottom) < 55 || Math.abs(y - LIFT.top) < 55)
    const nearCaveLift = Math.abs(x - 2520) < 65 && Math.abs(y - 1448) < 65
    if (Phaser.Input.Keyboard.JustDown(this.interact)) {
      if (nearLift) this.travel(LIFT.x, y > 620 ? LIFT.top : LIFT.bottom)
      else if (nearCaveLift) this.travel(2570, 868)
    }
    // Der markierte Aufwind ist eine Elementroute; alternativ gibt es einen neutralen Aufzug.
    if (x > 3285 && x < 3335 && y > 350 && y < 910 && this.elements.selectedElement === 'air' && this.player.isJumpHeld()) {
      this.matter.body.setVelocity(this.player.body, { x: this.player.body.velocity.x, y: -3.4 })
    }
    for (const marker of this.markers) {
      const landmark = LANDMARKS.find((entry) => entry.id === marker.id)!
      if (!this.found.has(marker.id) && Phaser.Math.Distance.Between(x, y, landmark.x, landmark.y) < 55) {
        this.found.add(marker.id)
        marker.view.setAlpha(0.3)
        this.persistProgress()
        this.refreshProgress()
        this.toast(this.found.size === 3
          ? 'Grenzland erkundet! Alle drei Grenzsteine sind gefunden.'
          : `${landmark.name} entdeckt · Grenzstein ${this.found.size} / 3`, 5000)
      }
    }
    if (time > this.toastUntil) {
      this.hintText.setText(nearLift || nearCaveLift ? 'E  Aufzug benutzen' : 'A/D Laufen · SHIFT Gehen · S Bauchlage · SPACE Sprung · MAUS Angriff · TAB Karte · R Lager')
    }
  }

  private onEnemyContact(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    for (const pair of event.pairs) {
      const a = pair.bodyA.parent, b = pair.bodyB.parent
      const other = a === this.player.body ? b : b === this.player.body ? a : undefined
      if (other && this.enemies.some((enemy) => enemy.body === other && enemy.health.alive)) {
        if (this.player.takeDamage(COMBAT.contactDamage)) this.cameras.main.shake(70, 0.002)
      }
    }
  }

  private refreshHealth(): void {
    const { current, max } = this.player.health
    if (current !== this.shownHealth) {
      this.shownHealth = current
      this.healthText.setText(`LEBEN  ${current} / ${max}`)
      this.healthBar.clear().fillStyle(0x263d46).fillRect(310, 42, 160, 7)
      this.healthBar.fillStyle(current <= 30 ? 0xe78b86 : 0x9dceaa).fillRect(310, 42, 160 * current / max, 7)
    }
    this.enemyText.setText(`PLÜSCHGEGNER ${this.enemies.filter((enemy) => enemy.health.alive).length} / ${TEST_ENEMIES.length}`)
  }

  private travel(x: number, y: number): void {
    this.elements.cancelPreparedAttack()
    this.matter.body.setPosition(this.player.body, { x, y })
    this.matter.body.setVelocity(this.player.body, { x: 0, y: 0 })
    this.cameras.main.centerOn(x, y)
    this.cameras.main.flash(250, 155, 209, 196, false)
  }

  private createHud(): void {
    const panel = this.add.graphics().setScrollFactor(0).setDepth(99)
    panel.fillStyle(0x0c1c26, 0.93).fillRect(0, 0, 960, 72)
    panel.fillStyle(0x9ab39a, 0.3).fillRect(24, 71, 912, 1)
    panel.fillStyle(0x0c1c26, 0.95).fillRect(0, 480, 960, 60)
    const text = (x: number, y: number, value: string, size: number, color: string) => this.add.text(x, y, value, {
      fontFamily: 'monospace', fontSize: `${size}px`, color,
    }).setScrollFactor(0).setDepth(100)
    text(26, 17, 'E L E M E N T S', 20, '#e8dfbd')
    this.healthText = text(310, 20, '', 12, '#e1e9ce')
    this.healthBar = this.add.graphics().setScrollFactor(0).setDepth(100)
    this.enemyText = text(500, 21, '', 10, '#d7bfdc')
    text(500, 43, 'T · TEST NEU STARTEN', 9, '#9bb7af')
    this.regionText = text(28, 46, '', 10, '#9bb7af')
    this.progressText = text(930, 20, '', 12, '#d2dfc8').setOrigin(1, 0)
    text(930, 43, 'ERKUNDUNGS-PROTOTYP · TAB KARTE', 10, '#829f9e').setOrigin(1, 0)
    this.hintText = text(480, 463, '', 10, '#e0d5b4').setOrigin(0.5, 1)
    this.hintText.setBackgroundColor('#10232c').setPadding(10, 7)
    text(500, 505, 'MAUSRAD: ELEMENT', 10, '#9bb7af')
    text(930, 505, '4 LUFT + SPACE: GLEITEN', 10, '#9bb7af').setOrigin(1, 0)
    this.refreshProgress()
    this.refreshHealth()
  }

  private createMarkers(): void {
    for (const landmark of LANDMARKS) {
      const halo = this.add.circle(0, 0, 24, landmark.color, 0.1)
      const stone = this.add.rectangle(0, 0, 14, 21, landmark.color).setAngle(45)
      const core = this.add.rectangle(0, 0, 4, 8, 0xf2efd5)
      const view = this.add.container(landmark.x, landmark.y, [halo, stone, core]).setDepth(4)
      if (this.found.has(landmark.id)) view.setAlpha(0.3)
      this.tweens.add({ targets: view, y: landmark.y - 7, duration: 1400, yoyo: true, repeat: -1 })
      this.markers.push({ id: landmark.id, view })
    }
  }

  private createMap(): void {
    this.map = this.add.container(0, 0).setScrollFactor(0).setDepth(150).setVisible(false)
    const g = this.add.graphics()
    g.fillStyle(0x081820, 0.97).fillRect(145, 85, 670, 355)
    g.lineStyle(1, 0x6c9188).strokeRect(145, 85, 670, 355)
    const mx = (x: number) => 190 + x / WORLD.width * 580
    const my = (y: number) => 120 + y / WORLD.height * 240
    g.lineStyle(3, 0x89a078)
    g.lineBetween(mx(0), my(900), mx(1480), my(900))
    g.lineBetween(mx(1480), my(900), mx(2092), my(1478))
    g.lineBetween(mx(2092), my(1478), mx(2772), my(1478))
    g.lineBetween(mx(2250), my(900), mx(4800), my(900))
    g.lineStyle(3, 0xc5d5bc).lineBetween(mx(2910), my(420), mx(4130), my(420))
    g.lineStyle(1, 0x738e9a).lineBetween(mx(LIFT.x), my(420), mx(LIFT.x), my(900))
    this.map.add(g)
    const label = (x: number, y: number, value: string) => {
      this.map.add(this.add.text(x, y, value, { fontFamily: 'monospace', fontSize: '11px', color: '#c5d5bc' }))
    }
    label(175, 103, 'GRENZLAND / ORIENTIERUNG')
    label(mx(200), my(900) - 22, 'Lager')
    label(mx(3100), my(420) - 25, 'Himmelsinseln')
    label(mx(1900), my(1478) + 14, 'Kristallgrotte')
    for (const landmark of LANDMARKS) g.fillStyle(landmark.color).fillCircle(mx(landmark.x), my(landmark.y), 4)
    this.mapPlayer = this.add.circle(0, 0, 5, 0xffffff)
    this.map.add(this.mapPlayer)
    label(175, 382, 'WEISS: Du   RAUTEN IN DER WELT: Grenzsteine')
    label(175, 406, 'TAB schließen · R zurück zum Lager · Aufzüge mit E')
  }

  private refreshProgress(): void {
    this.progressText.setText(`GRENZSTEINE  ${this.found.size} / 3${this.saveAvailable ? '  ·  lokal gespeichert' : '  ·  nur diese Sitzung'}`)
  }

  private toast(message: string, duration = 3500): void {
    this.hintText.setText(message)
    this.toastUntil = this.time.now + duration
  }

  private loadProgress(): void {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '[]')
      if (Array.isArray(saved)) this.found = new Set(saved.filter((id): id is string => typeof id === 'string' && LANDMARKS.some((entry) => entry.id === id)))
    } catch { this.saveAvailable = false }
  }

  private persistProgress(): void {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify([...this.found])) }
    catch { this.saveAvailable = false }
  }
}
