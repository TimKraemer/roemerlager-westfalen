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
| `public/precomputed/minden-luebbecke.*`, `westfalen-netz.json` | `bun run precompute` | Mapzen Terrain Tiles (SRTM, EU-DEM), OpenStreetMap, Preußische Uraufnahme (Bäche), BK50 NRW, GUM50 NI, Kreiskarte Lübbecke 1844 (Moore) | CC BY 4.0, enthält Ableitungen aus ODbL-Daten und aus der Kreiskarte 1844 (CC BY-SA 4.0) |
| `public/precomputed/lineaments*.json`, `lrm/*.jpg` | `bun run precompute`, `scripts/validate-lineaments.mjs` | DGM1 NRW (Geobasis NRW, dl-de/zero-2-0), OpenStreetMap | CC BY 4.0 |
| `public/precomputed/validation.json` | `scripts/validate-model.mjs`, `scripts/optimize-weights.mjs` | Gegenprobe des Modells | CC BY 4.0 |
| `public/precomputed/gewaesser-zeit.geojson` | `scripts/altkarten/gewaesser.sh` | Preußische Uraufnahme (Geobasis NRW), Karte des Deutschen Reiches 1904 (SLUB, Public Domain Mark), OpenStreetMap als Leitlinien | ODbL 1.0 |
| `public/precomputed/moor-1844.geojson` | `scripts/altkarten/moor1844.py` aus den Umrissen in `scripts/altkarten/moor/1844-kreis-luebbecke.json` | Kreiskarte Lübbecke 1844 (Landesarchiv NRW, W 051 Nr. 11781) | CC BY-SA 4.0 |
| `public/precomputed/moor-zeit.geojson` | `scripts/altkarten/moor.sh` | BK50 NRW (GD NRW, dl-de/by-2-0), GUM50 (LBEG Niedersachsen), Überschwemmungsgebiete nach der preußischen Aufnahme (Land NRW, Dienst uesg) | Lizenzen der Landesämter |
| `public/precomputed/wald-zeit.geojson` | `scripts/altkarten/wald.sh` | Waldflächen in NRW während der Preußischen Uraufnahme (LANUK NRW, Open Data), auf den Kreis zugeschnitten | Lizenz des LANUK, noch zu prüfen |
| `public/precomputed/wege-zeit.geojson` | `scripts/altkarten/wege.sh` | Preußische Uraufnahme (Geobasis NRW), OpenStreetMap als Leitlinien | ODbL 1.0 |
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
| `scripts/altkarten/gewaesser.sh [--quelle ura,kdr1904]` | Uraufnahme beim ersten Mal etwa 20 min, danach wenige Minuten | Gewässer um 1840 und um 1900 (die Karte zeigt um 1840) |
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

Die Altkarten (Kreiskarte Lübbecke 1844, Karte des Deutschen Reiches 1904)
sind entzerrte Scans historischer Karten. Das Projekt führt nur Karten, aus
denen das Modell Moore oder Gewässer liest. Dreizehn weitere Karten von 1650
bis 1898 und die Ebene TK25 1936–1945 stehen im Git-Tag `vor-trennung`. Weder die Scans noch die daraus gerechneten Kacheln
liegen im Repository, nur die Passpunkte (`scripts/altkarten/gcp/`) und das
Verzeichnis (`src/data/altkarten.json`). Ohne Kacheln blendet die App diese
Karten in der Gruppe „Historische Karten“ aus.

Bestandsnachweis und Rechteangabe je Scan stehen in
`src/data/altkarten-quellen.json` und erscheinen in der Attribution der
Karte. Die Karte von 1904 stammt aus der Deutschen Fotothek der SLUB
Dresden (Public Domain Mark 1.0), die Kreiskarte 1844 aus dem Landesarchiv
NRW, Abteilung Westfalen, Bestand W 051 (CC BY-SA 4.0, Scan über das
LWL-Portal „Westfälische Geschichte“). Die Angaben wurden über die API der
Deutschen Digitalen Bibliothek ermittelt, die Rechtehinweise auf den Seiten der Archive selbst sind noch von Hand zu
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

### Gewässer, Moore, Wald und Wege aus den Karten

Die Karte zeigt Gewässer, Moore, Wald und Hauptwege im Stand um 1840.
Die Gewässer um 1900 liegen weiter in den Daten, werden aber nicht
gezeigt. Die Umschaltung auf um 1900 und heute steckt in der Git-Historie.

`scripts/altkarten/gewaesser.sh` liest für den Kreis Minden-Lübbecke die
Gewässer aus zwei Karten:

- Um 1840, Preußische Uraufnahme: Bäche sind dünne blaugraue Linien auf
  grünblau laviertem Grund und lassen sich nicht von jeder Feldgrenze
  trennen. Das Skript sucht deshalb entlang jedes heutigen Bachs (OSM,
  ohne Kanäle; benannte Bäche, die OSM als Graben führt, zählen mit, außer
  der Name sagt Graben, Kanal oder Ähnliches) in einem Korridor von 150 m,
  bei Flüssen 400 m, den günstigsten Weg über bläuliche, dunkle Linien und
  übernimmt nur
  Abschnitte, auf denen der Weg deutlich mehr Wasser trifft als der Grund
  daneben. Gräben ohne heutigen Bach und verschwundene Bäche fehlen.
- Um 1900, Karte des Deutschen Reiches 1904, Blatt Lübbecke: Gewässer sind
  kräftig blau. Das Skript nimmt alle blauen Linien, schließt Lücken des
  Drucks in Linienrichtung und dünnt auf Mittellinien aus. Linien nahe
  einem heutigen Bach tragen dessen Namen, die übrigen gelten als Graben.

Die Karten des 17. und 18. Jahrhunderts liegen örtlich 0,3–1 km neben der
heutigen Lage, aus ihnen werden keine Linien gelesen.

Moore und nasse Flächen (`scripts/altkarten/moor.sh`) stammen nur aus
amtlichen Daten. In der Karte des Deutschen Reiches ist die Moorsignatur
ein blasser Blauschleier, die Uraufnahme ist Blatt für Blatt anders
koloriert, beides ließ sich nicht verlässlich auslesen. Immer gezeigt
werden die Moorböden nach BK50 (NRW, Hoch- und Niedermoor samt Deck- und
Fehnkultur) und außerhalb NRW nach GUM50; im Torfkörper steckt die
Ausdehnung vor der Kultivierung, abgetorfte Flächen fehlen teils. In der
GUM50 fehlt ein Kartenblatt am Dümmer. Um 1840 kommen die
Überschwemmungsgebiete nach der preußischen Aufnahme dazu (der Dienst
zeichnet sie schraffiert, das Skript füllt die Umrisse).

Wald um 1840 kommt aus dem Datensatz „Waldflächen in Nordrhein-Westfalen
während der Preußischen Uraufnahme“ des Landesamts für Natur, Umwelt und
Klima (`scripts/altkarten/wald.sh` lädt das GeoPackage und schneidet es
zu). Orte um 1840 gibt es nicht als amtliche Daten, und
die Uraufnahme färbt Häuser je Blatt anders (teils rot, teils schwarz), eine
automatische Erkennung war nicht verlässlich.

Hauptwege um 1840 (`scripts/altkarten/wege.sh`) liest das Skript wie die
Bäche: Leitlinien sind die heutigen Bundes-, Landes- und Kreisstraßen aus
OSM (trunk bis tertiary). In einem Korridor von 120 m sucht es den
günstigsten Weg über Linien, die wärmer (Rot über Blau) und dunkler sind
als ihre Umgebung, so wie die Uraufnahme Wege braun bis rot zieht, und
übernimmt nur Abschnitte, auf denen die Karte deutlich einen Weg zeigt.
Das Ergebnis zeigt, welche heutigen Hauptstraßen es schon als Weg gab und
wo der alte Weg anders lief. Verschwundene Wege fehlen, Feldgrenzen und
Gräben entlang einer Straße können als Weg durchgehen. Zwischenstände und
Prüfbilder (`--debug --bbox w s e n`) liegen in `scripts/altkarten/.cache`.

### Bäche und Moore im Potenzialmodell

Das Kriterium „Wasser“ misst den Abstand zum nächsten Bach. Standard ist
die Wasserquelle „Aus Karten“: Im Kreis Minden-Lübbecke gelten die Bäche
im Lauf der Uraufnahme um 1840 (Zeitschnitt `ura` aus
`gewaesser-zeit.geojson`, ohne Gräben). Heutige Bäche aus OpenStreetMap
zählen dort, wo in 400 m kein Lauf der Uraufnahme liegt, außerhalb des
Kreises also überall. Große Flüsse ab 150 km² Einzugsgebiet kommen weiter
aus dem Höhenmodell, Lippe, Weser und Ems im alten Lauf.

Das aus dem Höhenmodell abgeleitete Netz bleibt als Wahl „Aus
Höhenmodell“. Ein Abgleich im Kreis (Oktober 2026) zeigt, warum es nicht
mehr Standard ist. Im Flachland nördlich des Wiehengebirges lagen die
berechneten Bäche im Median 295 m neben dem nächsten OSM-Bach, 153 von
471 km hatten in 600 m gar keinen. Im Bergland waren es 116 m und 16 von
111 km. Bei Eilhausen etwa legte das Höhenmodell die Flöthe rund 400 m zu
weit nach Süden.

Moore ziehen das Potenzial um bis zu 70 % herunter. Grundlage sind die
Moorböden der BK50 NRW und der GUM50 Niedersachsen. Der NRW-Dienst zeichnet
erst unter etwa 70 m je Pixel und liefert gröber ein leeres Bild, er wird
deshalb wie der niedersächsische Dienst in Unterpixeln abgefragt. Bis
Oktober 2026 fehlten dadurch im Modell alle Moore in NRW.

Wo der Torf später abgestochen oder kultiviert wurde, fehlt das Moor in
der BK50. Diese Flächen kommen aus der Kreiskarte Lübbecke 1844
(`moor-1844.geojson`), etwa das Stemmer Moor, die Moore bei Moorort und
Spreen und das Schwarze und Weiße Moor bei Nutteln. Die Karte zeichnet
Heide und Torfmoor mit derselben Signatur. Aufgenommen sind deshalb nur
Flächen mit Torfstich-Zeichen oder Moor-, Torf- und Bruchnamen, von Hand in
Bildpixeln umrissen und über die Passpunkte der Karte entzerrt
(Lagefehler im Median etwa 210 m). Brüche zählen zu 60 %. Altes Moor,
Gessmoor, Nettelstedter und Eilhauser Moor fehlen in der Datei, weil die
BK50 sie deckungsgleich führt. Ein Moor von 1844 gilt im Modell auch zur
Römerzeit als Moor. Wie weit sich die Ränder in den knapp 2000 Jahren
dazwischen verschoben haben, lässt die Karte nicht erkennen.

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
