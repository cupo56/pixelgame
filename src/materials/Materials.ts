import type { EarthMaterial } from './EarthMaterial.ts'
import type { FireMaterial } from './FireMaterial.ts'
import type { IceMaterial } from './IceMaterial.ts'
import type { Puddle } from './Puddle.ts'
import type { WaterMaterial } from './WaterMaterial.ts'

/** Die am ReactionSystem angemeldeten Materialien; Reaktionshandler greifen darüber zu. */
export interface Materials {
  earth: EarthMaterial
  fire: FireMaterial
  water: WaterMaterial
  puddle: Puddle
  ice: IceMaterial
}
