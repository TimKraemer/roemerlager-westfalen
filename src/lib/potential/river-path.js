import { haversine } from "../geo"
import { Heap } from "./heap"

/**
 * Schiffsweg entlang gezeichneter Flussläufe statt über das Raster: Die
 * Linien (z. B. src/data/fluesse.json) bilden ein Netz, Mündungen hängen
 * über ihr Linienende am nächsten Punkt des anderen Flusses. Ein Lager
 * geht auf kürzestem Weg zum Ufer, von dort folgt der Weg der Linie.
 */

// Linienende so nah an einem anderen Fluss ist eine Mündung
const JOIN_M = 2000
// So nah kommen sich zwei Läufe nur, wo sie ineinander übergehen, etwa
// Lippe und Rhein dort, wo der römerzeitliche Rhein abzweigt (380 m)
const CROSS_M = 400
// Rasterweite für die Suche nach nahen Punkten, in Grad (größer als CROSS_M)
const CROSS_CELL = 0.007
// Lager weiter als das vom Fluss haben keinen Schiffsweg
const MAX_SNAP_M = 5000
// Der Weg vom Lager zum Ufer zählt bei der Wahl des Flusses mehrfach, damit
// ein Lager am nächstgelegenen Fluss ablegt
const LAND_FACTOR = 3

const M_PER_DEG = 111320

/** Netz aus Linien [[lon, lat], …]. */
export function riverGraph(lines, joinMeters = JOIN_M) {
	const coords = []
	const lineStart = []
	for (const line of lines) {
		lineStart.push(coords.length)
		for (const p of line) coords.push(p)
	}
	lineStart.push(coords.length)
	const adj = coords.map(() => [])
	const link = (u, v, w) => {
		adj[u].push([v, w])
		adj[v].push([u, w])
	}
	for (let l = 0; l < lines.length; l++) {
		for (let i = lineStart[l] + 1; i < lineStart[l + 1]; i++) {
			const [x0, y0] = coords[i - 1]
			const [x1, y1] = coords[i]
			link(i - 1, i, haversine(x0, y0, x1, y1))
		}
	}
	// Mündungen: Anfang und Ende jeder Linie an den nächsten Punkt einer anderen
	for (let l = 0; l < lines.length; l++) {
		for (const end of [lineStart[l], lineStart[l + 1] - 1]) {
			if (end < lineStart[l]) continue
			const [x, y] = coords[end]
			let best = -1
			let bestD = joinMeters
			for (let m = 0; m < lines.length; m++) {
				if (m === l) continue
				for (let i = lineStart[m]; i < lineStart[m + 1]; i++) {
					const d = haversine(x, y, coords[i][0], coords[i][1])
					if (d < bestD) {
						bestD = d
						best = i
					}
				}
			}
			if (best >= 0) link(end, best, bestD)
		}
	}
	// Wo sich zwei Läufe sehr nahe kommen, sind sie verbunden, auch abseits
	// der Linienenden. Sonst fährt ein Schiff etwa an der Lippemündung erst
	// zum Ende der Lippe und auf ihr zurück, obwohl der Rhein daneben liegt.
	const cell = (p) =>
		`${Math.floor(p[0] / CROSS_CELL)}|${Math.floor(p[1] / CROSS_CELL)}`
	const lineOf = new Int32Array(coords.length)
	const grid = new Map()
	for (let l = 0; l < lines.length; l++) {
		for (let i = lineStart[l]; i < lineStart[l + 1]; i++) {
			lineOf[i] = l
			const k = cell(coords[i])
			if (!grid.has(k)) grid.set(k, [])
			grid.get(k).push(i)
		}
	}
	for (let i = 0; i < coords.length; i++) {
		const [x, y] = coords[i]
		const cx = Math.floor(x / CROSS_CELL)
		const cy = Math.floor(y / CROSS_CELL)
		// je anderer Linie nur der nächste Punkt
		const best = new Map()
		for (let dy = -1; dy <= 1; dy++)
			for (let dx = -1; dx <= 1; dx++)
				for (const j of grid.get(`${cx + dx}|${cy + dy}`) ?? []) {
					if (lineOf[j] <= lineOf[i]) continue
					const d = haversine(x, y, coords[j][0], coords[j][1])
					if (d < CROSS_M && d < (best.get(lineOf[j])?.[1] ?? Infinity))
						best.set(lineOf[j], [j, d])
				}
		for (const [j, d] of best.values()) link(i, j, d)
	}
	return { coords, adj, lineStart }
}

/** Nächster Punkt je Linie zu [lon, lat] innerhalb von maxMeters. */
function snaps(graph, [lon, lat], maxMeters) {
	const { coords, lineStart } = graph
	const kx = M_PER_DEG * Math.cos((lat * Math.PI) / 180)
	const out = []
	for (let l = 0; l + 1 < lineStart.length; l++) {
		let best = null
		for (let i = lineStart[l] + 1; i < lineStart[l + 1]; i++) {
			const ax = (coords[i - 1][0] - lon) * kx
			const ay = (coords[i - 1][1] - lat) * M_PER_DEG
			const bx = (coords[i][0] - lon) * kx
			const by = (coords[i][1] - lat) * M_PER_DEG
			const dx = bx - ax
			const dy = by - ay
			const len2 = dx * dx + dy * dy
			const t = len2 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2)) : 0
			const d = Math.hypot(ax + dx * t, ay + dy * t)
			if (d < maxMeters && (!best || d < best.d)) best = { seg: i - 1, t, d }
		}
		if (best) {
			const [x0, y0] = coords[best.seg]
			const [x1, y1] = coords[best.seg + 1]
			best.point = [x0 + (x1 - x0) * best.t, y0 + (y1 - y0) * best.t]
			out.push(best)
		}
	}
	return out
}

/**
 * Kürzester Weg auf dem Flussnetz von a nach b ({lon, lat}), mit den
 * Stücken vom Lager zum Ufer. null, wenn ein Lager zu weit vom Fluss liegt
 * oder die Flüsse nicht verbunden sind.
 */
export function riverPath(graph, a, b, maxSnap = MAX_SNAP_M) {
	const { coords, adj } = graph
	const from = [a.lon, a.lat]
	const to = [b.lon, b.lat]
	const snapA = snaps(graph, from, maxSnap)
	const snapB = snaps(graph, to, maxSnap)
	if (!snapA.length || !snapB.length) return null

	// Zusatzknoten nur für diese Suche: Start, Ziel und die Uferpunkte
	const points = [...coords]
	const extra = new Map()
	const add = (u, v, w) => {
		for (const [x, y] of [
			[u, v],
			[v, u],
		]) {
			if (!extra.has(x)) extra.set(x, [])
			extra.get(x).push([y, w])
		}
	}
	const start = points.push(from) - 1
	const goal = points.push(to) - 1
	const bank = (snap, camp) => {
		const id = points.push(snap.point) - 1
		const [x0, y0] = coords[snap.seg]
		const [x1, y1] = coords[snap.seg + 1]
		const len = haversine(x0, y0, x1, y1)
		add(id, snap.seg, snap.t * len)
		add(id, snap.seg + 1, (1 - snap.t) * len)
		add(camp, id, snap.d * LAND_FACTOR)
		return { ...snap, id, len }
	}
	const banksA = snapA.map((s) => bank(s, start))
	const banksB = snapB.map((s) => bank(s, goal))
	// Beide Uferpunkte auf demselben Abschnitt: direkt verbinden
	for (const p of banksA)
		for (const q of banksB)
			if (p.seg === q.seg) add(p.id, q.id, Math.abs(p.t - q.t) * p.len)

	const dist = new Float64Array(points.length).fill(Number.POSITIVE_INFINITY)
	const prev = new Int32Array(points.length).fill(-1)
	const heap = new Heap()
	dist[start] = 0
	heap.push(start, 0)
	while (heap.size) {
		const u = heap.pop()
		if (u === goal) break
		const d0 = dist[u]
		for (const list of [adj[u], extra.get(u)]) {
			if (!list) continue
			for (const [v, w] of list) {
				const d = d0 + w
				if (d < dist[v]) {
					dist[v] = d
					prev[v] = u
					heap.push(v, d)
				}
			}
		}
	}
	if (!Number.isFinite(dist[goal])) return null
	const path = []
	for (let u = goal; u >= 0; u = prev[u]) path.push(points[u])
	path.reverse()
	let length = 0
	for (let k = 1; k < path.length; k++) {
		length += haversine(path[k - 1][0], path[k - 1][1], path[k][0], path[k][1])
	}
	return { coords: path, length }
}
