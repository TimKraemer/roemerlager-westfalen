/**
 * Ortsverzeichnis zum Georeferenzieren der Altkarten. Holt die Ortspunkte
 * (Layer "place") und Berggipfel aus den OpenMapTiles-Kacheln von
 * tiles.erleben.app: Städte für ganz Nordwestdeutschland, Dörfer für
 * Westfalen und Umgebung, Weiler und Ortsteile für Minden-Lübbecke.
 *
 *   bun scripts/altkarten/orte.mjs   → scripts/altkarten/.cache/orte.json
 */

import { mkdir, writeFile } from "node:fs/promises"
import { VectorTile } from "@mapbox/vector-tile"
import { PbfReader } from "pbf"
import { lonLatToPixel, pixelToLonLat } from "../../src/lib/geo.js"
import { VECTOR_TILES } from "../../src/lib/water.js"

const OUT = new URL("./.cache/orte.json", import.meta.url)
const PASSES = [
	{ z: 8, bbox: [3, 49, 15, 55.5] },
	{ z: 11, bbox: [5.8, 50.3, 10.6, 53.6] },
	{ z: 13, bbox: [8.1, 52.0, 9.3, 52.65] },
]

async function tile(z, x, y) {
	const url = VECTOR_TILES.replace("{z}", z).replace("{x}", x).replace("{y}", y)
	for (let attempt = 0; attempt < 8; attempt++) {
		try {
			const res = await fetch(url)
			if (res.status === 204 || res.status === 404) return null
			if (res.status === 429) {
				await Bun.sleep(2000 * (attempt + 1))
				continue
			}
			if (!res.ok) throw new Error(`${res.status}`)
			return new VectorTile(
				new PbfReader(new Uint8Array(await res.arrayBuffer())),
			)
		} catch (e) {
			if (attempt === 7) throw e
		}
	}
}

const places = new Map()
for (const { z, bbox } of PASSES) {
	const [w, s, e, n] = bbox
	const [x0, y0] = lonLatToPixel(w, n, z).map((v) => Math.floor(v / 256))
	const [x1, y1] = lonLatToPixel(e, s, z).map((v) => Math.floor(v / 256))
	const jobs = []
	for (let y = y0; y <= y1; y++)
		for (let x = x0; x <= x1; x++) jobs.push([x, y])
	let done = 0
	const worker = async () => {
		while (jobs.length) {
			const [x, y] = jobs.pop()
			const t = await tile(z, x, y)
			done++
			if (!t) continue
			for (const name of ["place", "mountain_peak"]) {
				const layer = t.layers[name]
				if (!layer) continue
				const scale = 256 / layer.extent
				for (let i = 0; i < layer.length; i++) {
					const f = layer.feature(i)
					const p = f.loadGeometry()[0]?.[0]
					if (!p || !f.properties.name) continue
					const [lon, lat] = pixelToLonLat(
						x * 256 + p.x * scale,
						y * 256 + p.y * scale,
						z,
					)
					if (lon < w || lon > e || lat < s || lat > n) continue
					const cls = name === "mountain_peak" ? "peak" : f.properties.class
					const key = `${f.properties.name}|${cls}|${lon.toFixed(3)}|${lat.toFixed(3)}`
					places.set(key, {
						name: f.properties.name,
						cls,
						lon: Number(lon.toFixed(5)),
						lat: Number(lat.toFixed(5)),
						...(f.properties.ele ? { ele: f.properties.ele } : {}),
					})
				}
			}
		}
	}
	await Promise.all(Array.from({ length: 3 }, worker))
	console.log(`z${z}: ${done} Kacheln, ${places.size} Orte`)
}

await mkdir(new URL("./.cache/", import.meta.url), { recursive: true })
await writeFile(OUT, JSON.stringify([...places.values()]))
console.log(`→ ${OUT.pathname}`)
