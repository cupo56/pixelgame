import Phaser from 'phaser'
import { createSparkTexture } from '../effects/particles.ts'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene')
  }

  preload(): void {
    // Assets (Sprites, Sounds, Tilemaps) aus public/assets hier laden.
  }

  create(): void {
    createSparkTexture(this)
    this.scene.start('MenuScene')
  }
}
