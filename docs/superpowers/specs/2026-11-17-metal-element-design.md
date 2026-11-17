# Element Metall – Design

Stand: 2026-11-17. Baut auf dem Elementreaktionssystem (`src/materials/`), der HTML-Leiste unten (`src/ui/HudBar.ts`), den Skilltrees (`src/progression/`, `src/ui/SkillTreePanel.ts`) und dem Startmenü auf.

## Absicht

Metall wird das fünfte bändigbare Element. Es ist ein **Verbrauchselement**: Metall muss erst in der Welt erzeugt werden (Feuer auf Erde), dann wird es als Rüstung angelegt und schließlich entweder durch Treffer oder durch den Angriff verbraucht. Die Inszenierung soll episch sein: Klumpen reißen sich vom Boden los, fliegen zur Figur, verschmelzen glühend und legen sich als Platten an; beim Angriff zerlegt sich die Rüstung in Spitzen, die als Kugel kreisen und dann explodieren.

„Eigene Physik" heißt hier: Metall bewegt sich mit echten Kräften, Geschwindigkeiten und Kollisionen. Es heißt **nicht**, dass Metall die Bewegung des Spielers beeinflusst (kein Zusatzgewicht, keine veränderte Kollisionsform).

## Ziele

1. Feuer auf einen Erdblock erzeugt direkt einen Metallklumpen (der Weg über Wasser/Sand entfällt für Metall).
2. Metall ist Element 5 (Taste 5, Mausrad, HUD unten, eigener Skilltree-Reiter).
3. Kurzer Linksklick mit Metall ohne Rüstung: alle Metallklumpen in Reichweite werden gebändigt und zur Rüstung.
4. Rüstung: 25 Schutzpunkte vor dem Leben, als echte Physikplatten an der Figur, sichtbar in der HUD-Leiste.
5. Gehaltener Linksklick mit Rüstung: Aufladen zu einer Spitzen-Kugel, Loslassen schleudert die Spitzen (Fächer zur Maus + Rest rundum); die Rüstung ist danach vollständig verbraucht.
6. Epische, prozedurale Animation im bestehenden Pixel-Look.

## Nicht-Ziele

- Keine Änderung an Laufen, Springen, Stufenlogik, Bauchlage oder Spielerkollision.
- Kein zweites Metall-Rezept, kein Metall aus anderen Quellen.
- Keine neuen Gegner, kein Sound, keine neuen Skilltree-Knoten-Inhalte (Metall bekommt dieselben Standardknoten wie die anderen Elemente).

## Anti-Ziele (das wäre ein Misserfolg)

- Die Figur bewegt sich mit Rüstung anders als ohne (Tempo, Sprunghöhe, Stufen, Hängenbleiben).
- Platten zittern, verrutschen sichtbar von der Figur weg oder bleiben beim Teleport (Rückruf, Aufzug) zurück.
- Metall verschwindet wortlos oder vermehrt sich (die Masse der Klumpen wird zur Rüstung, die Rüstung zu Spitzen, die Spitzen zerfallen).
- Bestehende Prüfungen (`check-movement.py`, `check-grenzland.py`, `check-reactions.py`, `check-skills-menu.mjs`, Vitest) brechen.

## Entscheidungen des Auftraggebers

- **Erzeugung:** Feuer auf Erdblock → direkt Metall. Sand + Feuer → Metall darf als Nebenweg bestehen bleiben, ist aber nicht der beworbene Weg.
- **Rüstung bei 0 Schutzpunkten:** Platten zerfallen, das Metall ist weg (kein Zurückfallen als Klumpen).
- **Angriff verbraucht die Rüstung komplett**, unabhängig von der Aufladedauer.
- **Spitzen fliegen als Fächer zur Maus**, der Rest rundum.
- **Rüstung als echte Physikplatten an der Figur, ohne Einfluss auf die Bewegung** (Bauweise „B ohne Gewicht", siehe unten).

## Entscheidungen nach der Bauleiter-Prüfung (vom Bauenden getroffen, Auftraggeber kann kippen)

1. **Direkter Treffer heizt voll.** `heatArea` schwächt die Wärme mit der Entfernung ab; beim geladenen Feuerball käme ein 0,5-m-Block nur auf ~1285 °C. Neu: Der Stoff, an dem der Feuerball tatsächlich explodiert (Kollisionspartner), erhält die volle Wärme ohne Abschwächung; alle anderen im Radius wie bisher. Damit macht **ein geladener Feuerball genau einen Klumpen** aus einem kleinen Block (~1515 °C ≥ 1500 °C). Kopplungsfaktor und Sand-/Metall-Werte bleiben unverändert.
2. **Heiße Blöcke verfallen nicht.** Solange ein Erdblock über `earthGlowC` (500 °C) ist, pausiert seine 10-s-Lebenszeit. Mehrere ungeladene Treffer schnell hintereinander funktionieren so ebenfalls, der beworbene Weg bleibt aber der geladene Feuerball.
3. **„Masse bleibt erhalten" ist optisch gemeint:** Nichts verschwindet ohne sichtbaren Effekt. Die Rüstung hat immer 25 Punkte, die Spitzen haben eine feste Masse (1,5 kg), ihre Zahl wächst mit der Ladung. Die Klumpenmasse beeinflusst nur Trägheit und Wucht der Animation beim Anziehen.
4. **Schaden durch Metall:** Platten machen **keinen** Schaden (sie stoßen nur ab und fangen ab). Kreisende Spitzen beim Aufladen: 3 Schaden, einmal je Spitze und Gegner. Geschleuderte Spitzen: 8 bis 14 je nach Ladung, einmal je Spitze und Gegner. Nur diese Treffer bringen Metall-EP.
5. **Unterbrechungen:**
   - Rückruf (R) und Aufzug (E) brechen das Bändigen ab (Klumpen fallen am alten Ort zu Boden, nichts verloren) und lassen angelegte Rüstung **und** eine laufende Spitzen-Kugel unberührt (beide folgen der Figur sofort an den neuen Ort). Dafür bekommt Metall einen eigenen Abbruchpfad statt `cancelPreparedAttack()`.
   - Fokusverlust und Elementwechsel: Bändigen bricht ab (Klumpen fallen), laufende Aufladung bricht ab (Spitzen zerfallen, Rüstung weg, wie oben festgelegt).
   - Skilltree (K) pausiert die Szene: alles friert ein und läuft nach dem Schließen weiter.
   - Tod (0 Leben) und Absturz: Rüstung und Kugel sind weg.
   - Eingefangene Klumpen zählen während des Bändigens nicht gegen den 6er-Deckel.

## Bauweisen (Abwägung)

- **A – Schutzwert + gezeichnete Platten:** einfach, aber Platten sind nur Grafik.
- **B – Platten als angeklebte Physikkörper mit Masse:** spektakulär, verändert aber Spielermasse und Kollisionsform und bricht Stufen-/Bauchlage-Logik.
- **C – Reine Animation:** widerspricht „eigene Physik".

**Gewählt: B ohne Gewicht.** Die Platten sind echte Matter-Körper, die in jedem Physikschritt per Zielgeschwindigkeit an Ankerpunkte der Strichfigur gezogen werden. Sie kollidieren nur mit Gegnern (und später gegnerischen Geschossen), nie mit Spieler, Gelände oder Stoffen. Dadurch bleibt die Spielerbewegung unberührt, Gegner prallen aber physisch an den Platten ab.

## Ablauf im Detail

### 1. Erzeugung: Erde + Feuer → Metall

- Die Reaktion `fire:earth` läuft heute über `heatArea` → `EarthMaterial.heat`, der Block glüht. Neu: erreicht ein Erdblock `REACTIONS.sandMeltC` (1500 °C), wird er **zu einem Metallklumpen umgewandelt** (gleiche Masse, Kantenlänge aus Metalldichte, gleiche Position und Geschwindigkeit, Temperatur übernommen; er glüht also anfangs).
- Rechenbeispiel mit den bestehenden Konstanten: ein geladener Feuerball (4,5 MJ, Kopplung 60) erhitzt einen 0,5-m-Block (225 kg) um ~1500 K → genau ein Klumpen. Ein ungeladener Feuerball erhitzt um ~100 K; mehrere schnelle Treffer summieren sich, solange der Block nicht abkühlt (40 K/s). Große geladene Erdblöcke (bis 1,5 m, 6 t) brauchen entsprechend mehr; das ist gewollt.
- Verwandlungseffekt: Block glüht weiß auf, kurzer Blitz, Funken, dann liegt der Klumpen da. Wiederverwendet `MetalMaterial` (Deckel 6 Klumpen, ältester versinkt).
- Metallklumpen bleiben dauerhaft liegen (wie bisher), bis sie gebändigt werden.

### 2. Element 5 „Metall"

- `ElementId` bekommt `'metal'`, `ELEMENTS` einen fünften Eintrag (Label „Metall", Farbe ~`0x9aa4ad`). Taste 5 (`FIVE`), Mausrad zykliert über fünf.
- HUD unten zeigt fünf Elemente. Skilltree bekommt automatisch einen Metall-Reiter mit den Standardknoten; dafür braucht `SkillTreePanel` ein Metall-Icon und `Progression` migriert alte Spielstände ohne Metall-Eintrag (fehlend → Startwert).
- Metall-Treffer (Spitzen, Platten-Kontaktschaden) bringen EP für Metall über die bestehende `damageEnemy(…, element)`-Signatur.

### 3. Bändigen (kurzer Linksklick, keine Rüstung)

- Kurzer Klick (< 180 ms, wie bei den anderen Elementen) mit Metall, **ohne** angelegte Rüstung: Alle Metallklumpen im Umkreis `METAL.bendRangeM` (5 m) um die Figur werden erfasst. Keiner in Reichweite → nichts passiert, keine Abklingzeit.
- Mit angelegter Rüstung bewirkt ein kurzer Klick nichts (die Rüstung ist schon voll).
- **Phase „Losreißen" (~250 ms):** jeder Klumpen bekommt einen Aufwärtsimpuls und Drehung; Staub/Funken am Boden; Klumpen werden für Gelände nicht mehr kollidierend (Kategorie für Flug), damit sie nicht hängen bleiben.
- **Phase „Anziehen":** Zielgeschwindigkeit zur Figur (Feder-Dämpfer-Steuerung wie die Wirbel-Umlaufbahnen in `AirTornadoAttack`), schwerere Klumpen reagieren träger, leichte Spiralbahn statt gerader Linie; Klumpen erhitzen sich sichtbar (Glühfarbe aus `glowFraction`).
- **Phase „Verschmelzen" (~400 ms, sobald alle Klumpen < ~0,8 m von der Figur):** Klumpen werden entfernt; an ihrer Stelle fließt eine glühende Metallmasse (gezeichnete, sich zusammenziehende Blobs) um den Torso, dann „schnappen" die Platten nacheinander auf ihre Anker (Brust zuerst, dann Arme, dann Beine), jeweils mit Funkenstoß. Abschluss: heller Ring, kurzer Hitstop (35 ms), Kamerawackeln klein.
- Ab dem Ende des Verschmelzens hat der Spieler **25 Schutzpunkte**, unabhängig von der Klumpenzahl. Mehr Klumpen machen nur die Animation wuchtiger (mehr Masse fliegt, mehr Funken).
- Während des Bändigens kann man sich frei bewegen; die Klumpen folgen. Elementwechsel oder Fokusverlust bricht ab: die Klumpen fallen als normale Klumpen zurück (nichts geht verloren, weil noch nicht verschmolzen).

### 4. Rüstung (Platten)

- **Anker:** Brust (Schulter–Hüfte), vorderer Oberarm, vorderer Unterarm, hinterer Oberarm, Oberschenkel ×2, Schienbein ×2 – also ~8 Platten. `StickFigureView` stellt dafür die Gelenkpunkte pro Frame bereit (neuer Getter `armorAnchors()`; liefert Mittelpunkt und Winkel je Segment, auch in Bauchlage).
- **Körper:** kleine Rechtecke (Größe je Segment), `ignoreGravity`, eigene Kategorie `armor`, Maske nur `enemy`. Pro Physikschritt: Zielgeschwindigkeit = (Anker − Position) · Federkonstante, gedämpft; Winkel folgt dem Segmentwinkel. Weicht eine Platte > 12 px ab (Teleport), wird sie direkt auf den Anker gesetzt.
- **Treffer:** Kollidiert ein Gegner mit einer Platte, prallt der Gegner ab (normale Matter-Kollision), die Platte wird eingedrückt und federt zurück, Funken. Gegnerkontakt auf Platte oder Spieler zieht `COMBAT.contactDamage` zuerst von den Schutzpunkten ab (gleiche 800-ms-Schutzzeit wie heute). Überschüssiger Schaden geht ins Leben.
- **Darstellung:** Platten in Metallfarben mit heller Oberkante, ab Schaden zunehmend Dellen/Risse (gezeichnete Linien) in Abhängigkeit vom verbleibenden Schutz.
- **Bersten bei 0:** alle Platten lösen sich mit Impuls nach außen, zerfallen in Splitter und Staub, kurzer Hitstop; Metall ist weg.
- **Rückruf/Neustart/Startmenü:** Rüstung bleibt beim Rückruf zum Lager (R) erhalten, beim Szenen-Neustart (T) und beim Zurück ins Startmenü wird sie verworfen.

### 5. Angriff „Spitzen-Sphäre" (Halten mit Rüstung)

- Halten ≥ 180 ms mit Metall **und** angelegter Rüstung startet das Aufladen (2 s bis voll, wie die anderen Elemente). Ohne Rüstung startet Halten nichts.
- **Aufladen:** Die Platten lösen sich nacheinander, strecken sich zu Spitzen (dünne, spitze Polygone) und kreisen auf mehreren gegeneinander verkippten Bahnen um die Figur (Pseudo-3D-Kugel: Spitzen hinter der Figur dunkler/kleiner gezeichnet). Mit der Ladung steigen Anzahl (8 → 24 Spitzen; Platten teilen sich), Umlaufgeschwindigkeit und Radius; leichtes Kamerazittern ab 35 % wie beim Feuer. Die Spitzen sind während des Kreisens echte Körper (Kategorie `armor`, Maske `enemy`), Gegner, die in die Kugel fliegen, werden getroffen und weggestoßen.
- Ab Beginn des Aufladens zählen die Schutzpunkte nicht mehr (die Rüstung ist „in Bewegung"); Abbruch durch Elementwechsel oder Fokusverlust: Spitzen fallen als Splitter zu Boden und zerfallen, Rüstung ist weg (konsistent mit „komplett verbrauchen").
- **Loslassen:** Hälfte der Spitzen fliegt in einem Fächer von ±35° zur Maus, die andere Hälfte gleichmäßig rundum. Startgeschwindigkeit `METAL.spikeSpeedMs` (~22 m/s, ladungsabhängig 16–26), Masse je Spitze aus 25 LP-Rüstung abgeleitet (fest, z. B. 1,5 kg), Gravitation wirkt leicht (Bogen). Treffer: Schaden `COMBAT.metalSpikeDamage` (8, geladen bis 14) einmal je Spitze und Gegner, Rückstoß. Spitzen bleiben in Gelände/Erdblöcken stecken (Körper wird statisch), glühen kurz nach und zerbröseln nach ~1,5 s.
- Danach: keine Rüstung, Abklingzeit 900 ms.

### 6. HUD

- Untere Leiste: neben dem Lebensbalken ein Rüstungsbalken in Metallfarbe („Rüstung 18 / 25"), nur sichtbar, solange Rüstung angelegt ist. Elementliste zeigt Metall als fünftes Element.

## Architektur (festgelegt)

```
src/config/elements.ts       + 'metal' (Taste 5)
src/config/metal.ts          Stellwerte: bendRangeM, armorPoints 25, Plattenfeder, Spitzenzahl, Tempi, Schaden, Zeiten
src/config/collision.ts      + Kategorie armor (Maske: enemy)
src/materials/EarthMaterial.ts   heat(): ≥ sandMeltC → materials.metal.fromEarth(rock)
src/materials/MetalMaterial.ts   fromEarth(rock); claim(lumps) / release(lumps) für das Bändigen
src/combat/Armor.ts          reiner Schutzwert (absorb(amount) → Rest fürs Leben); Vitest
src/entities/Player.ts       takeDamage: zuerst armor.absorb; Player besitzt Armor
src/entities/StickFigureView.ts  armorAnchors(): Segment-Mittelpunkte und Winkel (keine Posenänderung)
src/metal/MetalBending.ts    Bändigen: Losreißen, Anziehen, Verschmelzen (Animation + Physik)
src/metal/ArmorPlates.ts     Plattenkörper, Ankerfolge, Treffer-Feedback, Bersten, Darstellung
src/metal/SpikeSphere.ts     Aufladen (Kugel), Loslassen (Fächer + rundum), Spitzen-Lebenszyklus
src/attacks/MetalAttack.ts   Attack-Schnittstelle: execute = Bändigen, beginCharge/release = Sphäre
src/elements/ElementController.ts  Metall verdrahten (Taste 5, heldCast erweitert)
src/ui/HudBar.ts             Rüstungsbalken
src/ui/SkillTreePanel.ts     Metall-Icon
src/progression/Progression.ts  fehlender Metall-Eintrag in alten Spielständen → Startwert
```

## Prüfung

- Vitest für reine Logik: `Armor.absorb` (Rest, 0-Grenze, nicht negativ), Spitzen-Verteilung (Hälfte im ±35°-Fächer, Hälfte gleichmäßig), Erd→Metall-Schwelle (geladener Feuerball auf 0,5-m-Block reicht, ungeladener nicht), Progression-Migration ohne Metall-Eintrag.
- Browser (Playwright-MCP, bei dir zusätzlich die Skripte): Feuer auf Erdblock → Klumpen; Bändigen → 25 Schutz, Platten folgen beim Laufen/Springen/Bauchlage, Bewegungswerte identisch mit/ohne Rüstung (Bremsweg, Sprunghöhe, Treppe); Gegnerkontakt → Schutz sinkt, Leben bleibt; 0 Schutz → Platten bersten; Halten → Kugel, Loslassen → Spitzen treffen, Rüstung weg; Taste 5/Mausrad/Skilltree-Reiter.
- `check-reactions.py` um „Feuer auf Erde → Metall" erweitern.

## Dem Bauenden überlassen

- Genaue Farben, Partikelzahlen, Plattengrößen und Federkonstanten innerhalb des Pixel-Looks.
- Genaue Kurvenform der Spiralbahn beim Anziehen.
- Ob Spitzen beim Kreisen leicht wackeln/zittern.
