/**
 * Grundkarten und zuschaltbare Ebenen. Alle Dienste sind offen und
 * liefern Web-Mercator (EPSG:3857). WMS-Ebenen lädt MapLibre kachelweise
 * über den Platzhalter {bbox-epsg-3857}. Eine Ebene kann aus mehreren
 * Teilen bestehen (parts), die übereinander liegen, z. B. Luftbilder
 * NRW über Niedersachsen über Sentinel-2. Endpunkte am 05.10.2026 geprüft.
 */

import { addProtocol } from "maplibre-gl"
import { assetUrl, assetVersion, BASE_PATH, TILES } from "@/config"
import ALTKARTEN from "@/data/altkarten.json"
import ALTKARTEN_QUELLEN from "@/data/altkarten-quellen.json"
import RIVERS from "@/data/fluesse.json"

const GEOBASIS_NRW = "© Geobasis NRW (dl-de/zero-2-0)"
const LGLN = "© LGLN (CC BY 4.0)"
const BKG = "© BKG (CC BY 4.0)"
const OSM = "© OpenStreetMap-Mitwirkende"

export const DEM_TILES = TILES.dem
const VECTOR_TILES = TILES.vector

// Gewässer, Moore, Wald und Hauptwege aus den historischen Karten, alle im
// Stand um 1840. Die Stände um 1900 und heute stecken in der Git-Historie.
export const TIME_WATER_LAYER = "gewaesser-zeit"
export const MOOR_LAYER = "moor-zeit"
export const WALD_LAYER = "wald-zeit"
export const WEGE_LAYER = "wege-zeit"
export const GLYPHS = TILES.glyphs
export const FONT = ["Montserrat SemiBold"]
// Dienste von Geobasis NRW und eigene entzerrte Scans in einer Gruppe,
// im Panel nach Jahr sortiert
export const HISTORIC_GROUP = "Historische Karten"

// Grob umrissene Landesflächen. Dienste eines Landes bekommen sie als
// bounds, dann fragt MapLibre außerhalb gar nicht erst nach Kacheln, und
// das Panel meldet „außerhalb“.
const NRW = [5.86, 50.32, 9.47, 52.54]
const NI = [6.6, 51.29, 11.6, 53.9]

const SENTINEL = {
	tiles: [
		"https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg",
	],
	attribution:
		"Sentinel-2 cloudless 2024 © EOX IT Services GmbH (CC BY-NC-SA 4.0), enthält Copernicus-Daten",
	maxzoom: 15,
}
const DOP_NI = {
	wms: "https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms",
	layers: "ni_dop20",
	attribution: LGLN,
	minzoom: 8,
	bounds: NI,
}
// Im WMTS NRW heißen die Stufen der Matrix EPSG_3857_16 "00" bis "16",
// "00" ist Web-Mercator-Zoom 5. Das Protokoll nw-dop:// rechnet um.
const NW_DOP_WMTS =
	"https://www.wmts.nrw.de/geobasis/wmts_nw_dop/tiles/nw_dop/EPSG_3857_16"
const nwDopUrl = (z, x, y) =>
	`${NW_DOP_WMTS}/${String(Number(z) - 5).padStart(2, "0")}/${x}/${y}`
addProtocol("nw-dop", async (params, abortController) => {
	const [z, x, y] = params.url.slice("nw-dop://".length).split("/")
	const res = await fetch(nwDopUrl(z, x, y), {
		signal: abortController.signal,
	})
	if (!res.ok) throw new Error(`DOP NRW ${res.status}: ${params.url}`)
	return { data: await res.arrayBuffer() }
})
const DOP_NRW = {
	tiles: ["nw-dop://{z}/{x}/{y}"],
	attribution: GEOBASIS_NRW,
	minzoom: 8,
	bounds: NRW,
	// Stufe 14 entspricht Zoom 19, etwa 19 cm je Pixel auf 51,6° N
	maxzoom: 19,
}

export const BASE_LAYERS = [
	{
		id: "luftbild",
		label: "Luftbild",
		note: "NRW und Niedersachsen in 20 cm, außerhalb Sentinel-2 (10 m)",
		parts: [SENTINEL, DOP_NI, DOP_NRW],
	},
	{
		id: "topplus-grau",
		label: "TopPlusOpen grau",
		note: "Zurückhaltende Topographie, gut unter der Potenzialkarte",
		tiles: [
			"https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web_grau/default/WEBMERCATOR/{z}/{y}/{x}.png",
		],
		attribution: BKG,
		maxzoom: 18,
	},
	{
		id: "topplus",
		label: "TopPlusOpen (BKG)",
		note: "Amtliche Topographie für Deutschland",
		tiles: [
			"https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png",
		],
		attribution: BKG,
		maxzoom: 18,
	},
	{
		id: "osm",
		label: "OpenStreetMap",
		tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
		attribution: OSM,
		maxzoom: 19,
	},
]

// main: steht in der Seitenleiste oben unter „Auf der Karte“, alle übrigen
// außer den historischen Karten unter „Weitere Ebenen“.
// jump: [Länge, Breite, Zoom] für den Link „Dorthin springen“ bei regional
// begrenzten Ebenen. Gewählt ist eine Stelle und Stufe, an der der Dienst
// sicher etwas zeigt. minzoom bei WMS ist die Kartenzoomstufe, ab der der
// Dienst tatsächlich zeichnet (geprüft am 06.10.2026), darunter liefert er
// nur leere Bilder.
export const OVERLAYS = [
	{
		id: "relief",
		kind: "relief",
		group: "Gelände",
		label: "Relief farbig",
		note: "Höhenstufen und Schattierung aus dem Höhenmodell (Terrarium-Kacheln), NRW und Niedersachsen einheitlich",
		attribution:
			"Höhendaten: Mapzen Terrain Tiles (SRTM, EU-DEM, © Europäische Union)",
		opacity: 0.35,
		visible: true,
		main: true,
	},
	{
		id: "schummerung-nrw",
		bounds: NRW,
		jump: [8.62, 52.3, 12],
		group: "Gelände",
		label: "Schummerung NRW (DGM1)",
		note: "Laserscan, 1 m. Hier zeigen sich Wälle und Gräben.",
		wms: "https://www.wms.nrw.de/geobasis/wms_nw_dgm-schummerung",
		layers: "nw_dgm-schummerung_pan",
		attribution: GEOBASIS_NRW,
		opacity: 0.5,
		visible: true,
		main: true,
	},
	{
		id: "lrm",
		kind: "lrm",
		group: "Gelände",
		label: "Laserscan-Ansicht an Kandidaten und Lagern",
		note: "Local Relief Model aus dem DGM1 NRW (2 m): Gräben dunkel, Wälle hell. Fenster von 2,4 km an Kandidaten, Etappenhalten und allen bestätigten Lagern in NRW, geladen ab Zoomstufe 11.",
		attribution: GEOBASIS_NRW,
		opacity: 0.5,
		visible: true,
		main: true,
	},
	{
		id: "lines",
		kind: "lines",
		group: "Gelände",
		label: "Erkannte gerade Strukturen (experimentell)",
		note: "Automatisch gefundene gerade Gräben und Wälle, rot mit rechtwinkliger Ecke. An bestätigten Lagern nicht häufiger als anderswo, daher nur als Hinweis.",
		opacity: 0.9,
	},
	{
		id: "schummerung-nrw-col",
		bounds: NRW,
		jump: [8.62, 52.3, 12],
		group: "Gelände",
		label: "Schummerung NRW farbig (DGM1)",
		note: "Laserscan mit Höhenfarben, nur NRW",
		wms: "https://www.wms.nrw.de/geobasis/wms_nw_dgm-schummerung",
		layers: "nw_dgm-schummerung_col",
		attribution: GEOBASIS_NRW,
		opacity: 0.5,
		visible: true,
		main: true,
	},
	{
		id: "schummerung-de",
		group: "Gelände",
		label: "Schummerung Deutschland (basemap.de)",
		note: "Auch Niedersachsen und Hessen, gröber als DGM1",
		tiles: [
			"https://sgx.geodatenzentrum.de/wmts_basemapde_schummerung/tile/1.0.0/de_basemapde_web_raster_hillshade/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png",
		],
		attribution: BKG,
		maxzoom: 18,
		opacity: 0.6,
	},
	{
		id: "osm-gewaesser",
		kind: "water",
		group: "Gewässer",
		label: "Heutige Bäche und Flüsse (OSM)",
		note: "Aus den OpenStreetMap-Vektorkacheln, ohne Kanäle, Gräben und Drainagen",
		attribution: OSM,
		opacity: 0.9,
	},
	{
		id: "alte-flusslaeufe",
		kind: "oldrivers",
		group: "Gewässer",
		label: "Alte Flussläufe",
		note: "Dunkelblau Rhein, Lippe, Ems und Weser in NRW wie in der Uraufnahme um 1840, rot gestrichelt der römerzeitliche Lauf bei Haltern und Xanten, hellblau der heutige, wo die Uraufnahme nichts hergibt oder außerhalb NRW.",
		attribution: `${GEOBASIS_NRW}, ${OSM}`,
		opacity: 0.9,
	},
	{
		id: "uraufnahme",
		bounds: NRW,
		jump: [8.62, 52.3, 14],
		group: HISTORIC_GROUP,
		year: 1836,
		label: "Preußische Uraufnahme (1836–1850)",
		note: "Vor Mittellandkanal (1906–1938) und Begradigungen, zeigt alte Bachläufe und Feuchtgebiete. Nur NRW.",
		wms: "https://www.wms.nrw.de/geobasis/wms_nw_uraufnahme",
		layers: "nw_uraufnahme_rw",
		attribution: GEOBASIS_NRW,
		opacity: 0.85,
		minzoom: 12.5,
	},
	{
		id: "aue-preussisch",
		bounds: NRW,
		jump: [8.92, 52.3, 12],
		group: "Alte Gewässer und Böden",
		label: "Historische Aue (preußische Aufnahme)",
		note: "Überschwemmungsgebiete nach der preußischen Aufnahme, vor Deichen und Begradigung. Nur NRW.",
		wms: "https://www.wms.nrw.de/umwelt/wasser/uesg",
		layers: "4",
		attribution: "© Land NRW, Überschwemmungsgebiete",
		opacity: 0.7,
	},
	{
		id: "bk50-grundwasser",
		bounds: NRW,
		jump: [8.62, 52.3, 12],
		group: "Alte Gewässer und Böden",
		label: "Grundwassereinfluss im Boden (BK50 NRW)",
		note: "Gleye und Auenböden zeigen frühere Bachtäler und nasse Niederungen",
		wms: "https://www.wms.nrw.de/gd/bk050",
		layers: "Grundwasser",
		attribution: "© Geologischer Dienst NRW (dl-de/by-2-0)",
		opacity: 0.6,
		minzoom: 9.5,
	},
	{
		id: "bk50-bodentyp",
		bounds: NRW,
		jump: [8.62, 52.3, 12],
		group: "Alte Gewässer und Böden",
		label: "Bodentypen (BK50 NRW)",
		wms: "https://www.wms.nrw.de/gd/bk050",
		layers: "Bodentyp",
		attribution: "© Geologischer Dienst NRW (dl-de/by-2-0)",
		opacity: 0.6,
		minzoom: 9.5,
	},
	{
		id: "moore-ni",
		bounds: NI,
		jump: [8.5, 52.6, 12],
		group: "Alte Gewässer und Böden",
		label: "Ursprüngliche Moore (GUM50 Niedersachsen)",
		note: "Moorverbreitung vor der Kultivierung, ab Zoom 12",
		wms: "https://nibis.lbeg.de/net3/public/ogc.ashx?PkgId=22",
		layers: "L112",
		attribution: "© LBEG Niedersachsen",
		minzoom: 12,
		opacity: 0.6,
	},
	{
		id: "bk50-ni",
		bounds: NI,
		jump: [8.45, 52.48, 12],
		group: "Alte Gewässer und Böden",
		label: "Bodenkarte BK50 Niedersachsen",
		note: "Ab Zoom 12",
		wms: "https://nibis.lbeg.de/net3/public/ogc.ashx?NodeId=989",
		layers: "L816",
		attribution: "© LBEG Niedersachsen",
		minzoom: 12,
		opacity: 0.6,
	},
	{
		id: "gk100-nrw",
		bounds: NRW,
		jump: [8.62, 52.3, 12],
		group: "Alte Gewässer und Böden",
		label: "Geologie bis 2 m Tiefe (GK100 NRW)",
		note: "Holozäne Bach- und Flussablagerungen markieren alte Talböden",
		wms: "https://www.wms.nrw.de/gd/GK100",
		layers: "1",
		attribution: "© Geologischer Dienst NRW (dl-de/by-2-0)",
		opacity: 0.6,
		minzoom: 9.5,
	},
	{
		id: "gewaesser-nrw",
		bounds: NRW,
		jump: [8.62, 52.3, 12],
		group: "Gewässer",
		label: "Fließgewässer NRW (GSK3B)",
		note: "Amtliches Gewässernetz",
		wms: "https://www.wms.nrw.de/umwelt/gewstat",
		layers: "7,8,9",
		attribution: "© Land NRW, Gewässerstationierungskarte",
		opacity: 0.9,
	},
	{
		id: "tranchot",
		bounds: NRW,
		jump: [6.45, 51.66, 12],
		group: HISTORIC_GROUP,
		year: 1801,
		label: "Tranchot/v. Müffling (1801–1828)",
		note: "Nur Rheinland, rechts des Rheins etwa bis Duisburg, Wuppertal und Siegen. Xanten liegt drin, die Lippelager und Bergkamen nicht. Ab Zoom 11.",
		wms: "https://www.wms.nrw.de/geobasis/wms_nw_tranchot",
		layers: "nw_tranchot",
		attribution: GEOBASIS_NRW,
		minzoom: 11,
		opacity: 0.85,
	},
	{
		id: "neuaufnahme",
		bounds: NRW,
		jump: [8.62, 52.3, 13],
		group: HISTORIC_GROUP,
		year: 1891,
		label: "Preußische Neuaufnahme (1891–1912)",
		wms: "https://www.wms.nrw.de/geobasis/wms_nw_neuaufnahme",
		layers: "nw_neuaufnahme",
		attribution: GEOBASIS_NRW,
		opacity: 0.85,
		minzoom: 10.5,
	},
	{
		id: "hist-dop",
		bounds: NRW,
		jump: [7.62, 51.96, 13],
		group: HISTORIC_GROUP,
		year: 1951,
		label: "Luftbilder der 1950er (NRW)",
		note: "Befliegungen 1951–1958, Bewuchsmerkmale vor der Bebauung",
		wms: "https://www.wms.nrw.de/geobasis/wms_nw_hist_dop",
		layers: [1958, 1957, 1956, 1955, 1954, 1953, 1952, 1951]
			.map((y) => `nw_hist_dop_${y}`)
			.join(","),
		attribution: GEOBASIS_NRW,
		opacity: 1,
	},
	{
		id: "bodendenkmal-nrw",
		bounds: NRW,
		jump: [6.45, 51.66, 12],
		group: "Denkmäler",
		label: "Bodendenkmäler NRW (INSPIRE)",
		note: "Lückenhaft, die Römerlager fehlen dort",
		wms: "https://www.wms.nrw.de/wms/wms_nw_inspire-denkmal",
		layers:
			"ProtectedSites_Archaeological_Surface,ProtectedSites_Archaeological_Line,ProtectedSites_Archaeological_Point",
		attribution: "© LWL / LVR, Denkmalbehörden NRW",
		opacity: 0.9,
	},
	// Entzerrte Altkarten, Kacheln aus scripts/altkarten. Bestandsnachweis
	// und Lizenz der Scans je Karte in src/data/altkarten-quellen.json
	...ALTKARTEN.map((m) => ({
		id: `alt-${m.id}`,
		group: HISTORIC_GROUP,
		year: m.year,
		// Kacheln liegen nicht im Repo, das Panel zeigt sie nur, wenn vorhanden
		altkarte: true,
		label: `${m.year} ${m.short}`,
		note: [m.author, m.accuracy && `Passpunkte: ${m.accuracy}`]
			.filter(Boolean)
			.join(". "),
		tiles: [
			`${BASE_PATH}/altkarten/${m.id}/{z}/{x}/{y}.webp?v=${assetVersion(`altkarten/${m.id}/meta.json`)}`,
		],
		bounds: m.bounds,
		jump: jumpToBounds(m.bounds, m.minzoom),
		minzoom: m.minzoom,
		maxzoom: m.maxzoom,
		tileSize: m.tileSize ?? 256,
		attribution: altkarteAttribution(m),
		opacity: 0.85,
	})),
	// Über den Karten: Gewässer, die scripts/altkarten/gewaesser.py aus
	// ihnen gelesen hat, Stand um 1840
	{
		id: TIME_WATER_LAYER,
		kind: "timewater",
		group: HISTORIC_GROUP,
		label: "Gewässer um 1840 (Kreis Minden-Lübbecke)",
		note: "Aus der Preußischen Uraufnahme entlang der heutigen Bäche gelesen. Gräben ohne heutigen Bach und verschwundene Bäche fehlen.",
		attribution: `${GEOBASIS_NRW}, ${OSM}`,
		opacity: 0.95,
	},
	{
		id: MOOR_LAYER,
		kind: "timemoor",
		group: HISTORIC_GROUP,
		label: "Moore und nasse Flächen um 1840",
		note: "Moorböden nach BK50 NRW und GUM50 Niedersachsen (braun Hochmoor, grün Niedermoor), dort war vor der Kultivierung Moor. Dazu Überschwemmungsgebiete der preußischen Aufnahme (blau) und, dunkelbraun gestrichelt, Moore der Kreiskarte Lübbecke 1844, die heute kein Moorboden mehr sind.",
		attribution: "© GD NRW (dl-de/by-2-0), © LBEG Niedersachsen, © Land NRW",
		opacity: 0.5,
	},
	{
		id: WALD_LAYER,
		kind: "timewald",
		group: HISTORIC_GROUP,
		label: "Wald um 1840",
		note: "Waldflächen der Preußischen Uraufnahme (Landesamt für Natur, Umwelt und Klima NRW, nur NRW).",
		attribution: "© LANUK NRW",
		opacity: 0.55,
	},
	{
		id: WEGE_LAYER,
		kind: "timewege",
		group: HISTORIC_GROUP,
		label: "Hauptwege um 1840",
		note: "Die heutigen Bundes-, Landes- und Kreisstraßen, die die Uraufnahme schon als Weg zeigt, im alten Verlauf (aus der Karte gelesen, Feldgrenzen können mitlaufen). Wege, die es heute nicht mehr gibt, fehlen.",
		attribution: `${GEOBASIS_NRW}, ${OSM}`,
		opacity: 0.9,
	},
]

function altkarteAttribution(m) {
	const scans = (ALTKARTEN_QUELLEN[m.id] ?? []).map(
		(q) =>
			`<a href="${q.url}" target="_blank" rel="noopener">${q.label.split(",")[0]}</a> (${q.license})`,
	)
	const head = `Altkarte ${m.year}${m.author ? `, ${m.author}` : ""}`
	return [head, ...new Set(scans)].join(", ")
}

let altkartenCheck
/**
 * Die Altkarten-Kacheln sind nicht eingecheckt (README, Abschnitt
 * Altkarten). Prüft einmal, ob sie auf dem Server liegen.
 */
export function altkartenAvailable() {
	altkartenCheck ??= ALTKARTEN.length
		? fetch(assetUrl(`altkarten/${ALTKARTEN[0].id}/meta.json`), {
				method: "HEAD",
			})
				.then((res) => res.ok)
				.catch(() => false)
		: Promise.resolve(false)
	return altkartenCheck
}

/** Mitte und eine Zoomstufe, auf der die Kartenfläche etwa ins Bild passt. */
function jumpToBounds([w, s, e, n], minzoom) {
	// Ausschnitt etwa 1200 × 700 px, ein Breitengrad ist hier etwa 1,6 Längengrade hoch
	const fit = Math.floor(
		Math.log2(
			Math.min(
				(1200 / 256) * (360 / (e - w)),
				(700 / 256) * (360 / ((n - s) * 1.6)),
			),
		),
	)
	return [(w + e) / 2, (s + n) / 2, Math.max(minzoom, fit)]
}

// WMS-Kacheln in 512 px: ein Viertel der Anfragen bei kaum längerer
// Antwortzeit (gemessen 0,5 s für 256 px, 0,9 s für 512 px), und die
// Dienste von NRW und LBEG sprechen nur HTTP/1.1 mit sechs Verbindungen
const WMS_TILE = 512

/** MapLibre-Rasterquelle für eine Kachel- oder WMS-Ebene bzw. einen Teil. */
export function rasterSource(layer) {
	const tileSize = layer.wms ? WMS_TILE : (layer.tileSize ?? 256)
	const tiles = layer.wms
		? [
				`${layer.wms}${layer.wms.includes("?") ? "&" : "?"}SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${encodeURIComponent(layer.layers)}&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=${tileSize}&HEIGHT=${tileSize}&BBOX={bbox-epsg-3857}`,
			]
		: layer.tiles
	// Zoomgrenzen der Quelle gelten für Kachelstufen. Eine 512er-Kachel
	// deckt die Fläche einer 256er-Kachel eine Stufe tiefer ab.
	const shift = layer.wms ? Math.log2(tileSize / 256) : 0
	return {
		type: "raster",
		tiles,
		tileSize,
		attribution: layer.attribution,
		minzoom: Math.max(0, Math.floor((layer.minzoom ?? 0) - shift)),
		maxzoom: (layer.maxzoom ?? 19) - shift,
		...(layer.bounds ? { bounds: layer.bounds } : {}),
	}
}

/**
 * URL einer Kachel, genau so, wie MapLibre sie anfragt (tile_id.ts), damit
 * vorab geladene Kacheln im Cache wiedergefunden werden (src/lib/prefetch.js).
 */
export function tileUrl(template, z, x, y) {
	if (template.startsWith("nw-dop://")) return nwDopUrl(z, x, y)
	const half = Math.PI * 6378137
	const res = (2 * half) / 256 / 2 ** z
	const yy = 2 ** z - y - 1
	const bbox = [x * 256, yy * 256, (x + 1) * 256, (yy + 1) * 256]
		.map((v) => v * res - half)
		.join(",")
	return template
		.replace(/{z}/g, String(z))
		.replace(/{x}/g, String(x))
		.replace(/{y}/g, String(y))
		.replace(/{bbox-epsg-3857}/g, bbox)
}

/** Teile einer Ebene, eine einfache Ebene ist ihr eigener einziger Teil. */
export const partsOf = (layer) => layer.parts ?? [layer]

/** MapLibre-Layer-IDs einer Ebene mit ihrer Deckkraft-Eigenschaft. */
export function styleLayersOf(layer) {
	if (layer.kind === "relief") {
		return [
			{ id: `${layer.id}-color`, opacity: "color-relief-opacity" },
			{ id: `${layer.id}-shade`, opacity: null },
		]
	}
	if (layer.kind === "water") return [{ id: layer.id, opacity: "line-opacity" }]
	if (layer.kind === "timewege") {
		return [
			{ id: `${layer.id}-ura-casing`, opacity: "line-opacity" },
			{ id: `${layer.id}-ura`, opacity: "line-opacity" },
		]
	}
	if (layer.kind === "timewald") {
		return [
			{ id: `${layer.id}-ura`, opacity: "fill-opacity" },
			{ id: `${layer.id}-ura-line`, opacity: "line-opacity" },
		]
	}
	if (layer.kind === "timemoor") {
		return MOOR_PARTS.map(([suffix, prop]) => ({
			id: `${layer.id}-${suffix}`,
			opacity: prop,
		}))
	}
	if (layer.kind === "timewater") {
		return [
			{ id: `${layer.id}-casing`, opacity: "line-opacity" },
			{ id: layer.id, opacity: "line-opacity" },
		]
	}
	if (layer.kind === "oldrivers") {
		return [
			{ id: `${layer.id}-casing`, opacity: "line-opacity" },
			{ id: layer.id, opacity: "line-opacity" },
			{ id: `${layer.id}-roemisch`, opacity: "line-opacity" },
		]
	}
	// Fenster-Bilder und Linien legt die Karte selbst an (map-view.jsx)
	if (layer.kind === "lrm" || layer.kind === "lines") return []
	return partsOf(layer).map((_, i) => ({
		id: `${layer.id}-${i}`,
		opacity: "raster-opacity",
	}))
}

/** Quellen und Layer für den MapLibre-Style. */
export function styleFor(layer) {
	if (layer.kind === "lrm" || layer.kind === "lines") {
		return { sources: {}, layers: [] }
	}
	if (layer.kind === "oldrivers") return oldRiverStyle(layer)
	if (layer.kind === "timewater") return timeWaterStyle(layer)
	if (layer.kind === "timemoor") return timeMoorStyle(layer)
	if (layer.kind === "timewald") return timeWaldStyle(layer)
	if (layer.kind === "timewege") return timeWegeStyle(layer)
	if (layer.kind === "relief") {
		return {
			sources: {
				[layer.id]: {
					type: "raster-dem",
					tiles: [DEM_TILES],
					encoding: "terrarium",
					tileSize: 256,
					maxzoom: 12,
					attribution: layer.attribution,
				},
			},
			layers: [
				{
					id: `${layer.id}-color`,
					type: "color-relief",
					source: layer.id,
					layout: { visibility: "none" },
					paint: {
						"color-relief-opacity": layer.opacity,
						// Westfälische Bucht bis Weserbergland
						"color-relief-color": [
							"interpolate",
							["linear"],
							["elevation"],
							0,
							"#2f6f4f",
							40,
							"#4f9a5a",
							70,
							"#9cc56a",
							110,
							"#e6dc8c",
							170,
							"#d9a35c",
							250,
							"#b5714a",
							350,
							"#8a5a46",
							500,
							"#f2eee9",
						],
					},
				},
				{
					id: `${layer.id}-shade`,
					type: "hillshade",
					source: layer.id,
					layout: { visibility: "none" },
					paint: {
						"hillshade-method": "multidirectional",
						"hillshade-exaggeration": 0.6,
					},
				},
			],
		}
	}
	if (layer.kind === "water") {
		return {
			sources: {
				[layer.id]: {
					type: "vector",
					tiles: [VECTOR_TILES],
					maxzoom: 14,
					attribution: layer.attribution,
				},
			},
			layers: [
				{
					id: layer.id,
					type: "line",
					source: layer.id,
					"source-layer": "waterway",
					minzoom: 9,
					filter: ["in", ["get", "class"], ["literal", ["river", "stream"]]],
					layout: { visibility: "none", "line-cap": "round" },
					paint: {
						"line-color": "#4fc3f7",
						"line-opacity": layer.opacity,
						"line-width": [
							"interpolate",
							["linear"],
							["zoom"],
							9,
							["match", ["get", "class"], "river", 1.5, 0.4],
							14,
							["match", ["get", "class"], "river", 4, 1.6],
						],
					},
				},
			],
		}
	}
	const parts = partsOf(layer)
	return {
		sources: Object.fromEntries(
			parts.map((part, i) => [`${layer.id}-${i}`, rasterSource(part)]),
		),
		layers: parts.map((part, i) => ({
			id: `${layer.id}-${i}`,
			type: "raster",
			source: `${layer.id}-${i}`,
			layout: { visibility: "none" },
			paint: { "raster-opacity": layer.opacity ?? 1 },
			...(part.minzoom ? { minzoom: part.minzoom } : {}),
		})),
	}
}

export const TIME_WATER_FILE = "precomputed/gewaesser-zeit.geojson"
export const MOOR_FILE = "precomputed/moor-zeit.geojson"
export const MOOR_1844_FILE = "precomputed/moor-1844.geojson"
export const WALD_FILE = "precomputed/wald-zeit.geojson"
export const WEGE_FILE = "precomputed/wege-zeit.geojson"

/** Hauptwege um 1840 (scripts/altkarten/wege.py). */
function timeWegeStyle(layer) {
	const empty = { type: "FeatureCollection", features: [] }
	const none = { visibility: "none", "line-cap": "round", "line-join": "round" }
	const width = (lo, hi) => ["interpolate", ["linear"], ["zoom"], 9, lo, 15, hi]
	return {
		sources: {
			// Die Karte lädt die Datei erst beim Einschalten (map-view.jsx)
			[layer.id]: {
				type: "geojson",
				data: empty,
				attribution: layer.attribution,
			},
		},
		layers: [
			{
				id: `${layer.id}-ura-casing`,
				type: "line",
				source: layer.id,
				layout: none,
				paint: {
					"line-color": "#fff",
					"line-opacity": layer.opacity,
					"line-width": width(3, 7),
				},
			},
			{
				id: `${layer.id}-ura`,
				type: "line",
				source: layer.id,
				layout: none,
				paint: {
					"line-color": "#a0522d",
					"line-opacity": layer.opacity,
					"line-width": width(1.6, 4),
				},
			},
		],
	}
}

/** Wald um 1840 (scripts/altkarten/wald.py), Flächen mit Umriss. */
function timeWaldStyle(layer) {
	const empty = { type: "FeatureCollection", features: [] }
	const none = { visibility: "none" }
	return {
		sources: {
			// Die Karte lädt die Datei erst beim Einschalten (map-view.jsx)
			[layer.id]: {
				type: "geojson",
				data: empty,
				attribution: layer.attribution,
			},
		},
		layers: [
			{
				id: `${layer.id}-ura`,
				type: "fill",
				source: layer.id,
				layout: none,
				paint: { "fill-color": "#1b5e20", "fill-opacity": layer.opacity },
			},
			{
				id: `${layer.id}-ura-line`,
				type: "line",
				source: layer.id,
				layout: none,
				paint: {
					"line-color": "#0d3b10",
					"line-opacity": layer.opacity,
					"line-width": 1.2,
				},
			},
		],
	}
}

// Teile der Moorebene: Suffix der Layer-ID und Eigenschaft der Deckkraft
const MOOR_PARTS = [
	["boden", "fill-opacity"],
	["boden-line", "line-opacity"],
	["nass", "fill-opacity"],
	["1844", "fill-opacity"],
	["1844-line", "line-opacity"],
]
const MOOR_COLORS = {
	hochmoor: "#8a5a2b",
	niedermoor: "#6f9a35",
	nass: "#2f7bd6",
	moor1844: "#5b3412",
}

/**
 * Moore und nasse Flächen (scripts/altkarten/moor.py, moor-1844.geojson
 * aus scripts/altkarten/moor1844.py): Moorböden, Überschwemmungsgebiete
 * der preußischen Aufnahme um 1840 und Moore der Kreiskarte 1844.
 */
function timeMoorStyle(layer) {
	const empty = { type: "FeatureCollection", features: [] }
	const none = { visibility: "none" }
	const soil = [
		"match",
		["get", "kind"],
		"hochmoor",
		MOOR_COLORS.hochmoor,
		MOOR_COLORS.niedermoor,
	]
	return {
		sources: {
			// Die Karte lädt die Dateien erst beim Einschalten (map-view.jsx)
			[layer.id]: {
				type: "geojson",
				data: empty,
				attribution: layer.attribution,
			},
			[`${layer.id}-1844`]: { type: "geojson", data: empty },
		},
		layers: [
			{
				id: `${layer.id}-boden`,
				type: "fill",
				source: layer.id,
				filter: ["==", ["get", "slice"], "boden"],
				layout: none,
				paint: { "fill-color": soil, "fill-opacity": layer.opacity },
			},
			{
				id: `${layer.id}-boden-line`,
				type: "line",
				source: layer.id,
				filter: ["==", ["get", "slice"], "boden"],
				layout: none,
				paint: {
					"line-color": soil,
					"line-opacity": layer.opacity,
					"line-width": 1,
				},
			},
			{
				id: `${layer.id}-nass`,
				type: "fill",
				source: layer.id,
				filter: ["==", ["get", "slice"], "ura"],
				layout: none,
				paint: {
					"fill-color": MOOR_COLORS.nass,
					"fill-opacity": layer.opacity,
				},
			},
			{
				id: `${layer.id}-1844`,
				type: "fill",
				source: `${layer.id}-1844`,
				layout: none,
				paint: {
					"fill-color": MOOR_COLORS.moor1844,
					"fill-opacity": layer.opacity,
				},
			},
			{
				id: `${layer.id}-1844-line`,
				type: "line",
				source: `${layer.id}-1844`,
				layout: none,
				paint: {
					"line-color": MOOR_COLORS.moor1844,
					"line-opacity": layer.opacity,
					"line-width": 1.5,
					"line-dasharray": [3, 2],
				},
			},
		],
	}
}

/**
 * Gewässer aus den historischen Karten (public/precomputed/gewaesser-zeit.geojson),
 * gezeigt wird der Stand um 1840 aus der Uraufnahme.
 */
function timeWaterStyle(layer) {
	const width = (lo, hi) => ["interpolate", ["linear"], ["zoom"], 9, lo, 15, hi]
	const kindWidth = (river, stream, ditch) =>
		width(
			[
				"match",
				["get", "kind"],
				"river",
				river[0],
				"graben",
				ditch[0],
				stream[0],
			],
			[
				"match",
				["get", "kind"],
				"river",
				river[1],
				"graben",
				ditch[1],
				stream[1],
			],
		)
	const filter = ["==", ["get", "slice"], "ura"]
	const layout = {
		visibility: "none",
		"line-cap": "round",
		"line-join": "round",
	}
	return {
		sources: {
			// 2 MB, die Karte lädt sie erst beim Einschalten (map-view.jsx)
			[layer.id]: {
				type: "geojson",
				data: { type: "FeatureCollection", features: [] },
				attribution: layer.attribution,
			},
		},
		layers: [
			{
				id: `${layer.id}-casing`,
				type: "line",
				source: layer.id,
				filter,
				layout,
				paint: {
					"line-color": "#fff",
					"line-opacity": layer.opacity,
					"line-width": kindWidth([4, 8], [2.5, 5], [1.5, 3]),
				},
			},
			{
				id: layer.id,
				type: "line",
				source: layer.id,
				filter,
				layout,
				paint: {
					"line-color": [
						"match",
						["get", "kind"],
						"graben",
						"#4f8fd6",
						"#0b3d91",
					],
					"line-opacity": layer.opacity,
					"line-width": kindWidth([2, 4.5], [1.2, 3], [0.6, 1.6]),
				},
			},
		],
	}
}

/** Alte Flussläufe aus src/data/fluesse.json, je Teilstück nach Herkunft. */
function oldRiverStyle(layer) {
	const features = []
	for (const [name, river] of Object.entries(RIVERS)) {
		if (!river.parts) continue
		for (const [from, to, kind] of river.parts) {
			features.push({
				type: "Feature",
				properties: { name, kind },
				geometry: {
					type: "LineString",
					coordinates: river.coords.slice(from, to + 1),
				},
			})
		}
	}
	const width = (lo, hi) => ["interpolate", ["linear"], ["zoom"], 7, lo, 14, hi]
	return {
		sources: {
			[layer.id]: {
				type: "geojson",
				data: { type: "FeatureCollection", features },
				attribution: layer.attribution,
			},
		},
		layers: [
			{
				id: `${layer.id}-casing`,
				type: "line",
				source: layer.id,
				filter: ["!=", ["get", "kind"], "roemisch"],
				layout: {
					visibility: "none",
					"line-cap": "round",
					"line-join": "round",
				},
				paint: {
					"line-color": "#fff",
					"line-opacity": layer.opacity,
					"line-width": width(3, 7),
				},
			},
			{
				id: layer.id,
				type: "line",
				source: layer.id,
				filter: ["!=", ["get", "kind"], "roemisch"],
				layout: {
					visibility: "none",
					"line-cap": "round",
					"line-join": "round",
				},
				paint: {
					"line-color": [
						"match",
						["get", "kind"],
						"uraufnahme",
						"#0d47a1",
						"#7b9acc",
					],
					"line-opacity": layer.opacity,
					"line-width": width(1.5, 4),
				},
			},
			{
				id: `${layer.id}-roemisch`,
				type: "line",
				source: layer.id,
				filter: ["==", ["get", "kind"], "roemisch"],
				layout: { visibility: "none", "line-join": "round" },
				paint: {
					"line-color": "#c62828",
					"line-opacity": layer.opacity,
					"line-width": width(2, 4.5),
					"line-dasharray": [2, 1.5],
				},
			},
		],
	}
}
