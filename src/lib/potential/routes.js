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
	moorPenalty: 5,
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
	{ slope, tpi, distWater, distRiver, moor },
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
		// Moore sind kaum passierbar (vgl. die Bohlenwege bei Tacitus)
		if (moor) c *= 1 + p.moorPenalty * moor[i]
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
export function dijkstra(
	grid,
	cost,
	start,
	targets,
	elev = null,
	climb = 1 / 600,
) {
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
			// Naismith: eine Stunde zusätzlich je 600 m Anstieg
			const up = elev ? Math.max(0, elev[nb] - elev[c]) * climb : 0
			const d = dist[c] + ((cost[c] + cost[nb]) / 2) * len * cellMeters + up
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
		if (near) {
			near.names.push(camp.name)
			near.ids.push(camp.id)
		} else
			nodes.push({
				cell,
				outside: cell < 0,
				lon: camp.lon,
				lat: camp.lat,
				names: [camp.name],
				ids: [camp.id],
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
			// Zwischen Lagern der Schiffskette fährt man, statt zu marschieren
			.filter(({ j }) => a.ship == null || nodes[j].ship == null)
			// Ein Lager abseits der Kette hängt nur am nächstgelegenen Hafen
			.filter(({ j }) => {
				const ship = a.ship != null ? i : nodes[j].ship != null ? j : null
				if (ship == null) return true
				const land = ship === i ? j : i
				return nearestShip(nodes, land) === ship
			})
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
	// Anlegestelle: jedes Lager abseits der Kette zu Fuß zum nächsten Hafen,
	// auch unter dem Mindestabstand (Beckinghausen–Oberaden: 2,6 km)
	nodes.forEach((n, k) => {
		if (n.outside || n.ship != null) return
		const port = nearestShip(nodes, k)
		if (port == null) return
		const d = haversine(n.lon, n.lat, nodes[port].lon, nodes[port].lat)
		if (d > 25000 || d < 500) return
		const key = `${Math.min(port, k)}-${Math.max(port, k)}`
		if (!pairs.has(key)) pairs.set(key, { a: port, b: k, crow: d })
	})
	if (p.connect) connectTree(nodes, pairs)
	return [...pairs.values()]
}

function nearestShip(nodes, k) {
	let best = null
	let bestD = Number.POSITIVE_INFINITY
	nodes.forEach((n, i) => {
		if (n.ship == null) return
		const d = haversine(n.lon, n.lat, nodes[k].lon, nodes[k].lat)
		if (d < bestD) {
			bestD = d
			best = i
		}
	})
	return best
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
	// Schiffsstrecken verbinden ihre Lager bereits
	const ship = inside.filter((i) => nodes[i].ship != null)
	for (let k = 1; k < ship.length; k++) union(ship[k - 1], ship[k])
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
		if (nodes[a].ship != null && nodes[b].ship != null) continue
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

// Höchstens 15 % Umweg über einen Fundort
const WAYPOINT_DETOUR = 1.15

/**
 * Augusteische Fundorte (Münzschätze, Militaria) nahe der Luftlinie als
 * Zwischenstation prüfen: Lohnt sich der Weg darüber (höchstens 15 % mehr
 * Strecke und Gehzeit), führt die Route hindurch. Die Funde zeigen, wo
 * Truppen zogen.
 */
function viaWaypoint(grid, cost, elev, a, b, pair, hours, wps) {
	let best = null
	for (const w of wps) {
		const dA = haversine(a.lon, a.lat, w.lon, w.lat)
		const dB = haversine(w.lon, w.lat, b.lon, b.lat)
		if (dA < 3000 || dB < 3000) continue
		if (dA + dB > pair.crow * WAYPOINT_DETOUR) continue
		const leg1 = dijkstra(grid, cost, a.cell, [w.cell], elev)
		const leg2 = dijkstra(grid, cost, w.cell, [pair.target], elev)
		const total = leg1.dist[w.cell] + leg2.dist[pair.target]
		if (!(total <= hours * WAYPOINT_DETOUR)) continue
		if (best && best.hours <= total) continue
		const c1 = tracePath(leg1.prev, a.cell, w.cell)
		const c2 = tracePath(leg2.prev, w.cell, pair.target)
		if (!c1 || !c2) continue
		best = { cells: [...c1, ...c2.slice(1)], hours: total, name: w.name }
	}
	return best
}

/**
 * Routen zwischen den Knoten. Für Ziele außerhalb zählt vom Rand an die
 * Luftlinie mal 1,1 als Restweg.
 */
export function computeRoutes(
	grid,
	cost,
	camps,
	dayMarch,
	p = ROUTE_PARAMS,
	{ distRiver, elev = null, waypoints = [] } = {},
) {
	const nodes = campNodes(grid, camps, p.mergeRadius)
	const wps = waypoints
		.map((w) => ({ ...w, cell: cellAt(grid, w.lon, w.lat) }))
		.filter((w) => w.cell >= 0)
	// Position in der Schiffskette (z. B. Lippe von Vetera bis Anreppen)
	for (const node of nodes) {
		const k = (p.shipChain ?? []).findIndex((id) => node.ids.includes(id))
		node.ship = k >= 0 && !node.outside ? k : null
	}
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
			elev,
		)
		for (const pair of list) {
			const b = nodes[pair.b]
			let cells = tracePath(prev, nodes[a].cell, pair.target)
			if (!cells || cells.length < 2) continue
			let hours = dist[pair.target]
			// Über einen augusteischen Fundort, wenn der Umweg klein bleibt
			const via = viaWaypoint(grid, cost, elev, nodes[a], b, pair, hours, wps)
			if (via) {
				cells = via.cells
				hours = via.hours
			}
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
				hours,
				via: via?.name,
				days: length / dayMarch,
			})
		}
	}
	if (distRiver) routes.push(...shipRoutes(grid, nodes, distRiver, p))
	return routes
}

/**
 * Schiffsstrecken zwischen aufeinanderfolgenden Lagern der Kette: Weg
 * entlang des Flusses (Zellen am großen Fluss kosten wenig, Land viel).
 */
function shipRoutes(grid, nodes, distRiver, p) {
	const chain = nodes
		.map((n, i) => ({ n, i }))
		.filter(({ n }) => n.ship != null)
		.sort((a, b) => a.n.ship - b.n.ship)
	const cost = new Float32Array(grid.cols * grid.rows)
	for (let i = 0; i < cost.length; i++) {
		cost[i] = distRiver[i] < grid.cellMeters * 1.5 ? 1 : 40
	}
	const routes = []
	for (let k = 1; k < chain.length; k++) {
		const a = chain[k - 1].n
		const b = chain[k].n
		const { prev } = dijkstra(grid, cost, a.cell, [b.cell])
		const cells = tracePath(prev, a.cell, b.cell)
		if (!cells) continue
		let length = 0
		for (let c = 1; c < cells.length; c++) {
			const dx = (cells[c] % grid.cols) - (cells[c - 1] % grid.cols)
			const dy =
				Math.floor(cells[c] / grid.cols) - Math.floor(cells[c - 1] / grid.cols)
			length += Math.hypot(dx, dy) * grid.cellMeters
		}
		const note = b.ids.map((id) => p.shipNotes?.[id]).find(Boolean)
		routes.push({
			mode: "Schiff",
			note,
			from: a.names.join(", "),
			to: b.names.join(", "),
			cells,
			along: [0, length],
			inside: length,
			length,
			crow: haversine(a.lon, a.lat, b.lon, b.lat),
			days: 0,
		})
	}
	return routes
}

/** Etappenpunkte und die beste Potenzialzelle in ihrem Umkreis. */
export function routeStages(grid, routes, score, dayMarch, p = ROUTE_PARAMS) {
	const stages = []
	const k = Math.round(p.stageSearch / grid.cellMeters)
	routes.forEach((route, r) => {
		// Auf dem Schiff braucht es keine Marschlager
		if (route.mode === "Schiff") return
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
				via: route.via ?? "",
				mode: route.mode ?? "Fuß",
				note: route.note ?? "",
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
