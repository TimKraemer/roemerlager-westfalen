/**
 * Baut src/data/fluesse.json: Verlauf der in den antiken Texten genannten
 * Flüsse als je eine Linie, für die Kartendarstellung im Reiter „Texte“.
 * Quelle sind die OSM-Kacheln von tiles.erleben.app (heutiger Verlauf,
 * auf etwa 150 m vereinfacht). Große Flüsse aus Zoom 8, kleine aus Zoom 9.
 *
 *   bun scripts/build-rivers.mjs
 */
import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { VectorTile } from "@mapbox/vector-tile"
import { PbfReader } from "pbf"
import { lonLatToPixel, pixelToLonLat } from "../src/lib/geo.js"
import { VECTOR_TILES } from "../src/lib/water.js"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const TILE = 256
const JOBS = [
	{
		zoom: 8,
		bbox: [5.8, 50.0, 12.0, 54.0],
		names: ["Rhein", "Maas", "Weser", "Elbe", "Ems", "Lippe"],
	},
	{
		zoom: 9,
		bbox: [6.3, 51.25, 10.0, 52.75],
		names: ["Stever", "Seseke", "Alme"],
	},
]

async function tileLines(z, x, y, names) {
	const url = VECTOR_TILES.replace("{z}", z).replace("{x}", x).replace("{y}", y)
	const res = await fetch(url)
	if (!res.ok) return []
	const tile = new VectorTile(
		new PbfReader(new Uint8Array(await res.arrayBuffer())),
	)
	const layer = tile.layers.waterway
	if (!layer) return []
	const out = []
	const scale = TILE / layer.extent
	for (let i = 0; i < layer.length; i++) {
		const f = layer.feature(i)
		const name = f.properties.name
		if (f.properties.class !== "river" || !names.includes(name)) continue
		for (const ring of f.loadGeometry()) {
			out.push({
				name,
				coords: ring.map((p) =>
					pixelToLonLat(x * TILE + p.x * scale, y * TILE + p.y * scale, z),
				),
			})
		}
	}
	return out
}

// Die Teilstücke überlappen an den Kachelrändern und treffen sich nicht
// exakt. Deshalb ein Graph über alle Stützpunkte. Lücken bis rund 1 km,
// an den Enden eines Teilstücks bis rund 6 km, werden überbrückt. Der
// längste kürzeste Weg im Graphen ist der Flusslauf.
function chain(lines) {
	const nodes = lines.flat()
	const offset = []
	let n = 0
	for (const l of lines) {
		offset.push(n)
		n += l.length
	}
	const adj = Array.from({ length: n }, () => [])
	const dist = (a, b) =>
		Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][1] - nodes[b][1])
	const link = (a, b) => {
		const d = dist(a, b)
		adj[a].push([b, d])
		adj[b].push([a, d])
	}
	lines.forEach((l, li) => {
		for (let i = 1; i < l.length; i++) link(offset[li] + i - 1, offset[li] + i)
	})
	// Jeder Stützpunkt mit dem nächsten Punkt jedes anderen Teilstücks
	lines.forEach((l, li) => {
		for (let i = 0; i < l.length; i++) {
			const a = offset[li] + i
			lines.forEach((m, mi) => {
				if (mi === li) return
				let best = -1
				// Enden dürfen weiter springen als Punkte mitten im Lauf
				let bd = i === 0 || i === l.length - 1 ? 0.08 : 0.01
				for (let j = 0; j < m.length; j++) {
					const d = dist(a, offset[mi] + j)
					if (d < bd) {
						bd = d
						best = offset[mi] + j
					}
				}
				if (best >= 0) link(a, best)
			})
		}
	})
	const dijkstra = (src) => {
		const d = new Float64Array(n).fill(Infinity)
		const prev = new Int32Array(n).fill(-1)
		const done = new Uint8Array(n)
		d[src] = 0
		for (;;) {
			let u = -1
			for (let i = 0; i < n; i++)
				if (!done[i] && d[i] < Infinity && (u < 0 || d[i] < d[u])) u = i
			if (u < 0) break
			done[u] = 1
			for (const [v, w] of adj[u]) {
				if (d[u] + w < d[v]) {
					d[v] = d[u] + w
					prev[v] = u
				}
			}
		}
		let far = src
		for (let i = 0; i < n; i++) if (d[i] < Infinity && d[i] > d[far]) far = i
		return { far, prev }
	}
	const longest = lines.reduce(
		(a, l, i) => (l.length > lines[a].length ? i : a),
		0,
	)
	const { far: u } = dijkstra(offset[longest])
	const { far: v, prev } = dijkstra(u)
	const path = []
	for (let x = v; x >= 0; x = prev[x]) path.push(nodes[x])
	return path
}

function simplify(points, tol) {
	if (points.length < 3) return points
	let max = 0
	let idx = 0
	const [x0, y0] = points[0]
	const [x1, y1] = points.at(-1)
	const len = Math.hypot(x1 - x0, y1 - y0) || 1e-12
	for (let i = 1; i < points.length - 1; i++) {
		const [x, y] = points[i]
		const d = Math.abs((y1 - y0) * x - (x1 - x0) * y + x1 * y0 - y1 * x0) / len
		if (d > max) {
			max = d
			idx = i
		}
	}
	if (max <= tol) return [points[0], points.at(-1)]
	return [
		...simplify(points.slice(0, idx + 1), tol).slice(0, -1),
		...simplify(points.slice(idx), tol),
	]
}

const rivers = {}
for (const job of JOBS) {
	const [west, south, east, north] = job.bbox
	const [px0, py0] = lonLatToPixel(west, north, job.zoom)
	const [px1, py1] = lonLatToPixel(east, south, job.zoom)
	const byName = {}
	for (let y = Math.floor(py0 / TILE); y <= Math.floor(py1 / TILE); y++) {
		for (let x = Math.floor(px0 / TILE); x <= Math.floor(px1 / TILE); x++) {
			for (const l of await tileLines(job.zoom, x, y, job.names)) {
				byName[l.name] = [...(byName[l.name] ?? []), l.coords]
			}
		}
	}
	for (const [name, lines] of Object.entries(byName)) {
		const longest = chain(lines)
		rivers[name] = simplify(longest, 0.0015).map(([lon, lat]) => [
			Math.round(lon * 1e4) / 1e4,
			Math.round(lat * 1e4) / 1e4,
		])
		console.log(name, lines.length, "Teile ->", rivers[name].length, "Punkte")
	}
}

writeFileSync(
	join(ROOT, "src/data/fluesse.json"),
	`${JSON.stringify(rivers)}\n`,
)
