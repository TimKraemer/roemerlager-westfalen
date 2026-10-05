import { VectorTile } from "@mapbox/vector-tile"
import { PbfReader } from "pbf"
import { lonLatToPixel, pixelToLonLat } from "./geo"

/**
 * Heutige Fließgewässer aus den OpenMapTiles-Kacheln von tiles.erleben.app
 * (OpenStreetMap, Planetiler). Bäche gibt es erst ab Zoom 13. Kanäle
 * (Mittellandkanal 1906–1938), Gräben und Drainagen bleiben außen vor, sie
 * sind neuzeitlich. Verrohrte Bäche zählen mit, ihr Tal gab es schon.
 * Läuft im Worker.
 */

export const VECTOR_TILES = "https://tiles.erleben.app/germany/{z}/{x}/{y}"
export const WATER_CLASSES = ["river", "stream"]
const ZOOM = 13
const TILE = 256

async function loadTile(x, y) {
	const url = VECTOR_TILES.replace("{z}", ZOOM)
		.replace("{x}", x)
		.replace("{y}", y)
	const res = await fetch(url)
	if (res.status === 204 || res.status === 404) return []
	if (!res.ok) throw new Error(`tiles.erleben.app antwortet mit ${res.status}`)
	const tile = new VectorTile(
		new PbfReader(new Uint8Array(await res.arrayBuffer())),
	)
	const layer = tile.layers.waterway
	if (!layer) return []
	const lines = []
	for (let i = 0; i < layer.length; i++) {
		const f = layer.feature(i)
		if (!WATER_CLASSES.includes(f.properties.class)) continue
		const scale = TILE / layer.extent
		for (const ring of f.loadGeometry()) {
			lines.push({
				kind: f.properties.class,
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
