/**
 * Moorflächen je Rasterzelle aus den amtlichen Bodenkarten und Altkarten:
 * - NRW: BK50, Ebene „Bodentyp“ (GD NRW). Hochmoor (217, 255, 128) und
 *   Niedermoor (178, 255, 115) samt Deckkulturen haben eigene Gelbgrüntöne.
 *   Zeichnet erst unter etwa 70 m je Pixel, gröber kommt ein leeres Bild.
 * - Niedersachsen: GUM50, ursprüngliche Moorverbreitung (LBEG). Außerhalb
 *   der Moore transparent. Zeichnet erst ab 1:167 410, deshalb fein und in
 *   Teilstücken abgefragt. Der Dienst erlaubt keinen Browser-Zugriff (CORS),
 *   im Browser zählt daher nur NRW, die Vorberechnung nutzt beide.
 * - Kreiskarte Lübbecke 1844 (scripts/altkarten/moor1844.py): Moore, deren
 *   Torf später abgebaut oder kultiviert wurde und die deshalb in den
 *   Bodenkarten fehlen. Brüche zählen zu 60 %.
 */

import { readJsonAsset } from "./assets"
import { lonLatToPixel } from "./geo"

const NRW =
	"https://www.wms.nrw.de/gd/bk050?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=Bodentyp&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857"
const NI =
	"https://nibis.lbeg.de/net3/public/ogc.ashx?PkgId=22&SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=L112&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857"
const HALF = 20037508.342789244
// Mercator-Meter je Pixel, unter der Maßstabsgrenze beider Dienste
const MAX_METERS_PER_PIXEL = 45
const MAX_REQUEST = 2000

// Bild -> { data (RGBA), width, height }; die Vorberechnung setzt fast-png ein
let decode = async (blob) => {
	const bitmap = await createImageBitmap(blob)
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
	const ctx = canvas.getContext("2d", { willReadFrequently: true })
	ctx.drawImage(bitmap, 0, 0)
	const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
	return { data, width: bitmap.width, height: bitmap.height }
}

export function setMoorDecoder(decoder) {
	decode = decoder
}

export const isNrwMoor = (r, g, b, a) =>
	a > 0 && g >= 240 && r >= 160 && r <= 230 && b >= 90 && b <= 145

export const isNiMoor = (r, _g, b, a) => a > 100 && !(b > 200 && r < 170)

function mercatorBounds(grid) {
	const size = 256 * 2 ** grid.zoom
	const mx = (px) => (px / size) * 2 * HALF - HALF
	const my = (py) => HALF - (py / size) * 2 * HALF
	return {
		x0: mx(grid.x0),
		x1: mx(grid.x0 + grid.cols * grid.cellPx),
		y0: my(grid.y0 + grid.rows * grid.cellPx),
		y1: my(grid.y0),
	}
}

async function fetchImage(url) {
	const res = await fetch(url)
	if (!res.ok) throw new Error(`Bodenkarte antwortet mit ${res.status}`)
	return decode(await res.blob())
}

/**
 * Moor-Anteil je Zelle (0–1). Ein Bild in Zellauflösung je Teilstück, beim
 * NI-Dienst mit f × f Unterpixeln je Zelle.
 */
async function sample(grid, base, f, test) {
	const out = new Float32Array(grid.cols * grid.rows)
	const b = mercatorBounds(grid)
	const cellW = (b.x1 - b.x0) / grid.cols
	const cellH = (b.y1 - b.y0) / grid.rows
	const chunk = Math.max(1, Math.floor(MAX_REQUEST / f))
	for (let r0 = 0; r0 < grid.rows; r0 += chunk) {
		for (let c0 = 0; c0 < grid.cols; c0 += chunk) {
			const cols = Math.min(chunk, grid.cols - c0)
			const rows = Math.min(chunk, grid.rows - r0)
			const bbox = [
				b.x0 + c0 * cellW,
				b.y1 - (r0 + rows) * cellH,
				b.x0 + (c0 + cols) * cellW,
				b.y1 - r0 * cellH,
			]
			const img = await fetchImage(
				`${base}&WIDTH=${cols * f}&HEIGHT=${rows * f}&BBOX=${bbox.join(",")}`,
			)
			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					let hits = 0
					for (let y = 0; y < f; y++) {
						for (let x = 0; x < f; x++) {
							const i = ((r * f + y) * img.width + c * f + x) * 4
							const d = img.data
							if (test(d[i], d[i + 1], d[i + 2], d[i + 3])) hits++
						}
					}
					out[(r0 + r) * grid.cols + c0 + c] = hits / (f * f)
				}
			}
		}
	}
	return out
}

const HISTORIC_FILE = "precomputed/moor-1844.geojson"
const HISTORIC_WEIGHT = { moor: 1, bruch: 0.6 }
const SUB = 4 // Stichproben je Zellkante

/**
 * Anteil der Flächen aus moor-1844.geojson je Zelle, mit SUB × SUB
 * Stichproben je Zelle (Scanlinien, gerade-ungerade Regel).
 */
export function polygonCover(grid, features) {
	const out = new Float32Array(grid.cols * grid.rows)
	const step = 1 / SUB
	for (const f of features) {
		const weight = HISTORIC_WEIGHT[f.properties.kind] ?? 1
		const rings = f.geometry.coordinates.map((ring) =>
			ring.map(([lon, lat]) => {
				const [px, py] = lonLatToPixel(lon, lat, grid.zoom)
				return [(px - grid.x0) / grid.cellPx, (py - grid.y0) / grid.cellPx]
			}),
		)
		const ys = rings.flat().map((p) => p[1])
		const y0 = Math.max(0, Math.floor(Math.min(...ys)))
		const y1 = Math.min(grid.rows, Math.ceil(Math.max(...ys)))
		for (let sy = y0 * SUB; sy < y1 * SUB; sy++) {
			const y = (sy + 0.5) * step
			const xs = []
			for (const ring of rings) {
				for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
					const [ax, ay] = ring[j]
					const [bx, by] = ring[i]
					if (ay > y !== by > y)
						xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax))
				}
			}
			xs.sort((a, b) => a - b)
			const r = Math.floor(y)
			for (let k = 0; k + 1 < xs.length; k += 2) {
				const from = Math.max(0, Math.ceil(xs[k] * SUB - 0.5))
				const to = Math.min(
					grid.cols * SUB - 1,
					Math.floor(xs[k + 1] * SUB - 0.5),
				)
				for (let sx = from; sx <= to; sx++) {
					const i = r * grid.cols + Math.floor(sx / SUB)
					out[i] = Math.min(1, out[i] + weight / (SUB * SUB))
				}
			}
		}
	}
	return out
}

/**
 * Moor-Anteil je Zelle aus BK50 NRW, (wenn erreichbar) GUM50 NI und den
 * Mooren der Kreiskarte 1844.
 */
export async function moorCover(grid, { includeNi = true } = {}) {
	const n = grid.cols * grid.rows
	const out = new Float32Array(n)
	const b = mercatorBounds(grid)
	const cellMerc = (b.x1 - b.x0) / grid.cols
	const f = Math.max(1, Math.ceil(cellMerc / MAX_METERS_PER_PIXEL))
	const parts = [sample(grid, NRW, f, isNrwMoor)]
	if (includeNi) parts.push(sample(grid, NI, f, isNiMoor))
	parts.push(
		readJsonAsset(HISTORIC_FILE).then((data) =>
			polygonCover(grid, data.features),
		),
	)
	for (const p of await Promise.allSettled(parts)) {
		if (p.status !== "fulfilled") continue
		for (let i = 0; i < n; i++) out[i] = Math.max(out[i], p.value[i])
	}
	return out
}
