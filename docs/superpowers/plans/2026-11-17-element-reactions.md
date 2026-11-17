# Elementreaktionen – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein zentrales Reaktionssystem, in dem Feuer, Wasser, Eis, Erde, Sand, Metall und das Windfeld Luft physikalisch aufeinander reagieren, plus eine deutlich reichere Darstellung aller Elemente.

**Architecture:** Jeder physische Stoff wird als `Substance` in einer Registry geführt (Temperatur, Masse, Nässe, Wärmeinhalt). Ein `ReactionSystem` hört einmal auf Kollisionen, schlägt in einer Reaktionstabelle nach, führt pro Physikschritt das Thermomodell aus und bietet eine Wind-API für Windstoß und Wirbelsturm. Materialfabriken (`FireMaterial`, `WaterMaterial`, …) besitzen Körper, Grafik und Lebenszeit; die Attack-Klassen zielen, laden auf und rufen `spawn`.

**Tech Stack:** Phaser 4.2, Matter.js, TypeScript 7 (strict, `erasableSyntaxOnly`, `verbatimModuleSyntax`), Vite 8, Vitest (neu, nur für reine Logik).

**Spec:** `docs/superpowers/specs/2026-11-17-element-reactions-design.md`

## Global Constraints

- `npm run build` (`tsc && vite build`) läuft nach jedem Task fehlerfrei; `npx vitest run` ebenfalls.
- Alle Stellwerte in SI-Einheiten in `src/config/reactions.ts`; Pixelumrechnung nur über `config/physics.ts`.
- Pixel-Look: Formen gerastert, Partikel über `SPARK_TEXTURE`; Kommentare und sichtbare Texte auf Deutsch.
- Körper werden erst nach dem Physikschritt entfernt (`scene.time.delayedCall(0, …)`), wie heute.
- Kollisionen über `config/collision.ts` (neue Kategorien `ice`, `sand`, `metal`), keine Umgehung über Labels.
- Budget: höchstens 240 dynamische Stoffkörper; Tropfen ≤ 120, Körner ≤ 160, Metall ≤ 6 (dauerhaft).
- `FIRE_SOLID_COUPLING ≈ 60` ist der einzige nicht-physikalische Faktor und wird im Code begründet.
- Spieler: nur der Untergrund-Reibungshook aus Task 7 darf `Player.ts` ändern; `scripts/check-movement.py` muss weiter bestehen.
- Browserprüfung: Python-Playwright ist auf diesem Rechner nicht installiert. Die `scripts/check-*.py` werden geschrieben/erhalten, die Prüfung in dieser Umgebung läuft über die Playwright-MCP-Werkzeuge gegen `npm run dev`.
- Vor Task 1 wird der aktuelle, uncommittete Arbeitsstand als Baseline committet (nur mit Freigabe des Auftraggebers).

## Review Focus

1. **Tropfen trifft Feuerball im selben Schritt wie dessen Explosion am Gelände** → genau eine Reaktion, kein Dampf *und* Druckwelle; Test in Task 4 (`quenchFire`-Reihenfolge + Doppelzünd-Set).
2. **Block zerfällt zu Sand, während er im Wirbelsturm kreist** → Körner werden sauber aus dem Wirbel gelöst, keine verwaisten Umlaufbahnen; Test in Task 8 (Registry-`unregister` löst Capture).
3. **Budget voll beim Zerfall eines geladenen Blocks** → mindestens 4 größere Körner, Masse erhalten; Test in Task 1 (`grainPlan`).
4. **Eisfläche unter dem Spieler schmilzt, während er darauf steht** → Reibungsfaktor kehrt zu 1 zurück, kein Hängenbleiben; Test in Task 7 (Hook liest pro Schritt neu).
5. **Siebter Metallblock entsteht, während der älteste gerade Gegner trägt / glüht** → ältester versinkt ohne Fehler, Registry-Zähler stimmt; Test in Task 9.

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `src/config/reactions.ts` (neu) | Alle Konstanten: Umgebung, Verdampfungswärme, Schwellen, Raten, Dichten, Deckel, Kopplung |
| `src/config/collision.ts` (ändern) | Kategorien `ice`, `sand`, `metal`; Masken/Gruppen für Körner und Scherben |
| `src/materials/thermo.ts` (neu) | Reine Rechenfunktionen des Thermomodells (testbar ohne Phaser) |
| `src/materials/thermo.test.ts` (neu) | Vitest |
| `src/materials/Substance.ts` (neu) | Typen + `SubstanceRegistry` |
| `src/materials/Substance.test.ts` (neu) | Vitest |
| `src/materials/reactions.ts` (neu) | Reaktionstabelle `REACTIONS` + `lookupReaction` |
| `src/materials/reactions.test.ts` (neu) | Vitest (Symmetrie, Vollständigkeit der Matrix) |
| `src/materials/ReactionSystem.ts` (neu) | Kollisions-Listener, Thermoschritt, Wind-API, Budget, `spawn` |
| `src/materials/FireMaterial.ts`, `WaterMaterial.ts`, `IceMaterial.ts`, `EarthMaterial.ts`, `SandMaterial.ts`, `MetalMaterial.ts`, `Puddle.ts` (neu) | je Körper + Grafik + Lebenszeit eines Stoffs |
| `src/materials/SteamEffect.ts` (neu) | Dampfwolke (nur Partikel) |
| `src/effects/decals.ts` (neu) | Brandfleck, Risse, Pfützen-/Eisflächendekal mit Ausblenden |
| `src/effects/impact.ts` (neu) | Aufprallring, Weißblitz, Druckwellenring, Hitstop-Wrapper |
| `src/effects/particles.ts` (ändern) | `smoke`, `embers`, `steam`, `sandCloud` |
| `src/attacks/FireballAttack.ts`, `WaterJetAttack.ts`, `WaterWhipAttack.ts`, `EarthRockAttack.ts`, `AirGustAttack.ts`, `AirTornadoAttack.ts` (ändern) | Zielen/Aufladen bleibt; Körper, Kollisionen und Kreuz-Callbacks wandern ins Materialsystem |
| `src/elements/ElementController.ts` (ändern) | baut `ReactionSystem`, reicht es weiter, keine Kreuz-Callbacks |
| `src/entities/Player.ts` (ändern, nur Task 7) | Untergrund-Reibungsfaktor |
| `src/entities/FlyingPlushEnemy.ts` (ändern) | Maske um `ice`/`sand`, Bremsen im Sand |
| `scripts/check-reactions.py` (neu) | szenische Browserprüfung der Matrix |
| `README.md` (ändern) | Reaktionsmatrix für Spieler |

---

### Task 1: Vitest, Konfiguration und reines Thermomodell

**Files:**
- Modify: `package.json` (devDependency `vitest`, Script `"test": "vitest run"`)
- Create: `src/config/reactions.ts`
- Create: `src/materials/thermo.ts`
- Test: `src/materials/thermo.test.ts`

**Interfaces:**
- Produces `src/config/reactions.ts`:
  ```ts
  export const REACTIONS = {
    ambientC: 15, waterBoilC: 100, waterFreezeC: 0, waterStartC: 15,
    waterLatentJPerKg: 2.26e6, dropletMassKg: 0.15,
    fireHeatMinJ: 0.3e6, fireHeatMaxJ: 4.5e6, fireWindHeatFactorMax: 1.6,
    whipWaterKg: 1.5, chargedWhipWaterKg: 4,
    gustCoolingK: 30, vortexCoolingKPerS: 60,
    iceWarmingKPerS: 4, iceStartC: -10, iceSheetMeltMs: 10_000,
    iceShardDamageSpeedMs: 6, iceShardShatterSpeedMs: 10, iceShardDamage: 3,
    puddleRestMs: 400, puddleMergePx: 20, puddleMinWidthPx: 8, puddleMaxWidthPx: 96, puddleEvaporateMs: 12_000,
    sandWaterKgPerM2: 12, sandDensityKgM3: 1600, sandGrainsPerHalfMeterBlock: 10, sandGrainsPerBlockMax: 60,
    sandGrainsMin: 4, sandSinkMs: 12_000, sandBrakeFactor: 0.6, sandCloudDamage: 1, sandCloudDamageSpeedMs: 6,
    solidHeatCapacityJPerKgK: 800, fireSolidCoupling: 60, sandMeltC: 1500,
    metalDensityKgM3: 7800, metalGlowC: 500, metalWhiteC: 1500, metalCoolingKPerS: 60, metalMax: 6,
    earthGlowC: 500, earthCoolingKPerS: 40, glowContactDamage: 4,
    budgetTotal: 240, budgetDroplets: 120, budgetGrains: 160,
  } as const
  ```
  Kommentar bei `fireSolidCoupling`: „Spielabstraktion: der Bändiger-Feuerball wirkt als anhaltende Flamme, nicht als einmaliges Energiepaket; alle anderen Werte sind physikalisch.“
- Produces `src/materials/thermo.ts` (alle rein, keine Phaser-Imports):
  ```ts
  export const quenchFire = (heatJ: number, waterKg: number): { heatJ: number; extinguished: boolean }
  export const fireChargeFraction = (heatJ: number): number           // 0 bei fireHeatMinJ, 1 bei fireHeatMaxJ, geklemmt
  export const fireHeatForCharge = (charge: number): number           // Umkehrung, linear
  export const approachAmbient = (tempC: number, rateKPerS: number, dtS: number): number
  export const coolWater = (tempC: number, deltaK: number): { tempC: number; frozen: boolean }
  export const heatWater = (tempC: number, deltaK: number): { tempC: number; boiled: boolean }
  export const sandWettingThresholdKg = (edgeM: number): number
  export const grainPlan = (edgeM: number, freeSlots: number): { count: number; grainMassKg: number; grainRadiusM: number }
  export const solidHeatingK = (heatJ: number, falloff: number, massKg: number): number   // × fireSolidCoupling / (c·m)
  export const metalEdgeM = (sandMassKg: number): number
  export const glowFraction = (tempC: number, glowC: number, whiteC: number): number
  export const puddleWidthPx = (massKg: number): number
  ```

- [ ] **Step 1: Vitest installieren und Script anlegen**

Run: `npm i -D vitest@5` und in `package.json` unter `scripts` ergänzen: `"test": "vitest run"`.

- [ ] **Step 2: Fehlschlagenden Test schreiben** (`src/materials/thermo.test.ts`)

```ts
import { describe, expect, it } from 'vitest'
import { REACTIONS as R } from '../config/reactions.ts'
import { quenchFire, fireChargeFraction, fireHeatForCharge, coolWater, heatWater, approachAmbient,
  sandWettingThresholdKg, grainPlan, solidHeatingK, metalEdgeM, glowFraction, puddleWidthPx } from './thermo.ts'

describe('Feuer und Wasser', () => {
  it('ein Tropfen löscht einen kleinen Feuerball', () => {
    expect(quenchFire(R.fireHeatMinJ, R.dropletMassKg).extinguished).toBe(true)
  })
  it('ein voll geladener Feuerball braucht 13 Tropfen', () => {
    let heat = R.fireHeatMaxJ, n = 0
    while (!quenchFire(heat, R.dropletMassKg).extinguished) { heat = quenchFire(heat, R.dropletMassKg).heatJ; n++ }
    expect(n + 1).toBe(14)   // 13 Tropfen senken Q auf ~0,09 MJ, der 14. löscht (0,34 MJ je Tropfen)
  })
  it('Q ↔ Aufladung ist linear und geklemmt', () => {
    expect(fireChargeFraction(R.fireHeatMinJ)).toBe(0)
    expect(fireChargeFraction(R.fireHeatMaxJ)).toBe(1)
    expect(fireChargeFraction(R.fireHeatMaxJ * 2)).toBe(1)
    expect(fireHeatForCharge(0.5)).toBeCloseTo((R.fireHeatMinJ + R.fireHeatMaxJ) / 2)
  })
  it('Wasser gefriert bei 0 °C und kocht bei 100 °C', () => {
    expect(coolWater(15, 30)).toEqual({ tempC: -15, frozen: true })
    expect(coolWater(15, 10).frozen).toBe(false)
    expect(heatWater(15, 90).boiled).toBe(true)
  })
  it('Temperaturen nähern sich der Umgebung ohne Überschwingen', () => {
    expect(approachAmbient(-10, 4, 10)).toBe(R.ambientC)
    expect(approachAmbient(-10, 4, 1)).toBe(-6)
    expect(approachAmbient(900, 60, 1)).toBe(840)
  })
})

describe('Erde, Sand, Metall', () => {
  it('Nässeschwelle wächst mit der Oberfläche', () => {
    expect(sandWettingThresholdKg(0.5)).toBe(3)
    expect(sandWettingThresholdKg(1.5)).toBe(27)
  })
  it('Kornplan: 10 Körner für 0,5 m, Deckel 60, Mindestens 4 bei vollem Budget, Masse erhalten', () => {
    expect(grainPlan(0.5, 999).count).toBe(10)
    expect(grainPlan(1.5, 999).count).toBe(60)
    const tight = grainPlan(1.5, 2)
    expect(tight.count).toBe(4)
    expect(tight.count * tight.grainMassKg).toBeCloseTo(1.5 ** 3 * 1800)
  })
  it('geladener Feuerball bringt ein 22,5-kg-Korn über die Schmelztemperatur', () => {
    expect(solidHeatingK(R.fireHeatMaxJ, 1, 22.5)).toBeGreaterThan(R.sandMeltC)
    expect(solidHeatingK(R.fireHeatMinJ, 1, 22.5)).toBeLessThan(R.sandMeltC)
  })
  it('Metallkante aus Sandmasse über Metalldichte', () => {
    expect(metalEdgeM(225)).toBeCloseTo(Math.cbrt(225 / 7800))
  })
  it('Glühen von 0 bei 500 °C bis 1 bei 1500 °C', () => {
    expect(glowFraction(400, 500, 1500)).toBe(0)
    expect(glowFraction(1000, 500, 1500)).toBeCloseTo(0.5)
    expect(glowFraction(2000, 500, 1500)).toBe(1)
  })
  it('Pfützenbreite wächst mit der Masse und ist gedeckelt', () => {
    expect(puddleWidthPx(R.dropletMassKg)).toBe(R.puddleMinWidthPx)
    expect(puddleWidthPx(1000)).toBe(R.puddleMaxWidthPx)
  })
})
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run src/materials/thermo.test.ts`
Expected: FAIL („Cannot find module '../config/reactions.ts'“)

- [ ] **Step 4: `src/config/reactions.ts` und `src/materials/thermo.ts` implementieren**

`grainPlan`: Wunschzahl `round(10 × (edge/0,5)²)`, gedeckelt bei 60, dann `max(4, min(wunsch, freeSlots))`; Masse = `edge³ × 1800 / count`; Radius aus Kornmasse und Sanddichte als Kugel (`cbrt(3m / (4π·1600))`). `puddleWidthPx`: `clamp(8 × (mass/0,15)^0.5, 8, 96)`.

- [ ] **Step 5: Tests grün**

Run: `npx vitest run && npm run build`
Expected: alle Tests PASS, Build ohne Fehler

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/config/reactions.ts src/materials/thermo.ts src/materials/thermo.test.ts
git commit -m "feat(materials): Konfiguration und reines Thermomodell mit Vitest"
```

---

### Task 2: Substance-Registry und Kollisionskategorien

**Files:**
- Create: `src/materials/Substance.ts`
- Test: `src/materials/Substance.test.ts`
- Modify: `src/config/collision.ts`
- Modify: `src/entities/FlyingPlushEnemy.ts:43-47` (Maske)

**Interfaces:**
- Produces:
  ```ts
  export type SubstanceKind = 'fire' | 'water' | 'ice' | 'earth' | 'sand' | 'metal'
  export interface Substance {
    readonly kind: SubstanceKind
    readonly body: MatterJS.BodyType
    temperatureC: number
    massKg: number
    /** Nur Erde: aufgenommenes Wasser. */
    wetnessKg: number
    /** Nur Feuer: Wärmeinhalt Q. */
    heatJ: number
    /** Ruhezeit auf Gelände in ms (Pfützen, Versinken). */
    restingMs: number
    readonly createdAt: number
    /** Entfernt Körper und Grafik; ruft registry.unregister nicht selbst. */
    remove(): void
  }
  export class SubstanceRegistry {
    register(s: Substance): void
    unregister(body: MatterJS.BodyType): Substance | undefined
    get(body: MatterJS.BodyType): Substance | undefined     // nutzt body.parent ?? body
    kindOf(body: MatterJS.BodyType): SubstanceKind | undefined
    all(): Substance[]
    ofKind(kind: SubstanceKind): Substance[]
    count(kind?: SubstanceKind): number
    /** Ältester ruhender Stoff einer Art (restingMs > 0), sonst ältester. */
    oldest(kind: SubstanceKind): Substance | undefined
    onRemove(listener: (s: Substance) => void): () => void
  }
  ```
- `config/collision.ts`: `COLLISION_CATEGORY` erweitert um `ice: 16, sand: 32, metal: 64`; `SAND_GROUP = -2`, `ICE_GROUP = -3` (keine Kollision untereinander); `SAND_MASK` und `ICE_MASK` = alles außer `player`; `METAL_LAUNCH_MASK` = alles außer `player` (wie `LAUNCH_MASK` der Erde).

- [ ] **Step 1: Test schreiben** (`Substance.test.ts`; Körper als `{ id, parent }`-Attrappen mit `parent = self`)

```ts
it('findet Stoffe über Teilkörper (parent)', …)           // get(child) === substance
it('zählt pro Art und gesamt', …)
it('oldest bevorzugt ruhende Stoffe', …)                    // zwei Tropfen, der jüngere ruht → oldest('water') ist der jüngere
it('unregister feuert onRemove genau einmal', …)
```

- [ ] **Step 2: Fehlschlag prüfen**

Run: `npx vitest run src/materials/Substance.test.ts` → FAIL (Modul fehlt)

- [ ] **Step 3: `Substance.ts` implementieren** (WeakMap für `get`, Set für Iteration, Listener-Set)

- [ ] **Step 4: `collision.ts` erweitern; Gegner-Maske um `ice | sand` ergänzen**

- [ ] **Step 5: Tests und Build grün**

Run: `npx vitest run && npm run build`

- [ ] **Step 6: Commit** `feat(materials): Substance-Registry und neue Kollisionskategorien`

---

### Task 3: Reaktionstabelle und ReactionSystem-Gerüst

**Files:**
- Create: `src/materials/reactions.ts`
- Test: `src/materials/reactions.test.ts`
- Create: `src/materials/ReactionSystem.ts`

**Interfaces:**
- Produces `reactions.ts`:
  ```ts
  export interface ReactionContext {
    scene: Phaser.Scene
    system: ReactionSystem          // für spawn, steam, heatArea …
    point: { x: number; y: number } // Kontaktpunkt (Mittel der Kollisions-Supports)
    now: number
  }
  export type ReactionHandler = (a: Substance, b: Substance, ctx: ReactionContext) => void
  /** Schlüssel "a:b" in kanonischer Reihenfolge der KIND_ORDER. */
  export const KIND_ORDER: readonly SubstanceKind[] = ['fire', 'water', 'ice', 'earth', 'sand', 'metal']
  export const reactionKey = (a: SubstanceKind, b: SubstanceKind): string
  export const REACTIONS: Map<string, ReactionHandler>
  /** Liefert Handler und die Stoffe in Tabellenreihenfolge, oder undefined. */
  export const lookupReaction = (a: Substance, b: Substance): { handler: ReactionHandler; first: Substance; second: Substance } | undefined
  ```
  In diesem Task enthält `REACTIONS` nur Platzhalter-Einträge (leere Handler) für alle Paare, die das Design definiert: `fire:water`, `fire:ice`, `fire:earth`, `fire:sand`, `fire:metal`, `water:earth`, `water:sand`, `water:metal`, `ice:earth`. Spätere Tasks füllen sie.
- Produces `ReactionSystem.ts`:
  ```ts
  export type WindSource = 'gust' | 'tornado'
  export class ReactionSystem {
    readonly registry: SubstanceRegistry
    constructor(scene: Phaser.Scene)
    /** Platz im Budget schaffen; false, wenn auch nach Verdrängung kein Platz ist. */
    reserve(kind: SubstanceKind): boolean
    /** Wind auf einen Stoff; true, wenn es ein registrierter Stoff war (Aufrufer überspringt dann seine Standardlogik). */
    applyWind(body: MatterJS.BodyType, direction: Phaser.Math.Vector2, strength: number, source: WindSource): boolean
    canCapture(body: MatterJS.BodyType): boolean
    capture(body: MatterJS.BodyType): boolean
    release(body: MatterJS.BodyType): void
    /** Peitsche als virtuelles Wasser mit Masse. */
    whipContact(body: MatterJS.BodyType, waterKg: number, point: { x: number; y: number }): boolean
    /** Explosionen heizen Stoffe im Radius (Abfall linear). */
    heatArea(center: { x: number; y: number }, radiusM: number, heatJ: number): void
    /** Pro Art ein Handler, den die Materialien registrieren. */
    setWindHandler(kind: SubstanceKind, handler: (s: Substance, direction: Phaser.Math.Vector2, strength: number, source: WindSource) => void): void
    setCaptureHandlers(kind: SubstanceKind, capture: (s: Substance) => boolean, release: (s: Substance) => void): void
    setHeatHandler(kind: SubstanceKind, handler: (s: Substance, deltaK: number, ctx: ReactionContext) => void): void
    onStep(listener: (dtS: number, now: number) => void): () => void   // BEFORE_UPDATE, für Thermoschritte der Materialien
    destroy(): void
  }
  ```
  Kollisionen: ein `COLLISION_START`-Listener; für jedes Paar `lookupReaction`; ein `Set<string>` aus `${idA}:${idB}` pro Schritt verhindert Doppelzündung (geleert in `BEFORE_UPDATE`). Kontaktpunkt = Mittelwert von `pair.collision.supports`, Rückfall Mittelpunkt der Positionen.

- [ ] **Step 1: Test** (`reactions.test.ts`)

```ts
it('reactionKey ist symmetrisch und folgt KIND_ORDER', () => {
  expect(reactionKey('water', 'fire')).toBe('fire:water')
  expect(reactionKey('fire', 'water')).toBe('fire:water')
})
it('alle Paare der Designmatrix haben einen Eintrag', () => {
  for (const key of ['fire:water', 'fire:ice', 'fire:earth', 'fire:sand', 'fire:metal', 'water:earth', 'water:sand', 'water:metal', 'ice:earth'])
    expect(REACTIONS.has(key)).toBe(true)
})
it('lookupReaction liefert die Stoffe in Tabellenreihenfolge', …)   // water-Attrappe, fire-Attrappe → first.kind === 'fire'
```

- [ ] **Step 2: FAIL prüfen** · **Step 3: `reactions.ts` implementieren** · **Step 4: `ReactionSystem.ts` implementieren** (noch ohne Material-Anbindung; `applyWind`/`capture` liefern false, wenn kein Handler registriert)

- [ ] **Step 5: Tests + Build grün** · **Step 6: Commit** `feat(materials): Reaktionstabelle und ReactionSystem-Gerüst`

---

### Task 4: Erde ins Materialsystem (Verhalten unverändert)

**Files:**
- Create: `src/materials/EarthMaterial.ts`
- Modify: `src/attacks/EarthRockAttack.ts` (entfernen: `rocks`-Map, `isRock`, `captureInTornado`, `releaseFromTornado`, `pushWithAir`, `supportY`, `onCollision`, `impact`, `remove`; `launch` ruft `earth.adopt(...)`)
- Modify: `src/attacks/AirGustAttack.ts:99-116` (`pushEarthBlock`-Callback → `system.applyWind`)
- Modify: `src/attacks/AirTornadoAttack.ts` (`TornadoRocks` → `ReactionSystem`-Methoden `canCapture/capture/release`)
- Modify: `src/elements/ElementController.ts:38-50` (Konstruktion mit `ReactionSystem`)

**Interfaces:**
- Produces:
  ```ts
  export class EarthMaterial {
    constructor(scene: Phaser.Scene, system: ReactionSystem, playerBody: MatterJS.BodyType)
    /** Übernimmt einen frisch gestarteten Block (Körper + Rechteck) aus EarthRockAttack. */
    adopt(body: MatterJS.BodyType, shape: Phaser.GameObjects.Rectangle, charge: number, edgeM: number): Substance
    destroy(): void
  }
  ```
  Zieht aus `EarthRockAttack` um: `Rock`-Verwaltung (Lebenszeit 10 s, Schonfrist, `LAUNCH_MASK → ALL`), Aufprall (`impact`: Schaden, Staub, Shake), Windschub (`pushWithAir` inkl. `supportY`), Capture/Release. Registriert sich mit `setWindHandler('earth')` und `setCaptureHandlers('earth')`.
- Konstruktorsignaturen neu:
  - `new EarthRockAttack(scene, playerBody, earth: EarthMaterial, onLaunch)`
  - `new AirGustAttack(scene, playerBody, system: ReactionSystem, getPose)`
  - `new AirTornadoAttack(scene, playerBody, getPose, system: ReactionSystem)`

- [ ] **Step 1: `EarthMaterial.ts` schreiben** (Code aus `EarthRockAttack` verschieben, `Substance` mit `kind: 'earth'`, `massKg` aus Kante, `temperatureC: 15`, `wetnessKg: 0`)

- [ ] **Step 2: `EarthRockAttack.launch` auf `adopt` umstellen, alte Mitglieder löschen**

- [ ] **Step 3: Gust/Tornado auf die System-API umstellen**; in `AirGustAttack.pushBodies`: `if (this.system.applyWind(body, direction, strength, 'gust')) { coneBurst(...); continue }`. Im Tornado: `this.rocks.has(body)` → `system.canCapture(body)`, `capture` → `system.capture`, `release` → `system.release`.

- [ ] **Step 4: `ElementController` verdrahten**: `const system = new ReactionSystem(scene)`, `const earth = new EarthMaterial(scene, system, player.body)`, dann Attacken; `destroy` ruft `system.destroy()` nach den Attacken.

- [ ] **Step 5: Build + Browserprüfung**

Run: `npm run build`; `npm run dev` starten, mit Playwright-MCP: Erde werfen (Klick), geladenen Block werfen, Windstoß auf liegenden Block (Block rutscht), Tornado über Block (Block kreist und wird geschleudert). Erwartung: identisches Verhalten wie vor dem Task, keine Konsolenfehler.

- [ ] **Step 6: Commit** `refactor(materials): Erdblöcke über EarthMaterial und ReactionSystem`

---

### Task 5: Feuer und Wasser ins Materialsystem, mengenabhängiges Löschen, Dampf

**Files:**
- Create: `src/materials/FireMaterial.ts`, `src/materials/WaterMaterial.ts`, `src/materials/SteamEffect.ts`
- Modify: `src/effects/particles.ts` (`steam(scene, x, y, count)`: helle, nicht additive Partikel, `gravityY` negativ ≈ −40 px/s², Lebensdauer 700–1200 ms, Skalierung 1 → 2,2)
- Modify: `src/attacks/FireballAttack.ts` (entfernen: `flights`, `launch`-Körperteil, `drawFlight`, `onCollision`, `checkHit`, `fizzle`, `explode`, `retire`, `remove`, `extinguish`; `launch` → `fire.spawn(origin, direction, heatJ)`)
- Modify: `src/attacks/WaterJetAttack.ts` (entfernen: `droplets`, `spawnDroplet`-Körperteil, `onCollision`, `splash`, `remove`, `dispose`; Konstruktor ohne `extinguish`)
- Modify: `src/attacks/WaterWhipAttack.ts:1044-1057` (`extinguish(body)` → `system.whipContact(body, waterKg, point)`)
- Modify: `src/materials/reactions.ts` (Handler `fire:water` füllen)
- Modify: `src/elements/ElementController.ts`

**Interfaces:**
- Produces:
  ```ts
  export class FireMaterial {
    constructor(scene: Phaser.Scene, system: ReactionSystem)
    spawn(origin: Vector2Like, direction: Phaser.Math.Vector2, heatJ: number): Substance | undefined
    /** Explosion mit Schaden/Radius/Impuls aus fireChargeFraction(heatJ). */
    explode(s: Substance): void
    /** Erlöschen: nur Dampf, keine Druckwelle. */
    quench(s: Substance): void
    destroy(): void
  }
  export class WaterMaterial {
    constructor(scene: Phaser.Scene, system: ReactionSystem)
    spawnDroplet(x: number, y: number, angle: number, speedMs: number): Substance | undefined
    /** Tropfen verdampft: Dampf + entfernen. */
    evaporate(s: Substance): void
    destroy(): void
  }
  ```
- `fire:water`-Handler: `const q = quenchFire(fire.heatJ, water.massKg)`; `water` → `evaporate`; `fire.heatJ = q.heatJ`; wenn `q.extinguished` → `fire.quench(fire)`. Fireball-Kollision mit allem anderen Nicht-Sensor (Gelände, Gegner, Erde…) → `explode` (dies bleibt im `FireMaterial` als eigener Kollisionspfad, da kein Stoffpaar).
- `whipContact(body, kg, point)`: ist `body` Feuer → wie `fire:water` mit `kg`; ist `body` Erde → Nässe (Task 8); sonst false.
- Tropfen gegen Gegner: Schaden `COMBAT.waterDamage`, Spritzer; Tropfen bleibt bei Geländekontakt erhalten (für Pfützen in Task 6).
- `FireballAttack.launch` ruft `fire.spawn(origin, dir, fireHeatForCharge(charge))`; Peitsche: `whipWaterKg` bzw. `chargedWhipWaterKg` bei `charge >= 1`.

- [ ] **Step 1: Test ergänzen** in `thermo.test.ts`: `it('Peitschentreffer löscht einen vollen Feuerball', () => expect(quenchFire(R.fireHeatMaxJ, R.chargedWhipWaterKg).extinguished).toBe(true))` und `it('normale Peitsche löscht einen halb geladenen', …)` mit `fireHeatForCharge(0.5)` und `whipWaterKg`.

- [ ] **Step 2: FAIL prüfen** (zweiter Test schlägt fehl, falls Werte nicht passen → ggf. `whipWaterKg` ist 1,5 kg = 3,39 MJ ≥ 2,4 MJ, also PASS erwartet; dann nur Regressionsschutz)

- [ ] **Step 3: `FireMaterial`, `WaterMaterial`, `SteamEffect`, `particles.steam` schreiben**; Feuerball-Darstellung zunächst 1:1 aus `drawFlight` übernehmen (Task 11 ersetzt sie).

- [ ] **Step 4: Attacken verschlanken, `ElementController` verdrahten** (`fire`, `water` Materialien vor den Attacken bauen; `WaterJetAttack` erhält `water: WaterMaterial`, `WaterWhipAttack` erhält `system`).

- [ ] **Step 5: Build + Browserprüfung**: kleiner Feuerball + ein Tropfen → Dampf, kein Ring; geladener Feuerball in Dauerstrahl → fliegt durch die ersten Tropfen (schrumpft sichtbar), erlischt nach ~13; Peitsche löscht alles; Feuer am Gelände explodiert wie vorher.

- [ ] **Step 6: Commit** `feat(materials): Feuer und Wasser mit Wärmeinhalt, mengenabhängiges Löschen, Dampf`

---

### Task 6: Pfützen

**Files:**
- Create: `src/materials/Puddle.ts`
- Create: `src/effects/decals.ts` (`puddleDecal(scene, x, y, widthPx): Graphics` mit welliger Glanzlinie; `fadeOut(view, ms)`)
- Modify: `src/materials/WaterMaterial.ts` (Ruhezeit, Zusammenführen)

**Interfaces:**
```ts
export interface PuddleState { x: number; y: number; massKg: number; temperatureC: number; widthPx: number; lastFedAt: number }
export class Puddle {
  constructor(scene: Phaser.Scene, system: ReactionSystem)
  /** Tropfen am Boden aufnehmen: vorhandene Pfütze ≤ puddleMergePx oder neue. */
  absorb(x: number, y: number, massKg: number, tempC: number): void
  at(x: number, y: number): PuddleState | undefined
  /** Für Feuer: verdampft bis zu kg, liefert tatsächlich verdampfte Masse. */
  evaporate(p: PuddleState, kg: number): number
  all(): PuddleState[]
  destroy(): void
}
```
Pfützenkörper: statischer Sensor (Höhe 3 px, Breite `puddleWidthPx`), Label `puddle`, als `Substance` mit `kind: 'water'` registriert, damit die Tabelle greift (Feuer trifft Pfütze → anteilig verdampfen, Feuer explodiert normal). Tropfen: `restingMs` zählt hoch, wenn `speed < 0,2 m/s` und Geländekontakt (COLLISION_ACTIVE mit statischem Nicht-Sensor); ab `puddleRestMs` → `absorb`, Tropfen entfernen. Pfütze ohne Nachschub `puddleEvaporateMs` → Dekal ausblenden, Körper entfernen.

- [ ] **Step 1: Test** in `thermo.test.ts` bereits (`puddleWidthPx`); zusätzlich reine Funktion `mergeTarget(puddles, x, y, mergePx)` in `thermo.ts` testen: nächste Pfütze innerhalb 20 px wird gewählt, sonst undefined.
- [ ] **Step 2: FAIL** · **Step 3: implementieren** · **Step 4: Build + Browser**: Wasser auf den Boden sprühen → nach ~0,5 s bildet sich eine Pfütze, wächst, verschwindet nach 12 s; Feuerball in Pfütze → Dampf + Explosion.
- [ ] **Step 5: Commit** `feat(materials): Pfützen aus ruhendem Wasser`

---

### Task 7: Eis – Windkühlung, Scherben, Eisflächen, Spieler rutscht, Feuer schmilzt

**Files:**
- Create: `src/materials/IceMaterial.ts`
- Modify: `src/materials/WaterMaterial.ts` (Windhandler: Stoß + Kühlung; `freeze(s)` → `ice.fromDroplet`)
- Modify: `src/materials/Puddle.ts` (Temperatur; ≤ 0 → `ice.sheetFromPuddle`)
- Modify: `src/materials/reactions.ts` (`fire:ice`, `ice:earth`)
- Modify: `src/attacks/AirTornadoAttack.ts` (Wirbel hält Tropfen/Scherben: `canCapture` liefert für `water`/`ice` true; Kühlung `vortexCoolingKPerS × dt` pro gefangenem Tropfen)
- Modify: `src/entities/Player.ts:149-176, 311-324` (Untergrund-Reibungsfaktor)
- Modify: `src/effects/decals.ts` (`iceSheetDecal`)

**Interfaces:**
```ts
export class IceMaterial {
  constructor(scene: Phaser.Scene, system: ReactionSystem)
  fromDroplet(water: Substance): Substance          // Scherbe an gleicher Stelle, gleiche Geschwindigkeit, temperatureC = iceStartC
  sheetFromPuddle(p: PuddleState): void             // statische Platte, friction 0, Label 'ice-sheet', Breite = Pfützenbreite
  melt(s: Substance): void                          // Scherbe → Tropfen, Fläche → Pfütze
  destroy(): void
}
```
Scherbe: Kreis `DROPLET_RADIUS_M`, `friction 0.02`, `restitution 0.3`, Kategorie `ice`, `ICE_MASK`, `ICE_GROUP`. Pro Schritt `approachAmbient(…, iceWarmingKPerS)`; > 0 °C → `melt`. Aufprall ≥ `iceShardDamageSpeedMs` auf Gegner → `iceShardDamage`; ≥ `iceShardShatterSpeedMs` → Eispartikel + entfernen. `fire:ice` → `melt` + Dampf, Feuer explodiert. `ice:earth` → Scherbe zerspringt.

Spieler-Hook in `Player.ts`:
```ts
/** Reibungsfaktor des Untergrunds (1 = normal, Eis ≈ 0,08); skaliert Bremsen und Beschleunigen am Boden. */
private groundFriction(obstacles: MatterJS.BodyType[]): number
```
Liest pro Schritt den Körper unter den Füßen (gleiche Sonde wie `isGrounded`); Label `ice-sheet` → `REACTIONS.iceFriction` (neuer Wert `iceFriction: 0.08` in `config/reactions.ts`). In `groundSpeed` werden `stopDecelMs2` und `groundAccelMs2` mit dem Faktor multipliziert.

- [ ] **Step 1: Test** in `thermo.test.ts`: `it('ein voller Windstoß aus der Nähe friert einen Tropfen', () => expect(coolWater(R.waterStartC, R.gustCoolingK * 1).frozen).toBe(true))`, `it('Scherbe schmilzt nach gut 6 s', …)` (Schleife `approachAmbient(-10, 4, 1/60)` bis > 0, erwarte 2,5 s ≤ t ≤ 2,6 s – **Achtung:** Spec sagt „~8 s“; mit −10 °C Start und 4 K/s sind es 2,5 s. Setze `iceStartC: -30` in Task 1 nach, damit ~7,5 s herauskommen, und passe die Erwartung an.)
- [ ] **Step 2: FAIL** · **Step 3: implementieren** · **Step 4: Build + Browser**: Tropfen in der Luft mit Windstoß → Scherben fallen, rutschen; Pfütze + Windstoß → Eisfläche; Spieler rutscht darauf aus (Stoppweg sichtbar länger); Feuer auf Eisfläche → Pfütze + Dampf.
- [ ] **Step 5: `scripts/check-movement.py` gedanklich gegenprüfen**: normaler Boden liefert Faktor 1 → identische Werte. Zusätzlich in Browser: Anlauf/Stopp auf normalem Boden messen (Playwright-MCP: Position nach 1 s Laufen + 0,5 s Stopp, mit Werten vor dem Task vergleichen; Abweichung < 1 px).
- [ ] **Step 6: Commit** `feat(materials): Eis aus windgekühltem Wasser, Eisflächen, rutschender Spieler`

---

### Task 8: Erde + Wasser → Sand; Sand bremst, verweht, versinkt

**Files:**
- Create: `src/materials/SandMaterial.ts`
- Modify: `src/materials/EarthMaterial.ts` (Nässe, Farbe, Zerfall)
- Modify: `src/materials/reactions.ts` (`water:earth`, `water:sand`)
- Modify: `src/materials/ReactionSystem.ts` (`whipContact` für Erde)
- Modify: `src/entities/FlyingPlushEnemy.ts` (Bremsen bei Kontakt mit `sand`: in `fly` Geschwindigkeit × `sandBrakeFactor`, wenn COLLISION_ACTIVE mit Sand im Schritt)
- Modify: `src/effects/particles.ts` (`sandCloud`)

**Interfaces:**
```ts
export class SandMaterial {
  constructor(scene: Phaser.Scene, system: ReactionSystem)
  /** Block zerbröselt: Körner innerhalb der Blockfläche, Plan aus grainPlan(edgeM, freie Plätze). */
  fromEarth(earth: Substance, edgeM: number): Substance[]
  /** Alle Körner im Radius mit temperatureC ≥ sandMeltC zu Metall verschmelzen (Task 9 füllt). */
  destroy(): void
}
```
`water:earth`: `earth.wetnessKg += water.massKg`; Tropfen entfernen (Spritzer); Blockfarbe = Mischung `ROCK_COLOR → 0x5e4b3a` nach `wetness/threshold`; bei `wetnessKg ≥ sandWettingThresholdKg(edge)` → `sand.fromEarth`, Block entfernen (Registry-`unregister` löst ggf. Wirbel-Capture über `onRemove`). Körner: Kreise aus `grainPlan`, Kategorie `sand`, `SAND_MASK`, `SAND_GROUP`, `friction 0.6`, `restitution 0.05`. Windhandler `sand`: Δv wie Erde ohne Massenwurzel + Auftrieb `AIR_LIFT_MS`; fliegende Körner ≥ `sandCloudDamageSpeedMs` gegen Gegner → `sandCloudDamage` (einmal pro Korn und Gegner). `restingMs ≥ sandSinkMs` → Staubpuff, entfernen. Wirbel fängt Körner (`canCapture` true).

- [ ] **Step 1: Test** `grainPlan` existiert; ergänze `it('Nässe erreicht die Schwelle nach 20 Tropfen beim kleinen Block', () => expect(Math.ceil(sandWettingThresholdKg(0.5) / R.dropletMassKg)).toBe(20))`.
- [ ] **Step 2: FAIL/PASS prüfen** · **Step 3: implementieren** · **Step 4: Build + Browser**: Block werfen, ~0,5 s Wasser darauf → Block dunkelt, zerfällt in Haufen; Gegner in Haufen drücken (Windstoß) → sichtbar langsamer; Windstoß auf Haufen → Sandwolke; Haufen versinkt nach 12 s. Review Focus 2: Block im Tornado nass machen → Körner lösen sich sauber.
- [ ] **Step 5: Commit** `feat(materials): Erde wird mit Wasser zu Sand`

---

### Task 9: Sand + Feuer → Metall; Glühen, Abprallen, Wasser auf heißem Metall

**Files:**
- Create: `src/materials/MetalMaterial.ts`
- Modify: `src/materials/SandMaterial.ts` (Hitze, Verschmelzen)
- Modify: `src/materials/EarthMaterial.ts` (Hitze, Glühen, Kontaktschaden)
- Modify: `src/materials/FireMaterial.ts` (`explode` ruft `system.heatArea`; Kollision mit `metal` → Reflexion statt Explosion)
- Modify: `src/materials/reactions.ts` (`fire:earth`, `fire:sand`, `fire:metal`, `water:metal`)

**Interfaces:**
```ts
export class MetalMaterial {
  constructor(scene: Phaser.Scene, system: ReactionSystem)
  /** Verschmilzt Körner: Masse summiert, Kante metalEdgeM, Position = Massenschwerpunkt; ab 7. Block versinkt der älteste. */
  fromGrains(grains: Substance[]): Substance
  destroy(): void
}
```
`heatArea(center, radiusM, heatJ)`: für jeden Stoff mit `setHeatHandler` im Radius `ΔK = solidHeatingK(heatJ, falloff, massKg)`. Sand-Heathandler: Temperatur erhöhen; danach alle Körner im Radius mit `temperatureC ≥ sandMeltC` sammeln (≥ 1) → `metal.fromGrains`, Körner entfernen, weißer Blitz, 200-ms-Tween der Korn-Grafiken zur Mitte. Erde/Metall: `temperatureC` erhöhen; `approachAmbient` mit `earthCoolingKPerS`/`metalCoolingKPerS`; Zeichnung mischt Farbe nach `glowFraction` (dunkelrot 0x7a1e0a → orange 0xff8a1f → gelb 0xffe28a) plus additiver Schein; ≥ `metalGlowC` Kontaktschaden `glowContactDamage` an Gegner (COLLISION_START, einmal pro 500 ms und Gegner). `fire:metal`: Feuerball wird gespiegelt (Geschwindigkeit an der Kontaktnormalen reflektiert, ×0,8), Metall erhitzt um `solidHeatingK(fire.heatJ, 1, metal.massKg)`, Feuer verliert 20 % Q. `water:metal` bei Metall ≥ 100 °C: Tropfen verdampft, Metall −`solidHeatingK(waterLatent × kg, 1, mass)`. Metall: Kategorie `metal`, `METAL_LAUNCH_MASK` → nach Schonfrist alle; keine Lebenszeit; `metalMax` 6, Verdrängung = ältester mit 300-ms-Absinken + Staub.

- [ ] **Step 1: Test** in `thermo.test.ts`: `it('zehn Körner à 22,5 kg ergeben einen Metallwürfel von ~31 cm', () => expect(metalEdgeM(225)).toBeCloseTo(0.306, 2))`; `it('Wind-Q-Deckel', () => …)` (siehe Task 10 – hier nur Metall).
- [ ] **Step 2: FAIL/PASS** · **Step 3: implementieren** · **Step 4: Build + Browser**: Sandhaufen, geladener Feuerball → Blitz, Metallblock; kleiner Feuerball auf Metall → prallt ab, Block glüht; Wasser auf glühendes Metall → Dampf; sieben Blöcke erzeugen (per Konsole `testScene.elements.system` zugänglich machen) → ältester versinkt (Review Focus 5).
- [ ] **Step 5: Commit** `feat(materials): Sand schmilzt zu Metall; glühende Festkörper`

---

### Task 10: Luft + Feuer

**Files:**
- Modify: `src/materials/FireMaterial.ts` (Windhandler `fire`)
- Modify: `src/attacks/AirGustAttack.ts:99-104` (Sensoren nicht mehr pauschal überspringen: `if (body.isSensor && !this.system.registry.get(body)) continue`)
- Modify: `src/attacks/AirTornadoAttack.ts` (optional: `canCapture('fire')` → Feuerwirbel; **Ausbaustufe, nur wenn Zeit**)

Windhandler Feuer: `Δv = IMPULSE_NS × strength / massKg` in Windrichtung (wie Gegner); `heatJ = min(heatJ × (1 + 0,15 × strength), fireHeatForCharge(1) × fireWindHeatFactorMax)`; Radius folgt Q (`FireMaterial` zeichnet Radius aus `fireChargeFraction`, Körper per `matter.body.scale` anpassen).

- [ ] **Step 1: Test**: `it('Wind vergrößert Q höchstens auf das 1,6-Fache des Maximums', …)` mit reiner Hilfsfunktion `windFeedHeat(heatJ, strength)` in `thermo.ts`.
- [ ] **Step 2: FAIL** · **Step 3: implementieren** · **Step 4: Build + Browser**: Feuerball werfen, sofort Windstoß hinterher → Ball beschleunigt, wird größer, Explosion stärker.
- [ ] **Step 5: Commit** `feat(materials): Wind nährt Feuer`

---

### Task 11: Darstellung Feuer

**Files:**
- Modify: `src/materials/FireMaterial.ts` (Zeichnung), `src/effects/particles.ts` (`smoke`, `embers`), `src/effects/decals.ts` (`scorchDecal`), `src/effects/impact.ts` (neu: `flash`, `shockwaveRing`, `hitStopOnce`)

**Interfaces:**
```ts
// effects/impact.ts
export const flash = (scene, x, y, radiusPx, durationMs = 34): void          // weißer Kreis, additiv, 2 Frames
export const shockwaveRing = (scene, x, y, fromPx, toPx, durationMs, color): void
export const impactRing = (scene, x, y, color): void                            // 12 → 24 px, 160 ms
export const hitStopOnce = (scene, durationMs): void                            // ignoriert, solange einer läuft
// effects/particles.ts
export const smoke = (scene, x, y, count, riseSpeedPx): void                    // dunkelgrau 0x2b2b33→0x6b6b75, NORMAL blend, 1200 ms
export const embers = (scene, x, y, count): void                                // Glut mit Gravitation
// effects/decals.ts
export const scorchDecal = (scene, x, y, radiusPx): void                         // 6 s Ausblenden
```
Feuerball: 3–4 Flammenzungen als Polygone (`fillPoints`), Spitzen pro Frame um ±2 px gewürfelt, Zungenzahl `3 + round(charge)`, Länge `radius × 1.8` entgegen der Flugrichtung; additiver Schein; Rauch alle 40 ms 1–2 Partikel hinter dem Ball; Glut alle 90 ms. Explosion: `flash`, `shockwaveRing(r → r×3, 220 ms)`, `smoke(…)` Pilz, `embers`, `scorchDecal` wenn Kontakt mit statischem Körper; `hitStopOnce(50)` bei `fireChargeFraction ≥ 0,5`. Erlöschen: Dampf + Zisch-Partikel (weiß, schnell, kurz).

- [ ] **Step 1: implementieren** · **Step 2: Build + Browser-Screenshots** (klein, geladen, Explosion, Erlöschen) · **Step 3: Commit** `feat(fx): Feuerdarstellung mit Flammenzungen, Rauch, Druckwelle, Brandflecken`

---

### Task 12: Darstellung Wasser, Eis, Dampf

**Files:**
- Modify: `src/materials/WaterMaterial.ts` (Tropfen als gestreckte Ellipse: Länge `r × (1 + speedMs/6)`, Rotation = Flugrichtung, Glanzpunkt; Nachbarlinien < 14 px, höchstens 1 Linie pro Tropfen zum nächsten Nachbarn; Aufprall: `impactRing` klein + Spritzer)
- Modify: `src/materials/IceMaterial.ts` (Scherbe als unregelmäßiges Sechseck, 0xd8f6ff mit weißer Kante; Eisfläche mit Rissen)
- Modify: `src/materials/Puddle.ts` (wellige Glanzlinie, 2-px-Animation)
- Modify: `src/materials/SteamEffect.ts` (Ausdehnung, Aufstieg)

- [ ] **Step 1: implementieren** · **Step 2: Build + Screenshots** (Strahl, Pfütze, Scherben, Eisfläche, Dampf) · **Step 3: Commit** `feat(fx): Wasser-, Eis- und Dampfdarstellung`

---

### Task 13: Darstellung Luft, Erde, Sand, Metall und Treffer-Feedback

**Files:**
- Modify: `src/attacks/AirGustAttack.ts` (3–4 Windstreifen-Bögen 240 ms über eine kleine `GustStreaks`-Grafik; Bodenstaub entlang des Kegels: für jeden statischen Körper im Kegel ein `dust` an dessen Oberkante)
- Modify: `src/materials/EarthMaterial.ts` (Aufprall ≥ 3 m/s auf Gelände → `crackDecal` + 2–4 Geröllpartikel; Tropfenläufe bei Nässe als dunkle vertikale Linien)
- Modify: `src/materials/SandMaterial.ts` (zwei Sandtöne 0xd9c3a0/0xb8a079, Haufenwirkung durch Überlappung), `src/materials/MetalMaterial.ts` (0x4a4f57, Oberkante 0x8a9099, Glanzstreifen, Glühen, Hitzeflimmer-Partikel ≥ glowC)
- Modify: alle Stellen mit `damageEnemy(...)`-Erfolg in Materialien → `impactRing(scene, x, y, elementColor)`; `hitStopOnce(35)` bei geladenem Erdblock-Treffer (`charge ≥ 0.5`).
- Modify: `src/effects/decals.ts` (`crackDecal` aus `EarthRockAttack.crackGround` verallgemeinert)

- [ ] **Step 1: implementieren** · **Step 2: Build + Screenshots** · **Step 3: Commit** `feat(fx): Luft-, Erde-, Sand-, Metalldarstellung und Treffer-Feedback`

---

### Task 14: Browserprüfung, README, Aufräumen

**Files:**
- Create: `scripts/check-reactions.py` (Stil wie `check-grenzland.py`; nutzt `testScene.elements.system.registry.count(kind)`, dafür `ElementController.system` als `readonly` öffentlich machen)
- Modify: `README.md` (Abschnitt „Elementreaktionen“ mit der Matrix aus der Spec, Steuerung unverändert)
- Modify: `src/attacks/explosion.ts` → `applyBlast` bleibt; prüfen, dass `FireballAttack`, `WaterJetAttack`, `EarthRockAttack` keine toten Importe/Member mehr haben (`noUnusedLocals` erzwingt das)

Szenen im Skript (jede mit `travel` an eine freie Stelle rechts vom Lager, `page.mouse` zum Zielen, `page.mouse.down/up` für Angriffe, `page.keyboard.press('2')` usw.):
1. Feuer (2) klicken, sofort Wasser (3) klicken in dieselbe Richtung → nach 600 ms `count('fire') === 0`, keine Shake-Spur nötig; Screenshot `reaktion-loeschen.png`.
2. Wasser 1 s auf den Boden → `puddles ≥ 1`; Luft (4) klicken auf die Pfütze → Körper mit Label `ice-sheet` vorhanden.
3. Erde (1) klicken, dann Wasser 1 s auf den Block → `count('earth') === 0 && count('sand') ≥ 4`.
4. Feuer halten 2,2 s, loslassen auf den Haufen → `count('metal') === 1`.
5. `errors == []`.

- [ ] **Step 1: Skript schreiben** · **Step 2: Szenen mit Playwright-MCP manuell durchspielen (gleiche Schritte), Screenshots in `artifacts/`** · **Step 3: README** · **Step 4: `npm run build && npx vitest run`** · **Step 5: Commit** `test: Browserprüfung der Elementreaktionen; docs: Reaktionsmatrix`

---

## Selbstprüfung (durchgeführt)

- **Spec-Abdeckung:** Matrix-Zellen → Tasks 5 (Feuer/Wasser), 6 (Pfütze), 7 (Eis), 8 (Sand), 9 (Metall, Feuer+Erde, Feuer+Metall, Wasser+Metall), 10 (Luft+Feuer); Luft+Erde/Sand/Eis/Wasser → 4, 7, 8; Darstellung → 11–13; Treffer-Feedback → 13; Budget → 3 (`reserve`) + 8; Spieler-Hook → 7; Prüfung → 1–3 (Vitest), 14 (Browser). Feuerwirbel bleibt optional (Task 10).
- **Abweichung von der Spec gefunden:** `iceStartC: -10` ergibt mit 4 K/s nur 2,5 s Schmelzzeit statt „~8 s“; Task 7 setzt `-30` (≈ 7,5 s). Spec-Wert war eine Schätzung, Zielverhalten (~8 s) bleibt.
- **Typen:** `Substance`, `SubstanceRegistry`, `ReactionSystem`-Methoden, Material-Konstruktoren `(scene, system[, playerBody])` sind in allen Tasks gleich benannt.
- **Proportion:** Plan ≈ 1,3× Spec-Länge; Code nur für Konfigurationswerte, Tests und Signaturen.
