/**
 * Rechnet die Potenzialanalyse für die Regionen in src/lib/regions.js vor
 * und legt sie unter public/precomputed/<id>.json und .bin ab. Die App
 * zeigt das Ergebnis sofort beim Öffnen, ohne im Browser zu rechnen.
 *
 *   bun run precompute
 *
 * Nutzt dieselbe Rechenkette wie der Web Worker (src/lib/potential/pipeline.js),
 * nur das PNG-Dekodieren der Höhenkacheln läuft hier über fast-png.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { VectorTile } from "@mapbox/vector-tile"
import { decode } from "fast-png"
import { PbfReader } from "pbf"
import { lonLatToPixel, pixelToLonLat } from "../src/lib/geo.js"
import { DEFAULT_PARAMS } from "../src/lib/potential/model.js"
import { pack } from "../src/lib/potential/packed.js"
import { evaluate, prepare } from "../src/lib/potential/pipeline.js"
import { REGIONS } from "../src/lib/regions.js"
import { campsFor, routeCamps } from "../src/lib/sites.js"
import { setImageDecoder } from "../src/lib/terrain.js"
import { VECTOR_TILES } from "../src/lib/water.js"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const CANDIDATE_THRESHOLD = 0.5

setImageDecoder(async (blob) => {
	const png = decode(new Uint8Array(await blob.arrayBuffer()))
	if (png.channels === 4) return png.data
	// RGB ohne Alpha auf RGBA erweitern
	const rgba = new Uint8Array((png.data.length / png.channels) * 4)
	for (let i = 0, j = 0; i < png.data.length; i += png.channels, j += 4) {
		rgba[j] = png.data[i]
		rgba[j + 1] = png.data[i + 1]
		rgba[j + 2] = png.data[i + 2]
		rgba[j + 3] = 255
	}
	return rgba
})

/** Ortsnamen (Städte, Dörfer, Ortsteile) aus den Vektorkacheln. */
async function loadPlaces(bbox) {
	const z = 12
	const [w, s, e, n] = bbox
	const [x0, y0] = lonLatToPixel(w, n, z).map((v) => Math.floor(v / 256))
	const [x1, y1] = lonLatToPixel(e, s, z).map((v) => Math.floor(v / 256))
	const places = new Map()
	for (let y = y0; y <= y1; y++) {
		for (let x = x0; x <= x1; x++) {
			const url = VECTOR_TILES.replace("{z}", z)
				.replace("{x}", x)
				.replace("{y}", y)
			const res = await fetch(url)
			if (!res.ok || res.status === 204) continue
			const tile = new VectorTile(
				new PbfReader(new Uint8Array(await res.arrayBuffer())),
			)
			const layer = tile.layers.place
			if (!layer) continue
			for (let i = 0; i < layer.length; i++) {
				const f = layer.feature(i)
				const { class: cls, name } = f.properties
				if (
					!name ||
					!["city", "town", "village", "suburb", "hamlet"].includes(cls)
				)
					continue
				const p = f.loadGeometry()[0][0]
				const [lon, lat] = pixelToLonLat(
					x * 256 + (p.x * 256) / layer.extent,
					y * 256 + (p.y * 256) / layer.extent,
					z,
				)
				if (lon < w || lon > e || lat < s || lat > n) continue
				places.set(`${name}|${cls}`, {
					name,
					class: cls,
					lon: Number(lon.toFixed(4)),
					lat: Number(lat.toFixed(4)),
				})
			}
		}
	}
	return [...places.values()]
}

for (const region of REGIONS) {
	const t0 = Date.now()
	const params = DEFAULT_PARAMS
	const log = (stage, value = 0) =>
		process.stdout.write(
			`\r${region.label}: ${stage} ${Math.round(value * 100)} %   `,
		)
	const state = await prepare(region.bbox, params, { onProgress: log })
	const result = await evaluate(
		state,
		{
			params,
			camps: campsFor("marching"),
			routeCamps: routeCamps(),
			candidateThreshold: CANDIDATE_THRESHOLD,
		},
		{ full: true },
	)
	log("Ortsnamen laden")
	const places = await loadPlaces(region.bbox)
	const { meta, buffer } = pack({
		...result,
		region: region.id,
		params,
		ringSource: "marching",
		places,
		generatedAt: new Date().toISOString(),
	})
	const base = join(ROOT, "public", region.file)
	mkdirSync(dirname(base), { recursive: true })
	writeFileSync(`${base}.json`, JSON.stringify(meta))
	writeFileSync(`${base}.bin`, buffer)
	console.log(
		`\n${region.label}: ${result.grid.cols} × ${result.grid.rows} Zellen, ` +
			`${result.candidates.length} Kandidaten, ${result.routes.features.length} Routen, ` +
			`${result.stages.length} Etappen, ${places.length} Orte, ` +
			`${Math.round(JSON.stringify(meta).length / 1024)} KB JSON + ${Math.round(buffer.length / 1024)} KB Raster, ` +
			`${Math.round((Date.now() - t0) / 1000)} s`,
	)
}
