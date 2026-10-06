# Römerlager Westfalen

Web-Karte der bekannten augusteischen Römerlager in Westfalen und Umgebung
mit einer Potenzialkarte für noch unentdeckte Marschlager.

Anstoß war der Vortrag von Dr. Bettina Tremmel (LWL-Archäologie für
Westfalen, Fachreferat Provinzialrömische Archäologie) auf der
Regionalkonferenz des Kreisheimatbundes Minden-Lübbecke. Nach ihrer
Arbeitshypothese lagen Marschlager etwa einen Tagesmarsch (18–20 km) auseinander, an fließendem
Wasser und meist auf Anhöhen oder in leichter Hanglage. Im Boden erkennt man
sie an geraden Gräben mit abgerundeten Ecken („Spielkartenform“).

## Zitieren

Krämer, Tim (2026): Römerlager in Westfalen. Potenzialkarte für unentdeckte
Marschlager. Online: https://experiments.erleben.app/roemer/ (abgerufen am …).

Maschinenlesbar in [CITATION.cff](CITATION.cff).

## Starten

```bash
bun install
bun run dev
```

Danach http://localhost:3000/roemer/ öffnen.

Die Startansicht zeigt den Kreis Minden-Lübbecke mit vorberechneter Analyse.
Nach Änderungen an Fundstellen oder Modell neu rechnen:

```bash
bun run precompute
```

Gegenprobe (je ein bekanntes Lager weggelassen, mit Zufallsorten als
Vergleich) und Prüfung der Linienerkennung:

```bash
bun scripts/validate-model.mjs
bun scripts/validate-lineaments.mjs
```

Römerstraßen (Itiner-e und Hellweg vor dem Santforde) neu bauen:

```bash
bun scripts/build-roads.mjs
```

Alte Flussläufe (Lippe, Ems, Weser, Rhein, Elbe, Stever, Seseke, Alme)
neu bauen. Sie dienen dem Reiter „Texte“, der Ebene „Alte
Flussläufe“ und dem Flussabstand im Modell. In NRW greift das Skript den
Lauf aus der Preußischen Uraufnahme ab, geführt am heutigen Lauf aus den
OSM-Kacheln. Dazu wird je 6-km-Abschnitt der günstigste Weg über blau
kolorierte Wasserflächen gesucht. Findet sich auf einem Blatt kein Blau
(manche Blätter zeichnen Flüsse grau oder grün) oder folgt der Weg nur
dünnen Linien wie Festungsgräben, gilt dort der heutige Lauf in voller
Auflösung. Das gilt auch für Stever, Seseke und Alme, die die Uraufnahme
meist als dünne schwarze Linie zeichnet. Bei Haltern und Xanten setzt es den
römerzeitlichen Lauf nach der Literatur ein. Die Kacheln der Uraufnahme
landen in `node_modules/.cache/uraufnahme`, ein voller Lauf dauert
beim ersten Mal rund eine Stunde.

```bash
bun scripts/build-rivers.mjs            # alle Flüsse
bun scripts/build-rivers.mjs Lippe Ems  # nur diese
bun scripts/build-rivers.mjs --roemisch # nur die Römerzeit-Abschnitte neu einsetzen
```

Altkarten (Scans ohne Georeferenz) entzerren und als Kacheln nach
`public/altkarten/` legen. Die Passpunkte je Karte stehen in
`scripts/altkarten/gcp/`, die Scans selbst liegen nicht im Repo
(`ALTKARTEN_DIR`, Standard `~/Downloads/Historische Landkarten`). Die
Kacheln sind ebenfalls nicht eingecheckt und müssen vor dem Deploy einmal
gerechnet werden:

```bash
bun scripts/altkarten/orte.mjs          # Ortsverzeichnis für Passpunkte, einmalig
scripts/altkarten/alt.sh fit 1844-kreis-luebbecke
scripts/altkarten/alt.sh tiles 1844-kreis-luebbecke
scripts/altkarten/alt.sh index          # schreibt src/data/altkarten.json
```

`alt.sh` startet Python über uv mit numpy, scipy, Pillow und pyproj.

`bun test` prüft das Rechenmodell,
`bun run lint` den Code (Biome).

Live unter https://experiments.erleben.app/roemer/ (statischer Export).
Neue Version veröffentlichen mit `bun run deploy`, Details in
[deploy/README.md](deploy/README.md).

## Technik

Angelehnt an erleben.app: Next.js 16 (App Router, JavaScript), React 19,
MUI 9, MapLibre GL 6, zustand, Bun und Biome. Der MapLibre-Worker wird wie
dort per `postinstall` nach `public/maplibre` kopiert, weil Turbopack ihn
sonst nicht ausliefert.

| Pfad | Inhalt |
|------|--------|
| `src/data/fundstellen.json` | Bekannte Fundstellen (GeoJSON) mit Typ, Datierung, Größe, Quelle |
| `src/data/quellen.json` | Literatur, Karten und Datendienste für den Reiter „Quellen“ |
| `src/lib/layers.js` | Grundkarten und WMS/WMTS-Ebenen |
| `src/lib/potential/model.js` | Rechenmodell (rein, getestet in `model.test.js`) |
| `src/lib/potential/worker.js` | Web Worker: Höhenmodell laden, Raster rechnen |
| `src/lib/terrain.js` | Terrarium-Höhenkacheln (AWS Open Data) |
| `src/lib/potential/drainage.js` | Gewässernetz aus dem Höhenmodell (Senkenfüllung, Abfluss) |
| `src/lib/water.js` | Heutige Fließgewässer aus den OSM-Kacheln von tiles.erleben.app, ohne Kanäle und Gräben |
| `src/lib/potential/pipeline.js` | Rechenkette für Worker und Vorberechnung |
| `src/lib/potential/routes.js` | Marschwege als Least-Cost-Path (Tobler) und Etappenhalte |
| `src/lib/criteria.js` | Erklärtexte und Quellen je Kriterium |
| `scripts/precompute.mjs` | Vorberechnung der Regionen nach `public/precomputed` |
| `scripts/build-roads.mjs` | Römerstraßen-Datensatz |
| `src/data/texte.json` | Antike Textstellen mit Übersetzung und Kartenbezug |
| `src/lib/text-geo.js` | Orte, Räume und Richtungen je Textstelle für die Karte |
| `scripts/build-rivers.mjs` | Alte Flussläufe (`src/data/fluesse.json`) aus Uraufnahme, OSM und Literatur |
| `scripts/altkarten/` | Altkarten entzerren: Passpunkte, Thin-Plate-Spline, Kacheln |
| `src/data/altkarten.json` | Verzeichnis der gekachelten Altkarten (aus `alt.sh index`) |
| `src/components/` | Karte, Seitenleiste, Info-Karten |

## Potenzialmodell

Der sichtbare Kartenausschnitt (höchstens 90 × 90 km) wird in Zellen von
100–500 m zerlegt. Jede Zelle bekommt sechs Teilwerte zwischen 0 und 1:

| Kriterium | Berechnung |
|-----------|------------|
| Tagesmarsch | Gaußglocke um den Abstand zum nächsten bekannten Lager (Standard 19 ± 2,5 km) |
| Fließgewässer | 1 bis 300 m Abstand zum nächsten Bach oder Fluss, danach abfallend |
| Anhöhe | Topographic Position Index: Höhe minus Mittel im Umkreis von 1,5 km, logistisch skaliert |
| Hanglage | 0,5–6° Neigung ideal, ab 15° null |
| Marschroute | Nähe zum Weg geringster Gehzeit zwischen zwei bekannten Lagern |
| Flusskorridor | Nähe zu größeren Flüssen als Hinweis auf die Marschroute |

Das Gewässernetz wird standardmäßig aus dem Höhenmodell berechnet. Dazu
werden Senken gefüllt (Priority-Flood, Barnes et al. 2014), der Abfluss
folgt dem steilsten Gefälle und das Einzugsgebiet wird aufsummiert. Ab 2 km² Einzugsgebiet gilt ein Pixel
als Bach, ab 150 km² als Fluss (beides einstellbar). Das folgt den
natürlichen Talzügen und kennt keine Kanäle oder Begradigungen. Alternativ
lassen sich die heutigen Gewässer aus OpenStreetMap laden. Die öffentlichen
Overpass-Server sind aber oft überlastet. Scheitert die Abfrage, rechnet die
App mit dem Höhenmodell weiter.

Für die großen Flüsse (Lippe, Ems, Weser, Rhein und die übrigen in
`src/data/fluesse.json`) gilt in beiden Fällen der alte Lauf. Abgeleitete
Flusspixel, die näher als 1,5 km an einem alten Lauf liegen, werden als
derselbe Fluss verworfen; kleinere Bäche bleiben. Abschaltbar unter
„Alte Flussläufe“ im Reiter Analyse.

Der Gesamtwert ist das gewichtete Mittel. Steiles Gelände (über 12°) wird
abgewertet, das direkte Umfeld bekannter Lager ausgeblendet. Lokale Maxima
mit mindestens 4 km Abstand erscheinen als nummerierte Kandidaten.
Klick auf die Karte zeigt die Teilwerte einer Zelle.

Das Modell hat Grenzen. In flachen Auen (Lippe, Münsterland) ist das
abgeleitete Gewässernetz ungenau, OSM-Bäche sind dafür oft begradigt.
Einzugsgebiete großer Flüsse reichen über den Ausschnitt hinaus, deshalb
wird mit 6 km Rand gerechnet. Das Höhenmodell der Terrarium-Kacheln hat bei Zoom 11/12 etwa 25–50 m
Auflösung, für Gräben braucht es die DGM1-Schummerung. Überbaute Flächen
und Wald sind nicht berücksichtigt. Dort sind Lager schwerer nachzuweisen,
aber nicht unwahrscheinlicher. Die Karte zeigt Suchräume, keine Fundstellen.

## Lizenzen der Daten

Fundstellen-Koordinaten stammen aus frei zugänglichen Quellen (siehe
Feld `sources`). Kartendienste: OpenStreetMap (ODbL), Geobasis NRW
(dl-de/zero-2-0), LGLN Niedersachsen (CC BY 4.0), BKG TopPlusOpen
(CC BY 4.0), Sentinel-2 cloudless von EOX (CC BY-NC-SA 4.0),
Höhenkacheln von Mapzen/AWS Terrain Tiles.
