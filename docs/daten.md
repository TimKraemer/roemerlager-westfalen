# Daten, Herkunft und Lizenzen

Alle Daten liegen als JSON im Repository. Von Hand gepflegt werden nur die
Dateien in der ersten Tabelle, alles andere erzeugen Skripte unter
`scripts/`.

## Von Hand gepflegt

Lizenz: CC BY 4.0, Namensnennung „Tim Krämer, Römerlager Westfalen“.

| Datei | Inhalt |
|-------|--------|
| `src/data/fundstellen.json` | Bekannte Fundstellen als GeoJSON, Schema unten |
| `src/data/literatur.json` | Literatur, Presse und Datendienste als CSL-JSON, Schema unten |
| `src/data/quellen.json` | Gruppen und Reihenfolge der Quellen im Reiter „Quellen“, verweist per `ref` auf die Literatur |
| `src/data/texte.json` | Antike Textstellen mit lateinischem bzw. griechischem Original, deutscher Übersetzung und Kartenbezug |
| `src/lib/criteria.js` | Erklärtexte und Belege je Modellkriterium |
| `src/lib/text-geo.js` | Orte, Räume und Richtungen je Textstelle für die Karte |
| `src/lib/regions.js` | Vorberechnete Regionen und Einstellungen des Marschwege-Netzes |

Die lateinischen Originale stammen aus The Latin Library, Cassius Dio aus
LacusCurtius (Thayer). Offensichtliche Scanfehler der Vorlagen sind
berichtigt und im Feld `note` vermerkt. Die deutschen Übersetzungen sind
mit KI erstellt und nicht philologisch geprüft, die von Cassius Dio folgt
der gemeinfreien englischen Übersetzung von E. Cary (Loeb, 1917).

### Schema einer Fundstelle

```json
{
	"type": "Feature",
	"geometry": { "type": "Point", "coordinates": [8.9121, 52.2571] },
	"properties": {
		"id": "barkhausen",
		"name": "Porta Westfalica-Barkhausen „Auf der Lake“",
		"type": "marschlager",
		"status": "bestätigt",
		"precision": "Lagermitte, etwa ±200–300 m",
		"size_ha": "unbekannt (3 ha ergraben)",
		"dating": "augusteisch, entdeckt 2008",
		"place": "Porta Westfalica, Kreis Minden-Lübbecke",
		"description": "Marschlager an der Weser nördlich der Porta. …",
		"sources": [
			{ "ref": "tremmel2011a", "note": "Lagepläne der Grabung" },
			{ "label": "Wikipedia: Marschlager Porta Westfalica", "url": "https://de.wikipedia.org/wiki/Marschlager_Porta_Westfalica" }
		],
		"inModel": true
	}
}
```

| Feld | Bedeutung |
|------|-----------|
| `id` | Kleinbuchstaben und Bindestriche, eindeutig, wird in Routen und Vorberechnung referenziert |
| `type` | `legionslager`, `kastell`, `marschlager`, `posten`, `schlachtfeld`, `fund` oder `verdacht` (`src/lib/sites.js`) |
| `status` | `bestätigt`, `Verdacht mit guten Indizien`, `Hypothese` usw., frei formuliert |
| `precision` | Wie genau die Koordinate ist. Bei unveröffentlichten oder geschützten Plätzen nur grob, siehe unten |
| `inModel` | `true` für augusteische Lager, die Ringe und Routen im Modell erzeugen |
| `routeTarget`, `routeNote` | Optional. Ziel einer Marschroute ohne gesichertes Lager (Kalkriese, Suchraum Löhne) |
| `waypoint` | Optional. Zwangspunkt für Routen |
| `sources` | Mindestens eine Quelle. Fachliteratur steht in `literatur.json` und wird per `ref` eingebunden, optional mit `note`. Wikipedia und Projektseiten direkt mit `label` und `url`, nur zusätzlich |

Koordinaten stammen aus veröffentlichten Quellen (Fachliteratur,
LWL-Pressemitteilungen, Wikipedia). Bodendenkmäler sind gesetzlich
geschützt. Genauere Lagen als die veröffentlichten gehören nicht in dieses
Repository, und die Potenzialkarte ist keine Aufforderung zum Graben oder
Sondeln.

### Literatur

`src/data/literatur.json` ist eine Liste im Format
[CSL-JSON](https://citeproc-js.readthedocs.io/en/latest/csl-json/markup.html),
das Zotero, Pandoc und citeproc verstehen. Aus ihr entstehen die Kurzangaben
in den Listen (`src/lib/literature.js`), die Zitierstile und die Exporte nach
BibTeX, BibLaTeX und RIS (`src/lib/cite.js`).

```json
{
	"id": "tremmel2011a",
	"type": "article-journal",
	"author": [{ "family": "Tremmel", "given": "Bettina" }],
	"issued": { "date-parts": [[2011]] },
	"title": "Augusteische Marschlager in Porta Westfalica-Barkhausen „Auf der Lake“",
	"container-title": "Archäologie in Westfalen-Lippe",
	"volume": "2010",
	"page": "79-81",
	"DOI": "10.11588/aiw.0.0.25926"
}
```

| Feld | Bedeutung |
|------|-----------|
| `id` | Kleinbuchstaben, Ziffern und Bindestriche, Muster Name und Jahr. Wird zum BibTeX-Schlüssel, Bindestriche dort als Unterstrich |
| `type` | CSL-Typ, hier `article-journal`, `book`, `chapter`, `report`, `dataset`, `map`, `webpage`, `article-newspaper`, `post-weblog` |
| `author`, `editor` | Personen mit `family` und `given`, Namenszusätze in `non-dropping-particle` („von“), Institutionen als `literal` |
| `volume`, `issued` | Bei Jahrbüchern ist `volume` das Berichtsjahr und `issued` das Erscheinungsjahr („2010 (2011)“) |
| `DOI`, `URL` | DOI ohne `https://doi.org/`. Ohne DOI der Katalogeintrag (DNB, K10plus, NWBib, Zenon) oder die Seite |
| `accessed` | Abrufdatum bei Webseiten und Diensten |

Die Angaben stammen aus DOI-Metadaten (Crossref, DataCite) und den Katalogen
der DNB, des K10plus, der NWBib (lobid) und von Zenon (DAI), abgerufen am
06.10.2026. Wo ein Katalog keinen Vornamen nennt, fehlt er auch hier.
Pressemitteilungen und Zeitungsartikel tragen den Titel der Seite.

### Zitierstile

Die Stildateien in `public/csl/` stammen aus dem
[CSL-Stilrepository](https://github.com/citation-style-language/styles) und
stehen unter [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
Der DAI-Stil ist an zwei Stellen geändert, vermerkt im Kopf der Datei. URLs
bleiben in der ursprünglichen Schreibung (der Stil schrieb sie klein und
machte damit Links mit `urlID=` ungültig), und die Auflage steht wie in den
Zitierrichtlinien des DAI hochgestellt vor dem Jahr. APA 7 bringt
citation-js selbst mit.

## Von Skripten erzeugt

| Datei | Skript | Herkunft | Lizenz |
|-------|--------|----------|--------|
| `src/data/roemerstrassen.json` | `scripts/build-roads.mjs` | Itiner-e (Zenodo, DOI 10.5281/zenodo.17122148), Hellwege nach der heutigen B 65 aus OpenStreetMap | CC BY 4.0 (Itiner-e), ODbL 1.0 (OSM-Anteile) |
| `src/data/fluesse.json` | `scripts/build-rivers.mjs` | Preußische Uraufnahme (Geobasis NRW), OpenStreetMap, Literatur für römerzeitliche Abschnitte | ODbL 1.0 |
| `src/data/kreis-minden-luebbecke.json` | einmalig über Nominatim | OpenStreetMap | ODbL 1.0 |
| `src/data/altkarten.json` | `scripts/altkarten/alt.sh index` | Verzeichnis der entzerrten Altkarten | CC BY 4.0 |
| `src/data/altkarten-quellen.json` | von Hand | Bestandsnachweise der Scans (SLUB, Landesarchiv NRW) | CC BY 4.0 |
| `scripts/altkarten/gcp/*.json` | von Hand und `alt.sh fit` | Passpunkte je Altkarte | CC BY 4.0 |
| `public/precomputed/minden-luebbecke.*`, `westfalen-netz.json` | `bun run precompute` | Mapzen Terrain Tiles (SRTM, EU-DEM), OpenStreetMap, BK50 NRW, GUM50 NI | CC BY 4.0, enthält Ableitungen aus ODbL-Daten |
| `public/precomputed/lineaments*.json`, `lrm/*.jpg` | `bun run precompute`, `scripts/validate-lineaments.mjs` | DGM1 NRW (Geobasis NRW, dl-de/zero-2-0), OpenStreetMap | CC BY 4.0 |
| `public/precomputed/validation.json` | `scripts/validate-model.mjs`, `scripts/optimize-weights.mjs` | Gegenprobe des Modells | CC BY 4.0 |
| `public/precomputed/orte.json` | `scripts/build-places.mjs` | OpenStreetMap (OpenMapTiles) | ODbL 1.0 |
| `public/precomputed/gebiete.json` | `scripts/build-areas.mjs` | OpenStreetMap über Overpass | ODbL 1.0 |
| `public/models/oberaden.glb` | 3D-Modell aus der Bergkamen-App von erleben.app | eigene Rekonstruktion nach dem Gesamtplan der LWL-Archäologie | © erleben.app, alle Rechte vorbehalten |

OpenStreetMap-Daten: © OpenStreetMap-Mitwirkende, verfügbar unter der Open
Database License 1.0 (https://www.openstreetmap.org/copyright).

## Skripte

Alle Skripte laufen mit Bun aus dem Projektordner und laden Kacheln aus dem
Netz (Kacheldienste in `src/config.js`).

| Befehl | Dauer | Ergebnis |
|--------|-------|----------|
| `bun run precompute` | einige Minuten | Vorberechnete Regionen, Marschwege-Netz, Laserscan-Fenster |
| `bun scripts/validate-model.mjs` | einige Minuten | Gegenprobe, `validation.json` |
| `bun scripts/optimize-weights.mjs` | einige Minuten | Gewichtssuche mit Kreuzvalidierung |
| `bun scripts/validate-lineaments.mjs` | kurz | Prüfung der Linienerkennung an bekannten Lagern |
| `bun scripts/build-roads.mjs` | kurz | Römerstraßen, lädt Itiner-e von Zenodo |
| `bun scripts/build-rivers.mjs [Fluss …] [--roemisch]` | beim ersten Mal etwa 1 h | Alte Flussläufe |
| `bun scripts/build-places.mjs` | einige Minuten | Ortsverzeichnis der Suche |
| `bun scripts/build-areas.mjs` | je nach Overpass-Last | Höhenzüge und Verwaltungsgebiete der Suche |

### Alte Flussläufe

`scripts/build-rivers.mjs` baut die Läufe von Lippe, Ems, Weser, Rhein,
Elbe, Stever, Seseke und Alme. Leitlinie ist der heutige Lauf aus
OpenStreetMap. In NRW sucht das Skript je 6-km-Abschnitt den günstigsten
Weg über blau kolorierte Wasserflächen der Preußischen Uraufnahme. Findet
sich auf einem Blatt kein Blau oder folgt der Weg nur dünnen Linien wie
Festungsgräben, gilt dort der heutige Lauf. Bei Haltern und Xanten setzt es
den römerzeitlichen Lauf nach der Literatur ein. Jedes Teilstück trägt
seine Herkunft (`uraufnahme`, `osm` oder `roemisch`). Die Kacheln der
Uraufnahme landen in `node_modules/.cache/uraufnahme`.

### Altkarten

Die Altkarten (Minden und Lübbecke, 1650–1904) sind entzerrte Scans
historischer Karten. Weder die Scans noch die daraus gerechneten Kacheln
liegen im Repository, nur die Passpunkte (`scripts/altkarten/gcp/`) und das
Verzeichnis (`src/data/altkarten.json`). Ohne Kacheln blendet die App die
Gruppe „Altkarten“ aus.

Bestandsnachweis und Rechteangabe je Scan stehen in
`src/data/altkarten-quellen.json` und erscheinen in der Attribution der
Karte. Sieben Blätter stammen aus der Deutschen Fotothek der SLUB Dresden
(Public Domain Mark 1.0), sieben aus dem Landesarchiv NRW, Abteilung
Westfalen, Bestand W 051 (CC BY-SA 4.0, Scans über das LWL-Portal
„Westfälische Geschichte“). Die beiden Messtischblätter 3616 und 3617 in
der Ausgabe von 1938 führt die SLUB als urheberrechtlich geschützt. Die
Angaben wurden über die API der Deutschen Digitalen Bibliothek ermittelt,
die Rechtehinweise auf den Seiten der Archive selbst sind noch von Hand zu
prüfen. Die gerechneten Kacheln übernehmen die Lizenz des jeweiligen Scans.

Kacheln rechnen (Python über [uv](https://docs.astral.sh/uv/) mit numpy,
scipy, Pillow und pyproj):

```bash
export ALTKARTEN_DIR="$HOME/Downloads/Historische Landkarten"   # Ordner mit den Scans
bun scripts/altkarten/orte.mjs                  # Ortsverzeichnis für Passpunkte, einmalig
scripts/altkarten/alt.sh fit 1844-kreis-luebbecke
scripts/altkarten/alt.sh tiles 1844-kreis-luebbecke
scripts/altkarten/alt.sh index                  # schreibt src/data/altkarten.json
```

## Externe Dienste zur Laufzeit

Die App lädt Karten direkt bei den Anbietern. Die Lizenz steht jeweils in
der Attribution der Karte.

| Dienst | Lizenz |
|--------|--------|
| OpenStreetMap (Vektorkacheln, Grundkarte) | ODbL 1.0 |
| Geobasis NRW (Luftbilder, DGM1-Schummerung, Uraufnahme, Denkmäler) | dl-de/zero-2-0 |
| LGLN Niedersachsen (Luftbilder) | CC BY 4.0 |
| BKG TopPlusOpen | CC BY 4.0 |
| Sentinel-2 cloudless von EOX | CC BY-NC-SA 4.0 |
| Mapzen Terrain Tiles auf AWS (SRTM, EU-DEM u. a.) | siehe https://github.com/tilezen/joerd/blob/master/docs/attribution.md |
| GD NRW BK50, LBEG GUM50 und weitere LBEG-Karten (Böden, Moore) | Nutzungsbedingungen des jeweiligen Landesamts |
