import { REACTIONS } from '../config/reactions.ts'

/** Reine Regeln der Steinmauer und der Gegner-Geschosse, ohne Phaser. */

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/** Wachsfortschritt 0 bis 1 mit weichem Anlauf und Auslauf. */
export const wallGrowthProgress = (elapsedMs: number, growMs: number): number => {
  const t = clamp01(elapsedMs / growMs)
  return t * t * (3 - 2 * t)
}

export const wallHeightAt = (progress: number, maxHeightM: number): number => clamp01(progress) * maxHeightM

/** Zielposition der Mauer: Mausposition, waagerecht auf [min, max] Abstand zum Spieler geklemmt. */
export const wallPlacementX = (mouseX: number, playerX: number, minPx: number, maxPx: number, facing = 1): number => {
  const dx = mouseX - playerX
  const side = dx === 0 ? (Math.sign(facing) || 1) : Math.sign(dx)
  return playerX + side * Math.min(maxPx, Math.max(minPx, Math.abs(dx)))
}

/** Wurfrichtung (normiert): Neigung zur Waagerechten höchstens `maxDeg`; ohne seitliche Komponente gilt `facing`. */
export const clampThrowDirection = (dx: number, dy: number, maxDeg: number, facing: number): { x: number; y: number } => {
  const side = Math.abs(dx) < 1e-6 ? Math.sign(facing) || 1 : Math.sign(dx)
  const limit = (maxDeg * Math.PI) / 180
  const angle = Math.atan2(dy, Math.max(Math.abs(dx), 1e-6))
  const clamped = Math.max(-limit, Math.min(limit, angle))
  return { x: side * Math.cos(clamped), y: Math.sin(clamped) }
}

export const wallMassKg = (widthM: number, heightM: number, depthM: number): number =>
  widthM * heightM * depthM * REACTIONS.earthDensityKgM3

/** Kantenlänge eines Würfels mit gleicher Vorderfläche; Maß für Nässe- und Hitzeschwellen. */
export const wallEquivalentEdgeM = (widthM: number, heightM: number): number => Math.sqrt(widthM * heightM)

export const wallTakeDamage = (health: number, damage: number): { health: number; broken: boolean } => {
  if (!Number.isFinite(damage) || damage <= 0) return { health, broken: health <= 0 }
  const next = Math.max(0, health - damage)
  return { health: next, broken: next <= 0 }
}

/** Zufallswert r in [0, 1] auf das Schussintervall abbilden. */
export const nextShotDelayMs = (r: number, minMs: number, maxMs: number): number => minMs + clamp01(r) * (maxMs - minMs)
