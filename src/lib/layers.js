/**
 * Grundkarten und zuschaltbare Ebenen. Alle Dienste sind offen und
 * liefern Web-Mercator (EPSG:3857). WMS-Ebenen lädt MapLibre kachelweise
 * über den Platzhalter {bbox-epsg-3857}. Eine Ebene kann aus mehreren
 * Teilen bestehen (parts), die übereinander liegen, z. B. Luftbilder
 * NRW über Niedersachsen über Sentinel-2. Endpunkte am 05.10.2026 geprüft.
 */

import { addProtocol } from "maplibre-gl"
import { BASE_PATH, TILES } from "@/config"
import ALTKARTEN from "@/data/altkarten.json"
import ALTKARTEN_QUELLEN from "@/data/altkarten-quellen.json"
import RIVERS from "@/data/fluesse.json"
import { VECTOR_TILES } from "./water"

const GEOBASIS_NRW = "© Geobasis NRW (dl-de/zero-2-0)"
const LGLN = "© LGLN (CC BY 4.0)"
const BKG = "© BKG (CC BY 4.0)"
const OSM = "© OpenStreetMap-Mitwirkende"

export const DEM_TILES = TILES.dem
export const GLYPHS = TILES.glyphs
export const FONT = ["Montserrat SemiBold"]
export const ALTKARTEN_GROUP = "Altkarten (entzerrt)"

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
}
// Im WMTS NRW heißen die Stufen der Matrix EPSG_3857_16 "00" bis "16",
// "00" ist Web-Mercator-Zoom 5. Das Protokoll nw-dop:// rechnet um.
const NW_DOP_WMTS =
	"https://www.wmts.nrw.de/geobasis/wmts_nw_dop/tiles/nw_dop/EPSG_3857_16"
addProtocol("nw-dop", async (params, abortController) => {
	const [z, x, y] = params.url.slice("nw-dop://".length).split("/")
	const matrix = String(Number(z) - 5).padStart(2, "0")
	const res = await fetch(`${NW_DOP_WMTS}/${matrix}/${x}/${y}`, {
		signal: abortController.signal,
	})
	if (!res.ok) throw new Error(`DOP NRW ${res.status}: ${params.url}`)
	return { data: await res.arrayBuffer() }
})
const DOP_NRW = {
	tiles: ["nw-dop://{z}/{x}/{y}"],
	attribution: GEOBASIS_NRW,
	minzoom: 8,
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
	},
	{
		id: "schummerung-nrw",
		jump: [8.62, 52.3, 12],
		group: "Gelände",
		label: "Schummerung NRW (DGM1)",
		note: "Laserscan, 1 m. Hier zeigen sich Wälle und Gräben.",
		wms: "https://www.wms.nrw.de/geobasis/wms_nw_dgm-schummerung",
		layers: "nw_dgm-schummerung_pan",
		attribution: GEOBASIS_NRW,
		opacity: 0.85,
	},
	{
		id: "lrm",
		kind: "lrm",
		group: "Gelände",
		label: "Laserscan-Ansicht an Kandidaten und Lagern",
		note: "Local Relief Model aus dem DGM1 NRW (2 m): Gräben dunkel, Wälle hell. Fenster von 2,4 km an Kandidaten, Etappenhalten und allen bestätigten Lagern in NRW.",
		attribution: GEOBASIS_NRW,
		opacity: 0.85,
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
		jump: [8.62, 52.3, 12],
		group: "Gelände",
		label: "Schummerung NRW farbig (DGM1)",
		note: "Laserscan mit Höhenfarben, nur NRW",
		wms: "https://www.wms.nrw.de/geobasis/wms_nw_dgm-schummerung",
		layers: "nw_dgm-schummerung_col",
		attribution: GEOBASIS_NRW,
		opacity: 0.5,
		visible: true,
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
		jump: [8.62, 52.3, 14],
		group: "Gewässer",
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
		jump: [6.45, 51.66, 12],
		group: "Historische Karten",
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
		jump: [8.62, 52.3, 13],
		group: "Historische Karten",
		label: "Preußische Neuaufnahme (1891–1912)",
		wms: "https://www.wms.nrw.de/geobasis/wms_nw_neuaufnahme",
		layers: "nw_neuaufnahme",
		attribution: GEOBASIS_NRW,
		opacity: 0.85,
		minzoom: 10.5,
	},
	{
		id: "tk25-1936",
		jump: [8.62, 52.3, 15],
		group: "Historische Karten",
		label: "TK25 (1936–1945)",
		wms: "https://www.wms.nrw.de/geobasis/wms_nw_tk25_1936-1945",
		layers: "nw_tk25_1936-1945",
		attribution: GEOBASIS_NRW,
		opacity: 0.85,
		minzoom: 13.5,
	},
	{
		id: "hist-dop",
		jump: [7.62, 51.96, 13],
		group: "Historische Karten",
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
		group: ALTKARTEN_GROUP,
		label: `${m.year} ${m.short}`,
		note: [m.author, m.accuracy && `Passpunkte: ${m.accuracy}`]
			.filter(Boolean)
			.join(". "),
		tiles: [`${BASE_PATH}/altkarten/${m.id}/{z}/{x}/{y}.webp`],
		bounds: m.bounds,
		jump: jumpToBounds(m.bounds, m.minzoom),
		minzoom: m.minzoom,
		maxzoom: m.maxzoom,
		tileSize: m.tileSize ?? 256,
		attribution: altkarteAttribution(m),
		opacity: 0.85,
	})),
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
		? fetch(`${BASE_PATH}/altkarten/${ALTKARTEN[0].id}/meta.json`, {
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

/** MapLibre-Rasterquelle für eine Kachel- oder WMS-Ebene bzw. einen Teil. */
export function rasterSource(layer) {
	const tiles = layer.wms
		? [
				`${layer.wms}${layer.wms.includes("?") ? "&" : "?"}SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${encodeURIComponent(layer.layers)}&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`,
			]
		: layer.tiles
	return {
		type: "raster",
		tiles,
		tileSize: layer.tileSize ?? 256,
		attribution: layer.attribution,
		minzoom: Math.floor(layer.minzoom ?? 0),
		maxzoom: layer.maxzoom ?? 19,
		...(layer.bounds ? { bounds: layer.bounds } : {}),
	}
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
