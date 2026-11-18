import { fireHeatForCharge } from '../materials/thermo.ts'
import type { Rock } from '../materials/EarthMaterial.ts'
import type { ReactionSystem } from '../materials/ReactionSystem.ts'
import { afterMeteorTemperature, meteorCharge } from './meteorRules.ts'

/**
 * Meteor-Einschlag: Der glühende Block explodiert wie ein Feuerball, dessen Stärke aus seiner Glut folgt,
 * und gibt dabei einen Teil seiner Wärme ab. Die Entscheidung `isMeteorImpact` trifft der Aufrufer.
 *
 * `meteorSpent` wird vor der Explosion gesetzt, damit mehrere Kollisionspaare im selben Physikschritt
 * nur eine Explosion auslösen. Der Block heizt sich selbst nicht mit (`exclude`), sonst würde er durch
 * seine eigene Explosion über die Schmelztemperatur kommen und zu Metall werden.
 */
export const meteorImpact = (
  system: ReactionSystem,
  rock: Rock,
  point: { x: number; y: number },
  direct: MatterJS.BodyType,
  scorch: boolean,
): void => {
  const fire = system.materials.fire
  if (!fire) return
  rock.meteorSpent = true
  const charge = meteorCharge(rock.temperatureC)
  rock.temperatureC = afterMeteorTemperature(rock.temperatureC)
  fire.detonate(point, fireHeatForCharge(charge), scorch, direct, rock)
}
