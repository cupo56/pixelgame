# Elementreaktionen und Elementdarstellung – Design

Stand: 2026-11-17. Gilt für den Prototyp im Ordner `pixelgame` (Phaser 4, Matter.js, TypeScript, Vite).

## Absicht

Die vier Elementangriffe sollen sich wie echte Stoffe verhalten, die aufeinander reagieren, und dabei deutlich eindrucksvoller aussehen. Das Spiel ist an das Bändigen der vier Elemente angelehnt, soll aber eigenständiger wirken: Nicht die Figur, sondern **die Elemente selbst** tragen die Inszenierung. Die Leitidee des Projekts ist „1:1-Physik wie auf der Erde“ (SI-Einheiten, echte Masse, Energie, Temperatur). Reaktionen folgen daraus, nicht aus Sonderfällen.

Später kommt **Metall** als fünftes bändigbares Element. Dieses Design legt den Stoff Metall bereits an, aber noch keine Metall-Angriffe.

## Ziele

1. Eine vollständige Reaktionsmatrix zwischen den Stoffen Feuer, Wasser, Erde, Sand, Metall, Eis, Dampf und dem Feld Luft (siehe Matrix unten).
2. Eine neue, deutlich reichere Darstellung jedes Elements im Flug, beim Aufprall und als Rückstand in der Welt.
3. Ein zentrales Reaktionssystem, in dem jede Reaktion genau einmal definiert ist, sodass Metall später mit einer Materialdefinition und einigen Tabellenzeilen ergänzt werden kann.
4. Spürbares Treffer-Feedback (Aufprallringe, kurzer Hitstop bei wuchtigen Treffern).

## Nicht-Ziele

- Keine Änderung an der Strichfigur, ihren Posen oder der Bewegungsphysik des Spielers.
- Keine Metall-Angriffe, keine Elementfreischaltung, keine neuen Gegner, kein Sound.
- Keine Flüssigkeitssimulation (kein Partikelfluid). Wasser bleibt Tropfen, Pfütze und Peitsche.

## Anti-Ziele (das wäre ein Misserfolg)

- Reaktionen, die zweimal zünden oder sich gegenseitig endlos auslösen (Dampf → Wasser → Dampf …).
- Mehr als etwa 250 dynamische Körper in der Welt; Framerate unter 55 fps auf einem normalen Laptop.
- „Magische“ Ausnahmen, die dem physikalischen Modell widersprechen (z. B. ein Tropfen löscht einen 4,5-MJ-Feuerball).
- Bruch der bestehenden Browserprüfungen `scripts/check-movement.py` und `scripts/check-grenzland.py`.

## Rahmenbedingungen

- Phaser 4.2, Matter.js, TypeScript strict (`npm run build` = `tsc && vite build` muss fehlerfrei laufen).
- Pixel-Look: Formen aus gerasterten Rechtecken/Kreisen, Partikel bleiben 3-px-Quadrate (`SPARK_TEXTURE`), `pixelArt: true`.
- Alle Stellwerte in SI-Einheiten in `src/config/*.ts`, Umrechnung nur über `config/physics.ts`.
- Fester 60-Hz-Physikschritt; Körper werden erst nach dem Physikschritt entfernt (`delayedCall(0, …)`), wie heute.
- Kommentare und Spieler-sichtbare Texte auf Deutsch, wie im übrigen Code.
- Kollisionsmasken aus `config/collision.ts` erweitern, nicht umgehen.

## Bauweisen (Abwägung)

**A – Paarweise Verdrahtung (heutiges Muster).** `ElementController` reicht Callbacks zwischen den Attack-Klassen durch (`water → fire.extinguish`, `air → earth.pushWithAir`, Tornado-Capture-Interface). Schnell für wenige Reaktionen; bei ~15 Zellen und einem fünften Element wird jede Attacke von jeder anderen abhängig.

**B – Zentrales Reaktionssystem (gewählt).** Jeder physische Stoff ist ein *Material* mit Zustandsgrößen (Temperatur, Masse, Nässe, Wärmeinhalt). Eine Reaktionstabelle entscheidet bei Kollisionen; ein Thermomodell pro Schritt entscheidet über Zustandswechsel (Verdampfen, Gefrieren, Schmelzen). Attacken erzeugen nur noch Stoffe. Mehr Umbau am Anfang, dafür konsistente Physik und ein Ort für alle Regeln.

Entscheidung des Auftraggebers: **B**.

## Das Modell

### Stoffe

| Stoff | Körper | Zustandsgrößen | Entsteht durch |
|---|---|---|---|
| **Feuer** (Feuerball) | Sensorkreis, keine Gravitation | Wärmeinhalt Q (J), Radius | Feuerangriff |
| **Wasser** (Tropfen) | Kreis 0,08 m, 0,15 kg | Temperatur (°C), Ruhezeit | Wasserangriff, schmelzendes Eis |
| **Pfütze** | flacher statischer Sensorstreifen auf Gelände | Wassermasse (kg), Temperatur | Tropfen, die ≥ 400 ms auf Gelände ruhen, sammeln sich |
| **Eis** (Scherbe) | fester Kreis/Polygon, Reibung 0,02 | Temperatur (°C) | Wasser ≤ 0 °C |
| **Eisfläche** | statische Platte auf Gelände, Reibung 0 | Temperatur | Pfütze ≤ 0 °C |
| **Erde** (Block) | Rechteck, Dichte 1800 kg/m³ | Nässe (kg Wasser), Temperatur | Erdangriff (bestehende Hebe-/Wurflogik bleibt) |
| **Sand** (Körner) | Cluster kleiner Kreise, Dichte 1600 kg/m³ | Temperatur je Korn | Erde, deren Nässe die Schwelle überschreitet |
| **Metall** (Block) | Rechteck, Dichte 7800 kg/m³ | Temperatur | Sand, der auf Schmelztemperatur gebracht wird |
| **Dampf** | kein Körper, nur Partikelwolke | – | Wasser ≥ 100 °C, Feuer trifft Pfütze/Eis |

**Luft** ist kein Körper, sondern ein Feld: Windstoß (Kegelimpuls) und Wirbelsturm (Umlaufbahnen) wirken über eine Wind-Schnittstelle des Reaktionssystems auf Stoffe.

### Reaktionsmatrix

| | Feuer | Wasser (Tropfen/Pfütze) | Eis | Erde | Sand | Metall |
|---|---|---|---|---|---|---|
| **Feuer** | – | Tropfen verdampft (Dampf), Feuer verliert Q um die Verdampfungswärme; Q ≤ 0 → Feuer erlischt in Dampf, keine Druckwelle. Pfütze: verdampft anteilig, Feuer explodiert normal. | Eis schmilzt zu Wasser (+ Dampf), Feuer explodiert normal | Block erhitzt, glüht; glühender Block verursacht Kontaktschaden (Brand); Feuer explodiert normal | Körner im Explosionsradius erhitzen; erreichen sie die Schmelztemperatur, verschmelzen **alle heißen Körner im Radius zu einem Metallblock** (Masse erhalten, Volumen aus Metalldichte) | Block erhitzt, glüht; Feuerball **prallt ab** (Restitution) statt zu explodieren |
| **Luft** | Windstoß beschleunigt den Feuerball in Windrichtung und vergrößert ihn (+Q, bis ×1,6). Wirbelsturm fängt ihn: **Feuerwirbel** (optional, siehe Ausbaustufe) | Windstoß stößt Tropfen weg und kühlt sie; Wirbelsturm saugt Tropfen auf und schleudert sie. Jeder Windkontakt senkt die Temperatur; ≤ 0 °C → Eis. Pfütze → Eisfläche | wird gestoßen/aufgenommen wie Erde | wie heute: Schub, Wirbelsturm fängt | Körner werden als **Sandwolke** verweht (Körner fliegen mit dem Wind, leichter Schaden, landen wieder als Sand) | kaum Wirkung (schwer) |
| **Wasser** | s. o. | Tropfen vereinigen sich am Boden zur Pfütze | – | Block wird nass; Nässe ≥ Schwelle → **zerfällt zu Sand** | Sand wird nass (keine weitere Reaktion) | heißes Metall: Wasser verdampft (Dampf), Metall kühlt ab |
| **Eis** | s. o. | – | – | Scherben zerspringen am Block | – | – |

Bestehende Treffer gegen Gegner bleiben (Schaden, Rückstoß, Eisfessel durch geladene Peitsche, Windhalten).

### Thermomodell (alle Konstanten in `src/config/reactions.ts`)

- Umgebung: 15 °C. Jeder Stoff nähert sich der Umgebung mit einer stoffspezifischen Rate (Eis ~ +4 K/s → Scherbe schmilzt nach ~8 s; Metall ~ –60 K/s bis es nicht mehr glüht).
- Wasser: Starttemperatur 15 °C. Verdampfung bei ≥ 100 °C. Gefrieren bei ≤ 0 °C.
- Windkühlung: Windstoß –30 K × Stärke pro Kontakt; Wirbelsturm –60 K/s während der Gefangenschaft. Ein Tropfen gefriert also nach einem vollen Stoß aus nächster Nähe oder ~0,25 s im Wirbel. (Physikalisch ist das Verdunstungskälte in Reinform, bewusst kräftig, damit es lesbar ist.)
- Feuer: Wärmeinhalt Q = linear(0,3 MJ, 4,5 MJ) über die Aufladung. Verdampfungswärme von Wasser 2,26 MJ/kg → ein Tropfen (0,15 kg) kostet 0,34 MJ. Kleiner Feuerball erlischt am ersten Tropfen, voll geladener braucht ~13 Tropfen (etwa eine viertel Sekunde Dauerstrahl) oder einen Peitschentreffer (Peitsche zählt als 1,5 kg, geladen 4 kg).
- Erde → Sand: Nässeschwelle ∝ Oberfläche: `SAND_WATER_KG_PER_M2 × Kantenlänge²`. Mit 12 kg/m²: 0,5-m-Block nach ~20 Tropfen (~0,4 s Strahl), 1,5-m-Block nach ~180 Tropfen (~3 s).
- Sand → Metall: Schmelztemperatur 1500 °C. Ein Feuerball erhitzt Körner im Explosionsradius um ΔT ∝ Q × Abfall / Kornmasse; ein geladener Feuerball reicht für einen kleinen Sandhaufen, ein kleiner Feuerball braucht mehrere Treffer (Körner behalten Wärme einige Sekunden).
- Metall: glüht sichtbar ab 500 °C (Farbverlauf dunkelrot → orange → gelb), Kontaktschaden an Gegnern ab 500 °C.

### Sand im Detail

Ein Block der Kantenlänge *a* zerfällt in `round(10 × (a / 0,5 m)²)` Körner (0,5 m → 10, 1,5 m → 90, gedeckelt bei 60 pro Block und 200 Körnern weltweit; überzählige Masse geht in größere Körner). Körner sind kleine Kreise (Radius 4–6 px), Reibung 0,6, geringe Restitution; sie bilden von selbst Haufen. Gegner, die einen Haufen berühren, werden gebremst (Geschwindigkeit ×0,6 pro Kontakt-Schritt). Luft verweht Körner: Sie erhalten Windimpuls plus Auftrieb, fliegen als Wolke, verursachen 1 Schaden pro Korn-Treffer bei ≥ 6 m/s. Körner, die 12 s ruhen, versinken (verschwinden mit kleinem Staubpuff), damit die Welt sich aufräumt.

### Eis im Detail

Scherbe: fester Körper in Tropfengröße, Masse wie Tropfen, Reibung 0,02 → rutscht. Aufprall ≥ 6 m/s auf Gegner: 3 Schaden. Aufprall ≥ 10 m/s auf irgendetwas: zerspringt in Eispartikel. Schmilzt bei > 0 °C zurück zu einem Tropfen. Eisfläche: statische Platte (Höhe 3 px) über der Pfützenbreite mit Reibung 0; Spieler, Gegner, Blöcke rutschen. Schmilzt nach ~10 s zurück zur Pfütze.

### Pfützen im Detail

Tropfen, die ≥ 400 ms auf Gelände ruhen, werden entfernt und ihre Masse einer Pfütze an dieser Stelle zugeschlagen (neue Pfütze oder vorhandene im Abstand ≤ 20 px). Breite wächst mit der Masse (0,15 kg → 8 px, gedeckelt bei 96 px). Pfütze ist Sensor + Dekal, verdampft langsam (verschwindet nach 12 s ohne Nachschub).

### Entscheidungen des Auftraggebers nach der Bauleiter-Prüfung

- **Spieler rutscht auf Eisflächen.** Ausnahme vom Nicht-Ziel: `Player.ts` bekommt einen kleinen Untergrund-Hook (Reibungsfaktor des Bodens unter den Füßen, 1 = normal, ~0,08 auf Eis), der `stopDecelMs2` und `groundAccelMs2` skaliert. Normaler Boden bleibt unverändert, `check-movement.py` muss weiter bestehen.
- **Hitze-Kopplung an Festkörper:** Wasser rechnet exakt mit der Verdampfungswärme. Für Erde, Sand und Metall gilt ein offen dokumentierter Faktor `FIRE_SOLID_COUPLING ≈ 60` in `config/reactions.ts` (Begründung im Code: der Bändiger-Feuerball wirkt als anhaltende Flamme, nicht als einmaliges Energiepaket). Mit ihm glüht ein 0,5-m-Erdblock nach einem geladenen Feuerball, und ein geladener Feuerball schmilzt einen kleinen Sandhaufen (10 Körner) zu Metall; ein ungeladener braucht mehrere Treffer.
- **Metallblöcke sind dauerhaft** (keine Lebenszeit), maximal **6 weltweit**; beim siebten versinkt der älteste mit kurzer Animation (Staub, 300 ms Absinken). Erdblöcke behalten ihre 10 s, auch nass oder heiß.

### Kollisionen mit dem Spieler (meine Entscheidung)

- **Sandkörner und Eisscherben** ignorieren den Spieler (Maske wie Wasser): Er läuft durch Sandhaufen, eigene Scherben treffen ihn nicht. Grund: 200 Körner × Spielerkontakt wäre ein Performance-Risiko, und Sand als Hindernis würde die Bewegungsprüfungen gefährden.
- **Metallblöcke** verhalten sich wie Erdblöcke: kurze Schonfrist nach der Entstehung, dann solide (begehbar, schiebbar).
- **Eisflächen** sind statisch und solide.
- Die Gegner-Maske in `FlyingPlushEnemy` wird um `ice` und `sand` erweitert, sonst gibt es keinen Scherben-/Kornschaden.

### Körperbudget (meine Entscheidung)

`ReactionSystem.spawn` verwaltet ein globales Budget von **240 dynamischen Stoffkörpern** (Tropfen, Körner, Scherben, Feuerbälle, Blöcke). Teildeckel: Tropfen 120 (heute 160), Körner 160. Ist ein Deckel voll, wird der **älteste ruhende** Körper derselben Art verdrängt (mit kleinem Puff), wie heute beim ältesten Tropfen. Ein Block zerfällt immer; stehen weniger Plätze frei als Körner gewünscht, entstehen weniger, größere Körner (mindestens 4). Die 13-Tropfen-Rechnung bleibt davon unberührt.

### Feuer-Q koppelt alles (meine Entscheidung)

Schaden, Druckwellenradius, Impuls und die Hitstop-Schwelle des Feuerballs leiten sich aus dem **aktuellen Q** ab, nicht aus der ursprünglichen Aufladung. Ein von einer Pfütze geschwächter Feuerball explodiert schwächer, ein vom Wind genährter stärker. `config/combat.ts` behält `fireDamage`/`chargedFireDamage` als Endpunkte, die über Q/Q_max interpoliert werden.

## Darstellung (die „Animationen der Elemente“)

Alles prozedural mit `Graphics` und `SPARK_TEXTURE`, gerastert.

- **Feuerball:** Flammenkern aus 3–4 flackernden Zungen (Polygon, per Frame leicht verschoben), additiver Hitzeschein, dahinter Rauchschleppe (dunkelgraue, *nicht* additive Partikel, die aufsteigen und 1,2 s bleiben), Glutpunkte mit Gravitation. Größe und Zungenzahl aus Q. Explosion: 2-Frame-Weißblitz, expandierender Druckwellenring (Linie, dünner werdend), Rauchpilz 1,5 s, Brandfleck-Dekal auf Gelände (6 s Ausblenden). Geladene Explosion: Hitstop 50 ms. Erlöschen im Wasser: Dampfwolke, Zischen-Partikel, kein Ring.
- **Wasser:** Tropfen als Ellipse, in Flugrichtung gestreckt (Länge ∝ Geschwindigkeit), heller Glanzpunkt oben links. Benachbarte Tropfen (< 14 px) werden mit einer dünnen Linie verbunden, sodass der Strahl zusammenhängend wirkt. Aufprall: kleiner Ring + 3–5 Spritzer. Pfütze: flacher Streifen mit Glanzlinie, leicht wellig. Dampf: helle, aufsteigende, nicht additive Partikel, die sich ausdehnen.
- **Eis:** Scherbe als unregelmäßiges Sechseck, hellblau mit weißer Kante; Eisfläche als heller Streifen mit Rissen. Zerspringen: Eispartikel, kurzer heller Ring.
- **Luft (Windstoß):** zusätzlich zum Partikelkegel 3–4 gebogene Windstreifen, die als Linienbögen vom Ursprung nach außen laufen und ausblenden (240 ms); vom Boden gezogener Staub entlang des Kegels. Wirbelsturm bleibt wie heute, bekommt aufgewirbelte Tropfen/Körner als Umlaufkörper.
- **Erde:** Hebelogik bleibt. Aufprall ≥ 3 m/s: Rissdekal auf Gelände (wie `crackGround`) plus 2–4 Geröllpartikel. Nasser Block wird dunkler (Farbe mit Nässe gemischt), zeigt Tropfenläufe; Zerfall zu Sand: Block zerbröselt sichtbar (Körner spawnen innerhalb der Blockfläche, Staubpuff).
- **Sand:** Körner in zwei Sandtönen, Haufen wirkt durch Überlappung. Sandwolke: Körner plus Staubpartikel.
- **Metall:** dunkelgrauer Block mit abgeschrägter heller Oberkante und einem Glanzstreifen; Glühen als Farbmischung Richtung Orange/Gelb plus additiver Schein; Hitzeflimmer-Partikel über heißem Metall. Entstehung aus Sand: kurzer weißer Blitz, Körner ziehen sich 200 ms zur Blockmitte zusammen (Tween der Grafik), dann Block.
- **Treffer-Feedback (alle Elemente):** Aufprallring in Elementfarbe an jedem Treffer gegen Gegner (12 → 24 px, 160 ms). Hitstop 35 ms bei geladenem Erdblock und geladenem Feuerball, 50 ms bei Explosion ≥ geladen. `hitStop` aus `effects/juice.ts` wird dafür benutzt; es darf höchstens ein Hitstop gleichzeitig laufen.

## Architektur (festgelegt)

```
src/materials/
  Substance.ts       Typen: SubstanceKind, Substance (kind, body, temperatureC, massKg, wetnessKg, heatJ, view-Hooks)
                     Registry: WeakMap<Body, Substance> + Set<Substance> für Iteration, register/unregister/get/kindOf
  reactions.ts       REAKTIONSTABELLE: Map<"a:b", Handler>; symmetrische Suche; Handler bekommen (a, b, Kontaktpunkt, ctx)
  ReactionSystem.ts  ein COLLISION_START-Listener für alle Stoffe; Thermoschritt pro Physikschritt (BEFORE_UPDATE);
                     Wind-API applyWind(body, direction, strength, source) und captureInVortex/releaseFromVortex;
                     spawn(kind, x, y, opts) delegiert an Materialfabriken; verhindert Doppelzündung über ein Set pro Schritt
  FireMaterial.ts, WaterMaterial.ts, IceMaterial.ts, EarthMaterial.ts, SandMaterial.ts, MetalMaterial.ts, Puddle.ts
                     je: Körper anlegen, zeichnen, Lebenszeit, Zustandswechsel (transformTo), destroy
  SteamEffect.ts     reine Partikelwolke
src/effects/
  decals.ts          Brandfleck, Risse, Pfützen-/Eisflächendekal mit Ausblenden
  impact.ts          Aufprallring, Weißblitz, Druckwellenring, hitStop-Wrapper (nur einer gleichzeitig)
  particles.ts       erweitert um smoke(), embers(), steam(), sandCloud()
src/config/
  reactions.ts       alle Konstanten: Umgebungstemperatur, Verdampfungswärme, Schwellen, Raten, Dichten, Deckel
  collision.ts       neue Kategorien: ice, sand, metal (Masken: Tropfen/Körner kollidieren nicht untereinander – Gruppen)
```

- `EarthRockAttack` behält Heben/Aufladen/Werfen, übergibt den gestarteten Block an `EarthMaterial`/Registry und verliert `pushWithAir`, `captureInTornado`, `releaseFromTornado`, `isRock`.
- `AirGustAttack.pushBodies` und `AirTornadoAttack` rufen `ReactionSystem.applyWind` bzw. `captureInVortex`; das Interface `TornadoRocks` entfällt. Der Wirbel kann Erde, Sand, Eis, Wasser (und optional Feuer) aufnehmen.
- `FireballAttack` und `WaterJetAttack` behalten Zielen/Aufladen/Spawnen, verlieren ihre eigenen Kollisions-Listener (`checkHit`, `splash`) und `extinguish`.
- `ElementController` konstruiert `ReactionSystem` einmal und reicht es an die Attacken; alle Kreuz-Callbacks entfallen.
- Gegner bleiben über `combat/damage.ts` erreichbar; Reaktionshandler rufen `damageEnemy`, `freezeEnemy`, `holdEnemyInWind` wie heute.

## Reihenfolge der Umsetzung (Empfehlung)

1. Registry, Reaktionstabelle, ReactionSystem, Konfiguration; bestehende Reaktionen (Wasser löscht Feuer, Luft stößt Erde, Wirbel fängt Erde) ins System überführen, Verhalten unverändert. Browserprüfungen laufen weiter.
2. Thermomodell: Feuer-Q, Tropfentemperatur, Verdampfen mit Dampf, Mengenabhängigkeit des Löschens.
3. Wasser → Pfütze; Luft kühlt → Eis-Scherbe, Eisfläche; Feuer schmilzt Eis.
4. Erde + Wasser → Sand (Nässe, Zerfall, Körner, Bremsen, Verwehen).
5. Sand + Feuer → Metall; Metall-Glühen, Abprallen, Wasser auf heißem Metall.
6. Luft + Feuer (Beschleunigen/Vergrößern).
7. Darstellung: Feuer, Wasser, Luft, Erde, Treffer-Feedback, Dekale.
8. Ausbaustufe (nur wenn Zeit): Feuerwirbel.

## Prüfung

- `npm run build` fehlerfrei nach jedem Schritt.
- Für die reine Logik (Reaktionstabelle, Thermomodell, Schwellen) wird **Vitest** als Dev-Abhängigkeit ergänzt (meine Entscheidung; Begründung: die Rechnungen sind rein und ohne Phaser testbar, Browserprüfungen sind dafür zu langsam). Tests unter `src/materials/*.test.ts`.
- Browserprüfung: bestehende `scripts/check-movement.py` und `scripts/check-grenzland.py` müssen weiter bestehen. Ein neues `scripts/check-reactions.py` prüft die Matrix szenisch (Wasser auf Feuerball, Wind auf Tropfen → Eis, Wasser auf Block → Sand, Feuer auf Sand → Metall) über Screenshots und Körperzählung; Aufbau analog zu den vorhandenen Skripten.

## Dem Bauenden überlassen

- Exakte Farben, Partikelzahlen, Zungenformen, Ring-Dauern – innerhalb des Pixel-Looks.
- Konkrete Zahl der Körner pro Block unter den genannten Deckeln; Korngrößenverteilung.
- Wie die Pfützenbreite genau aus der Masse folgt; wie Eisflächen mit Treppenstufen umgehen (einfachste Lösung: nur auf waagerechtem Gelände).
- Ob der Feuerwirbel umgesetzt wird.
- Aufteilung in Commits; Reihenfolge innerhalb eines Schritts.
