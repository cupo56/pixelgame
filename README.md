# ELEMENTS

Erster spielbarer Erkundungsprototyp mit Phaser und TypeScript.

## Starten

```sh
npm install
npm run dev
```

Die im Terminal angezeigte lokale URL öffnen. `npm run build` prüft TypeScript und erstellt den Produktionsbuild in `dist`.

## Das Grenzland

Die handgebaute Region verbindet Grenzwacht und alten Hain an der Oberfläche mit einer Kristallgrotte und einer Kette schwebender Inseln. Finde die drei leuchtenden Grenzsteine. Entdeckungen werden im Local Storage des jeweiligen Browsers gespeichert; beim Neustart beginnt die Figur wieder am Lager. Wenn Speichern blockiert ist, bleiben Entdeckungen nur in der Sitzung erhalten.

| Eingabe | Aktion |
| --- | --- |
| A / D | Laufen (6 m/s) |
| Shift + A / D | Gehen (2,2 m/s) |
| Leertaste / W | Springen; kurz tippen für einen kleineren Sprung |
| Maus / Linksklick | Zielen / Elementangriff |
| 1 / 2 / 3 / 4 | Erde / Feuer / Wasser / Luft |
| Luft + Sprung halten | Gleiten; im markierten Aufwind aufsteigen |
| E | Aufzug in der Nähe benutzen |
| Tab | Übersichtskarte öffnen / schließen |
| R | Zum Lager zurückkehren |

Vom Lager nach rechts durch den Hain gehen und die Stufen in die Grotte hinabsteigen. Der Runenaufzug am rechten Ende der Grotte führt auf die östliche Oberfläche. Dort führt ein zweiter Aufzug in beide Richtungen zu den Himmelsinseln. Die Inselabstände lassen sich mit Anlauf überspringen; Luft erleichtert die Überquerung. Alle drei Grenzsteine sind auch mit Erde erreichbar.

Dies ist die erste Weltregion mit den vier bestehenden Elementangriffen. Gegner, Bosse, Elementfreischaltungen, Metall, Antimaterie und prozedurale Weltgeneration folgen in späteren Entwicklungsschritten. Das Tor zur Eisenstadt ist ein versiegelter Ausblick.

Die Figur wird aus scharf gerasterten Pixelgliedmaßen aufgebaut. Schritte folgen der Bewegungsgeschwindigkeit; Ellbogen und Knie werden aus den Hand- und Fußpositionen berechnet. Die vordere Hand zielt zur Maus und ist der Ursprung der Fähigkeiten. Der freie Arm schwingt mit. Sprung-, Fall- und Landeposen ergänzen die Laufanimation. Sprungeingaben werden 120 ms gepuffert; nach einer Kante bleiben 90 ms Zeit zum Absprung.

`scripts/check-movement.py` prüft Geh-/Laufgeschwindigkeit, Abbremsen, kurze und volle Sprünge, Zielhand in vier Richtungen sowie alle Elementangriffe im Entwicklungsserver auf Port 5174.

## Browserprüfung

`scripts/check-grenzland.py` verwendet eine vorhandene Python-Playwright-Installation mit Chromium. Der Test prüft den tatsächlichen Fußweg zur Grotte, beide Aufzüge, den Aufwind, einen Inselsprung ohne Luft, die vier Angriffe, Karte, Rückruf und Speicherung nach dem Neuladen. Screenshots landen im ignorierten Ordner `artifacts`.

```powershell
$env:ELEMENTS_TEST_URL = 'http://127.0.0.1:5173/'
python scripts/check-grenzland.py
```

Die URL muss dem laufenden Entwicklungsserver entsprechen. Ohne Umgebungsvariable verwendet das Skript Port 5174.
