# Potenzialmodell

Das Modell bewertet jede Rasterzelle eines Kartenausschnitts danach, wie gut
sie zu den bekannten Standorten augusteischer Marschlager passt. Es zeigt
Suchräume für Prospektion und Laserscan-Auswertung, keine Fundstellen.

## Arbeitshypothese

Ausgangspunkt ist die Arbeitshypothese von Dr. Bettina Tremmel
(LWL-Archäologie für Westfalen), vorgestellt auf der Regionalkonferenz des
Kreisheimatbundes Minden-Lübbecke. Marschlager lagen danach etwa einen
Tagesmarsch (18–20 km) auseinander, nahe fließendem Wasser und meist auf
Anhöhen oder in leichter Hanglage. Antike Vorgaben zur Lagerwahl
(Ps.-Hyginus, De munitionibus castrorum 56–57, Vegetius 1,22 und 3,8)
ergänzen das, sie stehen in der Zeitleiste der Texte am unteren Kartenrand und in
`src/data/texte.json`.

## Rechengang

Der Ausschnitt (höchstens 90 × 90 km) wird in Zellen von 100–500 m zerlegt
(Standard 200 m). Jede Zelle bekommt sieben Teilwerte zwischen 0 und 1. Der
Gesamtwert ist ihr gewichtetes Mittel, danach folgen Abzüge für Moore, nasse
Niederungen und steiles Gelände. Code: `src/lib/potential/model.js`,
Rechenkette: `src/lib/potential/pipeline.js`, Erklärtexte mit Belegen je
Kriterium: `src/lib/criteria.js`.

| Teilwert | Berechnung | Gewicht |
|----------|------------|--------:|
| Tagesmarsch | Gaußglocke um den Abstand zum nächsten bekannten Lager, 19 ± 2,5 km, auch für zwei und drei Tagesmärsche | 3 |
| Fließgewässer | voll bis 300 m Abstand zum nächsten Bach oder Fluss, danach über 700 m abfallend | 2 |
| Anhöhe | Topographic Position Index: Höhe minus Mittel im Umkreis von 1,5 km, ausgeprägte Hügel zählen weniger | 2 |
| Terrasse | 3–15 m über dem tiefsten Punkt im Umkreis von 1,5 km | 1 |
| Hanglage | 0,5–6° Neigung ideal, ab 15° null | 1 |
| Marschroute | Nähe zum Weg geringster Gehzeit zwischen zwei bekannten Lagern (Tobler-Funktion, Least-Cost-Path) | 2 |
| Flusskorridor | Nähe zu größeren Flüssen (Lippe, Weser, Ems) als Leitlinie der Feldzüge | 1 |

Abzüge, alle im Reiter „Analyse“ einstellbar:

- Moore laut Bodenkarte (BK50 NRW, GUM50 Niedersachsen), bis −70 %
- nasse Niederungen nach dem topographischen Feuchteindex (Beven und Kirkby 1979), bis −40 %
- gerade Strukturen im Laserscan (DGM1 NRW) als Aufschlag, Standard 0, weil die Gegenprobe keinen Vorteil zeigte
- heutiger Wald, Standard 0, weil der römerzeitliche Wald unbekannt ist

Das direkte Umfeld bekannter Lager (5 km) wird ausgeblendet. Lokale Maxima
über dem Schwellenwert erscheinen als nummerierte Kandidaten.

### Gewässer

Standardmäßig wird das Gewässernetz aus dem Höhenmodell abgeleitet. Senken
werden gefüllt (Priority-Flood, Barnes u. a. 2014), der Abfluss folgt dem
steilsten Gefälle, das Einzugsgebiet wird aufsummiert. Ab 2 km² gilt eine
Zelle als Bach, ab 150 km² als Fluss. Das folgt natürlichen Talzügen und
kennt keine Kanäle oder Begradigungen. Code:
`src/lib/potential/drainage.js`.

Für die großen Flüsse gilt der alte Lauf aus `src/data/fluesse.json`. In NRW
ist er aus der Preußischen Uraufnahme (1836–1850) abgegriffen, bei Haltern
und Xanten nach der Literatur auf den römerzeitlichen Lauf gesetzt (Skript
`scripts/build-rivers.mjs`, Beschreibung in [daten.md](daten.md)).
Alternativ lassen sich die heutigen Gewässer aus OpenStreetMap verwenden.

### Marschrouten

Zwischen benachbarten bekannten Lagern wird der Weg geringster Gehzeit
gesucht. Die Gehzeit je Schritt folgt der Wanderfunktion von Tobler (1993)
aus dem Höhenprofil. Steigungen kosten für den Tross zusätzlich (Wagenfunktion
nach Herzog), Flussquerungen, nasse Niederungen und Moore kosten Aufschlag,
im Wiehengebirge wird feiner gerechnet, damit schmale Pässe den Weg bestimmen. Auf der Lippe gilt die Strecke von Vetera bis Beckinghausen
als Schiffsweg (weiter bis Anreppen vermutet). Er folgt den gezeichneten alten
Flussläufen (`src/data/fluesse.json`, ab Vetera erst dem Rhein), vom Lager
geht es auf kürzestem Weg zum Ufer (`src/lib/potential/river-path.js`). Das überregionale Netz (`westfalen-netz`) ist vorberechnet.
Code: `src/lib/potential/routes.js`, Netz-Einstellungen:
`src/lib/regions.js`.

## Gegenprobe

`scripts/validate-model.mjs` lässt je Durchlauf genau ein bekanntes Lager
weg, samt Begleitanlagen im Umkreis von 3 km, rechnet Routen und Ringe ohne
es neu und liest an seiner Stelle ab, wie hoch die Zelle im Vergleich zu
allen anderen bewertet ist (Perzentil). Zum Vergleich dienen 300
Zufallsorte. Ergebnis vom 06.10.2026 mit Standardgewichten, 12 Lager:

| Messgröße | bekannte Lager | Zufallsorte |
|-----------|---------------:|------------:|
| Median-Perzentil an der Lagerstelle | 86 | 48 |
| Median-Perzentil, bester Wert im Umkreis von 2 km | 98 | 88 |
| Anteil mit bestem Wert in den oberen 20 % (2 km) | 11 von 12 | 62 % |

Ohne den Routen-Faktor sinkt das Median-Perzentil an der Lagerstelle auf
75. Die Routen verbinden bekannte Lager und tragen deshalb einen Teil der
Bestätigung in sich. Schwach schneiden Kneblinghausen (Perzentil 50) und
Hedemünden (35) ab, beide liegen abseits der Flusskorridore.

`scripts/optimize-weights.mjs` sucht Gewichte, die das mittlere Perzentil
maximieren, mit verschachtelter Kreuzvalidierung (die Gewichte für ein Lager
werden nur an den übrigen elf bestimmt). Optimiert und ehrlich geprüft ergab
sich ein mittleres Perzentil von 77, mit den Standardgewichten 80. Die
Standardgewichte bleiben deshalb. Die App zeigt die Gegenprobe und die
optimierten Gewichte im Reiter „Quellen“. Alle Zahlen stehen in
`public/precomputed/validation.json`.

Zwölf Lager sind wenig. Die Gegenprobe zeigt, dass das Modell bekannte
Lagerplätze überdurchschnittlich hoch bewertet. Sie zeigt nicht, dass ein
hoch bewerteter Ort ein Lager birgt.

## Grenzen

- In flachen Auen (Lippe, Münsterland) ist das abgeleitete Gewässernetz ungenau, OSM-Bäche sind dafür oft begradigt.
- Einzugsgebiete großer Flüsse reichen über den Ausschnitt hinaus. Deshalb wird mit 6 km Rand gerechnet.
- Die Terrarium-Höhenkacheln haben bei Zoom 11–12 etwa 25–50 m Auflösung. Für Gräben braucht es das DGM1 (Laserscan-Ansicht in der App).
- Überbaute Flächen und Wald sind nicht berücksichtigt. Dort sind Lager schwerer nachzuweisen, aber nicht unwahrscheinlicher.
- Der Tagesmarsch von 18–20 km ist ein Mittelwert. Gelände, Tross und Jahreszeit verschieben ihn.
- Die Koordinaten bekannter Lager sind teils nur auf einige hundert Meter genau (Feld `precision` in `src/data/fundstellen.json`).

## Reproduzieren

```bash
bun run precompute                 # Regionen und Netz nach public/precomputed
bun scripts/validate-model.mjs     # Gegenprobe, schreibt validation.json
bun scripts/optimize-weights.mjs   # Gewichtssuche mit Kreuzvalidierung
bun scripts/validate-lineaments.mjs
```

Die Skripte laden Höhen- und Vektorkacheln aus dem Netz (Kacheldienste in
`src/config.js`). Ergebnisse können sich ändern, wenn sich OpenStreetMap
oder die Landesdienste ändern. Das Datum steht jeweils im Feld
`generatedAt`.
