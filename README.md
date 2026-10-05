# Römerlager Westfalen

Web-Karte der bekannten augusteischen Römerlager in Westfalen und Umgebung
mit einer Potenzialkarte für noch unentdeckte Marschlager.

Anstoß war der Vortrag von Dr. Bettina Tremmel (LWL-Archäologie für
Westfalen, Fachreferat Provinzialrömische Archäologie) auf der
Regionalkonferenz des Kreisheimatbundes Minden-Lübbecke. Nach ihrer
Arbeitshypothese lagen Marschlager etwa einen Tagesmarsch (18–20 km) auseinander, an fließendem
Wasser und meist auf Anhöhen oder in leichter Hanglage. Im Boden erkennt man
sie an geraden Gräben mit abgerundeten Ecken („Spielkartenform“).

## Starten

```bash
bun install
bun run dev
```

Danach http://localhost:3000/roemer/ öffnen. `bun test` prüft das Rechenmodell,
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
| `src/lib/water.js` | Fließgewässer aus OSM über Overpass (optional) |
| `src/components/` | Karte, Seitenleiste, Info-Karten |

## Potenzialmodell

Der sichtbare Kartenausschnitt (höchstens 90 × 90 km) wird in Zellen von
100–500 m zerlegt. Jede Zelle bekommt fünf Teilwerte zwischen 0 und 1:

| Kriterium | Berechnung |
|-----------|------------|
| Tagesmarsch | Gaußglocke um den Abstand zum nächsten bekannten Lager (Standard 19 ± 2,5 km) |
| Fließgewässer | 1 bis 300 m Abstand zum nächsten Bach oder Fluss, danach abfallend |
| Anhöhe | Topographic Position Index: Höhe minus Mittel im Umkreis von 1,5 km, logistisch skaliert |
| Hanglage | 0,5–6° Neigung ideal, ab 15° null |
| Flusskorridor | Nähe zu größeren Flüssen als Hinweis auf die Marschroute |

Das Gewässernetz wird standardmäßig aus dem Höhenmodell berechnet. Dazu
werden Senken gefüllt (Priority-Flood, Barnes et al. 2014), der Abfluss
folgt dem steilsten Gefälle und das Einzugsgebiet wird aufsummiert. Ab 2 km² Einzugsgebiet gilt ein Pixel
als Bach, ab 150 km² als Fluss (beides einstellbar). Das folgt den
natürlichen Talzügen und kennt keine Kanäle oder Begradigungen. Alternativ
lassen sich die heutigen Gewässer aus OpenStreetMap laden. Die öffentlichen
Overpass-Server sind aber oft überlastet. Scheitert die Abfrage, rechnet die
App mit dem Höhenmodell weiter.

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
