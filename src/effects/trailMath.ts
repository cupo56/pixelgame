/** Reine Rechnung der Bewegungsschleppen; ohne Phaser prüfbar. */
export interface TrailPoint { x: number; y: number; at: number }

/** Behält die Punkte jünger als `lifeMs`, höchstens die neuesten `maxPoints`. */
export const pruneTrail = (points: readonly TrailPoint[], nowMs: number, lifeMs: number, maxPoints = 16): TrailPoint[] => {
  const alive = points.filter((point) => nowMs - point.at < lifeMs)
  return alive.slice(Math.max(0, alive.length - maxPoints))
}
