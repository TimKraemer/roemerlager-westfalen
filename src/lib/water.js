import { VectorTile } from "@mapbox/vector-tile"
import { PbfReader } from "pbf"
import { TILES } from "@/config"
import { readJsonAsset } from "./assets"
import { lonLatToPixel, pixelToLonLat } from "./geo"

/**
 * Heutige Fließgewässer aus OpenMapTiles-Vektorkacheln (TILES.vector)
 * (OpenStreetMap, Planetiler). Bäche gibt es erst ab Zoom 13. Kanäle
 * (Mittellandkanal 1906–1938), Gräben und Drainagen bleiben außen vor, sie
 * sind neuzeitlich, außer benannten Gräben mit Bachnamen. Verrohrte Bäche
 * zählen mit, ihr Tal gab es schon.
 * Läuft im Worker.
 */

export const VECTOR_TILES = TILES.vector
export const WATER_CLASSES = ["river", "stream"]
// Benannte Gräben sind oft begradigte Bäche (Wickriede, Flöthe, Moorbach).
// Sie zählen mit, außer der Name verrät ein künstliches Gewässer.
const DITCH_CLASSES = ["ditch", "drain"]
const ARTIFICIAL =
	/graben|kanal|vorfluter|abzug|leitung|flut|zuleiter|ableiter|sammler|entwässer|entlast|gräfte|wätering|wetter/i

function isNatural({ class: cls, name }) {
	if (WATER_CLASSES.includes(cls)) return true
	return DITCH_CLASSES.includes(cls) && Boolean(name) && !ARTIFICIAL.test(name)
}
const ZOOM = 13
const TILE = 256

/** fetch mit Wiederholung, wenn der Kachelserver bremst (429) oder hakt. */
async function fetchPatiently(url, tries = 6) {
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(url)
		if ((res.status !== 429 && res.status < 500) || attempt >= tries - 1)
			return res
		const wait = Number(res.headers.get("retry-after")) * 1000
		await new Promise((r) => setTimeout(r, wait || 500 * 2 ** attempt))
	}
}

async function loadTile(x, y) {
	const url = VECTOR_TILES.replace("{z}", ZOOM)
		.replace("{x}", x)
		.replace("{y}", y)
	const res = await fetchPatiently(url)
	if (res.status === 204 || res.status === 404) return []
	if (!res.ok) throw new Error(`Vektorkacheln: Antwort ${res.status}`)
	const tile = new VectorTile(
		new PbfReader(new Uint8Array(await res.arrayBuffer())),
	)
	const layer = tile.layers.waterway
	if (!layer) return []
	const lines = []
	for (let i = 0; i < layer.length; i++) {
		const f = layer.feature(i)
		if (!isNatural(f.properties)) continue
		const scale = TILE / layer.extent
		for (const ring of f.loadGeometry()) {
			lines.push({
				kind: f.properties.class === "river" ? "river" : "stream",
				name: f.properties.name ?? "",
				coords: ring.map((p) =>
					pixelToLonLat(x * TILE + p.x * scale, y * TILE + p.y * scale, ZOOM),
				),
			})
		}
	}
	return lines
}

/** Alle Fließgewässer im Ausschnitt als GeoJSON-Linien. */
export async function fetchWaterways(bbox, onProgress) {
	const [west, south, east, north] = bbox
	const [px0, py0] = lonLatToPixel(west, north, ZOOM)
	const [px1, py1] = lonLatToPixel(east, south, ZOOM)
	const jobs = []
	for (let y = Math.floor(py0 / TILE); y <= Math.floor(py1 / TILE); y++) {
		for (let x = Math.floor(px0 / TILE); x <= Math.floor(px1 / TILE); x++) {
			jobs.push([x, y])
		}
	}
	const features = []
	let done = 0
	const queue = [...jobs]
	await Promise.all(
		Array.from({ length: 8 }, async () => {
			while (queue.length) {
				const [x, y] = queue.shift()
				for (const line of await loadTile(x, y)) {
					features.push({
						type: "Feature",
						properties: { kind: line.kind, name: line.name },
						geometry: { type: "LineString", coordinates: line.coords },
					})
				}
				onProgress?.(++done / jobs.length)
			}
		}),
	)
	return { type: "FeatureCollection", features }
}

// Flüsse und Bäche der Kreiskarten Minden 1843 und Lübbecke 1844
// (scripts/altkarten/nachzeichnen.py), nur im Kreis Minden-Lübbecke
const OLD_WATER_FILE = "precomputed/fluesse-kreiskarten.geojson"

/**
 * Bäche und Flüsse der Kreiskarten im Ausschnitt als Linien [[lon, lat], …].
 * Leer außerhalb des Kreises.
 */
export async function fetchOldWaterways(bbox) {
	const [west, south, east, north] = bbox
	const data = await readJsonAsset(OLD_WATER_FILE)
	const lines = []
	for (const f of data.features) {
		const p = f.properties
		const coords = f.geometry.coordinates
		const inside = coords.some(
			([lon, lat]) =>
				lon >= west && lon <= east && lat >= south && lat <= north,
		)
		if (inside) lines.push({ name: p.name ?? "", kind: p.kind, coords })
	}
	return lines
}

/**
 * Anteil Wald je Rasterzelle aus der OSM-Landbedeckung (landcover: wood) der
 * Kacheln von tiles.erleben.app, Zoom 11. Heutiger Wald, nicht der
 * römerzeitliche; als Abzug deshalb nur auf Wunsch.
 */
export async function forestCover(grid) {
	const z = 11
	const scale = 2 ** (grid.zoom - z)
	const [nw, , se] = grid.corners
	const [px0, py0] = lonLatToPixel(nw[0], nw[1], z)
	const [px1, py1] = lonLatToPixel(se[0], se[1], z)
	const out = new Float32Array(grid.cols * grid.rows)
	for (let ty = Math.floor(py0 / TILE); ty <= Math.floor(py1 / TILE); ty++) {
		for (let tx = Math.floor(px0 / TILE); tx <= Math.floor(px1 / TILE); tx++) {
			const url = VECTOR_TILES.replace("{z}", z)
				.replace("{x}", tx)
				.replace("{y}", ty)
			const res = await fetchPatiently(url)
			if (!res.ok || res.status === 204) continue
			const tile = new VectorTile(
				new PbfReader(new Uint8Array(await res.arrayBuffer())),
			)
			const layer = tile.layers.landcover
			if (!layer) continue
			const k = TILE / layer.extent
			for (let i = 0; i < layer.length; i++) {
				const f = layer.feature(i)
				if (f.properties.class !== "wood" || f.type !== 3) continue
				// Ringe in Rasterzellen-Koordinaten, Füllung nach der Gerade-Ungerade-Regel
				const rings = f
					.loadGeometry()
					.map((ring) =>
						ring.map((p) => [
							((tx * TILE + p.x * k) * scale - grid.x0) / grid.cellPx,
							((ty * TILE + p.y * k) * scale - grid.y0) / grid.cellPx,
						]),
					)
				fillRings(out, grid.cols, grid.rows, rings)
			}
		}
	}
	return out
}

function fillRings(out, cols, rows, rings) {
	let minY = Number.POSITIVE_INFINITY
	let maxY = Number.NEGATIVE_INFINITY
	for (const ring of rings)
		for (const [, y] of ring) {
			if (y < minY) minY = y
			if (y > maxY) maxY = y
		}
	const r0 = Math.max(0, Math.floor(minY))
	const r1 = Math.min(rows - 1, Math.ceil(maxY))
	for (let r = r0; r <= r1; r++) {
		const yc = r + 0.5
		const xs = []
		for (const ring of rings) {
			for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
				const [xi, yi] = ring[i]
				const [xj, yj] = ring[j]
				if (yi > yc !== yj > yc)
					xs.push(xi + ((yc - yi) * (xj - xi)) / (yj - yi))
			}
		}
		xs.sort((a, b) => a - b)
		for (let k = 0; k + 1 < xs.length; k += 2) {
			const c0 = Math.max(0, Math.ceil(xs[k] - 0.5))
			const c1 = Math.min(cols - 1, Math.floor(xs[k + 1] - 0.5))
			for (let c = c0; c <= c1; c++) out[r * cols + c] = 1
		}
	}
}
