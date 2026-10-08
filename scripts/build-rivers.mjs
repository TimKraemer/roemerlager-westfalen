/**
 * Baut src/data/fluesse.json: Verlauf der in den antiken Texten genannten
 * Flüsse als je eine Linie, für die Kartendarstellung im Reiter „Texte“,
 * die Ebene „Alte Flussläufe“ und den Flussabstand im Potenzialmodell.
 *
 * 1. Leitlinie: heutiger Verlauf aus den OSM-Kacheln von tiles.erleben.app
 *    (große Flüsse Zoom 8, kleine Zoom 9), grob auf 150 m vereinfacht.
 * 2. Entlang der Leitlinie wird je 6-km-Abschnitt ein Raster mit rund 3 m
 *    Auflösung (Web-Mercator Zoom 15) gebaut. Darin liegt der heutige
 *    OSM-Lauf aus Zoom 13 und, für Rhein, Lippe, Ems und Weser in NRW, ein
 *    Wasserwert aus der Preußischen Uraufnahme (1836–1850): Auf den blau
 *    kolorierten Blättern sind Flüsse blassblau mit blauem Ufer, Papier und
 *    Wiesen gelblich.
 * 3. Der günstigste Weg durch das Raster innerhalb eines Korridors um die
 *    Leitlinie ist der Flusslauf. Er folgt dem Wasser, Lücken durch Schrift
 *    oder Blattränder werden überbrückt. Liegt der Weg nicht überwiegend auf
 *    erkanntem, flächigem Wasser (Blätter ohne Blau, Festungsgräben), gilt
 *    für den Abschnitt der heutige Lauf. Jedes Teilstück trägt seine
 *    Herkunft: "uraufnahme", "osm" oder "roemisch".
 * 4. Für die Römerzeit werden einzelne Abschnitte durch Rekonstruktionen
 *    aus der Literatur ersetzt (ROMAN).
 *
 * Kacheln der Uraufnahme werden in node_modules/.cache/uraufnahme gehalten.
 *
 *   bun scripts/build-rivers.mjs [Fluss …] [--roemisch]
 *
 * DEBUG_RIVER=Lippe schreibt je Abschnitt ein Bild von Kosten und Weg nach
 * node_modules/.cache, DEBUG_FROM=k beginnt bei Abschnitt k, DEBUG_QUALITY=1
 * gibt die Wasseranteile je Abschnitt aus, DRY=1 schreibt nichts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { VectorTile } from "@mapbox/vector-tile"
import jpeg from "jpeg-js"
import { PbfReader } from "pbf"
import { lonLatToPixel, metersPerPixel, pixelToLonLat } from "../src/lib/geo.js"
import { VECTOR_TILES } from "../src/lib/water.js"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const CACHE = join(ROOT, "node_modules/.cache/uraufnahme")
const TILE = 256
const URAUFNAHME =
	"https://www.wms.nrw.de/geobasis/wms_nw_uraufnahme?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=nw_uraufnahme_rw&STYLES=&CRS=EPSG:3857&FORMAT=image/jpeg"
// Ausdehnung der Uraufnahme (NRW), außerhalb wird nicht angefragt
const NRW = [5.85, 50.31, 9.47, 52.54]
// Rasterzoom (≈ 3 m je Pixel), Größe einer WMS-Kachel in Pixeln
const Z = 15
const BLOCK = 1024
// Abschnittslänge entlang der Leitlinie
const STEP_M = 6000
// Flächiges Wasser: Mindestwert im 45-m-Mittel und Anteil am Weg
const WIDE_MIN = 0.35
const BROAD_SHARE = 0.2
// Kleine Flüsse zeichnet die Uraufnahme meist als dünne schwarze Linie,
// die sich nicht von Wegen und Rainen trennen lässt: dort der heutige Lauf
const FROM_MAP = ["Rhein", "Lippe", "Ems", "Weser"]

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
// Halbe Korridorbreite um die Leitlinie: so weit darf der alte Lauf abweichen
const CORRIDOR_M = {
	Rhein: 2500,
	Maas: 1500,
	Weser: 1500,
	Elbe: 2000,
	Ems: 1500,
	Lippe: 1500,
	Stever: 800,
	Seseke: 800,
	Alme: 800,
}

async function tileLines(z, x, y, names, classes = ["river"]) {
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
		if (!classes.includes(f.properties.class) || !names.includes(name)) continue
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

/** Heutige Verläufe grob, als Leitlinie für die Feinsuche. */
async function guides() {
	const out = {}
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
			out[name] = simplify(chain(lines), 0.0015)
		}
	}
	return out
}

// --- Feinsuche -------------------------------------------------------------

const MERC = 20037508.342789244
const toMerc = (px) => (px / (TILE * 2 ** Z)) * 2 * MERC - MERC
const toMercY = (py) => MERC - (py / (TILE * 2 ** Z)) * 2 * MERC

/** WMS-Kachel der Uraufnahme laden, auf der Platte zwischengespeichert. */
async function download(bx, by) {
	const file = join(CACHE, `${bx}_${by}.jpg`)
	if (existsSync(file)) return readFileSync(file)
	const bbox = [
		toMerc(bx * BLOCK),
		toMercY((by + 1) * BLOCK),
		toMerc((bx + 1) * BLOCK),
		toMercY(by * BLOCK),
	].join(",")
	const url = `${URAUFNAHME}&BBOX=${bbox}&WIDTH=${BLOCK}&HEIGHT=${BLOCK}`
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(url).catch(() => null)
		const type = res?.headers.get("content-type") ?? ""
		if (res?.ok && type.includes("jpeg")) {
			const buf = Buffer.from(await res.arrayBuffer())
			writeFileSync(file, buf)
			return buf
		}
		if (attempt >= 4) throw new Error(`Uraufnahme ${bx}_${by}: ${res?.status}`)
		await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
	}
}

const inNrw = (bx, by) => {
	const [w, n] = pixelToLonLat(bx * BLOCK, by * BLOCK, Z)
	const [e, s] = pixelToLonLat((bx + 1) * BLOCK, (by + 1) * BLOCK, Z)
	return e > NRW[0] && w < NRW[2] && n > NRW[1] && s < NRW[3]
}

/** Mehrere Kacheln parallel vorladen (sechs gleichzeitig). */
async function prefetch(list) {
	const queue = list.filter(([bx, by]) => inNrw(bx, by))
	await Promise.all(
		Array.from({ length: 6 }, async () => {
			while (queue.length) await download(...queue.shift())
		}),
	)
}

/** Eine WMS-Kachel der Uraufnahme als Wasserwert je Pixel, null außerhalb. */
const blocks = new Map()
async function uraBlock(bx, by) {
	const key = `${bx}_${by}`
	if (blocks.has(key)) return blocks.get(key)
	let result = null
	if (inNrw(bx, by)) {
		const buf = await download(bx, by)
		result = waterScore(jpeg.decode(buf, { useTArray: true }))
	}
	blocks.set(key, result)
	if (blocks.size > 150) blocks.delete(blocks.keys().next().value)
	return result
}

/**
 * Wasserwert 0–1 je Pixel (score) und Anteil flächigen Wassers (wide), NaN
 * außerhalb der Karte (weiß). Flussflächen sind blass blaugrau: Blau minus
 * Grün um −5, Papier um −46, Straßen um −20. Schwarze Schrift hat ähnliche
 * Werte und zählt nicht. Blaue Uferlinien (Blau über Rot) zählen mit.
 * Andere Blätter zeichnen Flüsse blassgrün oder grau; dort findet das nichts,
 * und der Abschnitt fällt auf den heutigen Lauf zurück.
 */
function waterScore({ data, width, height }) {
	const n = width * height
	const fill = new Float32Array(n)
	const bank = new Float32Array(n)
	let valid = 0
	for (let i = 0; i < n; i++) {
		const r = data[i * 4]
		const g = data[i * 4 + 1]
		const b = data[i * 4 + 2]
		if (r > 240 && g > 240 && b > 240) {
			fill[i] = Number.NaN
			bank[i] = Number.NaN
			continue
		}
		valid++
		const lum = (r + g + b) / 3
		fill[i] = lum < 90 ? 0 : clamp01((b - g + 28) / 22)
		bank[i] = clamp01((b - r + 5) / 25)
	}
	if (valid < n * 0.01) return null
	const px = new Float32Array(n)
	for (let i = 0; i < n; i++) px[i] = Math.max(fill[i], bank[i])
	// Mittel über 7×7 Pixel (rund 20 m): Ufer und Fläche zusammen ergeben ein
	// kräftiges Band, eine Blattnaht von 1–2 Pixeln bleibt schwach
	const mean = boxMean(
		boxMean(px, width, height, 3, true),
		width,
		height,
		3,
		false,
	)
	// Mittel über 15×15 Pixel (rund 45 m): hoch nur bei flächigem Wasser, nicht
	// bei Gräben, Feldrainen oder Festungsgräben aus dünnen blauen Linien
	const wide = boxMean(
		boxMean(px, width, height, 7, true),
		width,
		height,
		7,
		false,
	)
	const score = new Float32Array(n)
	for (let i = 0; i < n; i++) {
		score[i] = Number.isNaN(fill[i])
			? Number.NaN
			: clamp01((mean[i] - 0.12) / 0.3)
	}
	return { score, wide }
}

/** Gleitendes Mittel über 2r+1 Pixel in einer Richtung, NaN wird übergangen. */
function boxMean(src, width, height, r, horizontal) {
	const out = new Float32Array(src.length)
	const len = horizontal ? width : height
	const lines = horizontal ? height : width
	const stride = horizontal ? 1 : width
	for (let l = 0; l < lines; l++) {
		const base = horizontal ? l * width : l
		let sum = 0
		let cnt = 0
		const add = (q, sign) => {
			const v = src[base + q * stride]
			if (!Number.isNaN(v)) {
				sum += sign * v
				cnt += sign
			}
		}
		for (let q = 0; q < Math.min(r, len); q++) add(q, 1)
		for (let p = 0; p < len; p++) {
			if (p + r < len) add(p + r, 1)
			if (p - r - 1 >= 0) add(p - r - 1, -1)
			out[base + p * stride] = cnt ? sum / cnt : Number.NaN
		}
	}
	return out
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Heutige OSM-Linien des Flusses im Ausschnitt, Zoom 13, als Weltpixel. */
const osmTiles = new Map()
async function osmLines(name, px0, py0, px1, py1) {
	const z = 13
	const k = 2 ** (Z - z)
	const out = []
	for (
		let y = Math.floor(py0 / k / TILE);
		y <= Math.floor(py1 / k / TILE);
		y++
	) {
		for (
			let x = Math.floor(px0 / k / TILE);
			x <= Math.floor(px1 / k / TILE);
			x++
		) {
			const key = `${x}_${y}`
			if (!osmTiles.has(key)) {
				osmTiles.set(
					key,
					// Kleine Flüsse sind in OSM teils als Bach erfasst
					await tileLines(z, x, y, Object.keys(CORRIDOR_M), [
						"river",
						"stream",
					]),
				)
			}
			for (const l of osmTiles.get(key)) {
				if (l.name === name)
					out.push(l.coords.map(([lo, la]) => lonLatToPixel(lo, la, Z)))
			}
		}
	}
	return out
}

/** Binärer Heap über Knotennummern mit Priorität, auf typisierten Arrays. */
class Heap {
	constructor() {
		this.ids = new Int32Array(1 << 16)
		this.pri = new Float64Array(1 << 16)
		this.size = 0
		this.top = -1
		this.topP = 0
	}
	push(id, p) {
		if (this.size === this.ids.length) {
			const ids = new Int32Array(this.size * 2)
			const pri = new Float64Array(this.size * 2)
			ids.set(this.ids)
			pri.set(this.pri)
			this.ids = ids
			this.pri = pri
		}
		const { ids, pri } = this
		let i = this.size++
		while (i > 0) {
			const parent = (i - 1) >> 1
			if (pri[parent] <= p) break
			ids[i] = ids[parent]
			pri[i] = pri[parent]
			i = parent
		}
		ids[i] = id
		pri[i] = p
	}
	/** Kleinstes Element nach top und topP. */
	pop() {
		const { ids, pri } = this
		this.top = ids[0]
		this.topP = pri[0]
		const n = --this.size
		const lastId = ids[n]
		const lastP = pri[n]
		if (n) {
			let i = 0
			for (;;) {
				let c = 2 * i + 1
				if (c >= n) break
				if (c + 1 < n && pri[c + 1] < pri[c]) c++
				if (pri[c] >= lastP) break
				ids[i] = ids[c]
				pri[i] = pri[c]
				i = c
			}
			ids[i] = lastId
			pri[i] = lastP
		}
	}
}

/** Punkte der Leitlinie in festen Abständen (Weltpixel Z). */
function stations(guide, stepPx) {
	const pts = guide.map(([lo, la]) => lonLatToPixel(lo, la, Z))
	const out = [pts[0]]
	let carry = 0
	for (let i = 1; i < pts.length; i++) {
		const [x0, y0] = pts[i - 1]
		const [x1, y1] = pts[i]
		const len = Math.hypot(x1 - x0, y1 - y0)
		let t = stepPx - carry
		while (t <= len) {
			out.push([x0 + ((x1 - x0) * t) / len, y0 + ((y1 - y0) * t) / len])
			t += stepPx
		}
		carry = len - (t - stepPx)
	}
	const last = pts.at(-1)
	if (Math.hypot(last[0] - out.at(-1)[0], last[1] - out.at(-1)[1]) > stepPx / 3)
		out.push(last)
	else out[out.length - 1] = last
	return { pts, stations: out }
}

function distToPolyline(x, y, line) {
	let best = Infinity
	for (let i = 1; i < line.length; i++) {
		const [ax, ay] = line[i - 1]
		const [bx, by] = line[i]
		const dx = bx - ax
		const dy = by - ay
		const l2 = dx * dx + dy * dy || 1e-9
		const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2))
		const d = Math.hypot(x - ax - t * dx, y - ay - t * dy)
		if (d < best) best = d
	}
	return best
}

/**
 * Feiner Lauf eines Flusses: Abschnitt für Abschnitt der günstigste Weg
 * von Tor zu Tor (Linie quer zur Leitlinie an jeder Station).
 */
async function refine(name, guide) {
	const lat = guide[Math.floor(guide.length / 2)][1]
	const mpp = metersPerPixel(lat, Z)
	const corridor = CORRIDOR_M[name] / mpp
	const { pts, stations: st } = stations(guide, STEP_M / mpp)
	const out = []
	const kinds = []
	let start = null
	const from = Number(process.env.DEBUG_FROM ?? 0)
	for (let k = from; k + 1 < st.length; k++) {
		const a = st[k]
		const b = st[k + 1]
		// Leitlinie zwischen den Stationen, etwas darüber hinaus
		const guideLine = localGuide(pts, a, b)
		const xs = guideLine.map((p) => p[0])
		const ys = guideLine.map((p) => p[1])
		if (start) {
			xs.push(start[0])
			ys.push(start[1])
		}
		const x0 = Math.floor(Math.min(...xs) - corridor - 4)
		const y0 = Math.floor(Math.min(...ys) - corridor - 4)
		const W = Math.ceil(Math.max(...xs) + corridor + 4) - x0
		const H = Math.ceil(Math.max(...ys) + corridor + 4) - y0
		const n = W * H
		// Korridor
		const inside = new Uint8Array(n)
		for (let y = 0; y < H; y += 4) {
			for (let x = 0; x < W; x += 4) {
				// grob prüfen, dann fein in 4×4-Blöcken
				const d = distToPolyline(x0 + x + 2, y0 + y + 2, guideLine)
				if (d > corridor + 4) continue
				for (let yy = y; yy < Math.min(H, y + 4); yy++)
					for (let xx = x; xx < Math.min(W, x + 4); xx++)
						if (
							d < corridor - 4 ||
							distToPolyline(x0 + xx, y0 + yy, guideLine) <= corridor
						)
							inside[yy * W + xx] = 1
			}
		}
		// Heutiger Lauf als Raster: Farbprobe und Ersatz, wo die Uraufnahme fehlt
		const osm = new Uint8Array(n)
		for (const l of await osmLines(name, x0, y0, x0 + W, y0 + H)) {
			for (let i = 1; i < l.length; i++) {
				const [ax, ay] = l[i - 1]
				const [bx, by] = l[i]
				const steps = Math.ceil(Math.hypot(bx - ax, by - ay)) + 1
				for (let s = 0; s <= steps; s++) {
					const x = Math.round(ax + ((bx - ax) * s) / steps - x0)
					const y = Math.round(ay + ((by - ay) * s) / steps - y0)
					for (let dy = -1; dy <= 1; dy++)
						for (let dx = -1; dx <= 1; dx++) {
							const xx = x + dx
							const yy = y + dy
							if (xx >= 0 && yy >= 0 && xx < W && yy < H) osm[yy * W + xx] = 1
						}
				}
			}
		}
		// Wasserwert der Uraufnahme, Kacheln vorab parallel laden
		const needed = []
		for (
			let by = Math.floor(y0 / BLOCK);
			by <= Math.floor((y0 + H) / BLOCK);
			by++
		) {
			for (
				let bx = Math.floor(x0 / BLOCK);
				bx <= Math.floor((x0 + W) / BLOCK);
				bx++
			) {
				const cx1 = Math.min(W, (bx + 1) * BLOCK - x0)
				const cy1 = Math.min(H, (by + 1) * BLOCK - y0)
				scan: for (let y = Math.max(0, by * BLOCK - y0); y < cy1; y += 4)
					for (let x = Math.max(0, bx * BLOCK - x0); x < cx1; x += 4)
						if (inside[y * W + x]) {
							needed.push([bx, by])
							break scan
						}
			}
		}
		await prefetch(needed)
		const blue = new Float32Array(n).fill(Number.NaN)
		const wide = new Float32Array(n)
		for (
			let by = Math.floor(y0 / BLOCK);
			by <= Math.floor((y0 + H) / BLOCK);
			by++
		) {
			for (
				let bx = Math.floor(x0 / BLOCK);
				bx <= Math.floor((x0 + W) / BLOCK);
				bx++
			) {
				const cx0 = Math.max(0, bx * BLOCK - x0)
				const cy0 = Math.max(0, by * BLOCK - y0)
				const cx1 = Math.min(W, (bx + 1) * BLOCK - x0)
				const cy1 = Math.min(H, (by + 1) * BLOCK - y0)
				// nur Kacheln, die den Korridor berühren
				let touches = false
				for (let y = cy0; y < cy1 && !touches; y += 4)
					for (let x = cx0; x < cx1; x += 4)
						if (inside[y * W + x]) {
							touches = true
							break
						}
				if (!touches) continue
				const blk = await uraBlock(bx, by)
				if (!blk) continue
				for (let y = cy0; y < cy1; y++) {
					const sy = y0 + y - by * BLOCK
					for (let x = cx0; x < cx1; x++) {
						const j = sy * BLOCK + (x0 + x - bx * BLOCK)
						blue[y * W + x] = blk.score[j]
						wide[y * W + x] = blk.wide[j]
					}
				}
			}
		}
		const costOf = (useMap) => {
			const cost = new Float32Array(n)
			for (let i = 0; i < n; i++) {
				if (!inside[i]) cost[i] = Infinity
				else if (!useMap || Number.isNaN(blue[i])) cost[i] = osm[i] ? 1 : 200
				else cost[i] = 1 + 199 * (1 - blue[i]) ** 3
			}
			return cost
		}
		// Tore quer zur Leitlinie: Richtung der Leitlinie rund 300 m um die Station
		const gate = (s) => {
			const back = pointAlong(pts, s, -300 / mpp)
			const fwd = pointAlong(pts, s, 300 / mpp)
			const dx = fwd[0] - back[0]
			const dy = fwd[1] - back[1]
			const l = Math.hypot(dx, dy) || 1
			return { p: s, ux: dx / l, uy: dy / l }
		}
		const onGate = (g, i, lo, hi) => {
			const x = x0 + (i % W) - g.p[0]
			const y = y0 + Math.floor(i / W) - g.p[1]
			const along = x * g.ux + y * g.uy
			return (
				along >= lo && along < hi && Math.abs(x * g.uy - y * g.ux) <= corridor
			)
		}
		const ga = gate(a)
		const gb = gate(b)
		const search = (cost) => {
			const dist = new Float64Array(n).fill(Infinity)
			const prev = new Int32Array(n).fill(-1)
			const heap = new Heap()
			if (start) {
				const i = Math.round(start[1] - y0) * W + Math.round(start[0] - x0)
				if (cost[i] === Infinity) cost[i] = 200
				dist[i] = 0
				heap.push(i, 0)
			} else {
				for (let i = 0; i < n; i++) {
					if (inside[i] && onGate(ga, i, -1.5, 0)) {
						dist[i] = cost[i]
						heap.push(i, cost[i])
					}
				}
			}
			const SQ2 = Math.SQRT2
			while (heap.size) {
				heap.pop()
				const u = heap.top
				const du = heap.topP
				if (du > dist[u]) continue
				if (onGate(gb, u, 0, 1.5)) {
					const seg = []
					for (let i = u; i >= 0; i = prev[i]) seg.push(i)
					return seg.reverse()
				}
				const ux = u % W
				const uy = (u - ux) / W
				for (let dy = -1; dy <= 1; dy++) {
					const vy = uy + dy
					if (vy < 0 || vy >= H) continue
					for (let dx = -1; dx <= 1; dx++) {
						if (!dx && !dy) continue
						const vx = ux + dx
						if (vx < 0 || vx >= W) continue
						const v = vy * W + vx
						const c = cost[v]
						if (c === Infinity) continue
						const nd = du + ((c + cost[u]) / 2) * (dx && dy ? SQ2 : 1)
						if (nd < dist[v]) {
							dist[v] = nd
							prev[v] = u
							heap.push(v, nd)
						}
					}
				}
			}
			return null
		}
		// Kaum Wasser im Korridor erkannt: Blatt ohne blaue Flüsse, gleich der heutige Lauf
		let wetPixels = 0
		let insidePixels = 0
		for (let i = 0; i < n; i++) {
			if (!inside[i]) continue
			insidePixels++
			if (blue[i] >= 0.4) wetPixels++
		}
		const tryMap = FROM_MAP.includes(name) && wetPixels > insidePixels * 0.005
		let cost = costOf(tryMap)
		let seg = search(cost)
		// Liegt der Weg nicht überwiegend auf erkanntem Wasser, hat die Karte
		// hier nichts hergegeben: dann der heutige Lauf
		let fromMap = false
		if (seg && tryMap) {
			let mapped = 0
			let wet = 0
			let broad = 0
			for (const i of seg) {
				if (Number.isNaN(blue[i])) continue
				mapped++
				if (blue[i] >= 0.4) wet++
				if (wide[i] >= WIDE_MIN) broad++
			}
			if (process.env.DEBUG_QUALITY)
				console.log(
					`Q ${name} ${k} ${pixelToLonLat(x0 + W / 2, y0 + H / 2, Z).map((v) => v.toFixed(3))} wet ${(wet / mapped).toFixed(2)} broad ${(broad / mapped).toFixed(2)}`,
				)
			fromMap =
				mapped > seg.length / 2 &&
				wet >= mapped * 0.8 &&
				broad >= mapped * BROAD_SHARE
		}
		if (tryMap && !fromMap) {
			cost = costOf(false)
			seg = search(cost)
		}
		if (!seg) {
			console.warn(`  ${name} Abschnitt ${k}: kein Weg, Leitlinie übernommen`)
			for (const p of localGuide(pts, a, b)) {
				out.push(p)
				kinds.push("osm")
			}
			start = b
			continue
		}
		if (process.env.DEBUG_RIVER === name) {
			const { encode } = await import("fast-png")
			const img = new Uint8Array(n * 3)
			for (let i = 0; i < n; i++) {
				const v = cost[i] === Infinity ? 0 : 255 - Math.min(255, cost[i] * 1.2)
				img[i * 3] = img[i * 3 + 1] = img[i * 3 + 2] = v
				if (Number.isNaN(blue[i]) && inside[i]) img[i * 3 + 2] = 255
			}
			for (const i of seg) {
				img[i * 3] = 255
				img[i * 3 + 1] = img[i * 3 + 2] = 0
			}
			writeFileSync(
				join(CACHE, `../debug-${name}-${k}.png`),
				encode({ width: W, height: H, data: img, channels: 3 }),
			)
		}
		for (const i of seg) {
			out.push([x0 + (i % W) + 0.5, y0 + Math.floor(i / W) + 0.5])
			kinds.push(fromMap && !Number.isNaN(blue[i]) ? "uraufnahme" : "osm")
		}
		const end = seg.at(-1)
		start = [x0 + (end % W), y0 + Math.floor(end / W)]
		if (k % 5 === 0)
			process.stdout.write(`  ${name} ${k + 1}/${st.length - 1}\r`)
	}
	return { pts: out, kinds }
}

function nearestIdx(line, p) {
	let best = 0
	let bd = Infinity
	line.forEach((q, i) => {
		const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2
		if (d < bd) {
			bd = d
			best = i
		}
	})
	return best
}

/** Punkt auf der Linie, d Pixel vor (d > 0) oder hinter s. */
function pointAlong(pts, s, d) {
	// Fußpunkt von s auf der Linie
	let best = { i: 1, t: 0, d: Infinity }
	for (let i = 1; i < pts.length; i++) {
		const [ax, ay] = pts[i - 1]
		const [bx, by] = pts[i]
		const dx = bx - ax
		const dy = by - ay
		const l2 = dx * dx + dy * dy || 1e-9
		const t = Math.max(
			0,
			Math.min(1, ((s[0] - ax) * dx + (s[1] - ay) * dy) / l2),
		)
		const dd = Math.hypot(s[0] - ax - t * dx, s[1] - ay - t * dy)
		if (dd < best.d) best = { i, t, d: dd }
	}
	let { i, t } = best
	let rest = Math.abs(d)
	const stepDir = d >= 0 ? 1 : -1
	let [x, y] = [
		pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]),
		pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1]),
	]
	for (;;) {
		const next = stepDir > 0 ? pts[i] : pts[i - 1]
		const l = Math.hypot(next[0] - x, next[1] - y)
		if (l >= rest)
			return [x + ((next[0] - x) * rest) / l, y + ((next[1] - y) * rest) / l]
		rest -= l
		;[x, y] = next
		i += stepDir
		if (i < 1 || i >= pts.length) return next
	}
}

/** Leitlinie zwischen den Punkten, die a und b am nächsten liegen, verlängert. */
function localGuide(pts, a, b) {
	const i = nearestIdx(pts, a)
	const j = nearestIdx(pts, b)
	const lo = Math.max(0, Math.min(i, j) - 2)
	const hi = Math.min(pts.length - 1, Math.max(i, j) + 2)
	return [a, ...pts.slice(lo, hi + 1), b]
}

/** Gleitendes Mittel gegen die Pixeltreppe, dann vereinfachen. */
function finish({ pts, kinds }, tolPx) {
	const R = 3
	const smooth = pts.map((_, i) => {
		let sx = 0
		let sy = 0
		let c = 0
		for (
			let j = Math.max(0, i - R);
			j <= Math.min(pts.length - 1, i + R);
			j++
		) {
			sx += pts[j][0]
			sy += pts[j][1]
			c++
		}
		return [sx / c, sy / c]
	})
	// Teilstücke gleicher Herkunft getrennt vereinfachen
	const coords = []
	const parts = []
	let s = 0
	for (let i = 1; i <= smooth.length; i++) {
		if (i < smooth.length && kinds[i] === kinds[s]) continue
		const seg = simplify(
			smooth.slice(s, i + (i < smooth.length ? 1 : 0)),
			tolPx,
		)
		const from = coords.length ? coords.length - 1 : 0
		for (const p of coords.length ? seg.slice(1) : seg) coords.push(p)
		parts.push([from, coords.length - 1, kinds[s]])
		s = i
	}
	const ll = coords.map(([x, y]) => {
		const [lon, lat] = pixelToLonLat(x, y, Z)
		return [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]
	})
	return { coords: ll, parts }
}

/**
 * Römerzeitliche Abschnitte, die von der Uraufnahme abweichen. Bewusst
 * ungefähr; die Karte zeichnet sie gestrichelt.
 *
 * Rhein bei Xanten: Gerlach, Meurers-Balke & Kalis 2022 (Netherlands Journal
 * of Geosciences 101, e14) und Klostermann 1986. Der Hauptstrom lief über die
 * Mäanderbahn bei Büderich und Alpen-Drüpt, östlich am Fürstenberg (Vetera I)
 * und nördlich an Vetera II vorbei und dann als Prallhang direkt an der
 * Ostmauer der Colonia Ulpia Traiana entlang. In diesem Bett fließt heute die
 * Pistley (Verlauf aus OSM). Der Xantener Altrhein ist jünger (um 1200–1788).
 * Die Lippe mündete schon damals etwa bei Wesel.
 *
 * Lippe bei Haltern: LWL-Archäologie 2023, Grabung Hofestatt. Bis 1547/48 floss
 * die Lippe am Fuß der Hofestatt-Terrasse, danach rund 900 m weiter südlich.
 */
const ROMAN = [
	{
		river: "Rhein",
		coords: [
			[6.604, 51.643],
			[6.585, 51.638],
			[6.565, 51.633],
			[6.548, 51.626],
			[6.525, 51.627],
			[6.502, 51.635],
			[6.488, 51.645],
			[6.488, 51.655],
			[6.476, 51.661],
			[6.45871, 51.6624],
			[6.45661, 51.66372],
			[6.45603, 51.66428],
			[6.45547, 51.66451],
			[6.45564, 51.66472],
			[6.4557, 51.66505],
			[6.4553, 51.66552],
			[6.45479, 51.66641],
			[6.45468, 51.66691],
			[6.45383, 51.66881],
			[6.45149, 51.66949],
			[6.44428, 51.67131],
			[6.44328, 51.67148],
			[6.44228, 51.67153],
			[6.44136, 51.67146],
			[6.43997, 51.67185],
			[6.43743, 51.67241],
			[6.43697, 51.67267],
			[6.43645, 51.67321],
			[6.4359, 51.67458],
			[6.43493, 51.67523],
			[6.43, 51.67672],
			[6.42768, 51.67802],
			[6.4266, 51.67964],
			[6.42632, 51.68032],
			[6.42627, 51.68112],
			[6.42563, 51.68322],
			[6.4253, 51.68401],
			[6.42586, 51.68439],
			[6.42591, 51.68453],
			[6.42502, 51.68558],
			[6.42474, 51.6862],
			[6.42455, 51.68704],
			[6.42443, 51.68792],
			[6.42473, 51.68817],
			[6.42492, 51.6888],
			[6.42546, 51.68917],
			[6.42409, 51.69202],
			[6.42221, 51.69418],
			[6.4208, 51.69383],
			[6.42019, 51.69388],
			[6.41993, 51.69403],
			[6.41935, 51.69469],
			[6.41855, 51.69526],
			[6.41835, 51.69566],
			[6.41785, 51.69795],
			[6.41668, 51.7022],
			[6.41641, 51.70284],
			[6.41567, 51.70365],
			[6.408, 51.72],
			[6.4, 51.735],
			[6.392, 51.752],
		],
	},
	{
		river: "Lippe",
		coords: [
			[7.1935, 51.7368],
			[7.186, 51.7377],
			[7.179, 51.7377],
			[7.1728, 51.7372],
			[7.1665, 51.7348],
			[7.1615, 51.7298],
			[7.1588, 51.7253],
		],
	},
]

/** Abschnitt zwischen den nächsten Punkten zu Anfang und Ende ersetzen. */
/**
 * Rekonstruktionen aus der Literatur sind teils nur alle 1–2 km belegt. Eine
 * Catmull-Rom-Spline durch die Punkte, alle ROUND_M ein Zwischenpunkt, macht
 * daraus einen Lauf ohne Knicke. Die belegten Punkte bleiben erhalten.
 */
const ROUND_M = 150
function rounded(coords) {
	const k = Math.cos((coords[0][1] * Math.PI) / 180)
	const out = []
	const p = [coords[0], ...coords, coords.at(-1)]
	for (let i = 1; i < p.length - 2; i++) {
		const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]]
		const m = Math.hypot((p2[0] - p1[0]) * k, p2[1] - p1[1]) * 111320
		const n = Math.max(1, Math.round(m / ROUND_M))
		for (let s = 0; s < n; s++) {
			const t = s / n
			const t2 = t * t
			const t3 = t2 * t
			out.push(
				[0, 1].map((c) =>
					Number(
						(
							0.5 *
							(2 * p1[c] +
								(p2[c] - p0[c]) * t +
								(2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 +
								(3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * t3)
						).toFixed(5),
					),
				),
			)
		}
	}
	out.push(coords.at(-1))
	return out
}

function splice(river, coords, kind) {
	const kinds = []
	for (const [from, to, k] of river.parts)
		for (let i = from; i <= to; i++) kinds[i] = k
	const near = (p) => nearestIdx(river.coords, p)
	let i = near(coords[0])
	let j = near(coords.at(-1))
	let seg = coords
	if (i > j) {
		;[i, j] = [j, i]
		seg = [...coords].reverse()
	}
	const pts = [
		...river.coords.slice(0, i),
		...seg,
		...river.coords.slice(j + 1),
	]
	const ks = [
		...kinds.slice(0, i),
		...seg.map(() => kind),
		...kinds.slice(j + 1),
	]
	// Teilstücke teilen sich den Randpunkt, damit die Linie durchgeht
	const parts = []
	let s = 0
	for (let x = 1; x <= ks.length; x++) {
		if (x < ks.length && ks[x] === ks[s]) continue
		parts.push([Math.max(0, s - 1), x - 1, ks[s]])
		s = x
	}
	return { coords: pts, parts }
}

mkdirSync(CACHE, { recursive: true })
// Flussnamen als Argumente bauen nur diese neu; --roemisch setzt nur die
// römerzeitlichen Abschnitte in den vorhandenen Stand ein
const args = process.argv.slice(2)
const onlyRoman = args.includes("--roemisch")
const only = args.filter((a) => !a.startsWith("--"))
const target = join(ROOT, "src/data/fluesse.json")
const previous = existsSync(target)
	? JSON.parse(readFileSync(target, "utf8"))
	: {}
const guide = onlyRoman ? previous : await guides()
const result = {}
for (const [name, g] of Object.entries(guide)) {
	if (onlyRoman) {
		result[name] = previous[name]
		continue
	}
	if (only.length && !only.includes(name)) {
		if (previous[name]) result[name] = previous[name]
		continue
	}
	const t = Date.now()
	const fine = finish(await refine(name, g), 1.5)
	result[name] = fine
	console.log(
		`${name}: ${fine.coords.length} Punkte, ${fine.parts.length} Teilstücke, ${Math.round((Date.now() - t) / 1000)} s`,
	)
}
for (const { river, coords } of ROMAN) {
	if (result[river]?.parts)
		result[river] = splice(result[river], rounded(coords), "roemisch")
}
if (!process.env.DRY) writeFileSync(target, `${JSON.stringify(result)}\n`)
