// geotiff und togeojson kommen erst mit der ersten Datei (zusammen gut 300 KB)
import { utmToLonLat } from "./utm"

/**
 * Eigene Karten einlesen, alles im Browser:
 * - GeoTIFF (EPSG:4326, 3857, UTM 32/33 auf ETRS89 oder WGS84)
 * - Bild (JPG/PNG) mit World-File (.jgw/.pgw/.wld), Bezugssystem wählbar
 * - Vektoren: GeoJSON, KML, GPX
 * Ergebnis für Raster: PNG als Data-URL plus vier Eckkoordinaten (NW, NO,
 * SO, SW) für eine MapLibre-Bildquelle.
 */

const MAX_SIDE = 4096
const HALF = 20037508.342789244

/** Unterstützte Bezugssysteme -> Umrechnung nach Länge/Breite. */
export const CRS = {
	4326: { label: "WGS84 Länge/Breite (EPSG:4326)", toLonLat: (x, y) => [x, y] },
	3857: {
		label: "Web Mercator (EPSG:3857)",
		toLonLat: (x, y) => [
			(x / HALF) * 180,
			(Math.atan(Math.exp((y / HALF) * Math.PI)) * 360) / Math.PI - 90,
		],
	},
	25832: {
		label: "ETRS89 / UTM 32N (EPSG:25832)",
		toLonLat: (x, y) => utmToLonLat(x, y, 32),
	},
	25833: {
		label: "ETRS89 / UTM 33N (EPSG:25833)",
		toLonLat: (x, y) => utmToLonLat(x, y, 33),
	},
	32632: {
		label: "WGS84 / UTM 32N (EPSG:32632)",
		toLonLat: (x, y) => utmToLonLat(x, y, 32),
	},
	32633: {
		label: "WGS84 / UTM 33N (EPSG:32633)",
		toLonLat: (x, y) => utmToLonLat(x, y, 33),
	},
}

function cornersFrom(toLonLat, xOf, yOf, w, h) {
	// Pixel (i, j) -> Weltkoordinate über die affine Abbildung
	const at = (i, j) => toLonLat(xOf(i, j), yOf(i, j))
	return [at(0, 0), at(w, 0), at(w, h), at(0, h)]
}

/** Bänder auf ein RGBA-Bild bringen; ein Band wird auf 2–98 % gestreckt. */
function toRgba(bands, width, height, noData) {
	const rgba = new Uint8ClampedArray(width * height * 4)
	if (bands.length >= 3) {
		const max = Math.max(255, ...sampleMax(bands[0]))
		const k = max > 255 ? 255 / max : 1
		for (let i = 0; i < width * height; i++) {
			rgba[i * 4] = bands[0][i] * k
			rgba[i * 4 + 1] = bands[1][i] * k
			rgba[i * 4 + 2] = bands[2][i] * k
			const empty = noData != null && bands[0][i] === noData
			rgba[i * 4 + 3] = bands[3] ? bands[3][i] : empty ? 0 : 255
		}
		return rgba
	}
	const band = bands[0]
	const values = []
	for (let i = 0; i < band.length; i += 13) {
		if (noData == null || band[i] !== noData) values.push(band[i])
	}
	values.sort((a, b) => a - b)
	const lo = values[Math.floor(values.length * 0.02)] ?? 0
	const hi = values[Math.floor(values.length * 0.98)] ?? 1
	const span = hi - lo || 1
	for (let i = 0; i < band.length; i++) {
		const g = ((band[i] - lo) / span) * 255
		rgba[i * 4] = g
		rgba[i * 4 + 1] = g
		rgba[i * 4 + 2] = g
		rgba[i * 4 + 3] = noData != null && band[i] === noData ? 0 : 255
	}
	return rgba
}

function sampleMax(band) {
	let max = 0
	for (let i = 0; i < band.length; i += 97) if (band[i] > max) max = band[i]
	return [max]
}

function rgbaToDataUrl(rgba, width, height) {
	const canvas = document.createElement("canvas")
	canvas.width = width
	canvas.height = height
	canvas.getContext("2d").putImageData(new ImageData(rgba, width, height), 0, 0)
	return canvas.toDataURL("image/png")
}

export async function readGeoTiff(file) {
	const { fromArrayBuffer } = await import("geotiff")
	const tiff = await fromArrayBuffer(await file.arrayBuffer())
	const image = await tiff.getImage()
	const keys = image.getGeoKeys() ?? {}
	const epsg = keys.ProjectedCSTypeGeoKey ?? keys.GeographicTypeGeoKey
	const crs = CRS[epsg]
	if (!crs) {
		throw new Error(
			`Bezugssystem EPSG:${epsg ?? "unbekannt"} wird nicht unterstützt. Bitte in QGIS nach EPSG:25832 oder 4326 umprojizieren.`,
		)
	}
	const w = image.getWidth()
	const h = image.getHeight()
	const scale = Math.min(1, MAX_SIDE / Math.max(w, h))
	const width = Math.round(w * scale)
	const height = Math.round(h * scale)
	const bands = await image.readRasters({ width, height })
	const [ox, oy] = image.getOrigin()
	const [rx, ry] = image.getResolution()
	const noData = image.getGDALNoData()
	const corners = cornersFrom(
		crs.toLonLat,
		(i) => ox + (i * rx * w) / width,
		(_, j) => oy + (j * ry * h) / height,
		width,
		height,
	)
	return {
		kind: "image",
		url: rgbaToDataUrl(
			toRgba(Array.from(bands), width, height, noData),
			width,
			height,
		),
		corners,
		info: `GeoTIFF, EPSG:${epsg}, ${w} × ${h} Pixel`,
	}
}

/** Bild mit World-File: sechs Zeilen A, D, B, E, C, F. */
export async function readWorldFile(imageFile, worldFile, epsg) {
	const crs = CRS[epsg]
	const [a, d, b, e, c, f] = (await worldFile.text())
		.trim()
		.split(/\s+/)
		.map(Number)
	if (![a, d, b, e, c, f].every(Number.isFinite)) {
		throw new Error("World-File unlesbar, erwartet werden sechs Zahlen")
	}
	const url = URL.createObjectURL(imageFile)
	const img = await new Promise((resolve, reject) => {
		const im = new Image()
		im.onload = () => resolve(im)
		im.onerror = () => {
			URL.revokeObjectURL(url)
			reject(new Error("Bild nicht lesbar"))
		}
		im.src = url
	})
	const w = img.naturalWidth
	const h = img.naturalHeight
	// World-File bezieht sich auf die Pixelmitte, Ecken liegen eine halbe Zelle daneben
	const xOf = (i, j) => c + a * (i - 0.5) + b * (j - 0.5)
	const yOf = (i, j) => f + d * (i - 0.5) + e * (j - 0.5)
	return {
		kind: "image",
		url,
		corners: cornersFrom(crs.toLonLat, xOf, yOf, w, h),
		info: `${imageFile.name} mit World-File, EPSG:${epsg}`,
	}
}

export async function readVector(file) {
	const name = file.name.toLowerCase()
	const text = await file.text()
	let data
	if (name.endsWith(".kml") || name.endsWith(".gpx")) {
		const { gpx, kml } = await import("@tmcw/togeojson")
		const xml = new DOMParser().parseFromString(text, "text/xml")
		data = name.endsWith(".kml") ? kml(xml) : gpx(xml)
	} else data = JSON.parse(text)
	if (data.type === "Feature")
		data = { type: "FeatureCollection", features: [data] }
	if (data.type !== "FeatureCollection")
		throw new Error("Keine GeoJSON-FeatureCollection")
	return {
		kind: "vector",
		data,
		info: `${file.name}, ${data.features.length} Objekte`,
	}
}

/**
 * Google Map Tiles API (Satellit) mit eigenem Schlüssel. Der Schlüssel
 * bleibt im Browser; Google verlangt eine Sitzung je Kartentyp.
 */
export async function googleSatellite(key) {
	const res = await fetch(
		`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(key)}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				mapType: "satellite",
				language: "de-DE",
				region: "DE",
			}),
		},
	)
	const json = await res.json()
	if (!res.ok || !json.session) {
		throw new Error(json.error?.message ?? `Google antwortet mit ${res.status}`)
	}
	return {
		kind: "raster",
		tiles: [
			`https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${json.session}&key=${encodeURIComponent(key)}`,
		],
		tileSize: json.tileWidth ?? 256,
		attribution: "Kartendaten © Google",
		maxzoom: 21,
		info: "Google Map Tiles API, Satellit",
	}
}

/** Kartendienst aus URL: XYZ/WMTS-Vorlage oder WMS mit Layernamen. */
export function serviceLayer({ type, url, layers }) {
	if (type === "wms") {
		const sep = url.includes("?") ? "&" : "?"
		return {
			kind: "raster",
			tiles: [
				`${url}${sep}SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${encodeURIComponent(layers)}&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`,
			],
			tileSize: 256,
			info: `WMS ${layers}`,
		}
	}
	if (!/\{z\}/.test(url) || !/\{x\}/.test(url) || !/\{y\}/.test(url)) {
		throw new Error("Die Kachel-URL braucht {z}, {x} und {y}")
	}
	return { kind: "raster", tiles: [url], tileSize: 256, info: "Kacheldienst" }
}
