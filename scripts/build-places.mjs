/**
 * Baut public/precomputed/orte.json, den Ortsindex der globalen Suche:
 * Städte, Dörfer, Ortsteile, Weiler, Berge und Schutzgebiete aus den
 * OpenMapTiles-Kacheln von tiles.erleben.app (OpenStreetMap, Planetiler).
 * Die Suche läuft danach ohne externen Dienst im Browser.
 *
 * Jede Zoomstufe enthält nur eine ausgedünnte Auswahl an Orten, deshalb
 * werden mehrere Stufen zusammengeführt. Z12 nur im Kerngebiet, sonst
 * werden es zu viele Kacheln.
 *
 *   bun scripts/build-places.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { VectorTile } from "@mapbox/vector-tile"
import { PbfReader } from "pbf"
import { lonLatToPixel, pixelToLonLat } from "../src/lib/geo.js"
import { VECTOR_TILES } from "../src/lib/water.js"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const TILE = 256

// Alle Fundstellen liegen darin, das Kerngebiet ist das Marschwege-Netz
const WIDE = [5.8, 50.2, 11.0, 53.6]
const CORE = [6.3, 51.25, 10.0, 52.75]
const JOBS = [
	{ zoom: 8, bbox: WIDE },
	{ zoom: 10, bbox: WIDE },
	{ zoom: 11, bbox: WIDE },
	{ zoom: 12, bbox: CORE },
]

// Klasse -> Kürzel in der Ausgabe, Reihenfolge = Wichtigkeit
const CLASSES = {
	city: "c",
	town: "t",
	village: "v",
	suburb: "s",
	quarter: "s",
	hamlet: "h",
	isolated_dwelling: "h",
	locality: "l",
	peak: "p",
	ridge: "r",
	volcano: "p",
	park: "n",
}
const PARK_SKIP = /wasserschutz|vogelschutz|fauna|flora/i

function tilesOf({ zoom, bbox: [w, s, e, n] }) {
	const [px0, py0] = lonLatToPixel(w, n, zoom)
	const [px1, py1] = lonLatToPixel(e, s, zoom)
	const out = []
	for (let y = Math.floor(py0 / TILE); y <= Math.floor(py1 / TILE); y++) {
		for (let x = Math.floor(px0 / TILE); x <= Math.floor(px1 / TILE); x++) {
			out.push([zoom, x, y])
		}
	}
	return out
}

async function loadTile([z, x, y]) {
	const url = VECTOR_TILES.replace("{z}", z).replace("{x}", x).replace("{y}", y)
	for (let attempt = 0; ; attempt++) {
		try {
			const res = await fetch(url)
			if (res.status === 204 || res.status === 404) return []
			if (!res.ok) throw new Error(`HTTP ${res.status}`)
			const tile = new VectorTile(
				new PbfReader(new Uint8Array(await res.arrayBuffer())),
			)
			return extract(tile, z, x, y)
		} catch (e) {
			if (attempt >= 3) throw new Error(`${url}: ${e.message}`)
			await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
		}
	}
}

function extract(tile, z, x, y) {
	const out = []
	const add = (layer, kind) => {
		if (!layer) return
		const scale = TILE / layer.extent
		for (let i = 0; i < layer.length; i++) {
			const f = layer.feature(i)
			const p = f.properties
			const cls = kind ?? p.class
			if (!CLASSES[cls] || !p.name || /^\d/.test(p.name)) continue
			if (kind === "park" && PARK_SKIP.test(`${p.class} ${p.name}`)) continue
			// Linien und Flächen: erster Punkt reicht für die Kamerafahrt
			const pt = f.loadGeometry()[0]?.[0]
			if (!pt) continue
			const [lon, lat] = pixelToLonLat(
				x * TILE + pt.x * scale,
				y * TILE + pt.y * scale,
				z,
			)
			const de = p["name:de"] ?? p.name_de
			out.push({
				name: p.name,
				alias: de && de !== p.name ? de : null,
				cls: CLASSES[cls],
				lon,
				lat,
			})
		}
	}
	add(tile.layers.place)
	add(tile.layers.mountain_peak)
	// Kleine Schutzgebiete gibt es zu Tausenden, nur die großen
	if (z <= 8) add(tile.layers.park, "park")
	return out
}

const km = (a, b) =>
	Math.hypot(
		(a.lon - b.lon) * 111.32 * Math.cos((a.lat * Math.PI) / 180),
		(a.lat - b.lat) * 110.57,
	)

const jobs = JOBS.flatMap(tilesOf)
console.log(`${jobs.length} Kacheln`)
const found = []
let done = 0
const queue = [...jobs]
await Promise.all(
	Array.from({ length: 12 }, async () => {
		while (queue.length) {
			found.push(...(await loadTile(queue.shift())))
			if (++done % 200 === 0) console.log(`${done}/${jobs.length}`)
		}
	}),
)

// Gleicher Name in 2 km Umkreis ist derselbe Ort. Schutzgebiete sind in
// den Kacheln zerschnitten, sie zählen nur einmal je Name.
const order = Object.values(CLASSES)
found.sort((a, b) => order.indexOf(a.cls) - order.indexOf(b.cls))
const byName = new Map()
const places = []
for (const p of found) {
	const same = byName.get(p.name) ?? []
	const park = p.cls === "n"
	const dup = same.some(
		(q) => (q.cls === "n") === park && (park || km(p, q) < 2),
	)
	if (dup) continue
	same.push(p)
	byName.set(p.name, same)
	places.push(p)
}

// Zur Unterscheidung gleichnamiger Orte: nächste Stadt im Umkreis
const towns = places.filter((p) => p.cls === "c" || p.cls === "t")
for (const p of places) {
	if (p.cls === "c") continue
	let best = null
	let bd = 25
	for (const t of towns) {
		if (t === p) continue
		const d = km(p, t)
		if (d < bd) {
			bd = d
			best = t
		}
	}
	if (best) p.near = best.name
}

// 3 Nachkommastellen, rund 100 m, genügen für die Kamerafahrt
const round = (v) => Math.round(v * 1e3) / 1e3
const near = [...new Set(places.map((p) => p.near).filter(Boolean))].sort()
const nearIndex = new Map(near.map((n, i) => [n, i]))
const out = places
	.sort((a, b) => a.name.localeCompare(b.name, "de"))
	.map((p) => {
		const row = [p.name, p.cls, round(p.lon), round(p.lat)]
		row.push(p.near ? nearIndex.get(p.near) : -1)
		if (p.alias) row.push(p.alias)
		return row
	})
const target = join(ROOT, "public/precomputed/orte.json")
mkdirSync(dirname(target), { recursive: true })
writeFileSync(
	target,
	JSON.stringify({
		source:
			"OpenStreetMap über tiles.erleben.app (OpenMapTiles), © OpenStreetMap-Mitwirkende (ODbL)",
		fields: ["name", "class", "lon", "lat", "near", "alias"],
		near,
		places: out,
	}),
)
const count = {}
for (const p of places) count[p.cls] = (count[p.cls] ?? 0) + 1
console.log(`${out.length} Orte nach ${target}`, count)
