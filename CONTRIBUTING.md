# Mitwirken

Korrekturen und Ergänzungen sind willkommen, besonders von Archäologinnen,
Heimatforschern und allen, die Fundstellen, Quellen oder Gelände vor Ort
kennen. Für kleine Hinweise reicht ein Issue. Für Änderungen bitte einen
Pull Request gegen `main`.

## Entwicklungsumgebung

Voraussetzung ist [Bun](https://bun.sh) ab Version 1.3.

```bash
bun install        # kopiert per postinstall auch den MapLibre-Worker und den Draco-Decoder
bun run dev        # http://localhost:3000/
bun test           # Tests des Rechenmodells und der Suche
bun run lint       # Biome, Formatierung und Linter
bun run lint:fix   # Formatierung automatisch korrigieren
bun run build      # statischer Export nach out/
```

Ein Pull Request sollte `bun test`, `bun run lint` und `bun run build`
bestehen. Die GitHub Actions prüfen das automatisch.

## Konventionen

- JavaScript ohne TypeScript, React-Komponenten in `src/components/`, reine Logik in `src/lib/`.
- Formatierung nach Biome: Tabs, doppelte Anführungszeichen, keine Semikolons.
- Kommentare, Oberfläche und Commit-Nachrichten auf Deutsch. Kommentare erklären, warum etwas so ist, nicht was die Zeile tut.
- Rechenlogik bleibt frei von Browser-APIs, damit sie im Web Worker und in den Bun-Skripten gleich läuft (`src/lib/potential/`).
- Neue Abhängigkeiten nur, wenn es ohne sie deutlich aufwendiger wäre.

## Quellen

Jede inhaltliche Angabe braucht eine nachprüfbare Quelle. Fachliteratur hat
Vorrang vor Presse und Wikipedia. Bitte Autor, Jahr, Titel, Erscheinungsort
und Seiten angeben und, wo vorhanden, einen DOI. Neue Literatur bitte vor
dem Eintragen im Katalog oder beim Verlag nachschlagen. Mit KI erzeugte
Literaturangaben sind oft erfunden und werden ohne Nachweis nicht
übernommen.

Keine unveröffentlichten Fundstellen und keine genaueren Koordinaten als die
veröffentlichten. Bodendenkmäler sind geschützt.

## Erweitern

### Fundstelle ergänzen

Eintrag in `src/data/fundstellen.json` nach dem Schema in
[docs/daten.md](docs/daten.md). Soll das Lager Ringe und Routen im Modell
erzeugen, `"inModel": true` setzen und danach neu rechnen:

```bash
bun run precompute
bun scripts/validate-model.mjs
```

### Region vorberechnen

Die Startansicht zeigt den Kreis Minden-Lübbecke mit vorberechneter
Analyse. Weitere Regionen kommen als Eintrag in `REGIONS` in
`src/lib/regions.js` dazu: `id`, `label`, `bbox` des Analysegebiets (etwas
größer als die Region, damit Routen zu Nachbarlagern hineinpassen),
`view.bounds` für den Kartenausschnitt, optional `outline` als
GeoJSON-Polygon und `file` als Ziel unter `public/precomputed/`. Dann
`bun run precompute`.

### Kartenebene ergänzen

Grundkarten stehen in `BASE_LAYERS`, zuschaltbare Ebenen in `OVERLAYS` in
`src/lib/layers.js`. Eine WMS-Ebene braucht `id`, `group`, `label`, `wms`,
`layers` und `attribution`, eine Kachel-Ebene `tiles` statt `wms`. `jump`
oder `bounds` setzt das Ziel für „Dorthin springen“. Bitte nur offen
lizenzierte Dienste mit Web-Mercator (EPSG:3857) und CORS. Das Datum der
letzten Prüfung steht oben in der Datei.

### Antiken Text ergänzen

Eintrag in `src/data/texte.json` mit Original (`latin`), Übersetzung
(`german`), Werk und Stelle, Link auf eine frei zugängliche Textausgabe
(`url`) und einem Satz zum Kartenbezug (`map`). Orte, Räume und Richtungen
für die Kartendarstellung kommen in `src/lib/text-geo.js` unter derselben
`id`.

### Quelle für den Reiter „Quellen“

Fachliteratur, Presse und Datendienste kommen einmal nach
`src/data/literatur.json` (CSL-JSON, Schema in [docs/daten.md](docs/daten.md#literatur)),
am einfachsten per DOI. `https://doi.org/<DOI>` liefert mit dem Header
`Accept: application/vnd.citationstyles.csl+json` fertiges CSL-JSON, das
nur noch auf die Felder im Schema gekürzt wird. In `src/data/quellen.json`,
bei einer Fundstelle oder in `src/lib/criteria.js` verweist dann
`{ "ref": "<id>" }` darauf, optional mit `note`. Wikipedia und Projektseiten
ohne bibliographische Angaben bekommen direkt `label` und `url`. Eine neue
Kartenebene braucht einen Eintrag in `src/lib/layer-sources.js`, sonst
schlägt `bun test` fehl.

### Modell ändern

Faktoren und Standardgewichte stehen in `src/lib/potential/model.js`
(`FACTORS`, `DEFAULT_PARAMS`), die Erklärtexte samt Belegen in
`src/lib/criteria.js`. Nach jeder Änderung am Modell bitte die Gegenprobe
laufen lassen und das Ergebnis im Pull Request nennen
(`bun scripts/validate-model.mjs`, Methode in [docs/modell.md](docs/modell.md)).
Tests für reine Rechenfunktionen gehören nach `src/lib/potential/model.test.js`.

## Arbeiten mit KI

Dieses Projekt ist weitgehend mit KI entstanden (siehe README). Beiträge mit
KI-Unterstützung sind willkommen, wenn sie im Pull Request so gekennzeichnet
sind (etwa mit `Co-Authored-By` im Commit) und die einreichende Person den
Code verstanden und die Quellen selbst geprüft hat.
