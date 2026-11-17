# ELEMENTS

Erster spielbarer Erkundungsprototyp mit Phaser und TypeScript.

## Starten

```sh
npm install
npm run dev
```

Die im Terminal angezeigte lokale URL öffnen. `npm run build` prüft TypeScript und erstellt den Produktionsbuild in `dist`.

## Startmenü und Fortschritt

Das Spiel startet auf einem eigenen Startbildschirm mit **Spiel starten** und **Optionen**. Die Optionen enthalten einen gespeicherten Schalter für Kamerawackeln, Vollbild und eine Übersicht der Steuerung. **Esc** beendet die laufende Spielszene und öffnet den Startbildschirm, auch aus dem Skilltree. Ein erneuter Spielstart beginnt am Lager mit frischen Testgegnern; Elementfortschritt und entdeckte Grenzsteine bleiben erhalten.

Mit **K** oder dem **Skilltree-Button** in der oberen Statusleiste öffnest du die vier Elementpfade. Die Welt samt Physik und Szenen-Timern pausiert bis zum Schließen. Jedes Element besitzt eigene Erfahrung, Level, Skillpunkte und Ränge. Treffer vergeben EP für das verursachende Element, insgesamt höchstens 30 EP pro Gegner; Überkill, Tropfenfolgen und wiederholter Materialkontakt erzeugen keine zusätzlichen EP über dieses Budget. Materialtreffer zählen zum zugehörigen Element, z. B. Eis zu Wasser und Sand zu Erde. Der erste Levelaufstieg benötigt 60 EP, jeder weitere 30 EP mehr.

Jedes Element startet auf Level 1 mit einem Skillpunkt. Pro Levelaufstieg kommt ein weiterer Punkt hinzu. **Elementkraft** erhöht den Schaden um 5 % pro Rang (maximal drei Ränge, auf ganze Lebenspunkte gerundet). **Fokus** verkürzt Abklingzeiten um 5 % pro Rang (maximal zwei Ränge, ab Element-Level 2 und nach Elementkraft). Ein Rang kostet einen Punkt. Voraussetzungen, Punktekosten und Ranglimits werden im Fortschrittsmodell geprüft.

Bestehende Angriffe und Kombinationen bleiben verfügbar. Die Zweige **Neue Fähigkeit** und **Element-Combo** sind sichtbare, noch nicht kaufbare Plätze für die später festgelegten Fähigkeiten. Die datenbasierten Knoten und die Freischaltungsabfrage in `src/progression` bilden die Grundlage dafür. Fortschritt wird getrennt von den Grenzsteinen unter `elements.skills.v1` lokal gespeichert; bei gesperrtem Speicher bleibt er für die Sitzung verfügbar und die Oberfläche zeigt dies an. **T** startet nur die Testwelt neu und löscht keine Skillpunkte oder gekauften Ränge.

## Das Grenzland

Die handgebaute Region verbindet Grenzwacht und alten Hain an der Oberfläche mit einer Kristallgrotte und einer Kette schwebender Inseln. Finde die drei leuchtenden Grenzsteine. Entdeckungen werden im Local Storage des jeweiligen Browsers gespeichert; beim Neustart beginnt die Figur wieder am Lager. Wenn Speichern blockiert ist, bleiben Entdeckungen nur in der Sitzung erhalten.

| Eingabe | Aktion |
| --- | --- |
| A / D | Laufen (6 m/s) |
| Shift + A / D | Gehen (2,2 m/s) |
| S halten | Schnell auf den Bauch legen; mit A / D kriechen (0,8 m/s). Loslassen zum Aufstehen |
| Leertaste / W | Springen; kurz tippen für einen kleineren Sprung |
| Maus / Linksklick | Zielen / Elementangriff |
| Erde: Linksklick halten / loslassen | Großen Erdblock aufladen / werfen; kurzer Klick wirft einen kleinen Block |
| Feuer: Linksklick halten / loslassen | Feuerball mit beiden Händen aufladen / sofort abfeuern; kurzer Klick wirft den normalen Feuerball |
| Wasser: Linksklick halten / loslassen | Wasserpeitsche aufladen / zur Maus schlagen; kurzer Klick wirft einen kleinen Wasserstoß |
| Luft: Linksklick halten / loslassen | Tornado aufladen / am Boden losschicken; kurzer Klick erzeugt beim Loslassen den bisherigen Luftstoß |
| 1 / 2 / 3 / 4 / 5 | Erde / Feuer / Wasser / Luft / Metall |
| Metall: kurzer Linksklick | Metallklumpen im Umkreis von 5 m bändigen; sie verschmelzen zu einer Rüstung mit 25 Schutzpunkten |
| Metall: Linksklick halten / loslassen (mit Rüstung) | Rüstung zu einer Kugel aus kreisenden Spitzen aufladen / Spitzen als Fächer zur Maus und rundum schleudern; die Rüstung ist danach verbraucht |
| Mausrad runter / hoch | Nächstes / vorheriges Element; wechselt im Kreis durch Erde → Feuer → Wasser → Luft → Metall |
| Luft + Sprung halten | Gleiten; im markierten Aufwind aufsteigen |
| E | Aufzug in der Nähe benutzen |
| M | Übersichtskarte öffnen / schließen |
| K | Element-Skilltrees öffnen / schließen; die Spielwelt pausiert währenddessen |
| Esc | Spiel verlassen und zum Startbildschirm zurückkehren |
| R | Zum Lager zurückkehren und Leben auffüllen |
| T | Test neu starten: drei Gegner mit je 30 LP, Spieler mit 100 LP |

Vom Lager nach rechts durch den Hain gehen und die Stufen in die Grotte hinabsteigen. Der Runenaufzug am rechten Ende der Grotte führt auf die östliche Oberfläche. Dort führt ein zweiter Aufzug in beide Richtungen zu den Himmelsinseln. Die Inselabstände lassen sich mit Anlauf überspringen; Luft erleichtert die Überquerung. Alle drei Grenzsteine sind auch mit Erde erreichbar.

Die Treppe lässt sich mit A / D hinauf- und hinabgehen, ohne zu springen. Aufrecht überwindet die Figur beim Gehen und Rennen automatisch Stufen bis 0,6 m, sofern der Weg und der Platz über dem Kopf frei sind. Beim Hinuntersteigen folgt sie jeder Stufe und behält ihre Schrittbewegung bei, ohne zwischendurch in die Fall- oder Landepose zu wechseln. Höhere Wände, echte Abgründe, Sprünge und Bauchlage lösen diese automatische Stufenbewegung nicht aus.

Rechts vom Lager patrouillieren drei fliegende Testgegner: flauschige Plüschbälle mit Knopfaugen, Nähten und flatternden Fledermausflügeln. Jeder hat 30 Lebenspunkte mit eigener Anzeige. Der Spieler startet mit 100 LP; sein Lebensbalken steht oben im HUD. Eine Berührung verursacht 10 Schaden, danach schützen 800 ms vor weiteren Kontakttreffern. Bei 0 LP kehrt der Spieler mit vollem Leben zum Lager zurück. Besiegte Gegner verschwinden in einer kleinen Plüschwolke; T startet den Test mit frischen Gegnern neu.

Alle vier Elemente verursachen Testschaden: Erde 15 pro kleinem Block und bis zu 60 bei voller Aufladung, Feuer bis zu 12 je normaler Explosion bzw. 48 bei voller Aufladung, Wasser 1 pro Tropfen oder 8 bis 20 pro Peitschenschlag und Luft bis zu 6 pro Windstoß. Ein Erdblock kann jeden Gegner einmal pro Wurf verletzen; ein neuer Luftstoß macht einen weiteren Treffer möglich. Feuer- und Luftschaden nehmen mit der Entfernung ab. Treffer und Windstöße versetzen die fliegenden Gegner in Bewegung, bevor sie in ihre Flugbahn zurückkehren.

Dies ist die erste Weltregion mit den vier bestehenden Elementangriffen und Testgegnern. Weitere Gegner, Bosse, Elementfreischaltungen, Metall, Antimaterie und prozedurale Weltgeneration folgen in späteren Entwicklungsschritten. Das Tor zur Eisenstadt ist ein versiegelter Ausblick.

Die Figur bleibt vorerst ein Strichmännchen mit dünnen Gliedmaßen und rundem Kopf. Schritte folgen der tatsächlichen Bewegungsgeschwindigkeit: Knie, Füße und Schrittbewegung richten sich unabhängig von der Maus nach links oder rechts aus. Im Stand bleibt die letzte Laufrichtung erhalten. Ellbogen und Knie werden aus den Hand- und Fußpositionen berechnet. Die Zielhand ist der Ursprung der Geschosse; beim Luftstoß liegt der Ursprung zwischen beiden Handflächen. Außerhalb eines Angriffs schwingt der freie Arm gegenläufig zu den Beinen. Sprung-, Fall- und Landeposen ergänzen die Laufanimation. Sprungeingaben werden 120 ms gepuffert; nach einer Kante bleiben 90 ms Zeit zum Absprung.

Jedes Element besitzt eine eigene Körperbewegung: Erde einen schweren Doppelarmstoß, Feuer einen schnellen Fauststoß oder bei Aufladung einen beidhändigen Schub, Wasser eine fließende Armbewegung und Luft einen breiten Stoß mit offenen Handflächen. Oberkörper und Stand unterstützen den Angriff, anschließend kehrt die Figur weich in ihre normale Haltung zurück. Die Posen spiegeln sich mit der Mauszielrichtung, passen sich der Bauchlage an und lassen beim Laufen den Schrittrhythmus bestehen. Elementwechsel, Fokusverlust und Rückruf lösen die Haltung wieder auf.

`scripts/check-movement.py` prüft Geh-/Laufgeschwindigkeit, Abbremsen, kurze und volle Sprünge, Zielhand in vier Richtungen sowie alle Elementangriffe im Entwicklungsserver auf Port 5174.

Die Bauchlage beginnt am Boden und dauert etwa 0,1 Sekunden; Aufstehen dauert etwa 0,18 Sekunden. Die Kollisionsform wird dabei flach und breit, die Füße bleiben am Boden und der bestehende Schwung wird abgebremst. Unter niedrigen Decken bleibt die Figur liegen, bis wieder genug Platz zum Aufstehen ist. Zielen und Elementangriffe funktionieren auch in Bauchlage; Springen ist erst wieder im Stand möglich. Wird S in der Luft gehalten, legt sich die Figur nach der Landung hin.

Ein kurzer Linksklick hebt wie bisher einen kleinen Erdblock aus dem Gelände neben der Figur: Risse und Staub kündigen das Herauslösen an, dann steigt der Block nach dem Loslassen in 260 ms auf Handhöhe. Nach 80 ms Schweben wird er in die aktuelle Zielrichtung der Hand geschossen; während des Anhebens lässt sich weiter zielen. Der 0,5-m-Erdblock hat bei angenommener Dichte von 1.800 kg/m³ eine Masse von 225 kg und startet mit etwa 14,6 m/s.

Bleibt die linke Maustaste länger als 180 ms gedrückt, beginnt stattdessen die Aufladung. Unter Vibration, Rissen und dichter werdendem Staub wächst der Block langsam aus dem Boden. Die Anzeige am Block zeigt den Fortschritt. Nach weiteren 2,2 Sekunden erreicht er 1,5 m Kantenlänge und 60 Schaden. Er bleibt auch voll aufgeladen schwebend, bis die Taste losgelassen wird. Früheres Loslassen ergibt entsprechend kleinere Blöcke mit 15 bis 60 Schaden; sie steigen vor dem Wurf noch vollständig aus dem Boden. Große Blöcke sind schwerer (maximal 6.075 kg) und starten langsamer (minimal 10 m/s).

Beim Aufladen geht die Figur in einen tiefen, breiten Stand und hebt beide Handflächen zusammen mit dem Block an; leichte Armvibration zeigt die Anstrengung. Diese Haltung bleibt auch beim vorzeitigen Loslassen bestehen, bis der Block frei ist. Erst beim tatsächlichen Abschuss folgt der kräftige Wurfstoß mit Gewichtsverlagerung nach vorne, bei voller Ladung mit längerem Nachschwingen.

Dafür braucht es erreichbaren Boden und einen freien Weg nach oben. An schmalen Kanten oder unter Hindernissen stoppt das Wachstum bei der noch passenden Größe. Elementwechsel, Rückkehr zum Lager oder Fokusverlust brechen das Aufladen ab. Nach dem Abschuss wirken Schwerkraft, Masse, Reibung und ein schwacher Rückprall. Abgelegte Blöcke bleiben kurz als feste Hindernisse liegen und verschwinden nach zehn Sekunden.

Erde und Luft lassen sich kombinieren: Einen Erdblock werfen, mit **4** zu Luft wechseln, auf den Block zielen und einen Luftstoß auslösen. Der Stoß addiert Geschwindigkeit in Zielrichtung, auch bei großen, noch fliegenden Blöcken. Kleine Blöcke reagieren stärker als schwere. Liegende Blöcke werden bei einem seitlichen oder aufwärts gerichteten Stoß etwas angehoben und können erneut Gegner treffen; ihre 15 bis 60 Schadenspunkte bleiben erhalten. Helle Luftstreifen zeigen den Schub am Block. Die Windwirkung nimmt innerhalb von sieben Metern ab; wiederholte Stöße beschleunigen bis 30 m/s. Ein bereits losgelassener Erdwurf läuft beim Elementwechsel weiter. Nach jedem Luftstoß bleibt der getroffene Block wieder zehn Sekunden erhalten.

Bei **Feuer (2)** wirft ein kurzer Linksklick den normalen Feuerball beim Loslassen. **Linke Maustaste halten** lädt wie bei Erde nach 180 ms Haltezeit eine größere Feuerkugel auf: Die Figur geht im Stand in eine breite, abgesenkte Kampfhaltung und sammelt die Kugel mit beiden Händen an der hinteren Hüfte. Kleine Feuerpartikel wirbeln hinein, Glut steigt auf und die Kugel pulsiert zunehmend. Die Haltung spiegelt sich beim Zielen nach links oder rechts; Bewegung, Sprung und Bauchlage behalten ihre Physik.

Nach **zwei Sekunden Aufladung** ist der Feuerball vollständig geladen. Er bleibt in den Händen, bis links losgelassen wird. Dann stoßen beide Arme sofort nach vorne und der Ball startet ohne weitere Vorbereitung mit **20 m/s**, genau wie der normale Feuerball. Teilaufladungen sind möglich: Radius, Explosionsgröße, Druckwelle und Schaden wachsen mit der Ladung, bis zu 48 Schaden und 4,5 m Explosionsradius. Während des Haltens werden keine zusätzlichen normalen Feuerbälle abgeschossen. Elementwechsel, Rückruf, Fokusverlust oder Neustart brechen die Aufladung ab. Auch große Feuerbälle werden von Wasser gelöscht und verletzen den eigenen Spieler nicht.

Bei **Wasser (3)** wirft ein kurzer Linksklick fünf Wassertropfen mit ihrer bisherigen Flugphysik. **Links halten** beginnt nach 180 ms die Aufladung einer Wasserpeitsche: Ein wachsendes Wasserband kreist vor und hinter der Figur, kleine Tropfen strömen hinein, beide Arme führen kreisende Bewegungen aus und das Gewicht verlagert sich zwischen den Beinen. Laufen, Springen und Bauchlage funktionieren dabei weiter.

Nach **zwei Sekunden Aufladung** ist die Peitsche vollständig geladen. Beim Loslassen schnellt sie in einem gebogenen Schlag in die aktuelle Mauszielrichtung und zieht sich anschließend zurück. Je nach Ladung erreicht sie **3 bis 7 m** und verursacht **8 bis 20 Schaden** pro Gegner. Mehrere Gegner können getroffen werden, jeder aber nur einmal pro Schlag. Wände, Gelände und Erdblöcke begrenzen den sichtbaren Wasserbogen und seinen Trefferbereich. Die Peitsche löscht auch Feuerbälle.

Ein voll geladener Treffer bildet zusätzlich eine sichtbare **Eisfessel für 1,6 Sekunden**. Der Gegner wird zunächst zurückgestoßen, stoppt dann seinen Flug und taut danach von selbst wieder auf. Er bleibt währenddessen verwundbar und kann von Luft oder Erdblöcken getroffen und weitergestoßen werden. Ein Plüschgegner mit 30 LP hat nach dem vollen Peitschentreffer noch 10 LP – genug Gelegenheit für einen Folgeangriff. Teilaufladungen frieren nicht ein. Elementwechsel und Fokusverlust brechen das Aufladen ab; Rückruf und Neustart entfernen auch eine gerade aktive Peitsche.

Bei **Luft (4)** löst ein kurzer Linksklick beim Loslassen den bisherigen Windstoß samt Rückstoß und Erdblock-Beschleunigung aus. **Links halten** beginnt nach 180 ms die Tornado-Aufladung. Beide Hände kreisen um eine Luftkugel; mehrere geneigte Windbänder, ein heller Kern und einströmender Staub verdichten sich mit der Ladung. Nach **zwei Sekunden** ist der Wirbel vollständig geladen und bleibt bis zum Loslassen zwischen den Händen. Dabei werden keine normalen Luftstöße ausgelöst.

Der Tornado entsteht beim Loslassen **auf echtem Boden in der Nähe des Spielers**, auch wenn dieser gerade springt. Ein Ring am Boden zeigt den vorgesehenen Ursprung. Ohne erreichbaren Boden innerhalb von vier Metern nach unten oder bei zu wenig Platz entsteht kein Tornado. Er wächst vom Boden aus nach oben und wandert je nach Mausziel nach links oder rechts. Seine Basis folgt kleinen Geländestufen bis 0,6 m; Wände, niedrige Decken und größere Abgründe lösen ihn auf. Teilaufladungen ergeben kleinere, kürzere Wirbel; voll geladen erreicht er 5 m Höhe und bleibt bis zu 3,2 Sekunden aktiv.

Vorhandene **Erdblöcke kreisen mit dem wandernden Tornado mit**. Die Windführung verändert ihre Geschwindigkeit, nicht ihre Position oder Masse: Schwere Blöcke reagieren träger und rotieren langsamer, Kollisionen mit Gelände und Gegnern bleiben wirksam. Beim Auflösen fliegen die Blöcke mit ihrem Schwung weiter und fallen wieder unter Schwerkraft; ihre Lebensdauer beträgt anschließend erneut zehn Sekunden. Der Tornado selbst verursacht pro Gegner einmalig **8 bis 18 Schaden**, reißt ihn kurz in seine Umlaufbahn und schleudert ihn weiter. Mitgeführte Erdblöcke behalten ihren eigenen Trefferschaden. Elementwechsel bricht nur die Aufladung ab; ein bereits gestarteter Tornado läuft weiter. Fokusverlust, Rückruf und Neustart räumen auch aktive Tornados auf und lösen ihre Bindung zu den Blöcken.

## Elementreaktionen

Die Elemente sind echte Stoffe mit Temperatur, Masse und Wärmeinhalt. Ein zentrales Reaktionssystem (`src/materials/`) entscheidet bei jeder Berührung; die Stellwerte stehen in SI-Einheiten in `src/config/reactions.ts`.

| Reaktion | Was passiert |
| --- | --- |
| Wasser trifft Feuer | Jeder Tropfen entzieht dem Feuerball seine Verdampfungswärme und verdampft dabei. Ein kleiner Feuerball erlischt am ersten Tropfen, ein voll geladener braucht etwa 13 Tropfen oder einen Peitschenschlag. Erloschenes Feuer löst keine Druckwelle aus. |
| Feuer trifft Pfütze oder Eis | Pfützen verdampfen anteilig, Eis schmilzt zu Wasser. |
| Wasser am Boden | Ruhende Tropfen sammeln sich zu Pfützen, die nach 12 s verdunsten. |
| Luft trifft Wasser | Windstoß und Wirbelsturm tragen Tropfen mit und kühlen sie; bei 0 °C werden sie zu Eisscherben, Pfützen zu glatten Eisflächen. Auf Eis rutscht auch die Figur. Scherben zerspringen bei hartem Aufprall und schmelzen nach einigen Sekunden. |
| Wasser trifft Erde | Der Block saugt sich voll (dunkelt ab) und zerfällt ab einer von der Oberfläche abhängigen Wassermenge zu Sand: ein kleiner Block nach etwa 20 Tropfen. |
| Sand | Körner bilden Haufen, bremsen Gegner, fliegen im Wind als Sandwolke und versinken nach 12 s Ruhe. |
| Feuer trifft Sand | Die Explosion erhitzt die Körner; geschmolzene Körner verschmelzen zu einem Metallblock (Masse bleibt erhalten, Volumen folgt der Metalldichte). Ein geladener Feuerball reicht für einen kleinen Haufen. |
| Metall | Dauerhaft (höchstens sechs Klumpen, der älteste versinkt), glüht nach Feuer und verbrennt Gegner bei Berührung. Feuerbälle prallen daran ab, Wasser verdampft auf heißem Metall und kühlt es. |
| Feuer trifft Erde | Der Block glüht und verbrennt Gegner. Ein geladener Feuerball (oder mehrere schnelle Treffer, solange der Block glüht) bringt einen kleinen Block auf 1500 °C: er wird zu einem glühenden Metallklumpen. Glühende Blöcke verschwinden nicht. |
| Metall bändigen | Mit Metall (Taste 5) holt ein kurzer Klick alle Klumpen im Umkreis von 5 m: sie reißen sich los, fliegen spiralförmig zur Figur, verschmelzen glühend und rasten als acht Platten ein. Die Rüstung hat 25 Schutzpunkte, fängt Treffer vor dem Leben ab und birst bei 0. Rückruf nimmt sie mit, Absturz und Tod kosten sie. Die Bewegung der Figur bleibt mit Rüstung unverändert. |
| Spitzen-Sphäre | Halten mit Rüstung zerlegt sie in 8 bis 24 kreisende Spitzen (3 Schaden beim Streifen); Loslassen schleudert die Hälfte als Fächer zur Maus und den Rest rundum (8 bis 14 Schaden). Spitzen bleiben in Gelände und Erdblöcken stecken und zerbröseln; das Metall ist verbraucht. |
| Luft trifft Feuer | Der Windstoß beschleunigt den Feuerball und nährt ihn. |
| Luft trifft Erde | Wie bisher: Schub, Auftrieb und Mitnahme im Wirbelsturm. |

Der einzige nicht-physikalische Wert ist `fireSolidCoupling` (Feuer wirkt auf Festkörper als anhaltende Flamme, nicht als einmaliges Energiepaket); alle anderen Größen (Verdampfungswärme, Dichten, Schwellen) sind real. Die reine Rechenlogik ist mit Vitest geprüft: `npm test`.

## Browserprüfung

`scripts/check-reactions.py` spielt die Reaktionsmatrix szenisch durch (Löschen, Eisfläche, Sand, Metall) und legt Screenshots in `artifacts` ab.

`scripts/check-grenzland.py` verwendet eine vorhandene Python-Playwright-Installation mit Chromium. Der Test prüft den tatsächlichen Fußweg zur Grotte, beide Aufzüge, den Aufwind, einen Inselsprung ohne Luft, die vier Angriffe, Karte, Rückruf und Speicherung nach dem Neuladen. Screenshots landen im ignorierten Ordner `artifacts`.

```powershell
$env:ELEMENTS_TEST_URL = 'http://127.0.0.1:5173/'
python scripts/check-grenzland.py
```

Die URL muss dem laufenden Entwicklungsserver entsprechen. Ohne Umgebungsvariable verwendet das Skript Port 5174.

### Skilltree- und Menüprüfung

`npm test` prüft unter anderem Levelaufstiege, Punktverbrauch, Voraussetzungen, Speicherdaten und die EP-Vergabe. `scripts/check-skills-menu.mjs` prüft im Browser Start/Optionen, M/K/Esc, Pausierung, tatsächliche Schadens- und Abklingzeitänderungen, Käufe, Neustarts und Speicherung. Dafür wird eine vorhandene Playwright-Installation mit Chromium benötigt. `PLAYWRIGHT_MODULE` kann auf dessen Modul verweisen, `CHROMIUM_PATH` optional auf den Browser und `ELEMENTS_TEST_URL` auf den Entwicklungsserver (Standard: Port 5174). Screenshots landen im ignorierten Ordner `artifacts`.
