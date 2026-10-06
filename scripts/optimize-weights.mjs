/**
 * Gewichtung an der Gegenprobe ausrichten, mit verschachtelter
 * Kreuzvalidierung gegen Überanpassung:
 *
 * 1. Je bekanntem Lager (samt Anlagen im Umkreis von 3 km) wird das Lager
 *    weggelassen und das Netz-Raster neu bewertet. Gespeichert werden die
 *    Teilwerte an der Lagerstelle und an 1500 festen Zufallszellen.
 * 2. Für eine Gewichtung ergibt sich je Lager ein Perzentil: Anteil der
 *    Zufallszellen mit niedrigerem Wert. Ziel ist ein hohes mittleres
 *    Perzentil.
 * 3. Ehrliche Schätzung: Für jedes Lager werden die Gewichte nur an den
 *    übrigen bestimmt und an ihm geprüft (nested leave-one-out).
 *
 *   bun scripts/optimize-weights.mjs
 */
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { decode } from "fast-png"
import { haversine } from "../src/lib/geo.js"
import { setMoorDecoder } from "../src/lib/moor.js"
import { cellAt, DEFAULT_PARAMS, FACTORS } from "../src/lib/potential/model.js"
import { evaluate, prepare } from "../src/lib/potential/pipeline.js"
import { NETWORK } from "../src/lib/regions.js"
import { campsFor, routeCamps, routeWaypoints } from "../src/lib/sites.js"
import { setImageDecoder } from "../src/lib/terrain.js"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const KEYS = FACTORS.map((f) => f.key)

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

const params = { ...DEFAULT_PARAMS, cellMeters: NETWORK.cellMeters }
const log = (stage, value = 0) =>
	process.stdout.write(`\r${stage} ${Math.round(value * 100)} %          `)
const state = await prepare(NETWORK.bbox, params, {
	onProgress: log,
	includeNiMoor: true,
})
const { grid } = state
const all = routeCamps()
const marching = campsFor("marching")

let seed = 11
const rand = () => {
	seed = (seed * 16807) % 2147483647
	return seed / 2147483647
}

const tests = []
for (const camp of all) {
	if (cellAt(grid, camp.lon, camp.lat) < 0) continue
	if (
		tests.some((t) =>
			t.members.some((m) => haversine(m.lon, m.lat, camp.lon, camp.lat) < 3000),
		)
	)
		continue
	tests.push({
		camp,
		members: all.filter(
			(c) => haversine(c.lon, c.lat, camp.lon, camp.lat) < 3000,
		),
	})
}

// Feste Zufallszellen (Land mit Werten), für alle Fälle dieselben
const refs = []
while (refs.length < 1500) {
	const i = Math.floor(rand() * grid.cols * grid.rows)
	if (Number.isFinite(state.elev[i])) refs.push(i)
}

/** Teilwerte und Faktoren für Abzüge an einer Zelle. */
function snapshot(result, i) {
	return {
		f: KEYS.map((k) => result.factors[k][i]),
		mult:
			(result.raw.slope[i] > 12 ? 0.3 : 1) *
			(1 - params.moorPenalty * result.raw.moor[i]) *
			(1 - params.wetPenalty * result.raw.wet[i]) *
			Math.min(1, result.raw.distKnown[i] / params.hideKnownRadius),
	}
}

const cases = []
for (const { camp, members } of tests) {
	const out = new Set(members.map((m) => m.id))
	state.routeKey = null
	const result = await evaluate(state, {
		params,
		camps: marching.filter((c) => !out.has(c.id)),
		routeCamps: all.filter((c) => !out.has(c.id)),
		waypoints: routeWaypoints(),
		routeParams: NETWORK.routeParams,
		candidateThreshold: 0.5,
	})
	cases.push({
		id: camp.id,
		name: camp.name,
		camp: snapshot(result, cellAt(grid, camp.lon, camp.lat)),
		refs: refs.map((i) => snapshot(result, i)),
	})
	log(`Teilwerte ${cases.length}/${tests.length}`, 1)
}

const scoreOf = (snap, w, total) => {
	let s = 0
	for (let k = 0; k < w.length; k++) s += w[k] * snap.f[k]
	return (s / total) * snap.mult
}
function percentileOf(c, w) {
	const total = w.reduce((a, b) => a + b, 0) || 1
	const v = scoreOf(c.camp, w, total)
	let below = 0
	for (const r of c.refs) if (scoreOf(r, w, total) < v) below++
	return below / c.refs.length
}
const meanP = (list, w) =>
	list.reduce((a, c) => a + percentileOf(c, w), 0) / list.length

/** Zufallssuche (Dirichlet-artig) plus Feinsuche in Einzelschritten. */
function optimize(list) {
	let best = KEYS.map((k) => DEFAULT_PARAMS.weights[k] ?? 1)
	let bestV = meanP(list, best)
	for (let n = 0; n < 1200; n++) {
		const w = KEYS.map(() => -Math.log(rand() + 1e-9) * (rand() < 0.2 ? 0 : 1))
		const v = meanP(list, w)
		if (v > bestV) {
			best = w
			bestV = v
		}
	}
	for (let round = 0; round < 3; round++) {
		for (let k = 0; k < KEYS.length; k++) {
			for (const f of [0, 0.5, 0.75, 1.33, 2]) {
				const w = [...best]
				w[k] = f === 0 ? 0 : w[k] * f + (w[k] === 0 ? 0.3 : 0)
				const v = meanP(list, w)
				if (v > bestV) {
					best = w
					bestV = v
				}
			}
		}
	}
	const sum = best.reduce((a, b) => a + b, 0) || 1
	return { weights: best.map((x) => (x / sum) * 10), score: bestV }
}

const defaults = KEYS.map((k) => DEFAULT_PARAMS.weights[k] ?? 1)
const nested = cases.map((held, j) => {
	const train = cases.filter((_, i) => i !== j)
	const { weights } = optimize(train)
	return {
		id: held.id,
		name: held.name,
		heldOut: percentileOf(held, weights),
		defaults: percentileOf(held, defaults),
	}
})
const final = optimize(cases)
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]

console.log(
	"\n\nLager                                          Standard  optimiert (ohne dieses Lager)",
)
for (const r of nested) {
	console.log(
		`${r.name.padEnd(46)} P${String(Math.round(r.defaults * 100)).padStart(3)}      P${Math.round(r.heldOut * 100)}`,
	)
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
console.log(
	`\nMittel  Standard P${Math.round(mean(nested.map((r) => r.defaults)) * 100)}, optimiert ehrlich P${Math.round(mean(nested.map((r) => r.heldOut)) * 100)} (Median P${Math.round(median(nested.map((r) => r.heldOut)) * 100)}), optimiert an allen 12 P${Math.round(final.score * 100)}`,
)
console.log(
	"Gewichte (Summe 10):",
	Object.fromEntries(
		KEYS.map((k, i) => [k, Number(final.weights[i].toFixed(2))]),
	),
)

const file = join(ROOT, "public", "precomputed", "validation.json")
let existing = {}
try {
	existing = JSON.parse(readFileSync(file, "utf8"))
} catch {
	// leer
}
existing.optimierung = {
	keys: KEYS,
	defaults: Object.fromEntries(KEYS.map((k, i) => [k, defaults[i]])),
	weights: Object.fromEntries(
		KEYS.map((k, i) => [k, Number(final.weights[i].toFixed(2))]),
	),
	inSample: final.score,
	nested,
	generatedAt: new Date().toISOString(),
}
writeFileSync(file, JSON.stringify(existing, null, 1))
