# Steinwand (Erde, rechte Maustaste) und Gegner-Geschosse

Stand: 2026-11-18, Branch `feat/kombos`. Entscheidungen des Nutzers: Wand als Erd-Stoff, Gegner-Projektile einbauen,
Wand hält Treffer aus und zerfällt dann. Korrektur danach: Die Wand sieht wirklich wie eine Mauer aus (nur dicker),
hat eine eigene Aufsteig-Animation und eine eigene Figurenhaltung, und sie wird mit dem **Fuß** abgefeuert, nicht mit der Hand.

## Ziel

Mit Erde gewählt: **rechte Taste halten** bändigt eine Steinmauer aus dem Boden. Sie schützt gegen Gegner-Geschosse.
Ein **Rechtsklick auf die stehende Mauer** tritt sie zur Maus. Die Mauer ist ein schwerer Erd-Stoff, damit gelten die
bestehenden Kombos ohne Sonderfall (Luftstoß, Feuer → Metall, Wasser → Sand).

## Ist-Stand

- Rechte Taste ist ungenutzt (`ElementController` reagiert nur auf `pointer.button === 0`, Kontextmenü ist aus).
- Gegner (`FlyingPlushEnemy`) schießen nicht, sie machen nur Kontaktschaden (`GameScene.onEnemyContact`).
- Die Gegnermaske kennt keine Erdblöcke; Blöcke treffen Gegner über die Aufprallprüfung in `EarthMaterial.impact`.
- Die Figur (`StickFigureView`) zeichnet Arme per Hand-Posen je Element; Beine folgen der Bewegung, nur ein „Stand“
  (`brace`) kann sie breiter stellen. Es gibt keine Tritt- oder Stampf-Haltung.

## Mauer

**Form:** eine breite Wand, nicht eine Säule: 1,2 m breit, 1 bis 5 m hoch je nach Aufladung, Tiefe 1,5 m (Masse bis etwa 16 t). Die Wand ist
dicker als eine normale Mauer, aber klar rechteckig, mit gerader Oberkante und leicht unregelmäßigen Rändern.

**Bändigen (RMB halten, nur Erdmodus, keine Mauer vorhanden):**
- **Zielen am Boden:** Die Mauer entsteht am Boden unter der Maus (auch wenn die Maus in der Luft ist: der nächste
  tragende Boden). Ein Zielzeichen (Fußabdruck mit Pfeilen und 1-m-Umriss) zeigt die Stelle, rot wenn dort nichts
  möglich ist. Reichweite 10 m waagerecht (weiter weg wird auf 10 m begrenzt), mindestens 1,5 m Abstand zum Spieler,
  Boden höchstens 5 m über oder unter den Füßen. Der Platz muss frei sein. Die Stelle wird beim Drücken festgelegt.
  Die Reichweite bleibt bewusst begrenzt (Balance, Sicht), ist aber groß genug, um die Mauer weit vor sich zu setzen.
- **Aufladen:** Je länger gehalten, desto höher: 1 m (Mindesthöhe) bis 5 m bei 1,6 s, also doppelt so hoch wie die
  erste Fassung (2,5 m nach etwa 0,8 s). Voll geladen steht die Mauer von selbst. Stößt sie oben an ein Hindernis,
  bleibt sie in der letzten freien Höhe stehen. Loslassen unter 1 m bricht ab.
- Nur eine Mauer gleichzeitig; eine neue ersetzt die alte (alte zerfällt). Abklingzeit 4 s nach Zerfall oder Tritt.

**Stehen:**
- Dynamischer Erdkörper (`Rock`-Substanz, Trägheit unendlich, hohe Reibung), kollidiert wie Gelände mit Gegnern und
  Spieler, hält also auch Gegner auf.
- **Haltbarkeit 60 LP.** Jedes Geschoss zieht seinen Schaden ab, Risse zeigen den Zustand, bei 0 bricht die Mauer in
  Brocken-Partikel. Ohne Treffer sinkt sie nach 15 s in den Boden.
- Kombos über die Substanz: Luftstoß schleudert sie, Feuer macht sie zu einem Metallklumpen, Wasser lässt sie zu
  Sand zerfallen. Als äquivalente Kantenlänge gilt √(Breite·Höhe) ≈ 1,7 m (wie der dicke Block, also Wasser nach etwa 6 Tropfen).

**Treten (RMB-Klick auf die stehende Mauer):**
- Der Spieler tritt mit dem vorderen Fuß zur Mauer (siehe Figur). Nach dem Treffpunkt des Tritts (150 ms) läuft ein
  Staubstoß über den Boden, danach gleitet die Mauer los.
- Flug in Zielrichtung, Neigung ±35° zur Waagerechten, Starttempo 14 m/s, Schwerkraft 0,6 s lang reduziert, bleibt
  aufrecht. Schaden nach Wucht (`wuchtDamage`, gedeckelt 60), jeder Gegner höchstens einmal pro Wurf.
- Harter Aufprall: sie bricht in 5 bis 7 Brocken (Partikel, kein Körperbudget). Sonst bleibt sie als Hindernis liegen,
  bis sie zerfällt.

## Darstellung der Mauer

- **Mauerwerk:** Steinquader in versetzten Lagen (Läufer-Verband), 5 Lagen zu je 2 bis 3 Steinen, helle Mörtelfugen,
  Kanten heller oben, dunkler unten, einzelne Ausbrüche. Farbe wie die Erdblöcke, damit sie als Erde lesbar bleibt.
  Eine unsichtbare Rectangle bleibt Träger für `Rock.shape`, eine eigene Graphics zeichnet die Steine.
- **Aufsteigen (eigene Animation):** Das Mauerwerk schiebt sich starr aus dem Boden (Muster hängt an der Oberkante,
  alles wird an der Bodenlinie abgeschnitten), mit Zittern der Lagen, solange gehalten wird. Beim Start Risslinie
  und Staubfontäne am Boden, beim Wachsen Erdkrümel, am Ende ein kurzer Erdstoß mit Staubring.
- **Schaden:** Risslinien und Ausbrüche nehmen mit sinkender Haltbarkeit zu, kleine Brocken lösen sich bei Treffern.
- **Tritt:** Staubwelle läuft vom Fuß zur Mauer, beim Gleiten Staubspur am Boden, beim Aufprall Brockenschauer.

## Figur: eigene Bändigerhaltung

Eigene Zustände in `StickFigureView`, getrennt von den Handposen der anderen Elemente (Avatar-typisch):

- **Heben (RMB gehalten):** tiefer, breiter Stand (Pferdestand): Füße weit auseinander, Knie gebeugt, Hüfte tief.
  Beide Hände starten an den Hüften, Handflächen nach oben, und steigen mit der Mauer bis über Kopfhöhe. Leichtes
  Zittern. Die Haltung hängt nur am Wachsfortschritt der Mauer.
- **Treten (RMB-Klick):** Ausholen (Fuß zurück, Oberkörper leicht zurück, Arme auseinander), dann Tritt des vorderen
  Beins in Zielrichtung auf Hüfthöhe (Fuß zeigt zur Mauer), Standbein gebeugt, Arme gegenläufig. Dauer 0,5 s, danach
  weich zurück in die normale Haltung. Kein Handzauber, die Hände bleiben frei.
- Beide Haltungen setzen die anderen Cast-Posen zurück (`resetCastPose`) und bleiben im Liegen abgeschaltet.

## Gegner-Geschosse

- Jeder lebende Gegner schießt alle 3 bis 4,5 s (zufällig versetzt) ein Plüsch-Geschoss auf den Spieler, wenn der
  Spieler in 14 m Nähe ist. Geschoss: Kreiskörper, 9 m/s in gerader Linie, keine Schwerkraft, Lebensdauer 3 s.
- Eigene Kollisionskategorie `enemyShot`: trifft Spieler (Schaden 6), Gelände und Mauer/Rock; Gegner und Geschosse
  untereinander ignorieren sich.
- Trifft es die Mauer, zieht es seinen Schaden von deren Haltbarkeit ab. Trifft es den Spieler, gilt die Schutzzeit
  des Spielers wie bisher (`Player.takeDamage`).
- Eingefrorene Gegner schießen nicht.

## Stellwerte

Neue Datei `src/config/wall.ts`: widthM 1.2, maxHeightM 5, depthM 1.5, chargeMs 1600, minDistanceM 1.5, reachM 10,
verticalReachM 5, courseM 0.5, wallHealth 60, wallLifetimeMs 15000, wallCooldownMs 4000, kickDelayMs 150, throwSpeedMs 14,
throwAngleDeg 35, throwGravityDelayMs 600. Geschosse in `src/config/combat.ts`: shotIntervalMinMs 3000,
shotIntervalMaxMs 4500, shotRangeM 14, shotSpeedMs 9, shotDamage 6, shotLifetimeMs 3000.

## Aufbau

- `src/earth/wallRules.ts` (rein, getestet): Höhe/Lagenfortschritt aus Wachszeit, Wurfrichtung geklemmt,
  Haltbarkeit nach Treffer, Schussintervall.
- `src/earth/wallDraw.ts`: Mauerwerk-Zeichnung (Lagen, Fugen, Risse, Abschnitt an der Bodenlinie).
- `src/attacks/StoneWallAttack.ts`: Zustandsautomat (`idle | growing | standing | kicked`), baut Körper und Rock.
- `src/combat/EnemyShots.ts`: Geschosse (Körper, Kollision, Schaden, Haltbarkeit der Mauer).
- `StickFigureView` / `Player`: `setWallRaise(progress | null)`, `kick()`; Hand- und Beinpose wie beschrieben.
- `ElementController`: rechte Taste (button 2) für Erde, ruft die Mauerattacke auf, Pose über `Player`.
- `FlyingPlushEnemy`: Schusszeitgeber, ruft `EnemyShots.fire` auf.
- Browserprüfung `scripts/check-wall.py`: Wachsen, Geschoss-Block mit Haltbarkeit, Zerfall, Tritt mit Schaden,
  Luftstoß auf Mauer, Gegner-Schuss trifft Spieler ohne Mauer. Die Figurenhaltung bewerten wir per Screenshot.

## Offen / bewusst nicht enthalten

- Wasser oder Luft lenken Geschosse nicht ab.
- Keine Skilltree-Ränge für die Mauer (kann später ergänzt werden).
- Gegner weichen der Mauer nicht aus (sie fliegen drumherum oder schießen dagegen).
