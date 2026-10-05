import { haversine } from "../geo"
import { cellAt, cellCenter } from "./model"

/**
 * Mögliche Marschrouten zwischen bekannten Lagern als Weg geringster
 * Kosten (Least-Cost-Path) über das Analyse-Raster.
 *
 * Kosten je Zelle = Gehzeit nach Toblers Wanderfunktion (Tobler 1993:
 * v = 6·e^(−3,5·|tan θ + 0,05|) km/h), gemittelt für bergauf und bergab,
 * mit Aufschlägen für Flussquerungen, nasse Niederungen und steiles
 * Gelände. Das ist ein Modell für Fußtruppen mit Tross, keine
 * Rekonstruktion belegter Wege.
 */

export const ROUTE_PARAMS = {
	mergeRadius: 3000, // Lager näher als das zählen als ein Knoten
	minPair: 8000,
	maxPair: 75000,
	neighbors: 3, // Verbindungen je Lager zu den nächsten Nachbarn
	// Spannbaum ergänzen, damit jedes Lager im Raster am Netz hängt
	connect: false,
	stageSearch: 3000, // Suchradius um einen Etappenpunkt
	riverPenalty: 4,
	streamPenalty: 1.5,
	wetPenalty: 2.5,
	steepPenalty: 4,
	// Trockene Talränder an großen Flüssen: Leitlinie und Nachschubweg
	valleyBonus: 0.8,
	valleyDistance: 3000,
}

function tobler(tanSlope) {
	const up = 6 * Math.exp(-3.5 * Math.abs(tanSlope + 0.05))
	const down = 6 * Math.exp(-3.5 * Math.abs(-tanSlope + 0.05))
	return (up + down) / 2
}

/** Stunden je Meter für jede Zelle. */
export function costSurface(
	grid,
	{ slope, tpi, distWater, distRiver },
	p = ROUTE_PARAMS,
) {
	const n = grid.cols * grid.rows
	const cost = new Float32Array(n)
	const onWater = grid.cellMeters * 0.75
	for (let i = 0; i < n; i++) {
		const tan = Math.tan((slope[i] * Math.PI) / 180)
		let c = 1 / (tobler(tan) * 1000)
		if (distRiver[i] < onWater) c *= p.riverPenalty
		else if (distWater[i] < onWater) c *= p.streamPenalty
		// Aue/Bruch: tief, flach, nah am Wasser
		if (tpi[i] < -2 && slope[i] < 1 && distWater[i] < 400) c *= p.wetPenalty
		if (slope[i] > 15) c *= p.steepPenalty
		else if (
			distRiver[i] >= onWater &&
			distRiver[i] < p.valleyDistance &&
			tpi[i] >= -2
		)
			c *= p.valleyBonus
		cost[i] = c
	}
	return cost
}

class Heap {
	constructor() {
		this.ids = []
		this.keys = []
	}
	get size() {
		return this.ids.length
	}
	push(id, key) {
		const { ids, keys } = this
		let i = ids.length
		ids.push(id)
		keys.push(key)
		while (i > 0) {
			const p = (i - 1) >> 1
			if (keys[p] <= key) break
			ids[i] = ids[p]
			keys[i] = keys[p]
			i = p
		}
		ids[i] = id
		keys[i] = key
	}
	pop() {
		const { ids, keys } = this
		const top = ids[0]
		const lastId = ids.pop()
		const lastKey = keys.pop()
		if (ids.length) {
			let i = 0
			while (true) {
				let c = 2 * i + 1
				if (c >= ids.length) break
				if (c + 1 < ids.length && keys[c + 1] < keys[c]) c++
				if (keys[c] >= lastKey) break
				ids[i] = ids[c]
				keys[i] = keys[c]
				i = c
			}
			ids[i] = lastId
			keys[i] = lastKey
		}
		return top
	}
}

const STEPS = [
	[-1, -1, Math.SQRT2],
	[0, -1, 1],
	[1, -1, Math.SQRT2],
	[-1, 0, 1],
	[1, 0, 1],
	[-1, 1, Math.SQRT2],
	[0, 1, 1],
	[1, 1, Math.SQRT2],
]

/** Dijkstra von einer Zelle aus, bis alle Ziele erreicht sind. */
export function dijkstra(grid, cost, start, targets) {
	const { cols, rows, cellMeters } = grid
	const n = cols * rows
	const dist = new Float64Array(n).fill(Number.POSITIVE_INFINITY)
	const prev = new Int32Array(n).fill(-1)
	const done = new Uint8Array(n)
	const open = new Set(targets)
	const heap = new Heap()
	dist[start] = 0
	heap.push(start, 0)
	while (heap.size && open.size) {
		const c = heap.pop()
		if (done[c]) continue
		done[c] = 1
		open.delete(c)
		const cx = c % cols
		const cy = (c - cx) / cols
		for (const [dx, dy, len] of STEPS) {
			const nx = cx + dx
			const ny = cy + dy
			if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
			const nb = ny * cols + nx
			if (done[nb]) continue
			const d = dist[c] + ((cost[c] + cost[nb]) / 2) * len * cellMeters
			if (d < dist[nb]) {
				dist[nb] = d
				prev[nb] = c
				heap.push(nb, d)
			}
		}
	}
	return { dist, prev }
}

/**
 * Lager zu Knoten zusammenfassen (Haltern hat sechs Anlagen). Lager
 * außerhalb des Rasters bleiben als Ziel erhalten, Routen dorthin enden
 * am Rand.
 */
export function campNodes(grid, camps, mergeRadius = ROUTE_PARAMS.mergeRadius) {
	const nodes = []
	for (const camp of camps) {
		const cell = cellAt(grid, camp.lon, camp.lat)
		const near = nodes.find(
			(n) => haversine(n.lon, n.lat, camp.lon, camp.lat) < mergeRadius,
		)
		if (near) near.names.push(camp.name)
		else
			nodes.push({
				cell,
				outside: cell < 0,
				lon: camp.lon,
				lat: camp.lat,
				names: [camp.name],
			})
	}
	return nodes
}

/** Paare: jedes Lager im Raster mit seinen nächsten Nachbarn. */
export function campPairs(nodes, p = ROUTE_PARAMS) {
	const pairs = new Map()
	nodes.forEach((a, i) => {
		if (a.outside) return
		const candidates = nodes
			.map((b, j) => ({ j, d: haversine(a.lon, a.lat, b.lon, b.lat) }))
			.filter(({ j, d }) => j !== i && d >= p.minPair && d <= p.maxPair)
			.sort((x, y) => x.d - y.d)
			.slice(0, p.neighbors)
		for (const { j, d } of candidates) {
			const key = `${Math.min(i, j)}-${Math.max(i, j)}`
			if (pairs.has(key)) continue
			// a liegt immer im Raster, b darf außerhalb liegen
			const [x, y] = nodes[j].outside
				? [i, j]
				: [Math.min(i, j), Math.max(i, j)]
			pairs.set(key, { a: x, b: y, crow: d })
		}
	})
	if (p.connect) connectTree(nodes, pairs)
	return [...pairs.values()]
}

/** Kruskal über alle Lager im Raster: fehlende Verbindungen ergänzen. */
function connectTree(nodes, pairs) {
	const inside = [...nodes.keys()].filter((i) => !nodes[i].outside)
	const parent = new Map(inside.map((i) => [i, i]))
	const find = (i) => {
		while (parent.get(i) !== i) i = parent.get(i)
		return i
	}
	const union = (a, b) => parent.set(find(a), find(b))
	for (const { a, b } of pairs.values()) {
		if (parent.has(a) && parent.has(b)) union(a, b)
	}
	const edges = []
	for (let x = 0; x < inside.length; x++) {
		for (let y = x + 1; y < inside.length; y++) {
			const a = nodes[inside[x]]
			const b = nodes[inside[y]]
			edges.push({
				a: inside[x],
				b: inside[y],
				d: haversine(a.lon, a.lat, b.lon, b.lat),
			})
		}
	}
	edges.sort((u, v) => u.d - v.d)
	for (const { a, b, d } of edges) {
		if (find(a) === find(b)) continue
		union(a, b)
		pairs.set(`${Math.min(a, b)}-${Math.max(a, b)}`, {
			a: Math.min(a, b),
			b: Math.max(a, b),
			crow: d,
		})
	}
}

/** Letzte Zelle im Raster auf der Luftlinie von a nach b. */
function exitCell(grid, a, b) {
	const steps = Math.ceil(
		haversine(a.lon, a.lat, b.lon, b.lat) / (grid.cellMeters / 2),
	)
	let last = a.cell
	for (let k = 1; k <= steps; k++) {
		const t = k / steps
		const cell = cellAt(
			grid,
			a.lon + (b.lon - a.lon) * t,
			a.lat + (b.lat - a.lat) * t,
		)
		if (cell < 0) break
		last = cell
	}
	return last
}

function tracePath(prev, from, to) {
	const path = [to]
	let c = to
	while (c !== from && prev[c] >= 0) {
		c = prev[c]
		path.push(c)
	}
	return c === from ? path.reverse() : null
}

/**
 * Routen zwischen den Knoten. Für Ziele außerhalb zählt vom Rand an die
 * Luftlinie mal 1,1 als Restweg.
 */
export function computeRoutes(grid, cost, camps, dayMarch, p = ROUTE_PARAMS) {
	const nodes = campNodes(grid, camps, p.mergeRadius)
	const pairs = campPairs(nodes, p)
	const bySource = new Map()
	for (const pair of pairs) {
		const b = nodes[pair.b]
		pair.target = b.outside ? exitCell(grid, nodes[pair.a], b) : b.cell
		if (!bySource.has(pair.a)) bySource.set(pair.a, [])
		bySource.get(pair.a).push(pair)
	}
	const routes = []
	for (const [a, list] of bySource) {
		const { dist, prev } = dijkstra(
			grid,
			cost,
			nodes[a].cell,
			list.map((pair) => pair.target),
		)
		for (const pair of list) {
			const b = nodes[pair.b]
			const cells = tracePath(prev, nodes[a].cell, pair.target)
			if (!cells || cells.length < 2) continue
			// Weglänge über Grund entlang der Zellmitten
			const along = [0]
			for (let k = 1; k < cells.length; k++) {
				const dx = (cells[k] % grid.cols) - (cells[k - 1] % grid.cols)
				const dy =
					Math.floor(cells[k] / grid.cols) -
					Math.floor(cells[k - 1] / grid.cols)
				along.push(along[k - 1] + Math.hypot(dx, dy) * grid.cellMeters)
			}
			const inside = along[along.length - 1]
			const [ex, ey] = cellCenter(
				grid,
				pair.target % grid.cols,
				Math.floor(pair.target / grid.cols),
			)
			const extra = b.outside ? haversine(ex, ey, b.lon, b.lat) * 1.1 : 0
			const length = inside + extra
			routes.push({
				from: nodes[a].names.join(", "),
				to: b.names.join(", "),
				partial: b.outside,
				cells,
				along,
				inside,
				length,
				crow: pair.crow,
				hours: dist[pair.target],
				days: length / dayMarch,
			})
		}
	}
	return routes
}

/** Etappenpunkte und die beste Potenzialzelle in ihrem Umkreis. */
export function routeStages(grid, routes, score, dayMarch, p = ROUTE_PARAMS) {
	const stages = []
	const k = Math.round(p.stageSearch / grid.cellMeters)
	routes.forEach((route, r) => {
		const n = Math.max(0, Math.round(route.length / dayMarch) - 1)
		for (let s = 1; s <= n; s++) {
			const target = (route.length * s) / (n + 1)
			// Etappen jenseits des Rasterrands liegen außerhalb des Ausschnitts
			if (target > route.inside) continue
			const idx = route.along.findIndex((d) => d >= target)
			const cell = route.cells[Math.max(0, idx)]
			const cx = cell % grid.cols
			const cy = Math.floor(cell / grid.cols)
			let best = cell
			for (let dy = -k; dy <= k; dy++) {
				for (let dx = -k; dx <= k; dx++) {
					if (dx * dx + dy * dy > k * k) continue
					const x = cx + dx
					const y = cy + dy
					if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) continue
					const c = y * grid.cols + x
					if (score[c] > score[best]) best = c
				}
			}
			const [lon, lat] = cellCenter(
				grid,
				best % grid.cols,
				Math.floor(best / grid.cols),
			)
			const [plon, plat] = cellCenter(grid, cx, cy)
			stages.push({
				route: r,
				from: route.from,
				to: route.to,
				stage: s,
				of: n + 1,
				km: target / 1000,
				lon,
				lat,
				score: score[best],
				offset: haversine(plon, plat, lon, lat),
			})
		}
	})
	return stages
}

/** Routen als GeoJSON für die Karte. */
export function routesGeoJSON(grid, routes) {
	return {
		type: "FeatureCollection",
		features: routes.map((route, i) => ({
			type: "Feature",
			properties: {
				id: i,
				from: route.from,
				to: route.to,
				km: Math.round(route.length / 100) / 10,
				partial: route.partial,
				crowKm: Math.round(route.crow / 100) / 10,
				days: Math.round(route.days * 10) / 10,
			},
			geometry: {
				type: "LineString",
				coordinates: route.cells.map((c) => {
					const [lon, lat] = cellCenter(
						grid,
						c % grid.cols,
						Math.floor(c / grid.cols),
					)
					return [Number(lon.toFixed(5)), Number(lat.toFixed(5))]
				}),
			},
		})),
	}
}
