/**
 * Grundkarten und zuschaltbare Ebenen. Alle Dienste sind offen und
 * liefern Web-Mercator (EPSG:3857). WMS-Ebenen lädt MapLibre kachelweise
 * über den Platzhalter {bbox-epsg-3857}. Endpunkte am 05.10.2026 geprüft.
 */

const GEOBASIS_NRW = "© Geobasis NRW (dl-de/zero-2-0)"
const BKG = "© BKG (CC BY 4.0)"

export const BASE_LAYERS = [
	{
		id: "osm",
		label: "OpenStreetMap",
		tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
		attribution: "© OpenStreetMap-Mitwirkende",
		maxzoom: 19,
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
		id: "topplus-grau",
		label: "TopPlusOpen grau",
		note: "Zurückhaltend, gut unter der Potenzialkarte",
		tiles: [
			"https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web_grau/default/WEBMERCATOR/{z}/{y}/{x}.png",
		],
		attribution: BKG,
		maxzoom: 18,
	},
	{
		id: "dop-nrw",
		label: "Luftbild NRW (DOP)",
		note: "Aktuelle Orthophotos, nur NRW",
		tiles: [
			"https://www.wmts.nrw.de/geobasis/wmts_nw_dop/tiles/nw_dop/EPSG_3857_16/{z}/{x}/{y}",
		],
		attribution: GEOBASIS_NRW,
		maxzoom: 16,
	},
	{
		id: "sentinel",
		label: "Satellit (Sentinel-2)",
		note: "Wolkenfreies Mosaik 2024, ganz Europa, 10 m",
		tiles: [
			"https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg",
		],
		attribution:
			"Sentinel-2 cloudless 2024 © EOX IT Services GmbH (CC BY-NC-SA 4.0), enthält Copernicus-Daten",
		maxzoom: 15,
	},
]

export const OVERLAYS = [
	{
		id: "schummerung-nrw",
		group: "Gelände (Gräben erkennen)",
		label: "Schummerung NRW (DGM1)",
		note: "Laserscan, 1 m. Hier zeigen sich Wälle und Gräben.",
		wms: "https://www.wms.nrw.de/geobasis/wms_nw_dgm-schummerung",
		layers: "nw_dgm-schummerung_pan",
		attribution: GEOBASIS_NRW,
		opacity: 0.85,
	},
	{
		id: "schummerung-nrw-col",
		group: "Gelände (Gräben erkennen)",
		label: "Schummerung NRW farbig",
		note: "Mit Höhenfarben",
		wms: "https://www.wms.nrw.de/geobasis/wms_nw_dgm-schummerung",
		layers: "nw_dgm-schummerung_col",
		attribution: GEOBASIS_NRW,
		opacity: 0.8,
	},
	{
		id: "schummerung-de",
		group: "Gelände (Gräben erkennen)",
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
		id: "uraufnahme",
		group: "Historische Karten",
		label: "Preußische Uraufnahme (1836–1850)",
		note: "Vor Flurbereinigung und Begradigung, zeigt alte Bachläufe",
		wms: "https://www.wms.nrw.de/geobasis/wms_nw_uraufnahme",
		layers: "nw_uraufnahme_rw",
		attribution: GEOBASIS_NRW,
		opacity: 0.85,
	},
	{
		id: "neuaufnahme",
		group: "Historische Karten",
		label: "Preußische Neuaufnahme (1891–1912)",
		wms: "https://www.wms.nrw.de/geobasis/wms_nw_neuaufnahme",
		layers: "nw_neuaufnahme",
		attribution: GEOBASIS_NRW,
		opacity: 0.85,
	},
	{
		id: "tk25-1936",
		group: "Historische Karten",
		label: "TK25 (1936–1945)",
		wms: "https://www.wms.nrw.de/geobasis/wms_nw_tk25_1936-1945",
		layers: "nw_tk25_1936-1945",
		attribution: GEOBASIS_NRW,
		opacity: 0.85,
	},
	{
		id: "hist-dop",
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
		id: "dop-ni",
		group: "Luftbilder",
		label: "Luftbild Niedersachsen (DOP20)",
		note: "Für die Grenzregion Minden-Lübbecke und Wilkenburg",
		wms: "https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms",
		layers: "ni_dop20",
		attribution: "© LGLN (CC BY 4.0)",
		opacity: 1,
	},
	{
		id: "gewaesser-nrw",
		group: "Gewässer und Denkmäler",
		label: "Fließgewässer NRW (GSK3B)",
		note: "Amtliches Gewässernetz",
		wms: "https://www.wms.nrw.de/umwelt/gewstat",
		layers: "7,8,9",
		attribution: "© Land NRW, Gewässerstationierungskarte",
		opacity: 0.9,
	},
	{
		id: "bodendenkmal-nrw",
		group: "Gewässer und Denkmäler",
		label: "Bodendenkmäler NRW (INSPIRE)",
		note: "Lückenhaft, die Römerlager fehlen dort",
		wms: "https://www.wms.nrw.de/wms/wms_nw_inspire-denkmal",
		layers:
			"ProtectedSites_Archaeological_Surface,ProtectedSites_Archaeological_Line,ProtectedSites_Archaeological_Point",
		attribution: "© LWL / LVR, Denkmalbehörden NRW",
		opacity: 0.9,
	},
]

export function rasterSource(layer) {
	const tiles = layer.wms
		? [
				`${layer.wms}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${encodeURIComponent(layer.layers)}&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`,
			]
		: layer.tiles
	return {
		type: "raster",
		tiles,
		tileSize: 256,
		attribution: layer.attribution,
		maxzoom: layer.maxzoom ?? 19,
	}
}
