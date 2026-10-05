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
import { setMoorDecoder } from "../src/lib/moor.js"
import { rankedCandidates } from "../src/lib/potential/candidates.js"
import {
	cellAt,
	cellCenter,
	DEFAULT_PARAMS,
} from "../src/lib/potential/model.js"
import { pack } from "../src/lib/potential/packed.js"
import { evaluate, prepare, waterLines } from "../src/lib/potential/pipeline.js"
import { NETWORK, REGIONS } from "../src/lib/regions.js"
import {
	campsFor,
	routeCamps,
	routeWaypoints,
	SITES,
} from "../src/lib/sites.js"
import { setImageDecoder } from "../src/lib/terrain.js"
import { VECTOR_TILES } from "../src/lib/water.js"
import { analyzeWindows } from "./lineaments.mjs"

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

setMoorDecoder(async (blob) => {
	const png = decode(new Uint8Array(await blob.arrayBuffer()))
	const n = png.width * png.height
	const data = new Uint8Array(n * 4)
	const ch = png.channels
	for (let i = 0; i < n; i++) {
		data[i * 4] = png.data[i * ch]
		data[i * 4 + 1] = png.data[i * ch + (ch > 2 ? 1 : 0)]
		data[i * 4 + 2] = png.data[i * ch + (ch > 2 ? 2 : 0)]
		data[i * 4 + 3] =
			ch === 4 ? png.data[i * 4 + 3] : ch === 2 ? png.data[i * 2 + 1] : 255
	}
	return { data, width: png.width, height: png.height }
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

/** Überregionales Netz: Routen, grobe Etappenhalte, große Flüsse. */
async function computeNetwork() {
	const t0 = Date.now()
	const params = { ...DEFAULT_PARAMS, cellMeters: NETWORK.cellMeters }
	const log = (stage, value = 0) =>
		process.stdout.write(
			`\r${NETWORK.label}: ${stage} ${Math.round(value * 100)} %   `,
		)
	const state = await prepare(NETWORK.bbox, params, {
		onProgress: log,
		includeNiMoor: true,
	})
	const result = await evaluate(
		state,
		{
			params,
			camps: campsFor("marching"),
			routeCamps: routeCamps(),
			waypoints: routeWaypoints(),
			routeParams: NETWORK.routeParams,
			candidateThreshold: CANDIDATE_THRESHOLD,
		},
		{ full: true },
	)
	const rivers = waterLines(state, NETWORK.riverKm2, 2000)
	console.log(
		`\n${NETWORK.label}: ${result.routes.features.length} Routen, ` +
			`${result.stages.length} Etappen, ${rivers.features.length} Flussabschnitte, ` +
			`${Math.round((Date.now() - t0) / 1000)} s`,
	)
	return { routes: result.routes, stages: result.stages, rivers }
}

/** Etappenhalte im Kreis auf die beste Zelle des feinen Rasters setzen. */
function refineStages(stages, regional) {
	const { grid, score } = regional
	const k = Math.round(3000 / grid.cellMeters)
	return stages.map((stage) => {
		const center = cellAt(grid, stage.lon, stage.lat)
		if (center < 0) return stage
		const cx = center % grid.cols
		const cy = Math.floor(center / grid.cols)
		let best = center
		for (let dy = -k; dy <= k; dy++) {
			for (let dx = -k; dx <= k; dx++) {
				const x = cx + dx
				const y = cy + dy
				if (
					dx * dx + dy * dy > k * k ||
					x < 0 ||
					y < 0 ||
					x >= grid.cols ||
					y >= grid.rows
				)
					continue
				if (score[y * grid.cols + x] > score[best]) best = y * grid.cols + x
			}
		}
		const [lon, lat] = cellCenter(
			grid,
			best % grid.cols,
			Math.floor(best / grid.cols),
		)
		return { ...stage, lon, lat, score: score[best], refined: true }
	})
}

const network = await computeNetwork()
const routeLines = network.routes.features.map((f) => f.geometry.coordinates)

for (const region of REGIONS) {
	const t0 = Date.now()
	const params = DEFAULT_PARAMS
	const log = (stage, value = 0) =>
		process.stdout.write(
			`\r${region.label}: ${stage} ${Math.round(value * 100)} %   `,
		)
	const state = await prepare(region.bbox, params, {
		onProgress: log,
		includeNiMoor: true,
	})
	const result = await evaluate(
		state,
		{
			params,
			camps: campsFor("marching"),
			routeCamps: routeCamps(),
			waypoints: routeWaypoints(),
			routeLines,
			candidateThreshold: CANDIDATE_THRESHOLD,
		},
		{ full: true },
	)
	network.stages = refineStages(network.stages, result)

	// Laserscan-Fenster: bestätigte Lager (Prüffälle), Kandidaten mit hoher
	// Wahrscheinlichkeit und Etappenhalte im Kreis. Nur NRW hat DGM1-Daten.
	log("Laserscan-Fenster")
	const points = [
		...SITES.features
			.filter(
				(f) =>
					f.properties.inModel &&
					f.properties.status === "bestätigt" &&
					["marschlager", "legionslager", "kastell"].includes(
						f.properties.type,
					),
			)
			.map((f) => ({
				id: f.properties.id,
				kind: "bestätigt",
				label: f.properties.name,
				lon: f.geometry.coordinates[0],
				lat: f.geometry.coordinates[1],
			})),
		...rankedCandidates({ ...result, region: region.id })
			.filter((c) => c.rank && c.score >= 0.7)
			.slice(0, 10)
			.map((c) => ({
				id: `kandidat-${c.rank}`,
				kind: "Kandidat",
				label: `Kandidat ${c.rank}`,
				lon: c.lon,
				lat: c.lat,
			})),
		...network.stages
			.filter((st) => st.refined)
			.map((st, i) => ({
				id: `etappe-${i + 1}`,
				kind: "Etappenhalt",
				label: `Etappenhalt ${st.from} – ${st.to}`,
				lon: st.lon,
				lat: st.lat,
			})),
	]
	const lrmDir = join(ROOT, "public", "precomputed", "lrm")
	mkdirSync(lrmDir, { recursive: true })
	const lineaments = await analyzeWindows(points, undefined, (id, jpg) =>
		writeFileSync(join(lrmDir, `${id}.jpg`), jpg),
	)
	writeFileSync(
		join(ROOT, "public", "precomputed", "lineaments.json"),
		JSON.stringify({ ...lineaments, generatedAt: new Date().toISOString() }),
	)
	const looked = lineaments.windows.filter((w) => w.status === "untersucht")
	console.log(
		`\nLaserscan: ${looked.length} von ${points.length} Fenstern untersucht`,
	)
	log("Ortsnamen laden")
	const places = await loadPlaces(region.bbox)
	const { meta, buffer } = pack({
		...result,
		routes: null,
		stages: [],
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
			`${result.candidates.length} Kandidaten, ${places.length} Orte, ` +
			`${Math.round(JSON.stringify(meta).length / 1024)} KB JSON + ${Math.round(buffer.length / 1024)} KB Raster, ` +
			`${Math.round((Date.now() - t0) / 1000)} s`,
	)
}

const netFile = join(ROOT, "public", `${NETWORK.file}.json`)
writeFileSync(
	netFile,
	JSON.stringify({ ...network, generatedAt: new Date().toISOString() }),
)
console.log(`Netz: ${Math.round(JSON.stringify(network).length / 1024)} KB`)
