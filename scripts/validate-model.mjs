/**
 * Gegenprobe des Modells (Leave-one-out): Je Durchlauf wird genau ein
 * bekanntes Lager weggelassen, samt Begleitanlagen im Umkreis von 3 km
 * (Haltern hat sechs). Dann wird das Netz-Raster neu bewertet, mit neu
 * berechneten Routen, Ringen und Abständen, und an der Stelle des Lagers
 * nachgesehen:
 * - Wert der Zelle und ihr Perzentil unter allen Zellen
 * - bester Wert im Umkreis von 2 km (Koordinaten sind teils ungenau)
 * - ob ein Kandidat des Modells näher als 3 km liegt
 *
 *   bun scripts/validate-model.mjs
 */
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { decode } from "fast-png"
import { haversine } from "../src/lib/geo.js"
import { setMoorDecoder } from "../src/lib/moor.js"
import {
	cellAt,
	DEFAULT_PARAMS,
	findCandidates,
} from "../src/lib/potential/model.js"
import { evaluate, prepare } from "../src/lib/potential/pipeline.js"
import { NETWORK } from "../src/lib/regions.js"
import { campsFor, routeCamps, routeWaypoints } from "../src/lib/sites.js"
import { setImageDecoder } from "../src/lib/terrain.js"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

const toRgba = (png) => {
	const n = png.width * png.height
	const ch = png.channels
	const data = new Uint8Array(n * 4)
	for (let i = 0; i < n; i++) {
		data[i * 4] = png.data[i * ch]
		data[i * 4 + 1] = png.data[i * ch + (ch > 2 ? 1 : 0)]
		data[i * 4 + 2] = png.data[i * ch + (ch > 2 ? 2 : 0)]
		data[i * 4 + 3] =
			ch === 4 ? png.data[i * 4 + 3] : ch === 2 ? png.data[i * 2 + 1] : 255
	}
	return { data, width: png.width, height: png.height }
}
setImageDecoder(
	async (blob) => toRgba(decode(new Uint8Array(await blob.arrayBuffer()))).data,
)
setMoorDecoder(async (blob) =>
	toRgba(decode(new Uint8Array(await blob.arrayBuffer()))),
)

// Variante „ohne-routen“: Routen-Faktor aus, nur Gelände, Wasser, Ringe
const VARIANT = process.env.VARIANT ?? "voll"
const params = {
	...DEFAULT_PARAMS,
	cellMeters: NETWORK.cellMeters,
	weights:
		VARIANT === "ohne-routen"
			? { ...DEFAULT_PARAMS.weights, route: 0 }
			: DEFAULT_PARAMS.weights,
}
const log = (stage, value = 0) =>
	process.stdout.write(`\r${stage} ${Math.round(value * 100)} %          `)
const state = await prepare(NETWORK.bbox, params, {
	onProgress: log,
	includeNiMoor: true,
})
const { grid } = state

// Routenziele ohne Lager bleiben draußen: Der Suchraum Löhne ist aus
// Sennestadt und Barkhausen abgeleitet und würde die Gegenprobe verfälschen
const all = routeCamps().filter((c) => !c.target)
const marching = campsFor("marching")
// Testfälle: jedes augusteische Lager im Raster, Begleitanlagen zusammengefasst
const tests = []
for (const camp of all) {
	if (cellAt(grid, camp.lon, camp.lat) < 0) continue
	if (
		tests.some((t) =>
			t.members.some((m) => haversine(m.lon, m.lat, camp.lon, camp.lat) < 3000),
		)
	)
		continue
	const members = all.filter(
		(c) => haversine(c.lon, c.lat, camp.lon, camp.lat) < 3000,
	)
	tests.push({ camp, members })
}

const percentile = (score, v) => {
	let below = 0
	let n = 0
	for (const s of score) {
		if (s <= 0) continue
		n++
		if (s < v) below++
	}
	return n ? below / n : 0
}

const rows = []
for (const { camp, members } of tests) {
	const out = new Set(members.map((m) => m.id))
	state.routeKey = null // Routen ohne das Lager neu berechnen
	const result = await evaluate(state, {
		params,
		camps: marching.filter((c) => !out.has(c.id)),
		routeCamps: all.filter((c) => !out.has(c.id)),
		waypoints: routeWaypoints(),
		routeParams: NETWORK.routeParams,
		candidateThreshold: 0.5,
	})
	const { score } = result
	const i = cellAt(grid, camp.lon, camp.lat)
	const k = Math.round(2000 / grid.cellMeters)
	const cx = i % grid.cols
	const cy = Math.floor(i / grid.cols)
	let best = score[i]
	for (let dy = -k; dy <= k; dy++) {
		for (let dx = -k; dx <= k; dx++) {
			if (dx * dx + dy * dy > k * k) continue
			const x = cx + dx
			const y = cy + dy
			if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) continue
			best = Math.max(best, score[y * grid.cols + x])
		}
	}
	const candidates = findCandidates(grid, score, { threshold: 0.5, limit: 60 })
	const nearest = candidates
		.map((c, r) => ({
			r: r + 1,
			d: haversine(c.lon, c.lat, camp.lon, camp.lat),
		}))
		.sort((a, b) => a.d - b.d)[0]
	const row = {
		id: camp.id,
		name: camp.name,
		removed: members.map((m) => m.name),
		score: Number(score[i].toFixed(3)),
		percentile: Number(percentile(score, score[i]).toFixed(3)),
		best2km: Number(best.toFixed(3)),
		percentileBest: Number(percentile(score, best).toFixed(3)),
		nearestCandidateKm: nearest ? Number((nearest.d / 1000).toFixed(1)) : null,
		nearestCandidateRank: nearest?.r ?? null,
	}
	rows.push(row)
	console.log(
		`\n${row.name.padEnd(46)} Wert ${row.score.toFixed(2)} (P${Math.round(row.percentile * 100)}), ` +
			`bester ≤2 km ${row.best2km.toFixed(2)} (P${Math.round(row.percentileBest * 100)}), ` +
			`nächster Kandidat ${row.nearestCandidateKm} km (Rang ${row.nearestCandidateRank})`,
	)
}

// Vergleich: dieselben Kennzahlen an 300 Zufallsorten im vollen Modell
// (mindestens 10 km von bekannten Lagern, dort ist das Potenzial gedämpft)
state.routeKey = null
const base = await evaluate(state, {
	params,
	camps: marching,
	routeCamps: all,
	waypoints: routeWaypoints(),
	routeParams: NETWORK.routeParams,
	candidateThreshold: 0.5,
})
let seed = 7
const rand = () => {
	seed = (seed * 16807) % 2147483647
	return seed / 2147483647
}
const randomRows = []
while (randomRows.length < 300) {
	const c = Math.floor(rand() * grid.cols)
	const r = Math.floor(rand() * grid.rows)
	const i = r * grid.cols + c
	if (base.score[i] <= 0) continue
	if (base.raw.distCamp[i] < 10000) continue
	let best = base.score[i]
	const k = Math.round(2000 / grid.cellMeters)
	for (let dy = -k; dy <= k; dy++)
		for (let dx = -k; dx <= k; dx++) {
			if (dx * dx + dy * dy > k * k) continue
			const x = c + dx
			const y = r + dy
			if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) continue
			best = Math.max(best, base.score[y * grid.cols + x])
		}
	randomRows.push({
		percentile: percentile(base.score, base.score[i]),
		percentileBest: percentile(base.score, best),
	})
}
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
const baseline = {
	points: randomRows.length,
	medianPercentile: median(randomRows.map((r) => r.percentile)),
	medianPercentileBest: median(randomRows.map((r) => r.percentileBest)),
	shareHighBest:
		randomRows.filter((r) => r.percentileBest >= 0.8).length /
		randomRows.length,
}
console.log(
	`\nZufallsorte: Median-Perzentil ${Math.round(baseline.medianPercentile * 100)}, im 2-km-Umkreis ${Math.round(baseline.medianPercentileBest * 100)}, ` +
		`Anteil mit bestem Wert in den oberen 20 %: ${Math.round(baseline.shareHighBest * 100)} %`,
)

const high = rows.filter((r) => r.percentileBest >= 0.8).length
const summary = {
	tests: rows.length,
	highBest: high,
	medianPercentile: rows.map((r) => r.percentile).sort((a, b) => a - b)[
		Math.floor(rows.length / 2)
	],
	medianPercentileBest: rows.map((r) => r.percentileBest).sort((a, b) => a - b)[
		Math.floor(rows.length / 2)
	],
}
console.log(
	`\n${rows.length} Lager geprüft, bei ${high} liegt der beste Wert im Umkreis von 2 km in den oberen 20 %.` +
		` Median-Perzentil an der Lagerstelle ${Math.round(summary.medianPercentile * 100)}, im 2-km-Umkreis ${Math.round(summary.medianPercentileBest * 100)}.`,
)
const file = join(ROOT, "public", "precomputed", "validation.json")
let existing = {}
try {
	existing = JSON.parse(readFileSync(file, "utf8"))
	if (existing.rows) existing = {}
} catch {
	// erste Variante
}
existing[VARIANT] = {
	rows,
	summary,
	baseline,
	weights: params.weights,
	generatedAt: new Date().toISOString(),
}
writeFileSync(file, JSON.stringify(existing, null, 1))
