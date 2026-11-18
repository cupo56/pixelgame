import Phaser from 'phaser'
import { EnemyShots } from '../combat/EnemyShots.ts'
import { ElementController } from '../elements/ElementController.ts'
import { Player } from '../entities/Player.ts'
import { FlyingPlushEnemy } from '../entities/FlyingPlushEnemy.ts'
import { COMBAT, TEST_ENEMIES } from '../config/combat.ts'
import { CAMP, Grenzland, LANDMARKS, LIFT, WORLD } from '../world/Grenzland.ts'
import { HudBar } from '../ui/HudBar.ts'
import { SkillTreePanel } from '../ui/SkillTreePanel.ts'
import { screenShake } from '../effects/juice.ts'

const SAVE_KEY = 'elements.grenzland.v1'

export class GameScene extends Phaser.Scene {
  private player!: Player
  private elements!: ElementController
  private enemies: FlyingPlushEnemy[] = []
  private shots!: EnemyShots
  /** Scharfe HTML-Leiste unten (Leben, Elemente, Ort). */
  readonly hud = HudBar.get()
  private map!: Phaser.GameObjects.Container
  private mapPlayer!: Phaser.GameObjects.Arc
  private interact!: Phaser.Input.Keyboard.Key
  private recall!: Phaser.Input.Keyboard.Key
  private mapKey!: Phaser.Input.Keyboard.Key
  private testReset!: Phaser.Input.Keyboard.Key
  private markers: { id: string; view: Phaser.GameObjects.Container }[] = []
  private found = new Set<string>()
  private skills!: SkillTreePanel

  constructor() { super('GameScene') }

  create(): void {
    this.hud.setVisible(true)
    this.markers = []
    this.found = new Set()
    this.loadProgress()
    new Grenzland(this)
    this.player = new Player(this, CAMP.x, CAMP.y)
    this.elements = new ElementController(this, this.player)
    this.enemies = TEST_ENEMIES.map((enemy, index) => new FlyingPlushEnemy(this, enemy.x, enemy.y, enemy.color, index))
    this.shots = new EnemyShots(this, this.player, () => this.enemies)
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
    this.mapKey = keyboard.addKey('M')
    this.testReset = keyboard.addKey('T')
    keyboard.addCapture(['SPACE'])
    this.createMarkers()
    this.createMap()
    this.refreshHealth()
    this.skills = new SkillTreePanel(() => this.closeSkills())
    document.addEventListener('keydown', this.onMenuKey, true)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('keydown', this.onMenuKey, true)
      this.skills.destroy()
      keyboard.resetKeys()
      this.hud.setVisible(false)
    })
  }

  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.testReset)) {
      this.scene.restart()
      return
    }
    if (!this.player.health.alive) {
      this.elements.loseMetal()
      this.player.restoreHealth()
      this.travel(CAMP.x, CAMP.y)
    }
    this.elements.update()
    this.shots.update()
    this.player.render(delta)
    this.elements.afterRender()
    for (const enemy of this.enemies) enemy.render()
    this.refreshHealth()
    const { x, y } = this.player.body.position
    this.hud.setRegion(y > 1080 ? 'Die Kristallgrotte' : y < 620 ? 'Die Himmelsinseln' : 'Das Grenzland')
    if (Phaser.Input.Keyboard.JustDown(this.mapKey)) this.map.setVisible(!this.map.visible)
    this.mapPlayer.setPosition(190 + x / WORLD.width * 580, 120 + y / WORLD.height * 240)
    const fell = y > WORLD.height - 70
    if (Phaser.Input.Keyboard.JustDown(this.recall) || fell) {
      // Rückruf behält die Rüstung, ein Absturz kostet sie.
      if (fell) this.elements.loseMetal()
      this.player.restoreHealth()
      this.travel(CAMP.x, CAMP.y)
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
      }
    }
  }

  /** DOM-Tasten bleiben auch bei der für den Skilltree pausierten Szene erreichbar. */
  private onMenuKey = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey || !['Escape', 'KeyK'].includes(event.code)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.repeat) return
    if (event.code === 'Escape') {
      this.elements.cancelPreparedAttack()
      this.input.keyboard?.resetKeys()
      this.scene.start('MenuScene')
    } else if (this.skills.isOpen) this.closeSkills()
    else this.openSkills()
  }

  private openSkills(): void {
    if (this.skills.isOpen) return
    this.elements.cancelCharging()
    this.input.keyboard?.resetKeys()
    this.map.setVisible(false)
    this.skills.open(this.elements.selectedElement)
    this.scene.pause()
  }

  private closeSkills(): void {
    this.skills.close()
    this.input.keyboard?.resetKeys()
    this.scene.resume()
  }

  private onEnemyContact(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    for (const pair of event.pairs) {
      const a = pair.bodyA.parent, b = pair.bodyB.parent
      const other = a === this.player.body ? b : b === this.player.body ? a : undefined
      if (other && this.enemies.some((enemy) => enemy.body === other && enemy.health.alive)) {
        if (this.player.takeDamage(COMBAT.contactDamage)) screenShake(this, 0.002, 70)
      }
    }
  }

  private refreshHealth(): void {
    const { current, max } = this.player.health
    this.hud.setHealth(current, max)
    this.hud.setArmor(this.player.armor.current, this.player.armor.max)
  }

  private travel(x: number, y: number): void {
    this.elements.cancelPreparedAttack(true)
    const from = { x: this.player.body.position.x, y: this.player.body.position.y }
    this.matter.body.setPosition(this.player.body, { x, y })
    this.elements.afterTeleport(x - from.x, y - from.y)
    this.matter.body.setVelocity(this.player.body, { x: 0, y: 0 })
    this.cameras.main.centerOn(x, y)
    this.cameras.main.flash(250, 155, 209, 196, false)
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
    label(175, 406, 'M schließen · R zurück zum Lager · Aufzüge mit E')
  }



  private loadProgress(): void {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '[]')
      if (Array.isArray(saved)) this.found = new Set(saved.filter((id): id is string => typeof id === 'string' && LANDMARKS.some((entry) => entry.id === id)))
    } catch { /* Speicher blockiert: Entdeckungen gelten nur für diese Sitzung. */ }
  }

  private persistProgress(): void {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify([...this.found])) }
    catch { /* Speicher blockiert: Entdeckungen gelten nur für diese Sitzung. */ }
  }
}
