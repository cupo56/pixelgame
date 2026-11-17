import './style.css'
import Phaser from 'phaser'
import { gameConfig } from './config/game.ts'

export const game = new Phaser.Game(gameConfig)

// Development inspection without importing the entry module a second time after HMR.
if (import.meta.env.DEV) {
  Object.assign(window, { elementsGame: game })
  import.meta.hot?.dispose(() => game.destroy(true))
}
