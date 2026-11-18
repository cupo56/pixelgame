# Element-Kombos – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vier Kombos (Meteor, Hagel, Steinhagel, Feuerwirbel) über Träger-Nutzlast-Veredlung: Block-Schaden folgt der Wucht, Gegner können nass werden und durch Kälte einfrieren, der Wirbel feuert Blöcke als Salve ab und nimmt Feuer auf, eine dezente Markierung zeigt, welche Blöcke ein Windstoß träfe.

**Architecture:** Reine Logik (Wucht, Zustände, Meteor-Regeln, Wirbel-Rechnung) liegt in Phaser-freien Dateien und ist mit Vitest geprüft. Physik und Darstellung hängen am bestehenden `ReactionSystem` (`applyWind`, `capture`, `heatSubstance`, `heatArea`); die Attacken bekommen keine neuen Callbacks zueinander.

**Tech Stack:** Phaser 4.2, Matter.js, TypeScript 7 strict, Vite 8, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-11-18-element-combos-design.md`

## Global Constraints

- `npm run build` und `npx vitest run` grün nach jedem Task; bestehende Browserprüfungen (`check-movement.py`, `check-grenzland.py`, `check-reactions.py`, `check-skills-menu.mjs`) bleiben grün.
- Schaden sinkt nie unter den heutigen Festwert (Wucht ist nur Steigerung).
- Spielerbewegung unverändert; keine neuen Kollisionen mit dem Spieler.
- Reine Logik importiert weder Phaser noch Szenen (sonst nicht mit Vitest ladbar); Phaser-Teile sind dünne Hüllen darum.
- Stellwerte nur in `src/config/combos.ts`; SI-Einheiten, Umrechnung nur über `config/physics.ts`.
- Körperbudget aus `config/reactions.ts` (240) bleibt maßgeblich; keine neuen dynamischen Körperarten.
- Pixel-Look, deutsche Kommentare, Körper erst nach dem Physikschritt entfernen (`delayedCall(0, …)`).
- EP-Vergabe über `damageEnemy`; der Gegner gibt weiter höchstens seine Start-LP als EP ab (Wucht lässt sich nicht farmen).
- Arbeit auf Branch `feat/kombos`.

## Review Focus

1. **Meteor zündet doppelt:** `impact()` läuft für beide Reihenfolgen des Kollisionspaars und für mehrere Paare im selben Schritt. `meteorSpent` muss sofort gesetzt werden; Test in Task 3 (zwei Paare, eine Explosion).
2. **Meteor trifft den Spieler oder eigene Nähe:** kein Selbstschaden, `applyBlast` überspringt `label === 'player'`; Test in Task 3.
3. **Salve ohne Block:** Ein Wirbel mit nur gefangenen Gegnern (kein Block) löst keine Salve aus, der Klick wird ein normaler Windstoß; Test in Task 4.
4. **Feuerball im Wirbel:** explodiert nicht an kreisenden Blöcken; bei Wirbelende, Abbruch (Elementwechsel, Neustart T, Menü) und Q = 0 wird er sauber entfernt, ohne verwaisten Körper, Emitter oder Timer; Test in Task 5.
5. **Dauerfessel:** Nass → Windstoß → Eisfessel → Nass → Windstoß darf innerhalb der Frostschutzzeit nicht erneut fesseln; Test in Task 2 (Vitest) und Task 7 (Browser).
6. **Budget:** Dauerfeuer Wasser plus Windstoß-Spam hält `registry.budgetCount() ≤ 240` und 55 fps; Test in Task 7.
7. **Windmarkierung** bleibt nach Elementwechsel, Neustart und Menü nicht stehen und zeichnet nicht, wenn Luft nicht gewählt ist; Test in Task 6.
8. **Windschub-Refactor:** `pushWithAir` verhält sich nach der Umstellung auf `airBoostSpeedMs` bitgleich (gleiche Geschwindigkeiten wie vorher); Test in Task 1.

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `src/config/combos.ts` (neu) | alle Stellwerte der Kombos |
| `src/combat/wucht.ts` + `.test.ts` (neu) | `wuchtDamage`, `airBoostSpeedMs` (rein) |
| `src/combat/status.ts` + `.test.ts` (neu) | Nass, Kältetreffer, Frostschutz (rein, Zeit wird übergeben) |
| `src/combos/meteorRules.ts` + `.test.ts` (neu) | `isMeteorImpact`, `meteorCharge`, `afterMeteorTemperature` (rein) |
| `src/combos/fireVortexMath.ts` + `.test.ts` (neu) | Q-Abfluss, Tick-Schaden, Blockwärme (rein) |
| `src/combos/Meteor.ts` (neu) | Einschlag: Explosion, Wärmeabgabe, Hitstop |
| `src/combos/FireVortex.ts` (neu) | Capture-Handler Feuer, Tick-Schaden, Blockheizung, Freilassen |
| `src/combos/WindMarker.ts` (neu) | Anzeige im Luftmodus |
| `src/materials/EarthMaterial.ts` | Wucht-Schaden, Meteor-Aufruf, `meteorSpent`, `pushWithAir` auf `airBoostSpeedMs` |
| `src/materials/FireMaterial.ts`, `src/attacks/explosion.ts` | Explosionsroutine herauslösen; Capture-Flag, Freilassen |
| `src/materials/WaterMaterial.ts`, `src/attacks/WaterWhipAttack.ts`, `src/materials/IceMaterial.ts` | Nass bei Treffer; Kältetreffer der Scherbe |
| `src/attacks/AirGustAttack.ts`, `src/attacks/AirTornadoAttack.ts` | Kältetreffer; `volley`; Feuer aufnehmen |
| `src/entities/FlyingPlushEnemy.ts` | Darstellung „nass“ |
| `src/elements/ElementController.ts`, `src/scenes/GameScene.ts` | WindMarker anlegen, aufräumen |
| `scripts/check-combos.py` (neu), `README.md` | Browserprüfung; Steuerung und Kombos beschreiben |

---

### Task 1: Wucht

**Files:** Create `src/config/combos.ts`, `src/combat/wucht.ts`, `src/combat/wucht.test.ts`; Modify `src/materials/EarthMaterial.ts`

**Interfaces – Produces:**
```ts
// config/combos.ts  (alle Werte der Spec, Abschnitt „Stellwerte“; zusätzlich die bisher lokalen Luftwerte)
export const COMBOS = {
  wuchtJoulesPerHp: 2400, wuchtDamageCap: 60,
  airBoostMs: 18, airMaxSpeedMs: 30, airReferenceMassKg: 225,   // bisher AIR_BOOST_MS, AIR_MAX_SPEED_MS, REFERENCE_MASS_KG in EarthMaterial
  meteorMinJ: 30_000, meteorHeatRetention: 0.4,
  fireVortexTickMs: 300, fireVortexDamageMin: 2, fireVortexDamageMax: 6, fireVortexRockHeatFraction: 0.08,
  wetMs: 6000, chillMinStrength: 0.3, chillFreezeMinFactor: 0.5, frostImmunityMs: 3000,
  volleyMaxBodies: 12,
} as const
// combat/wucht.ts
/** E_kin / wuchtJoulesPerHp, gerundet; nie unter floor, nie über wuchtDamageCap (ein höherer floor bleibt). */
export const wuchtDamage = (massKg: number, speedMs: number, floor: number): number
/** Windschub in m/s: airBoostMs · ∛(airReferenceMassKg / massKg) · strength. */
export const airBoostSpeedMs = (massKg: number, strength: number): number
```

- [ ] **Step 1: Tests schreiben** (`wucht.test.ts`)
```ts
it('Beispiele der Spec', () => {
  expect(wuchtDamage(225, 18, 15)).toBe(15)     // 36 kJ
  expect(wuchtDamage(225, 30, 15)).toBe(42)     // 101 kJ
  expect(wuchtDamage(6075, 6, 15)).toBe(46)     // 109 kJ, 1,5-m-Block
})
it('sinkt nie unter den Festwert', () => { expect(wuchtDamage(225, 3, 15)).toBe(15); expect(wuchtDamage(225, 3, 60)).toBe(60) })
it('deckelt bei 60, ein höherer Festwert bleibt', () => { expect(wuchtDamage(6075, 30, 15)).toBe(60); expect(wuchtDamage(225, 1, 70)).toBe(70) })
it('ungültige Werte ergeben den Festwert', () => { expect(wuchtDamage(NaN, 10, 15)).toBe(15); expect(wuchtDamage(225, 0, 15)).toBe(15); expect(wuchtDamage(225, -4, 15)).toBe(15) })
it('airBoostSpeedMs entspricht dem bisherigen pushWithAir', () => {
  expect(airBoostSpeedMs(225, 1)).toBeCloseTo(18)
  expect(airBoostSpeedMs(6075, 1)).toBeCloseTo(6)
  expect(airBoostSpeedMs(225, 0.5)).toBeCloseTo(9)
})
```
- [ ] **Step 2:** `npx vitest run src/combat` → FAIL (Module fehlen)
- [ ] **Step 3:** `config/combos.ts` und `wucht.ts` implementieren. In `EarthMaterial`: die drei lokalen Konstanten entfernen; `pushWithAir` nutzt `airBoostSpeedMs(body.mass, strength)` und `COMBOS.airMaxSpeedMs`; `impact()` ruft `damageEnemy(other, wuchtDamage(body.mass, speedMs, earth.damage), 'earth')` (`speedMs` ist dort schon die Relativgeschwindigkeit).
- [ ] **Step 4:** `npx vitest run && npm run build` grün; `check-reactions.py` grün; Browser: Block mit Windstoß auf Gegner schießen → LP-Verlust ≥ Festwert, großer Block (1,5 m) mit Windstoß → deutlich höher; geworfener Block wie bisher (Untergrenze greift).
- [ ] **Step 5:** Commit `feat(kombos): Block-Schaden folgt der Wucht`

---

### Task 2: Nass und Kälte (Hagel-Kette)

**Files:** Create `src/combat/status.ts`, `src/combat/status.test.ts`; Modify `src/materials/WaterMaterial.ts`, `src/attacks/WaterWhipAttack.ts`, `src/materials/IceMaterial.ts`, `src/attacks/AirGustAttack.ts`, `src/attacks/AirTornadoAttack.ts`, `src/attacks/explosion.ts`, `src/materials/EarthMaterial.ts`, `src/entities/FlyingPlushEnemy.ts`

**Interfaces – Produces:**
```ts
// combat/status.ts   (Zustand je Gegnerkörper in WeakMaps; Zeit wird übergeben)
export const applyWet = (body: MatterJS.BodyType, now: number, durationMs?: number): void   // Standard COMBOS.wetMs, erneuert
export const isWet = (body: MatterJS.BodyType, now: number): boolean
export const dry = (body: MatterJS.BodyType): void
/** Kältetreffer. true, wenn ein Eisfessel ausgelöst wurde. Nur bei nassem Gegner, strength ≥ chillMinStrength,
 *  ohne Frostschutz. Dauer waterFreezeMs · (0,5 + 0,5 · strength). Verbraucht Nass nur, wenn freeze true liefert.
 *  Frostschutz läuft bis now + Dauer + frostImmunityMs. */
export const chillEnemy = (body: MatterJS.BodyType, strength: number, now: number,
  freeze: (b: MatterJS.BodyType, ms: number) => boolean = freezeEnemy): boolean
```

- [ ] **Step 1: Tests schreiben** (`status.test.ts`, `freeze` als Spion injizieren)
```ts
it('Nass hält wetMs und wird erneuert', () => { const b = body(); applyWet(b, 0); expect(isWet(b, 5999)).toBe(true); expect(isWet(b, 6001)).toBe(false); applyWet(b, 5000); expect(isWet(b, 10_999)).toBe(true) })
it('Kälte auf trockenen Gegner wirkt nicht', () => { const s = spy(); expect(chillEnemy(body(), 1, 0, s.freeze)).toBe(false); expect(s.calls).toEqual([]) })
it('Kälte auf nassen Gegner: Dauer 0,5 bis 1,0 · waterFreezeMs, verbraucht Nass', () => {
  const s = spy(); const b = body(); applyWet(b, 0)
  expect(chillEnemy(b, 1, 100, s.freeze)).toBe(true); expect(s.calls).toEqual([1600]); expect(isWet(b, 200)).toBe(false)
  const c = body(); applyWet(c, 0); chillEnemy(c, 0.3, 100, s.freeze); expect(s.calls[1]).toBe(1040)
})
it('Stärke unter der Schwelle wirkt nicht und behält Nass', () => { const s = spy(); const b = body(); applyWet(b, 0); expect(chillEnemy(b, 0.29, 100, s.freeze)).toBe(false); expect(isWet(b, 200)).toBe(true) })
it('Frostschutz: nach dem Fesseln 3 s nach Ablauf immun', () => {
  const s = spy(); const b = body(); applyWet(b, 0); chillEnemy(b, 1, 0, s.freeze)     // Fessel bis 1600, Schutz bis 4600
  applyWet(b, 1000); expect(chillEnemy(b, 1, 4000, s.freeze)).toBe(false)
  applyWet(b, 4600); expect(chillEnemy(b, 1, 4700, s.freeze)).toBe(true)
})
it('kein Gegner (freeze liefert false): Nass bleibt, kein Frostschutz', () => { const b = body(); applyWet(b, 0); expect(chillEnemy(b, 1, 10, () => false)).toBe(false); expect(isWet(b, 20)).toBe(true) })
it('dry entfernt Nass', () => { const b = body(); applyWet(b, 0); dry(b); expect(isWet(b, 1)).toBe(false) })
```
- [ ] **Step 2:** `npx vitest run src/combat/status.test.ts` → FAIL
- [ ] **Step 3:** `status.ts` implementieren. Verdrahten:
  - **Nass:** Tropfentreffer am Gegner (`WaterMaterial`), Wasserpeitschentreffer (`WaterWhipAttack`; Pfützenkontakt nur, wenn der Bestand ihn schon als Treffer meldet) → `applyWet(body, scene.time.now)`.
  - **Kälte:** `AirGustAttack.pushBodies` im Gegnerzweig → `chillEnemy(body, strength, now)`; `AirTornadoAttack` beim Fangen/Halten eines Gegners → Stärke 0,6, höchstens einmal je Gegner und 700 ms; `IceMaterial` Scherbentreffer am Gegner → Stärke 0,5.
  - **Trocknen:** `applyBlast` (explosion.ts) und die Glutberührung in `EarthMaterial.impact` rufen für getroffene nasse Gegner `dry` und `SteamEffect` (kleine Wolke), ohne Bonusschaden.
  - **Darstellung:** `FlyingPlushEnemy` zeichnet bei `isWet` dunklere Tönung und 1 bis 2 Tropfenläufe (analog `EarthMaterial.draw`), nur wenn nass.
- [ ] **Step 4:** `npx vitest run && npm run build` grün; Browser: Gegner mit Wasserstrahl treffen → nass sichtbar; danach Windstoß → Eisfessel (Balken); direkt danach erneut nass + Windstoß → keine Fessel (Frostschutz); Feuerball auf nassen Gegner → trocknet, Dampf.
- [ ] **Step 5:** Commit `feat(kombos): Nass und Kältetreffer, Eisfessel als Kette`

---

### Task 3: Meteor

**Files:** Create `src/combos/meteorRules.ts`, `src/combos/meteorRules.test.ts`, `src/combos/Meteor.ts`; Modify `src/attacks/explosion.ts`, `src/materials/FireMaterial.ts`, `src/materials/EarthMaterial.ts`

**Interfaces – Produces:**
```ts
// combos/meteorRules.ts (rein)
export interface MeteorImpactInput { temperatureC: number; energyJ: number; spent: boolean; otherIsPlayer: boolean; otherIsSensor: boolean }
export const isMeteorImpact = (i: MeteorImpactInput): boolean      // T ≥ earthGlowC ∧ energyJ ≥ meteorMinJ ∧ ¬spent ∧ ¬Spieler ∧ ¬Sensor
export const meteorCharge = (tempC: number): number                // glowFraction(tempC, earthGlowC, earthWhiteC)
export const afterMeteorTemperature = (tempC: number): number      // ambient + meteorHeatRetention · (tempC − ambient)
// combos/Meteor.ts
export const meteorImpact = (scene, system, rock: Rock, point: { x: number; y: number }, direct: MatterJS.BodyType): void
// attacks/explosion.ts  (aus FireMaterial.explode herausgelöst, Verhalten unverändert)
export const detonate = (scene, system, point, charge: number, heatJ: number, direct?: MatterJS.BodyType, scorch?: boolean): void
```
`Rock` bekommt `meteorSpent: boolean` (Start false).

**Klarstellung zur Spec (Wiedervorlage):** `afterMeteorTemperature` lässt einen 1500-°C-Block bei 609 °C, also noch über der Glühgrenze. „Erneut über die Glühgrenze“ ist deshalb so umgesetzt: `meteorSpent` wird gelöscht, sobald `EarthMaterial.heat` dem Block nach dem Einschlag wieder Wärme zuführt (ΔT > 0). Ein Block ohne neue Hitze zündet also nicht noch einmal. Spec ist entsprechend angepasst.

- [ ] **Step 1: Tests schreiben** (`meteorRules.test.ts`)
```ts
const ok = { temperatureC: 600, energyJ: 40_000, spent: false, otherIsPlayer: false, otherIsSensor: false }
it('zündet bei Glut und Wucht', () => expect(isMeteorImpact(ok)).toBe(true))
it.each([
  ['zu kalt', { temperatureC: 499 }], ['zu wenig Wucht', { energyJ: 29_999 }],
  ['schon verbraucht', { spent: true }], ['Spieler', { otherIsPlayer: true }], ['Sensor', { otherIsSensor: true }],
])('zündet nicht: %s', (_n, patch) => expect(isMeteorImpact({ ...ok, ...patch })).toBe(false))
it('Ladung aus der Glut', () => { expect(meteorCharge(500)).toBe(0); expect(meteorCharge(1200)).toBe(1); expect(meteorCharge(850)).toBeCloseTo(0.5) })
it('Wärmerest 40 %', () => expect(afterMeteorTemperature(1500)).toBeCloseTo(15 + 0.4 * 1485))
```
- [ ] **Step 2:** `npx vitest run src/combos` → FAIL
- [ ] **Step 3:** (a) **Refactor ohne Verhaltensänderung:** Die Explosion aus `FireMaterial.explode` (ab Zeile ~122: Weißblitz, Druckwellenring, Rauch, Brandfleck, `applyBlast`, `heatArea`, Hitstop) in `detonate` herauslösen und von `FireMaterial` aufrufen; `check-reactions.py` muss unverändert grün sein. (b) `meteorRules.ts` und `Meteor.ts`: `meteorImpact` ruft `detonate(scene, system, point, meteorCharge(T), fireHeatForCharge(charge), direct)`, setzt `rock.meteorSpent = true` **vor** dem Aufruf und `rock.temperatureC = afterMeteorTemperature(T)`. (c) `EarthMaterial.impact`: nach dem Schadensblock `isMeteorImpact({ …, energyJ: ½·m·v², otherIsPlayer: other.label === 'player', otherIsSensor: other.isSensor })` → `meteorImpact`; `heat()` setzt `meteorSpent = false`, wenn der Block nach dem Einschlag Wärme erhält.
- [ ] **Step 4:** `npx vitest run && npm run build` grün; Browser: Erdblock werfen, geladenen Feuerball drauf (glüht), Windstoß auf Gegner → Explosion am Einschlag (Gegner-LP sinkt über Block-Schaden hinaus), Block danach kühler; zweiter Aufprall ohne neue Hitze → keine Explosion; zwei Gegner am selben Einschlagpunkt → genau eine Explosion (Review Focus 1); Block auf Spieler zu → kein Selbstschaden (Review Focus 2).
- [ ] **Step 5:** Commit `feat(kombos): Meteor – glühender schneller Block explodiert beim Einschlag`

---

### Task 4: Salve (Steinhagel)

**Files:** Modify `src/attacks/AirTornadoAttack.ts`, `src/attacks/AirGustAttack.ts`

**Interfaces – Produces:**
```ts
AirTornadoAttack.volley(direction: Phaser.Math.Vector2): boolean
// true, wenn mindestens ein gefangener Block (orbit.rock) vorhanden war. Für jeden (höchstens COMBOS.volleyMaxBodies):
// releaseBody(.., throwOut = false), danach system.applyWind(body, direction, 1, 'gust'). Gefangene Gegner: wie beim normalen Ende freigeben.
// Danach endet der Wirbel (finish(tornado, false)).
```
`AirGustAttack.execute` ruft nach der Ladungsprüfung zuerst `this.tornado.volley(direction)`; bei `true` wird zusätzlich nur der Fächer-Effekt in Schussrichtung gezeichnet (kein `pushBodies`, kein Rückstoß).

- [ ] **Step 1:** Kein Vitest (reine Physik); stattdessen Browser-Skriptfall in Task 7 vormerken. Erwartung formulieren: `n` Blöcke im Wirbel → `n` Blöcke danach mit Geschwindigkeit ≥ 0,9 · `airBoostSpeedMs(m, 1)` in Richtung Maus.
- [ ] **Step 2:** `volley` und Einbindung in `execute` implementieren. `hitTargets` setzt `pushWithAir` bereits zurück; Wirbel endet danach ohne Auslaufen-Kick.
- [ ] **Step 3:** `npx vitest run && npm run build` grün.
- [ ] **Step 4:** Browser: zwei bis drei Blöcke in den Wirbel, Luft-Kurzklick zur Maus → alle fliegen zur Maus, Wirbel verschwindet, Treffer machen Wucht-Schaden. Nur Gegner im Wirbel (kein Block) + Kurzklick → normaler Windstoß (Review Focus 3). Windstoß-Abklingzeit gilt.
- [ ] **Step 5:** Commit `feat(kombos): Wirbel-Salve schleudert gefangene Blöcke zur Maus`

---

### Task 5: Feuerwirbel

**Files:** Create `src/combos/fireVortexMath.ts`, `src/combos/fireVortexMath.test.ts`, `src/combos/FireVortex.ts`; Modify `src/materials/FireMaterial.ts`, `src/attacks/AirTornadoAttack.ts`

**Interfaces – Produces:**
```ts
// combos/fireVortexMath.ts (rein)
export const vortexHeatJ = (q0J: number, elapsedMs: number, durationMs: number): number   // q0 · (1 − elapsed/duration), ≥ 0
export const vortexTickDamage = (q: number, q0: number): number                           // round(lerp(2, 6, q/q0 geklemmt))
export const vortexRockHeatJ = (qJ: number): number                                        // 0,08 · qJ
// combos/FireVortex.ts
export class FireVortex { /* Capture-Handler für 'fire'; update(tornado, dtMs): Tick-Schaden + Blockheizung; release(direction?) */ }
// FireMaterial: Fireball.captured: boolean (true → explode() kehrt sofort zurück, Maske ohne feste Körper)
```
`AirTornadoAttack`: `canCapture` gilt jetzt auch für Feuer; **höchstens ein Feuerball je Wirbel**; `Orbit` bekommt `kind: 'rock' | 'enemy' | 'fire'` statt `rock: boolean`, weil der Gravitationsausgleich (`if (orbit.rock) nextVY -= …`) nur für Blöcke gilt (der Feuerball hat keine Gravitation).

- [ ] **Step 1: Tests schreiben** (`fireVortexMath.test.ts`)
```ts
const Q = R.fireHeatMaxJ
it('Q sinkt linear auf 0', () => { expect(vortexHeatJ(Q, 0, 3200)).toBe(Q); expect(vortexHeatJ(Q, 1600, 3200)).toBeCloseTo(Q / 2); expect(vortexHeatJ(Q, 4000, 3200)).toBe(0) })
it('Tick-Schaden 2 bis 6 nach Q-Anteil', () => { expect(vortexTickDamage(0, Q)).toBe(2); expect(vortexTickDamage(Q, Q)).toBe(6); expect(vortexTickDamage(Q / 2, Q)).toBe(4) })
const heatedTemperature = (durationMs: number): number => {            // 0,5-m-Block (225 kg), ohne Abkühlung
  let t = R.ambientC
  for (let ms = 0; ms < durationMs; ms += COMBOS.fireVortexTickMs) t += solidHeatingK(vortexRockHeatJ(vortexHeatJ(Q, ms, durationMs)), 1, 225)
  return t
}
it('voll geladener Feuerball in einem geladenen Wirbel (3200 ms) bringt den Block über die Glühgrenze', () => expect(heatedTemperature(3200)).toBeGreaterThanOrEqual(R.earthGlowC))
it('kurzer Wirbel (1600 ms) allein reicht nicht', () => expect(heatedTemperature(1600)).toBeLessThan(R.earthGlowC))
```
(Erwartet ≈ 716 °C bzw. ≈ 397 °C.)
- [ ] **Step 2:** `npx vitest run src/combos` → FAIL
- [ ] **Step 3:** Mathe-Modul und `FireVortex` implementieren. Verhalten: Q sinkt über die **Restdauer** des Wirbels; alle `fireVortexTickMs` Flammenschaden an allen Gegnern im Wirbelradius (`damageEnemy(body, vortexTickDamage(q, q0), 'fire')`, `impactRing`) und `system.heatSubstance(block, vortexRockHeatJ(q), point)` für jeden gefangenen Block. Bei Q = 0 oder Wirbelende: Funkenstoß, Feuerball per `system.remove` entfernen (kein `explode`). `volley` aus Task 4 gibt den Feuerball mit Rest-Q als normalen Feuerball in Schussrichtung frei (`captured = false`, Geschwindigkeit der Feuerball-Flugroutine). Abbruchpfade (`cancel`, `finish`, Szenen-`destroy`) räumen den Feuerball mit auf.
- [ ] **Step 4:** `npx vitest run && npm run build` grün; Browser: Feuerball in Wirbel schießen → kreist, explodiert nicht; Gegner im Wirbel nehmen Tickschaden; gefangener Block glüht nach dem Wirbel (voller Q, langer Wirbel); Wirbelende ohne Klick → Funken, keine Explosion, `count('fire') = 0`; Wirbel + Elementwechsel/T/Esc mitten im Flug → keine Konsolenfehler, `count('fire') = 0` (Review Focus 4); Salve mit Feuerball → fliegt als Feuerball weiter und explodiert normal.
- [ ] **Step 5:** Commit `feat(kombos): Feuerwirbel nimmt Feuerbälle auf und heizt Blöcke`

---

### Task 6: Windmarkierung

**Files:** Create `src/combos/WindMarker.ts`; Modify `src/elements/ElementController.ts`, `src/scenes/GameScene.ts`

**Interfaces – Produces:**
```ts
export class WindMarker {
  constructor(scene: Phaser.Scene, system: ReactionSystem, playerBody: MatterJS.BodyType)
  /** Pro Frame: zeichnet nur, wenn active; sonst clear(). origin/direction wie bei AirGustAttack. */
  update(active: boolean, origin: Phaser.Types.Math.Vector2Like, direction: Phaser.Math.Vector2): void
  destroy(): void
}
```
Zeichnung: je Erdblock im Windstoßkegel (Reichweite und Halbwinkel aus `AirGustAttack`, dafür `RANGE_M`/`HALF_ANGLE_RAD` exportieren statt kopieren) vier Eckklammern in `0xcfe9f2` und ein Pfeil, Länge ∝ `airBoostSpeedMs(m, strength)`. Ein einziges `Graphics`-Objekt, Tiefe knapp über den Blöcken.

- [ ] **Step 1:** Kein Vitest (reine Darstellung, Mathe steckt in `airBoostSpeedMs`, Task 1).
- [ ] **Step 2:** `WindMarker` implementieren; `ElementController.update` ruft `update(this.selected.id === 'air', origin, direction)`; `destroy` in `ElementController.destroy`/Szenenneustart.
- [ ] **Step 3:** `npm run build` grün.
- [ ] **Step 4:** Browser: Luft wählen, Maus auf einen Block → Klammern und Pfeil; Maus weg → verschwinden; Element wechseln → Markierung weg und kein Zeichnen mehr; T und Esc → keine Konsolenfehler (Review Focus 7); die Markierung ändert den Windstoß nicht (gleiche Geschwindigkeit mit und ohne).
- [ ] **Step 5:** Commit `feat(kombos): Windmarkierung für Blöcke im Windstoßkegel`

---

### Task 7: Browserprüfung, Doku, Abschluss

**Files:** Create `scripts/check-combos.py`; Modify `README.md`

- [ ] **Step 1: `scripts/check-combos.py`** (Aufbau und Hilfsfunktionen von `check-reactions.py` übernehmen). Szenen:
  1. Windstoß-Block trifft härter als Wurf (LP-Differenz ≥ Festwert, großer Block höher).
  2. Glühender schneller Block → Explosion beim Einschlag; zweiter Aufprall ohne Hitze → keine.
  3. Wasserstrahl, dann Windstoß → Scherben **und** nasser Gegner wird gefesselt; Wiederholung innerhalb des Frostschutzes → keine zweite Fessel (Review Focus 5).
  4. Salve: `n` Blöcke im Wirbel → `n` Blöcke fliegen zur Maus.
  5. Feuerball im Wirbel explodiert nicht, `count('fire') = 0` nach Wirbelende; gefangener Block glüht.
  6. Dauerfeuer Wasser plus Windstoß-Spam: `budgetCount ≤ 240`, Frameschnitt ≥ 55 fps (Review Focus 6).
  7. Windmarkierung nur im Luftmodus.
- [ ] **Step 2: README:** Abschnitt „Kombos“ (Prinzip Träger/Nutzlast/Veredlung; die vier Kombos in je zwei Sätzen; Zustand Nass; Windmarkierung).
- [ ] **Step 3:** `npm run build && npx vitest run`; alle Browserskripte (`check-movement.py`, `check-grenzland.py`, `check-reactions.py`, `check-skills-menu.mjs`, `check-combos.py`) grün.
- [ ] **Step 4:** `/balance-check src/config/combos.ts` und `/perf-profile combos`; Findings, die Startwerte betreffen, in `config/combos.ts` nachziehen, Spec-Zahlen angleichen.
- [ ] **Step 5:** Commit `docs: Element-Kombos`; danach Code-Review (`/code-review`) auf dem Branch.

---

## Selbstprüfung (durchgeführt)

- **Spec-Abdeckung:** Wucht (Ziel 1) → T1; Nass und Kälte (Ziel 3) → T2; Meteor → T3; Hagel → T1/T2 (Bestand plus Kette); Steinhagel/Salve → T4; Feuerwirbel → T5; Windmarkierung (Ziel 4) → T6; Stellwerte (Ziel 5) → T1; Prüfung → T7. Entscheidungen des Bauleiters 1 → T1, 2 → T4, 3 → T2, 4 → T3, 5 → T5.
- **Abweichungen von der Spec:** Zwei reine Dateien mehr (`meteorRules.ts`, `fireVortexMath.ts`), weil `Meteor.ts` und `FireVortex.ts` Phaser importieren und sich so nicht mit Vitest laden lassen; Klarstellung zu `meteorSpent` (Task 3). Spec ist entsprechend angepasst.
- **Typen:** `COMBOS`, `wuchtDamage`, `airBoostSpeedMs`, `applyWet`, `isWet`, `dry`, `chillEnemy`, `isMeteorImpact`, `meteorCharge`, `afterMeteorTemperature`, `detonate`, `volley`, `vortexHeatJ`, `vortexTickDamage`, `vortexRockHeatJ`, `FireVortex`, `WindMarker` durchgängig gleich benannt.
- **Nicht geprüft:** Ob `FireMaterial.explode` sich ohne Verhaltensänderung herauslösen lässt (Task 3 Step 3a ist dafür mit `check-reactions.py` abgesichert); wo genau Tropfen- und Peitschentreffer am Gegner ausgewertet werden (Task 2 sucht die Stellen über `damageEnemy` in den Wasserdateien).
