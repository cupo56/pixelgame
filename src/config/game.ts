import Phaser from 'phaser'
import { MATTER_GRAVITY_Y, PHYSICS_FPS } from './physics.ts'
import { BootScene } from '../scenes/BootScene.ts'
import { GameScene } from '../scenes/GameScene.ts'
import { MenuScene } from '../scenes/MenuScene.ts'

export const GAME_WIDTH = 960
export const GAME_HEIGHT = 540

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0b0b14',
  pixelArt: true,
  roundPixels: true,
  scale: {
    // Füllt den ganzen Bereich ohne schwarze Balken; bei abweichendem Seitenverhältnis wird ein schmaler Rand abgeschnitten.
    mode: Phaser.Scale.ENVELOP,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: MATTER_GRAVITY_Y },
      runner: { fps: PHYSICS_FPS },
      debug: false,
    },
  },
  scene: [BootScene, MenuScene, GameScene],
}
