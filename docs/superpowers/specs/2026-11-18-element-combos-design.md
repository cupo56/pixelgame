# Element-Kombos – Design

Stand: 2026-11-18. Baut auf dem Elementreaktionssystem (`src/materials/`, Spec `2026-11-17-element-reactions-design.md`), dem Metall-Element, `combat/damage.ts` und den Luftangriffen auf. Phaser 4, Matter.js, TypeScript strict, Vite.

Umsetzungsplan: `docs/superpowers/plans/2026-11-18-element-combos.md`.

## Absicht

Die fünf Elemente sollen sich **kombinieren lassen**, nicht nur in der Welt aufeinander reagieren: Man legt Rollen übereinander und bekommt etwas, das kein Element allein kann. Das Leitbild ist **Träger, Nutzlast, Veredlung**:

| Rolle | Element | Aufgabe |
|---|---|---|
| **Träger** | Luft | beschleunigt, schleudert und verweht jeden Stoff |
| **Nutzlast** | Erde, Metall, Sand, Eis, Wasser | der Stoff, der trifft |
| **Veredlung** | Feuer, Wasser | ändert die Eigenschaft: heiß, nass, gefroren |

Kombos entstehen durch **Reihenfolge und Physik**, nicht durch ein Zweitelement-Menü. Beispiel: Erdblock heben, Feuerball drauf, Windstoß – der glühende Block fliegt als Meteor.

## Bestand (was schon funktioniert)

Wichtig für den Umfang: Vieles ist bereits emergent möglich. Diese Spec ergänzt nur, was fehlt.

| Kombination | Heute | Lücke |
|---|---|---|
| Luft → Erde | `EarthMaterial.pushWithAir` beschleunigt Blöcke massenabhängig (18 m/s · ∛(225 kg / m), Deckel 30 m/s), hebt sie vom Boden, setzt `hitTargets` zurück | Schaden ist fest (`earth.damage` 15 bis 60), unabhängig von der Wucht; Spieler sieht nicht, welcher Block getroffen wird |
| Feuer → Erde | Erhitzen bis Glühen und zu Metall; glühender Block verbrennt Gegner bei Berührung (4 pro 500 ms) | Ein schneller glühender Block explodiert nicht |
| Luft → Feuer | `windFeedHeat`: Wind nährt den Feuerball (bis ×1,6) | Wirbel nimmt kein Feuer auf |
| Luft → Wasser | Windstoß kühlt Tropfen um 30 K · Stärke, Wirbel um 60 K/s; ≤ 0 °C wird zu Eis | Kein Effekt auf Gegner außer 3 Schaden pro Scherbe |
| Wirbel → Erde | `AirTornadoAttack` fängt bis zu 12 Blöcke, beim Ende werden sie mit 3 bis 6 m/s hinausgekickt | Man kann die Blöcke nicht gezielt abfeuern |
| Gegner-Zustände | nur Eisfessel (`freezeEnemy`) und Windhalten | kein Zustand „nass“, damit keine Kälte-Kette |

## Ziele

1. **Wucht statt Festwert:** Schaden von Blöcken folgt der kinetischen Energie, damit „Erde mit Luft schießen“ spürbar stärker ist als ein Wurf.
2. **Vier Kombos** (Meteor, Hagel, Steinhagel, Feuerwirbel) als Beleg des Prinzips.
3. **Zustand „Nass“** an Gegnern, der mit Kälte zur Eisfessel führt (Wasser dann Luft).
4. **Lesbarkeit:** Der Spieler sieht, welche Blöcke ein Windstoß treffen würde.
5. Alle Stellwerte in `src/config/combos.ts`, Reaktionslogik rein und mit Vitest prüfbar.

## Nicht-Ziele

- Kein Zweitelement-Slot, keine Tastenkombination, kein neues Auswahlmenü. (Eine Abkürzung dafür kann später als Skilltree-Knoten „Element-Combo“ folgen.)
- Kein volles Statussystem: keine Zustände Brennend, Sandig, Gepanzert an Gegnern.
- Keine Sandsturm-, Dampf-, Schlamm-, Lava- oder Klingenwirbel-Kombo (siehe „Später“).
- Keine Änderung an Laufen, Springen, Stufenlogik oder Spielerkollision; keine neuen Gegner, kein Sound.
- Der Metallangriff bleibt unverändert.

## Anti-Ziele (das wäre ein Misserfolg)

- Schaden sinkt gegenüber heute: Die Wucht-Formel ist nur eine **Untergrenze der Steigerung**, nie eine Absenkung des bisherigen Festwerts.
- Kettenreaktionen ohne Ende (Meteor erhitzt Block, der erhitzt Block …): Jede Kombo **verbraucht** ihre Wärme.
- Dauerfessel: Ein Gegner darf nicht durch Wasser und Wind endlos eingefroren werden.
- Mehr als 240 dynamische Körper, Framerate unter 55 fps (Budget aus der Reaktions-Spec). Hagel und Steinhagel sind der kritische Fall.
- Zielhilfe, die den Wurf verfälscht: Die Markierung zeigt nur, sie lenkt nichts.
- Bruch der Prüfungen `check-movement.py`, `check-grenzland.py`, `check-reactions.py`, `check-skills-menu.mjs` und `npm test`.

## Entscheidungen des Auftraggebers

- **Zielen: Physisch + Anzeige.** Der Windstoß wirkt rein physikalisch, aber betroffene Blöcke bekommen eine dezente Markierung.
- **Gegner-Zustände: leicht.** Nur **Nass** und **Eisfessel** (vorhanden).
- **Umfang: 4 Kombos.** Meteor, Hagel, Steinhagel, Feuerwirbel. Der Rest steht unter „Später“.

## Entscheidungen des Bauleiters (Auftraggeber kann kippen)

1. **Wucht-Formel:** `Schaden = clamp(round(E_kin / 2400 J), Festwert, 60)` mit `E_kin = ½·m·v²` (Relativgeschwindigkeit wie in `EarthMaterial.impact`). Der bisherige Festwert bleibt Untergrenze, 60 (= `chargedEarthDamage`) die Obergrenze. Beispiele: 0,5-m-Block (225 kg) mit 18 m/s: 36 kJ → 15; mit 30 m/s: 101 kJ → 42. 1,5-m-Block (6075 kg) mit Windschub 6 m/s: 109 kJ → 46. Schwere Blöcke treffen also auch langsam hart, wie in der Physik. Startwerte, nach Spieltest mit `/balance-check` nachziehen.
2. **Salve per Luft-Kurzklick:** Existiert ein eigener Wirbel mit mindestens einem gefangenen Block, löst der Windstoß-Klick eine Salve aus statt eines normalen Windstoßes. Er nutzt dafür die vorhandene Windbeschleunigung (`applyWind`, Stärke 1) und braucht keine neue Eingabe.
3. **Frostschutz:** Nach dem Auftauen ist ein Gegner 3 s gegen eine neue Eisfessel immun.
4. **Meteor verbraucht Wärme:** Nach dem Einschlag behält der Block 40 % seiner Übertemperatur; ein weiterer Meteor braucht erneute Wärmezufuhr (siehe Meteor, Wirkung).
5. **Feuer im Wirbel:** beliebig viele Feuerbälle je Wirbel (wie Blöcke); jeder erlischt ohne Explosion, wenn Wirbel oder Q enden.

## Die vier Kombos

### 1. Meteor (Erde + Feuer + Luft)

**Ablauf:** Erdblock heben oder werfen, mit Feuer auf mindestens 500 °C (`earthGlowC`) erhitzen, mit Windstoß beschleunigen. Ein geladener Feuerball genügt für einen 0,5-m-Block weit darüber (~1500 °C); ein zu etwa einem Viertel geladener kommt gerade auf die Glühgrenze.

**Trigger** (`isMeteorImpact`, rein): Block ist `kind: 'earth'`, Temperatur ≥ `earthGlowC`, Einschlagsenergie ≥ `meteorMinJ` (30 kJ), Treffer an festem Körper oder Gegner (nicht Spieler), Block ist nicht `meteorSpent`.

**Wirkung:** Eine Feuerball-Explosion am Einschlagpunkt über die vorhandenen Bausteine (`applyBlast`, `ReactionSystem.heatArea`, Brandfleck), mit `charge := glowFraction(T, earthGlowC, earthWhiteC)`:
- Schaden `lerp(fireDamage, chargedFireDamage, charge)`, Radius und Impuls wie beim Feuerball.
- Hitstop 50 ms und Kamerawackeln wie bei einer geladenen Explosion.
- Danach `meteorSpent = true`, Temperatur `ambient + 0,4 · (T − ambient)`. Weil ein 1500-°C-Block dabei noch bei 609 °C und damit über der Glühgrenze bleibt, fällt `meteorSpent` erst wieder, wenn dem Block nach dem Einschlag **erneut Wärme zugeführt** wird (`EarthMaterial.heat` mit ΔT > 0). Ohne neue Hitze zündet er nicht noch einmal.
- Die Explosion heizt Nachbarblöcke über `heatArea` wie jeder Feuerball. Das ist gewollt (ein Meteor kann einen Nachbarblock zu Metall schmelzen) und endet von selbst, weil kein Block sich selbst erneut zündet.

**Darstellung:** Fliegender glühender Block zieht Funken und eine Rauchschleppe (vorhandene `particles.ts`-Bausteine), Einschlag mit Weißblitz und Druckwellenring.

### 2. Hagel (Wasser + Luft)

**Ablauf:** Wasserstrahl, dann Windstoß durch die Tropfen. Der Bestand erledigt das Gefrieren: Ein Tropfen mit 15 °C friert bei Windstärke ≥ 0,5 (innerhalb der halben Reichweite); weiter entfernte kühlen nur ab, ein zweiter Stoß vollendet es.

**Neu:**
- Eine Eisscherbe, die einen Gegner trifft, ist ein **Kältetreffer** (`chillEnemy`, Stärke 0,5, siehe Gegner-Zustände).
- Tropfen, die einen Gegner treffen, machen ihn **nass** (`applyWet`).
- Damit entsteht die Kette *nass → Windstoß oder Scherben → Eisfessel* auch ohne Hagel; der Hagel macht sie dichter.

**Darstellung:** Beim Gefrieren im Flug heller Funke am Tropfen, Scherben als Kegel mit kurzem Windstreifen. Budget: Tropfendeckel 120 bleibt maßgeblich.

### 3. Steinhagel (Wirbel + Erde, Salve)

**Ablauf:** Wirbel laden und platzieren, Blöcke einfangen (bis 12, Bestand), dann Luft-Kurzklick zur Maus.

**Salve** (`AirTornadoAttack.volley(direction)`, neu): Für jeden gefangenen Block `release`, dann `applyWind(body, direction, 1, 'gust')`. Die vorhandene Windbeschleunigung liefert massenabhängige Geschwindigkeit (18 m/s für 0,5 m), Wucht-Schaden und das Zurücksetzen von `hitTargets`. Der Wirbel endet danach. Ohne Klick endet er wie bisher mit dem Auslaufen-Kick.

**Grenzen:** höchstens 12 Blöcke je Salve (Bestand); Windstoß-Abklingzeit (700 ms) gilt für die Salve.

**Darstellung:** Der Wirbel „entlädt“ sich: Ring und Luftstreifen in Schussrichtung, jeder Block mit eigener Schleppe.

### 4. Feuerwirbel (Wirbel + Feuer)

**Ablauf:** Ein Feuerball, der in einen Wirbel gerät, wird **gefangen** (neuer Capture-Handler für `fire`), kreist mit dem Wirbel und explodiert nicht an den kreisenden Blöcken.

**Wirkung** (Startwerte):
- Wärmeinhalt `Q` sinkt linear über die Restdauer des Wirbels auf 0. Bei 0 erlischt der Feuerball in einem kleinen Funkenstoß, ohne Druckwelle.
- Alle 300 ms Flammenschaden an Gegnern im Wirbelradius: `lerp(2, 6, Q / Q_max)`, Element `fire` (EP gehen an Feuer).
- Alle 300 ms erhält jeder gefangene Block Wärme `0,08 · Q` über `heatSubstance`. Damit erreicht ein 0,5-m-Block bei geladenem Feuerball die Glühgrenze (Kopplung 60 wie im Bestand). **Folge:** Feuerwirbel plus Steinhagel ergibt eine **Meteor-Salve** aus glühenden Blöcken.
- Salve während eines Feuerwirbels: Der Feuerball wird mit seinem Rest-Q als normaler Feuerball in Schussrichtung freigelassen.

**Darstellung:** Wirbel in Feuerfarben, Funken an den Rändern, Hitzeflimmern über dem Kern.

## Gegner-Zustände: Nass und Kälte

Neues Modul `src/combat/status.ts`, ohne Phaser-Abhängigkeit (reine Logik mit übergebener Zeit, getestet mit Vitest). Zustand je Gegnerkörper in einer `WeakMap`, wie in `damage.ts`.

| Zustand | Auslöser | Dauer | Wirkung |
|---|---|---|---|
| **Nass** | Wassertropfen, Wasserpeitsche oder Pfützenkontakt trifft einen Gegner | 6 s, wird bei jedem Treffer erneuert | macht Kältetreffer wirksam; Feuerball oder glühender Block auf einen nassen Gegner trocknet ihn und erzeugt eine kleine Dampfwolke (kein Bonusschaden) |
| **Eisfessel** | `chillEnemy` auf einen nassen Gegner | `waterFreezeMs · (0,5 + 0,5 · Stärke)`, also 800 bis 1600 ms | bestehende `freezeEnemy`-Logik; verbraucht „Nass“ |

**Kältetreffer** (`chillEnemy(body, strength, now)`): Windstoß (Stärke = Entfernungsfaktor), Wirbelkontakt (Stärke 0,6) und Eisscherbe (0,5). Wirkt nur bei Stärke ≥ 0,3 und nassem Gegner und nur, wenn kein Frostschutz läuft (3 s nach dem Auftauen). Ein nasser Gegner im Windstoß ist damit ein sichtbarer, planbarer Kombo-Auslöser.

**Darstellung:** Nasser Gegner dunkler getönt mit Tropfenläufen (analog zu nassen Erdblöcken); Eisfessel wie bisher (Balken in `FlyingPlushEnemy`).

## Anzeige (Windmarkierung)

Ist Luft das gewählte Element, zeichnet ein einziges `Graphics`-Objekt um jeden **Erdblock im Windstoß-Kegel zur Maus** vier dünne Eckklammern in Luftfarbe (`0xcfe9f2`) und einen kurzen Pfeil, dessen Länge der erwarteten Austrittsgeschwindigkeit entspricht (`AIR_BOOST_MS · ∛(225 kg / m) · Stärke`). Keine Zahlen, kein Lenken. Das Objekt wird nur neu gezeichnet, solange Luft gewählt ist; sonst `clear()` und unsichtbar. Beim Elementwechsel und bei Szenenneustart wird es zerstört.

## Stellwerte (`src/config/combos.ts`, neu)

```ts
export const COMBOS = {
  wuchtJoulesPerHp: 2400,
  wuchtDamageCap: 60,
  meteorMinJ: 30_000,
  meteorHeatRetention: 0.4,
  fireVortexTickMs: 300,
  fireVortexDamageMin: 2,
  fireVortexDamageMax: 6,
  fireVortexRockHeatFraction: 0.08,
  wetMs: 6000,
  chillMinStrength: 0.3,
  chillFreezeMinFactor: 0.5,
  frostImmunityMs: 3000,
  volleyMaxBodies: 12,
} as const
```

Der Kopplungsfaktor `fireSolidCoupling` bleibt als einzige dokumentierte Spielabstraktion. `fireVortexRockHeatFraction` ist eine zweite und wird im Code mit derselben Begründung kommentiert (der Wirbel hält die Flamme am Block).

## Architektur

```
src/config/combos.ts            Stellwerte (oben)
src/combat/wucht.ts             wuchtDamage(massKg, speedMs, floor): number  (rein, Vitest)
src/combat/status.ts            applyWet, isWet, dry, chillEnemy, Frostschutz (rein, Vitest)
src/combos/meteorRules.ts       isMeteorImpact, meteorCharge, afterMeteorTemperature (rein, Vitest)
src/combos/Meteor.ts            meteorImpact(scene, system, rock, point, direct): Explosion über detonate()
src/combos/fireVortexMath.ts    Q-Abfluss, Tick-Schaden, Blockwärme (rein, Vitest)
src/combos/FireVortex.ts        Capture-Handler für 'fire', Tick-Schaden, Blockheizung, Freilassen
src/combos/WindMarker.ts        Anzeige im Luftmodus
src/materials/EarthMaterial.ts  impact(): wuchtDamage statt Festwert; Meteor-Aufruf; meteorSpent
src/materials/WaterMaterial.ts  Tropfentreffer am Gegner → applyWet
src/materials/IceMaterial.ts    Scherbentreffer am Gegner → chillEnemy
src/materials/FireMaterial.ts   Capture-Flag (keine Explosion im Wirbel), Freilassen mit Rest-Q
src/attacks/AirGustAttack.ts    Windstoß auf Gegner → chillEnemy; Kurzklick → tornado.volley zuerst
src/attacks/AirTornadoAttack.ts volley(direction); Feuerball aufnehmen; Wirbelkontakt → chillEnemy
src/entities/FlyingPlushEnemy.ts Darstellung Nass
src/elements/ElementController.ts WindMarker anlegen und aufräumen
scripts/check-combos.py         Browserprüfung (siehe unten)
```

Kreuzabhängigkeiten laufen weiter über `ReactionSystem` (`applyWind`, `capture`, `heatSubstance`, `heatArea`); die Attacken bekommen keine neuen Callbacks zueinander.

## Reihenfolge der Umsetzung

1. `config/combos.ts`, `combat/wucht.ts` (mit Tests) und `EarthMaterial.impact` auf Wucht umstellen. Prüfung: bestehende Skripte grün, Schaden nie unter Festwert.
2. `combat/status.ts` (mit Tests), Nass an Wasser, Kältetreffer an Windstoß, Wirbel und Scherbe; Darstellung Nass. Damit läuft die Hagel-Kette.
3. Meteor (`Meteor.ts`, `isMeteorImpact` mit Tests, `meteorSpent`).
4. Salve (`volley`) für den Steinhagel.
5. Feuerwirbel (`FireVortex.ts`, Capture für Feuer, Freilassen).
6. Windmarkierung.
7. `check-combos.py` und Feinschliff der Darstellung.

## Prüfung

- **Vitest:** `wuchtDamage` (Untergrenze, Obergrenze, die drei Beispiele oben), `status.ts` (Nass erneuert, Dauer, Kälte nur bei nass und Stärke ≥ 0,3, Frostschutz, Trocknen), `isMeteorImpact` (Temperatur, Energie, Spieler ausgenommen, `meteorSpent`), Feuerwirbel-Rechnung (Q-Abfluss, Blockwärme reicht für Glühen bei 0,5 m).
- **Browser:** `scripts/check-combos.py`, Aufbau analog `check-reactions.py`: Block wird per Windstoß beschleunigt und trifft härter als der Wurf; glühender schneller Block explodiert beim Einschlag; Wasserstrahl, dann Windstoß ergibt Scherben und fesselt einen nassen Gegner; Salve schleudert mehrere Blöcke; Feuerball im Wirbel explodiert nicht und heizt Blöcke; Körperzählung bleibt ≤ 240.
- Bestehende Skripte und `npm test` laufen weiter.
- `/balance-check` auf `src/config/combos.ts` nach dem ersten Spieltest, `/perf-profile` für Hagel und Steinhagel.

## Später (bewusst nicht in dieser Stufe)

Sandsturm (Wirbel plus Sand, Gegner verlangsamt und geblendet), Dampfdeckung (Wasser plus Feuer), Schlammfläche (Wasser plus Erde), Lavafläche, Klingenwirbel (Metallspitzen im Wirbel), heiße Rüstung (Feuer plus Metall), Metallhülle für Blöcke, Zweitelement-Abkürzung als Skilltree-Knoten.

## Dem Bauenden überlassen

- Genaue Farben, Partikelzahlen, Schleppenlängen und Ring-Dauern innerhalb des Pixel-Looks.
- Form der Eckklammern und des Pfeils der Windmarkierung.
- Wie der Feuerball im Wirbel geführt wird (eigene Umlaufbahn oder Mitte), solange er keine Blöcke berührt und nicht explodiert.
- Feinabstimmung aller Startwerte aus `config/combos.ts` nach Spieltest.
