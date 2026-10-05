/**
 * Laserscan-Fenster für die Erkennung gerader Strukturen (nur NRW).
 * Höhen: DGM1 NRW über den WCS des Landes, auf 2 m vergröbert.
 * Moderne Linien zum Ausblenden: Wege, Bahn, Gewässer und Gebäude aus den
 * OSM-Kacheln von tiles.erleben.app (Zoom 14).
 */
import { VectorTile } from "@mapbox/vector-tile"
import { encode } from "fast-png"
import { fromArrayBuffer } from "geotiff"
import jpeg from "jpeg-js"
import { PbfReader } from "pbf"
import { lonLatToPixel, pixelToLonLat } from "../src/lib/geo.js"
import {
	detectLineaments,
	localRelief,
} from "../src/lib/potential/lineaments.js"
import { lonLatToUtm, utmToLonLat } from "../src/lib/utm.js"
import { VECTOR_TILES } from "../src/lib/water.js"

export const WCS =
	"https://www.wcs.nrw.de/geobasis/wcs_nw_dgm?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=nw_dgm&FORMAT=image/tiff&SCALEFACTOR=0.5"
const SIZE = 2400 // m Fensterkante
const PX = 2 // m nach SCALEFACTOR 0.5
const OSM_BUFFER = 7 // Pixel (14 m) um moderne Linien, deckt auch Böschungen ab

async function fetchDgm(lon, lat) {
	const [e, n] = lonLatToUtm(lon, lat)
	const e0 = Math.round(e - SIZE / 2)
	const n0 = Math.round(n - SIZE / 2)
	const url = `${WCS}&SUBSET=x(${e0},${e0 + SIZE})&SUBSET=y(${n0},${n0 + SIZE})`
	const res = await fetch(url)
	if (!res.ok) return null
	const buf = await res.arrayBuffer()
	if (new Uint8Array(buf, 0, 2)[0] === 0x3c) return null // XML-Fehler: außerhalb NRW
	const tiff = await fromArrayBuffer(buf)
	const image = await tiff.getImage()
	const [ox, oy] = image.getOrigin()
	const [rx, ry] = image.getResolution()
	const w = image.getWidth()
	const h = image.getHeight()
	const [band] = await image.readRasters()
	const dem = Float32Array.from(band)
	// Lücken (NoData) mit dem Mittel füllen, sonst entstehen Kanten
	let sum = 0
	let cnt = 0
	for (const v of dem) {
		if (v > -1000 && v < 5000) {
			sum += v
			cnt++
		}
	}
	if (cnt < dem.length * 0.5) return null
	const mean = sum / cnt
	for (let i = 0; i < dem.length; i++)
		if (!(dem[i] > -1000 && dem[i] < 5000)) dem[i] = mean
	return { dem, w, h, ox, oy, rx, ry }
}

/** Moderne Linien als Maske im Fensterraster. */
async function osmMask(win) {
	const { w, h, ox, oy, rx, ry } = win
	const mask = new Uint8Array(w * h)
	const toPx = (lon, lat) => {
		const [e, n] = lonLatToUtm(lon, lat)
		return [(e - ox) / rx, (n - oy) / ry]
	}
	const stamp = (x, y) => {
		const xi = Math.round(x)
		const yi = Math.round(y)
		for (let dy = -OSM_BUFFER; dy <= OSM_BUFFER; dy++) {
			for (let dx = -OSM_BUFFER; dx <= OSM_BUFFER; dx++) {
				const xx = xi + dx
				const yy = yi + dy
				if (xx >= 0 && yy >= 0 && xx < w && yy < h) mask[yy * w + xx] = 1
			}
		}
	}
	const line = (a, b) => {
		const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]))
		for (let s = 0; s <= steps; s++) {
			const t = steps ? s / steps : 0
			stamp(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
		}
	}
	const z = 14
	const corners = [utmToLonLat(ox, oy), utmToLonLat(ox + w * rx, oy + h * ry)]
	const [x0, y0] = lonLatToPixel(corners[0][0], corners[0][1], z).map((v) =>
		Math.floor(v / 256),
	)
	const [x1, y1] = lonLatToPixel(corners[1][0], corners[1][1], z).map((v) =>
		Math.floor(v / 256),
	)
	for (let ty = Math.min(y0, y1); ty <= Math.max(y0, y1); ty++) {
		for (let tx = Math.min(x0, x1); tx <= Math.max(x0, x1); tx++) {
			const url = VECTOR_TILES.replace("{z}", z)
				.replace("{x}", tx)
				.replace("{y}", ty)
			const res = await fetch(url)
			if (!res.ok || res.status === 204) continue
			const tile = new VectorTile(
				new PbfReader(new Uint8Array(await res.arrayBuffer())),
			)
			for (const name of ["transportation", "waterway", "building"]) {
				const layer = tile.layers[name]
				if (!layer) continue
				for (let i = 0; i < layer.length; i++) {
					const f = layer.feature(i)
					for (const ring of f.loadGeometry()) {
						const pts = ring.map((p) =>
							toPx(
								...pixelToLonLat(
									tx * 256 + (p.x * 256) / layer.extent,
									ty * 256 + (p.y * 256) / layer.extent,
									z,
								),
							),
						)
						for (let k = 1; k < pts.length; k++) line(pts[k - 1], pts[k])
					}
				}
			}
		}
	}
	return mask
}

/** Vorschau: LRM grau, Abschnitte gelb, Abschnitte mit Ecke rot. */
function previewPng(win, result) {
	const { dem, w, h } = win
	const lrm = localRelief(dem, w, h, PX)
	const rgba = new Uint8Array(w * h * 4)
	for (let i = 0; i < w * h; i++) {
		const g = Math.max(0, Math.min(255, Math.round(128 + lrm[i] * 255)))
		const m = win.mask[i] ? 0.6 : 1
		rgba[i * 4] = g * m
		rgba[i * 4 + 1] = g * m
		rgba[i * 4 + 2] = g
		rgba[i * 4 + 3] = 255
	}
	for (const s of result.segments) {
		const steps = Math.ceil(Math.hypot(s.x1 - s.x0, s.y1 - s.y0))
		for (let k = 0; k <= steps; k++) {
			const x = Math.round(s.x0 + ((s.x1 - s.x0) * k) / steps)
			const y = Math.round(s.y0 + ((s.y1 - s.y0) * k) / steps)
			for (let o = -1; o <= 1; o++) {
				const i = (y + o) * w + x
				if (i < 0 || i >= w * h) continue
				rgba[i * 4] = 255
				rgba[i * 4 + 1] = s.corner ? 30 : 210
				rgba[i * 4 + 2] = 0
			}
		}
	}
	return encode({ width: w, height: h, data: rgba, channels: 4 })
}

/** Local Relief Model als JPEG: ±0,5 m auf Grau, Senken dunkel. */
function lrmJpeg(win) {
	const { dem, w, h } = win
	const lrm = localRelief(dem, w, h, PX)
	const data = new Uint8Array(w * h * 4)
	for (let i = 0; i < w * h; i++) {
		const g = Math.max(0, Math.min(255, Math.round(128 + lrm[i] * 255)))
		data[i * 4] = g
		data[i * 4 + 1] = g
		data[i * 4 + 2] = g
		data[i * 4 + 3] = 255
	}
	return jpeg.encode({ data, width: w, height: h }, 82).data
}

/**
 * Analysiert Fenster um die angegebenen Punkte.
 * @param {{id, kind, label, lon, lat}[]} points
 * @param {(id: string, png: Uint8Array) => void} [onPreview]
 */
export async function analyzeWindows(points, onPreview, onImage) {
	const windows = []
	const features = []
	for (const point of points) {
		const win = await fetchDgm(point.lon, point.lat)
		if (!win) {
			windows.push({ ...point, status: "keine Daten (außerhalb NRW)" })
			continue
		}
		win.mask = await osmMask(win)
		const result = detectLineaments(win.dem, win.w, win.h, PX, win.mask)
		const toLonLat = (x, y) =>
			utmToLonLat(win.ox + x * win.rx, win.oy + y * win.ry).map((v) =>
				Number(v.toFixed(6)),
			)
		for (const s of result.segments) {
			features.push({
				type: "Feature",
				properties: {
					window: point.id,
					length: Math.round(s.length),
					corner: s.corner,
					kind: s.kind,
				},
				geometry: {
					type: "LineString",
					coordinates: [toLonLat(s.x0, s.y0), toLonLat(s.x1, s.y1)],
				},
			})
		}
		const sw = toLonLat(0, win.h)
		const ne = toLonLat(win.w, 0)
		// Ecken für die MapLibre-Bildquelle: NW, NO, SO, SW (UTM leicht gedreht)
		const imageCorners = [
			toLonLat(0, 0),
			toLonLat(win.w, 0),
			toLonLat(win.w, win.h),
			toLonLat(0, win.h),
		]
		onImage?.(point.id, lrmJpeg(win))
		windows.push({
			...point,
			status: "untersucht",
			bbox: [sw[0], sw[1], ne[0], ne[1]],
			imageCorners,
			segments: result.segments.length,
			corners: result.corners.length,
			length: Math.round(result.segments.reduce((a, s) => a + s.length, 0)),
			threshold: Number(result.threshold.toFixed(3)),
		})
		onPreview?.(point.id, previewPng(win, result))
	}
	return { windows, segments: { type: "FeatureCollection", features } }
}
