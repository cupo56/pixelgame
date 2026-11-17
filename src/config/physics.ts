// Echte Welt 1:1: Alle Spielwerte in SI-Einheiten (Meter, Sekunden, Kilogramm),
// Umrechnung in Pixel nur hier.

/** Skalierung: 1 Meter = 32 Pixel (Figur 1,8 m ≈ 58 px). */
export const PIXELS_PER_METER = 32

/** Erdbeschleunigung in m/s². */
export const GRAVITY_MS2 = 9.81

/** Fester Physik-Schritt, unabhängig von der Framerate. */
export const PHYSICS_FPS = 60

/** Matter.js skaliert Gravitation intern mit 0.001 (px/ms² pro Einheit). */
const MATTER_GRAVITY_SCALE = 0.001

export const metersToPixels = (meters: number): number => meters * PIXELS_PER_METER
export const pixelsToMeters = (pixels: number): number => pixels / PIXELS_PER_METER

/** m/s -> Matter-Geschwindigkeit (px pro Physik-Schritt). */
export const metersPerSecondToMatter = (ms: number): number =>
  (ms * PIXELS_PER_METER) / PHYSICS_FPS

/** Matter-Geschwindigkeit (px pro Physik-Schritt) -> m/s. */
export const matterToMetersPerSecond = (pxPerStep: number): number =>
  (pxPerStep * PHYSICS_FPS) / PIXELS_PER_METER

/** Wert für matter.gravity.y, ergibt exakt 9,81 m/s². */
export const MATTER_GRAVITY_Y =
  (GRAVITY_MS2 * PIXELS_PER_METER) / 1000 / (MATTER_GRAVITY_SCALE * 1000)

/** Luftwiderstand pro Schritt (Körper fällt nahezu frei wie in der Realität). */
export const AIR_DRAG = 0.001
