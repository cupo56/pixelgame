# Element Metall – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Metall als fünftes Element: Feuer macht Erdblöcke zu Klumpen, kurzer Klick bändigt sie zu einer 25-LP-Rüstung aus Physikplatten, gehaltener Klick schleudert die Rüstung als Spitzen-Sphäre.

**Architecture:** Reine Logik (Schutzwert, Spitzenrichtungen, Stellwerte) ist Phaser-frei und mit Vitest geprüft. Physik und Darstellung liegen in `src/metal/` (Bändigen, Platten, Sphäre) und hängen am bestehenden `ReactionSystem`/`MetalMaterial`. `MetalAttack` verbindet beides mit der Eingabe im `ElementController`.

**Tech Stack:** Phaser 4.2, Matter.js, TypeScript 7 strict, Vite 8, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-11-17-metal-element-design.md`

## Global Constraints

- `npm run build` und `npx vitest run` grün nach jedem Task.
- Spielerbewegung unverändert: Platten/Spitzen kollidieren nie mit Spieler, Gelände oder Stoffen (Kategorie `armor`, Maske nur `enemy`).
- Stellwerte in `src/config/metal.ts`; Rüstung immer 25 Punkte; Spitzen 1,5 kg, 8→24 je Ladung; Fächer ±35° zur Maus für die Hälfte der Spitzen.
- Schaden: Platten 0, kreisende Spitzen 3, geschleuderte 8→14 je Ladung, je Spitze und Gegner einmal; EP über `damageEnemy(body, amount, 'metal')`.
- Pixel-Look, deutsche Kommentare, Körper erst nach dem Physikschritt entfernen.
- Arbeit im Worktree auf Branch `feat/metall`, Auftraggeber arbeitet parallel auf `main`.

## Review Focus

1. **Rückruf (R) mit Rüstung oder laufender Sphäre** → Platten/Spitzen springen mit an den neuen Ort, keine Platte bleibt am Lager-Ursprung hängen; Test in Task 4 (Browser: R, dann Abstand Platte–Anker < 4 px).
2. **Absturz unter die Welt / Tod mit Rüstung** → Rüstung ist weg, HUD-Balken verschwindet; Test in Task 4.
3. **Bändigen, während ein Klumpen noch glüht oder rollt** → wird trotzdem erfasst und angezogen, nichts klemmt im Boden; Test in Task 5 (Klumpen direkt nach Erzeugung bändigen).
4. **Kurzer Klick mit Metall ohne Klumpen in Reichweite** → nichts passiert, keine Abklingzeit, keine Pose-Hänger; Test in Task 5.
5. **Szenen-Neustart (T) / Startmenü (Esc) während Bändigen oder Sphäre** → keine verwaisten Körper, keine Konsolenfehler, Rüstung weg; Test in Task 6.

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `src/config/metal.ts` (neu) | Stellwerte Metall |
| `src/combat/Armor.ts` + `.test.ts` (neu) | Schutzpunkte, `absorb` |
| `src/metal/spikes.ts` + `.test.ts` (neu) | reine Spitzen-Mathematik (Anzahl, Richtungen, Schaden) |
| `src/config/elements.ts`, `src/config/collision.ts` | `'metal'`, Kategorie `armor` |
| `src/ui/SkillTreePanel.ts`, `src/ui/HudBar.ts` | Metall-Icon; Rüstungsbalken |
| `src/materials/ReactionSystem.ts`, `FireMaterial.ts`, `EarthMaterial.ts`, `MetalMaterial.ts` | Direkttreffer-Hitze, Erde→Metall, Klumpen beanspruchen/freigeben |
| `src/entities/StickFigureView.ts`, `Player.ts` | Anker der Platten; Rüstung im Schadenspfad |
| `src/metal/ArmorPlates.ts` (neu) | Plattenkörper, Ankerfolge, Treffer, Bersten |
| `src/metal/MetalBending.ts` (neu) | Losreißen, Anziehen, Verschmelzen |
| `src/metal/SpikeSphere.ts` (neu) | Aufladen (Kugel) und Loslassen (Fächer + rundum) |
| `src/attacks/MetalAttack.ts` (neu) | Attack-Schnittstelle Metall |
| `src/elements/ElementController.ts`, `src/scenes/GameScene.ts` | Taste 5, Eingabe, Abbruchpfade, Rückruf/Absturz |

---

### Task 1: Reine Metall-Logik

**Files:** Create `src/config/metal.ts`, `src/combat/Armor.ts`, `src/combat/Armor.test.ts`, `src/metal/spikes.ts`, `src/metal/spikes.test.ts`

**Interfaces – Produces:**
```ts
// config/metal.ts
export const METAL = {
  bendRangeM: 5, armorPoints: 25, tearUpMs: 250, fuseMs: 400, fuseDistanceM: 0.8,
  pullSpeedMs: 9, pullResponse: 10,        // Zielgeschwindigkeit (m/s) und Nachführrate (1/s), träger mit Masse
  plateSpring: 0.45, plateSnapPx: 12,      // Anteil der Abweichung je Schritt; ab dieser Abweichung direkt setzen
  chargeMs: 2000, spikesMin: 8, spikesMax: 24, spikeMassKg: 1.5,
  spikeSpeedMinMs: 16, spikeSpeedMaxMs: 26, fanHalfRad: (35 * Math.PI) / 180,
  orbitDamage: 3, spikeDamageMin: 8, spikeDamageMax: 14,
  spikeStickMs: 1500, cooldownMs: 900, color: 0x9aa4ad,
} as const
// combat/Armor.ts
export class Armor {
  get current(): number; get max(): number; get active(): boolean   // active = current > 0
  equip(points: number): void       // setzt current = max = points
  clear(): void                     // current = 0
  /** Zieht amount ab und liefert den Rest, der ins Leben geht (nie negativ). */
  absorb(amount: number): number
}
// metal/spikes.ts
export const spikeCount = (charge: number): number              // round(lerp(8, 24, clamp01(charge)))
export const spikeSpeedMs = (charge: number): number            // lerp(16, 26)
export const spikeDamage = (charge: number): number             // round(lerp(8, 14))
/** Winkel (rad): erste Hälfte (ceil) gleichmäßig im Fächer aimRad ± fanHalfRad, Rest gleichmäßig rundum (Versatz um halben Schritt). */
export const spikeDirections = (count: number, aimRad: number, fanHalfRad: number): number[]
```

- [ ] **Step 1: Tests schreiben**
```ts
// Armor.test.ts
it('absorbiert bis 0 und gibt den Rest weiter', () => { const a = new Armor(); a.equip(25); expect(a.absorb(10)).toBe(0); expect(a.current).toBe(15); expect(a.absorb(20)).toBe(5); expect(a.current).toBe(0); expect(a.active).toBe(false) })
it('ohne Rüstung geht alles ins Leben, ungültige Werte zählen 0', () => { const a = new Armor(); expect(a.absorb(7)).toBe(7); a.equip(25); expect(a.absorb(-3)).toBe(0); expect(a.absorb(NaN)).toBe(0); expect(a.current).toBe(25) })
it('equip setzt immer auf volle Punkte, clear leert', () => { const a = new Armor(); a.equip(25); a.absorb(9); a.equip(25); expect(a.current).toBe(25); a.clear(); expect(a.active).toBe(false) })
// spikes.test.ts
it('Anzahl, Tempo, Schaden steigen mit der Ladung', () => { expect(spikeCount(0)).toBe(8); expect(spikeCount(1)).toBe(24); expect(spikeCount(2)).toBe(24); expect(spikeSpeedMs(0)).toBe(16); expect(spikeDamage(1)).toBe(14) })
it('Hälfte im Fächer zur Maus, Rest rundum', () => {
  const dirs = spikeDirections(10, 0, METAL.fanHalfRad)
  expect(dirs).toHaveLength(10)
  expect(dirs.slice(0, 5).every((a) => Math.abs(a) <= METAL.fanHalfRad + 1e-9)).toBe(true)
  const rest = dirs.slice(5).map((a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).sort((a, b) => a - b)
  for (let i = 1; i < rest.length; i++) expect(rest[i] - rest[i - 1]).toBeCloseTo((2 * Math.PI) / 5)
})
it('ungerade Anzahl: Fächer bekommt die größere Hälfte', () => { expect(spikeDirections(9, 1, METAL.fanHalfRad).slice(0, 5).every((a) => Math.abs(a - 1) <= METAL.fanHalfRad + 1e-9)).toBe(true) })
```
- [ ] **Step 2:** `npx vitest run src/combat src/metal` → FAIL (Module fehlen)
- [ ] **Step 3:** Implementieren wie oben.
- [ ] **Step 4:** `npx vitest run && npx tsc --noEmit` → grün
- [ ] **Step 5:** Commit `feat(metal): Stellwerte, Rüstungspunkte und Spitzen-Mathematik` (inkl. Spec und Plan unter `docs/superpowers/`)

---

### Task 2: Element 5 „Metall"

**Files:** Modify `src/config/elements.ts`, `src/config/collision.ts`, `src/entities/FlyingPlushEnemy.ts` (Maske), `src/ui/SkillTreePanel.ts` (Icon), `src/elements/ElementController.ts` (Taste FIVE), `src/progression/Progression.test.ts`

**Interfaces – Produces:** `ElementId` enthält `'metal'`; `ELEMENTS[4] = { id: 'metal', label: 'Metall', color: METAL.color, implemented: true }`; `COLLISION_CATEGORY.armor = 128`, `ARMOR_MASK = COLLISION_CATEGORY.enemy`; Gegnermaske um `armor` ergänzt.

- [ ] **Step 1: Test** in `Progression.test.ts`: `it('alter Spielstand ohne Metall lädt mit Metall-Startwert', …)` – Spielstand-JSON nur mit vier Elementen laden → `get('metal')` liefert `level 1, xp 0, ranks { foundation: 1 }`, die anderen bleiben erhalten.
- [ ] **Step 2:** FAIL (`'metal'` unbekannt / Typfehler)
- [ ] **Step 3:** Element, Kategorie, Icon (Amboss/Barren-Silhouette im selben SVG-Stil), `ELEMENT_KEY_NAMES` um `'FIVE'`.
- [ ] **Step 4:** `npx vitest run && npm run build` grün; Browser: Taste 5 und Mausrad wählen Metall, HUD zeigt fünf Elemente, Skillfenster hat Metall-Reiter.
- [ ] **Step 5:** Commit `feat(metal): Metall als fünftes Element (Taste 5, HUD, Skilltree)`

---

### Task 3: Feuer auf Erde → Metall

**Files:** Modify `src/materials/ReactionSystem.ts`, `src/materials/FireMaterial.ts`, `src/materials/EarthMaterial.ts`, `src/materials/MetalMaterial.ts`, `src/materials/thermo.test.ts`, `scripts/check-reactions.py`

**Interfaces – Produces:**
```ts
ReactionSystem.heatArea(center, radiusM, heatJ, direct?: MatterJS.BodyType): void   // direct erhält volle Wärme
MetalMaterial.fromEarth(rock: Substance): Substance | undefined                       // gleiche Masse/Position/Geschwindigkeit/Temperatur
```
`FireMaterial.explode` übergibt den Kollisionspartner als `direct` (neuer optionaler Parameter `explode(s, scorch, direct?)`). `EarthMaterial.heat`: ab `REACTIONS.sandMeltC` → `materials.metal.fromEarth(rock)` mit Weißblitz/Funken. `EarthMaterial.step`: Lebenszeit pausiert, solange `temperatureC > R.earthGlowC` (`expiresAt += dt`).

- [ ] **Step 1: Test** in `thermo.test.ts`: `it('geladener Volltreffer macht 0,5-m-Block zu Metall, ungeladener nicht', () => { expect(R.ambientC + solidHeatingK(R.fireHeatMaxJ, 1, 225)).toBeGreaterThanOrEqual(R.sandMeltC); expect(R.ambientC + solidHeatingK(R.fireHeatMinJ, 1, 225)).toBeLessThan(R.sandMeltC) })` (Regressionsschutz der Werte).
- [ ] **Step 2:** Lauf: PASS erwartet (Werte stimmen bereits); dient als Pin.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** Browser: Erdblock werfen, geladenen Feuerball direkt drauf → `count('earth') 0`, `count('metal') 1`, Klumpen glüht; ungeladener Feuerball → bleibt Erde, glüht; heißer Block verschwindet nicht nach 10 s. `check-reactions.py`: Szene „Feuer auf Erde → Metall" ergänzen.
- [ ] **Step 5:** Commit `feat(metal): Feuer verwandelt Erdblöcke direkt in Metall`

---

### Task 4: Rüstung – Schadenspfad, Platten, HUD

**Files:** Modify `src/entities/StickFigureView.ts`, `src/entities/Player.ts`, `src/ui/HudBar.ts`, `src/style.css`, `src/scenes/GameScene.ts`; Create `src/metal/ArmorPlates.ts`

**Interfaces – Produces:**
```ts
// StickFigureView
export interface ArmorAnchor { id: 'chest'|'upperArmFront'|'foreArmFront'|'upperArmBack'|'thighFront'|'shinFront'|'thighBack'|'shinBack'; x: number; y: number; angle: number; length: number }
armorAnchors(): ArmorAnchor[]   // aus den beim letzten draw() berechneten Gelenken, auch in Bauchlage
// Player
readonly armor: Armor
getArmorAnchors(): ArmorAnchor[]
takeDamage(amount): boolean      // erst armor.absorb, Rest ins Leben; Schutzzeit wie bisher
// ArmorPlates
export class ArmorPlates {
  constructor(scene: Phaser.Scene, player: Player)
  get equipped(): boolean
  equip(): void                    // erzeugt 8 Körper an den Ankern, armor.equip(METAL.armorPoints)
  /** Löst die Platten als Startpunkte für die Sphäre; Rüstung zählt danach nicht mehr. */
  detach(): { x: number; y: number }[]
  shatter(): void                  // Bersten mit Splittern, armor.clear()
  snapToAnchors(): void            // nach Teleport
  destroy(): void
}
// HudBar
setArmor(current: number, max: number): void   // max 0 → Balken ausgeblendet
```
Platten: `matter.add.rectangle`, `ignoreGravity`, Kategorie `armor`, Maske `ARMOR_MASK`, Label `armor-plate`. Je Physikschritt Zielgeschwindigkeit `(anker − pos) · METAL.plateSpring`, Winkel per `setAngle` auf Segmentwinkel; Abweichung > `plateSnapPx` → direkt setzen. Gegner-Kontakt mit Platte (`COLLISION_START`) → `player.takeDamage(COMBAT.contactDamage)`, Funken, Platte bekommt Gegenimpuls (federt zurück). `armor.current` erreicht 0 → `shatter()`. Darstellung: Metallfarbe, helle Oberkante, Risse proportional zu `1 − current/max`.
GameScene: `travel()` ruft danach `plates.snapToAnchors()`; Absturz (`y > WORLD.height - 70`) und Tod → `plates.shatter()` ohne Effekt-Hitstop; R behält. Neustart/Menü: `destroy()`.

- [ ] **Step 1:** Rüstungsabzug ist durch `Armor.test.ts` abgedeckt; ergänze dort `it('Schutzzeit: zweiter Treffer innerhalb 800 ms zählt nicht', …)` nur falls `takeDamage`-Logik in `Armor` wandert – sonst entfällt (Player bleibt Phaser-abhängig, Prüfung im Browser).
- [ ] **Step 2:** Implementieren; vorübergehend Testzugang: `ElementController.metalPlates` öffentlich (für Browser).
- [ ] **Step 3: Browser:**
  - `equip()` per Konsole → 8 Platten, HUD „Rüstung 25 / 25".
  - Bewegung identisch mit/ohne Rüstung: 1 s laufen + 0,7 s bremsen (Δx gleich ±1 px), Sprunghöhe (min y gleich ±1 px), Treppe in die Grotte ohne Hängenbleiben.
  - Platten bleiben beim Laufen/Springen/Bauchlage < 4 px am Anker.
  - Gegnerkontakt → Rüstung 15, Leben 100; drei Kontakte → Platten bersten, Leben 95.
  - Review Focus 1: R → Platten < 4 px am Anker. Review Focus 2: Absturz → Rüstung 0, Balken weg.
- [ ] **Step 4:** `npm run build && npx vitest run`
- [ ] **Step 5:** Commit `feat(metal): Rüstung aus Physikplatten mit 25 Schutzpunkten`

---

### Task 5: Bändigen (kurzer Klick)

**Files:** Create `src/metal/MetalBending.ts`, `src/attacks/MetalAttack.ts`; Modify `src/materials/MetalMaterial.ts`, `src/elements/ElementController.ts`

**Interfaces – Produces:**
```ts
// MetalMaterial
inRange(x: number, y: number, rangePx: number): Substance[]     // nicht versinkend, nicht beansprucht
claim(lump: Substance): void      // aus Deckel-Zählung nehmen, Maske auf 0 außer enemy, ignoreGravity
release(lump: Substance): void    // zurück auf Normalzustand (fällt)
consume(lump: Substance): void    // entfernt beim Verschmelzen (ohne Versink-Effekt)
// MetalBending
export class MetalBending {
  constructor(scene: Phaser.Scene, metal: MetalMaterial, player: Player, plates: ArmorPlates)
  get active(): boolean
  /** false, wenn kein Klumpen in Reichweite oder schon Rüstung angelegt ist. */
  begin(): boolean
  cancel(): void                   // Klumpen release(), fallen zu Boden
  destroy(): void
}
// MetalAttack implements Attack (name 'Metallbändigen', cooldownMs METAL.cooldownMs, energyJoules 0)
execute(): boolean  // = bending.begin()
```
Phasen in `MetalBending` (pro Physikschritt): Losreißen `tearUpMs` (Aufwärtsimpuls, Drehung, Staub), Anziehen (Zielgeschwindigkeit zur Brust mit seitlichem Spiralanteil, Nachführrate `pullResponse / cbrt(masse/225)`, Glühfarbe steigt), Verschmelzen sobald alle < `fuseDistanceM`: `consume()`, gezeichnete Blobs ziehen sich `fuseMs` zum Torso zusammen, dann `plates.equip()`, Ring, `hitStopOnce(35)`. Controller: Metall ist im `heldCast`-Typ enthalten; kurzer Klick → `tryAttack` → `MetalAttack.execute`; `select()`/BLUR → `bending.cancel()`; `GameScene.travel` → `bending.cancel()`.

- [ ] **Step 1:** Keine reine Logik neu; Prüfung im Browser.
- [ ] **Step 2: Browser:**
  - 2 Klumpen erzeugen (API `metal.fromEarth`), Taste 5, kurzer Klick → nach ≤ 2 s `count('metal') 0`, HUD Rüstung 25, Platten angelegt, keine Fehler.
  - Review Focus 3: Klumpen direkt nach Erzeugung (glühend, rollend) bändigen → klappt.
  - Review Focus 4: Klick ohne Klumpen in Reichweite → nichts, sofort erneut klickbar.
  - Abbruch: während Anziehen Taste 1 → Klumpen fallen, `count('metal') 2`.
  - Mit Rüstung: kurzer Klick → nichts.
- [ ] **Step 3:** Screenshots der drei Phasen.
- [ ] **Step 4:** `npm run build && npx vitest run`
- [ ] **Step 5:** Commit `feat(metal): Metallklumpen bändigen und zur Rüstung verschmelzen`

---

### Task 6: Spitzen-Sphäre (gehaltener Klick mit Rüstung)

**Files:** Create `src/metal/SpikeSphere.ts`; Modify `src/attacks/MetalAttack.ts`, `src/elements/ElementController.ts`, `src/entities/StickFigureView.ts` (Ladepose analog Luft), `src/entities/Player.ts` (`setMetalCharge`)

**Interfaces – Produces:**
```ts
export class SpikeSphere {
  constructor(scene: Phaser.Scene, player: Player, plates: ArmorPlates)
  get isCharging(): boolean; get chargeProgress(): number | undefined
  beginCharge(): boolean          // nur mit plates.equipped; detach() liefert Startpunkte
  release(aimRad: number): boolean // spikeDirections(spikeCount(q), aimRad, METAL.fanHalfRad)
  cancelCharge(): void            // Spitzen fallen als Splitter, Rüstung weg
  snapToPlayer(): void            // nach Teleport
  destroy(): void
}
MetalAttack: isCharging, chargeProgress, chargedCooldownMs, beginCharge(), cancelCharge(), release(origin, direction)
```
Kreisen: Spitzen sind Körper (Kategorie `armor`, Maske `ARMOR_MASK`, Label `metal-spike`), Zielposition auf `n` gegeneinander verkippten Bahnen um den Torso (Radius 22→40 px, Winkelgeschwindigkeit 4→11 rad/s), dahinterliegende Spitzen dunkler/kleiner gezeichnet; Anzahl wächst durch Teilen bis `spikeCount(q)`; Treffer `METAL.orbitDamage` einmal je Spitze/Gegner. Loslassen: Masse `spikeMassKg`, Tempo `spikeSpeedMs(q)`, Gravitation an, Schaden `spikeDamage(q)` je Spitze/Gegner, Rückstoß; Gelände/Erdblock → `isStatic`, `spikeStickMs` später zerbröseln; Flugzeit max 2 s. Controller: Metall läuft durch `chargedAttack()`; `beginPendingCharge` nur, wenn Rüstung angelegt; Cooldown `METAL.cooldownMs`. Abbruchpfade wie in der Spec (Elementwechsel/BLUR → `cancelCharge`, Teleport → `snapToPlayer`).

- [ ] **Step 1: Browser:**
  - Rüstung anlegen, 2 s halten → `spikes 24` kreisen, Leben-/Rüstungs-HUD: Rüstungsbalken weg ab Ladebeginn.
  - Loslassen Richtung Gegner → Gegner verliert ≥ 14 LP, Spitzen stecken im Boden und verschwinden nach ~1,5 s; Metall-EP > 0.
  - Ohne Rüstung halten → nichts.
  - Elementwechsel während Laden → Spitzen fallen, Rüstung weg.
  - Review Focus 5: T und Esc während Laden und während Bändigen → keine Fehler, keine verwaisten Körper (`getAllBodies` nach Neustart ohne `armor-plate`/`metal-spike`).
- [ ] **Step 2:** Screenshots Kugel (halb/voll geladen) und Loslassen.
- [ ] **Step 3:** `npm run build && npx vitest run`
- [ ] **Step 4:** Commit `feat(metal): Spitzen-Sphäre als aufgeladener Metallangriff`

---

### Task 7: Abschluss

**Files:** Modify `README.md`, `scripts/check-reactions.py` (falls in Task 3 nicht vollständig)

- [ ] **Step 1:** README: Metall in Steuerungstabelle (Taste 5) und Reaktionsabschnitt (Feuer auf Erde → Metall; Bändigen; Rüstung; Spitzen-Sphäre).
- [ ] **Step 2:** `npm run build && npx vitest run`; Bewegungsvergleich aus Task 4 erneut.
- [ ] **Step 3:** Commit `docs: Element Metall`

## Selbstprüfung (durchgeführt)

- Spec-Abdeckung: Erzeugung → T3; Element 5/Skilltree/HUD → T2, T4; Bändigen inkl. Phasen/Abbruch → T5; Platten/Schutz/Bersten/Teleport/Absturz → T4; Sphäre inkl. Fächer, Schaden, Verbrauch, Abbrüche → T6; Entscheidungen 1–5 nach Prüfung → T3 (1, 2), T1 (3, 4), T4–T6 (5); Prüfungen → alle.
- Typen: `Armor`, `ArmorAnchor`, `ArmorPlates`, `MetalBending`, `SpikeSphere`, `MetalAttack`, `METAL` konsistent benannt.
- Proportion: Plan etwa so lang wie die Spec; Code nur für Stellwerte, Signaturen und Tests.
