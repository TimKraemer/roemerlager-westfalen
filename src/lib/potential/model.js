import { haversine, lonLatToPixel, metersPerPixel, pixelToLonLat } from "../geo"

/**
 * Potenzialmodell für unentdeckte Marschlager.
 *
 * Arbeitshypothese (Vortrag Dr. Bettina Tremmel, LWL): Marschlager lagen
 * etwa einen Tagesmarsch (18–20 km) auseinander, nahe fließendem Wasser
 * und meist auf Anhöhen oder in leichter Hanglage. Jede Annahme ist ein
 * eigener Faktor zwischen 0 und 1, das Ergebnis ist das gewichtete Mittel.
 * Das Raster liegt in Web-Mercator-Pixeln der DEM-Zoomstufe.
 */

export const FACTORS = [
	{
		key: "ring",
		label: "Tagesmarsch zu bekanntem Lager",
		hint: "Abstand zum nächsten bekannten Lager nahe dem Tagesmarsch",
	},
	{
		key: "water",
		label: "Fließgewässer in der Nähe",
		hint: "Bach oder Fluss (OSM) in wenigen hundert Metern",
	},
	{
		key: "height",
		label: "Leichte Anhöhe",
		hint: "Etwas höher als die Umgebung (Topographic Position Index). Ausgeprägte Hügel zählen weniger, Ps.-Hyginus 56 stellt sie erst an dritte Stelle.",
	},
	{
		key: "terrace",
		label: "Erhöhte Terrasse über der Aue",
		hint: "3–15 m über dem tiefsten Punkt im Umkreis von 1,5 km, trocken über Fluss oder Bach (Ps.-Hyginus 56: sanft aus der Ebene ansteigend)",
	},
	{
		key: "slope",
		label: "Flache bis leichte Hanglage",
		hint: "Ideal 0,5–6° Neigung, steiles Gelände fällt ab",
	},
	{
		key: "route",
		label: "Auf möglicher Marschroute",
		hint: "Nähe zum Weg geringster Kosten zwischen zwei bekannten Lagern",
	},
	{
		key: "corridor",
		label: "Flusskorridor (Marschroute)",
		hint: "Nähe zu größeren Flüssen wie Lippe, Weser, Ems",
	},
]

export const DEFAULT_PARAMS = {
	cellMeters: 200,
	// "dem": Gewässernetz aus dem Höhenmodell, "osm": OpenStreetMap
	waterSource: "dem",
	// Lippe, Rhein, Ems usw. im alten Lauf (Uraufnahme, römerzeitlich) statt heute
	oldRivers: true,
	streamKm2: 2,
	riverKm2: 150,
	ringMean: 19000,
	ringSigma: 2500,
	// Ringe auch bei zwei und drei Tagesmärschen (1 = nur ein Tagesmarsch)
	ringMultiples: 3,
	waterNear: 300,
	waterFalloff: 700,
	corridorSigma: 6000,
	tpiRadius: 1500,
	// Mindestabstand neuer Vorschläge zu schon bekannten Lagern (Meter)
	hideKnownRadius: 5000,
	routeSigma: 1500,
	// Aufschlag für gerade Strukturen im Laserscan (0,15 = bis zu +15 %).
	// Standard 0: die Gegenprobe an bestätigten Lagern zeigte keinen Vorteil.
	linesBonus: 0,
	// Abzug für Moore laut Bodenkarte (BK50 NRW, GUM50 NI), 0,7 = −70 %
	moorPenalty: 0.7,
	// Abzug für nasse Niederungen nach dem Feuchteindex, 0,4 = bis −40 %
	wetPenalty: 0.4,
	// Abzug für heutigen Wald; römerzeitlicher Wald ist unbekannt, daher aus
	forestPenalty: 0,
	weights: {
		ring: 3,
		water: 2,
		height: 2,
		terrace: 1,
		slope: 1,
		route: 2,
		corridor: 1,
	},
}

const DEG = 180 / Math.PI

/** Raster über einer Bounding Box anlegen. */
export function createGrid(bbox, cellMeters, demZoom) {
	const [west, south, east, north] = bbox
	const [x0, y0] = lonLatToPixel(west, north, demZoom)
	const [x1, y1] = lonLatToPixel(east, south, demZoom)
	const midLat = (south + north) / 2
	const cellPx = cellMeters / metersPerPixel(midLat, demZoom)
	const cols = Math.max(2, Math.ceil((x1 - x0) / cellPx))
	const rows = Math.max(2, Math.ceil((y1 - y0) / cellPx))
	const nw = pixelToLonLat(x0, y0, demZoom)
	const se = pixelToLonLat(x0 + cols * cellPx, y0 + rows * cellPx, demZoom)
	return {
		zoom: demZoom,
		x0,
		y0,
		cellPx,
		cellMeters,
		cols,
		rows,
		// Ecken für die MapLibre-Bildquelle: NW, NO, SO, SW
		corners: [
			[nw[0], nw[1]],
			[se[0], nw[1]],
			[se[0], se[1]],
			[nw[0], se[1]],
		],
	}
}

export function cellCenter(grid, col, row) {
	return pixelToLonLat(
		grid.x0 + (col + 0.5) * grid.cellPx,
		grid.y0 + (row + 0.5) * grid.cellPx,
		grid.zoom,
	)
}

export function cellAt(grid, lon, lat) {
	const [x, y] = lonLatToPixel(lon, lat, grid.zoom)
	const col = Math.floor((x - grid.x0) / grid.cellPx)
	const row = Math.floor((y - grid.y0) / grid.cellPx)
	if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return -1
	return row * grid.cols + col
}

/**
 * Höhe je Zelle aus einem Sampler (x, y in Weltpixeln -> Meter oder NaN).
 * Fehlende Werte werden mit dem Nachbarmittel aufgefüllt.
 */
export function sampleElevation(grid, sampler) {
	const { cols, rows } = grid
	const elev = new Float32Array(cols * rows)
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			elev[r * cols + c] = sampler(
				grid.x0 + (c + 0.5) * grid.cellPx,
				grid.y0 + (r + 0.5) * grid.cellPx,
			)
		}
	}
	let mean = 0
	let n = 0
	for (const v of elev) {
		if (Number.isFinite(v)) {
			mean += v
			n++
		}
	}
	mean = n ? mean / n : 0
	for (let i = 0; i < elev.length; i++) {
		if (!Number.isFinite(elev[i])) elev[i] = mean
	}
	return elev
}

/** Neigung in Grad aus zentralen Differenzen über den Zellabstand. */
export function computeSlope(grid, elev) {
	const { cols, rows, cellMeters } = grid
	const slope = new Float32Array(cols * rows)
	const at = (c, r) =>
		elev[
			Math.min(rows - 1, Math.max(0, r)) * cols +
				Math.min(cols - 1, Math.max(0, c))
		]
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const dzdx = (at(c + 1, r) - at(c - 1, r)) / (2 * cellMeters)
			const dzdy = (at(c, r + 1) - at(c, r - 1)) / (2 * cellMeters)
			slope[r * cols + c] = Math.atan(Math.hypot(dzdx, dzdy)) * DEG
		}
	}
	return slope
}

/**
 * Höhe über dem Talboden: Höhe minus tiefste Höhe im Quadrat ±radius
 * (getrennter Minimumfilter, erst Zeilen, dann Spalten).
 */
export function computeValleyHeight(grid, elev, radiusMeters = 1500) {
	const { cols, rows } = grid
	const k = Math.max(1, Math.round(radiusMeters / grid.cellMeters))
	const tmp = new Float32Array(cols * rows)
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			let m = Number.POSITIVE_INFINITY
			for (let d = Math.max(0, c - k); d <= Math.min(cols - 1, c + k); d++) {
				const v = elev[r * cols + d]
				if (v < m) m = v
			}
			tmp[r * cols + c] = m
		}
	}
	const out = new Float32Array(cols * rows)
	for (let c = 0; c < cols; c++) {
		for (let r = 0; r < rows; r++) {
			let m = Number.POSITIVE_INFINITY
			for (let d = Math.max(0, r - k); d <= Math.min(rows - 1, r + k); d++) {
				const v = tmp[d * cols + c]
				if (v < m) m = v
			}
			out[r * cols + c] = elev[r * cols + c] - m
		}
	}
	return out
}

/** Topographic Position Index: Höhe minus Mittel im Quadrat ±radius. */
export function computeTpi(grid, elev, radiusMeters) {
	const { cols, rows } = grid
	const k = Math.max(1, Math.round(radiusMeters / grid.cellMeters))
	// Summed-area table für Mittelwerte in O(1)
	const w = cols + 1
	const sat = new Float64Array(w * (rows + 1))
	for (let r = 0; r < rows; r++) {
		let rowSum = 0
		for (let c = 0; c < cols; c++) {
			rowSum += elev[r * cols + c]
			sat[(r + 1) * w + c + 1] = sat[r * w + c + 1] + rowSum
		}
	}
	const tpi = new Float32Array(cols * rows)
	for (let r = 0; r < rows; r++) {
		const r0 = Math.max(0, r - k)
		const r1 = Math.min(rows, r + k + 1)
		for (let c = 0; c < cols; c++) {
			const c0 = Math.max(0, c - k)
			const c1 = Math.min(cols, c + k + 1)
			const sum =
				sat[r1 * w + c1] -
				sat[r0 * w + c1] -
				sat[r1 * w + c0] +
				sat[r0 * w + c0]
			tpi[r * cols + c] = elev[r * cols + c] - sum / ((r1 - r0) * (c1 - c0))
		}
	}
	return tpi
}

/**
 * Abstand jeder Zelle zur nächsten Linie in Metern. Die Linien werden ins
 * Raster gezeichnet, danach folgt eine exakte euklidische
 * Distanztransformation (Felzenszwalb & Huttenlocher 2012).
 */
export function distanceToLines(grid, lines) {
	const { cols, rows } = grid
	const INF = 1e20
	const f = new Float64Array(cols * rows).fill(INF)
	let any = false
	for (const line of lines) {
		let prev = null
		for (const [lon, lat] of line) {
			const [px, py] = lonLatToPixel(lon, lat, grid.zoom)
			const cur = [(px - grid.x0) / grid.cellPx, (py - grid.y0) / grid.cellPx]
			if (prev) {
				const steps = Math.ceil(
					Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) * 2,
				)
				for (let s = 0; s <= steps; s++) {
					const t = steps ? s / steps : 0
					const c = Math.floor(prev[0] + (cur[0] - prev[0]) * t)
					const r = Math.floor(prev[1] + (cur[1] - prev[1]) * t)
					if (c >= 0 && r >= 0 && c < cols && r < rows) {
						f[r * cols + c] = 0
						any = true
					}
				}
			}
			prev = cur
		}
	}
	if (!any) return new Float32Array(cols * rows).fill(Number.POSITIVE_INFINITY)
	return finishDistance(f, cols, rows, grid.cellMeters)
}

/** Abstand jedes Pixels zum nächsten gesetzten Pixel der Maske (Meter). */
export function distanceToMask(mask, cols, rows, pixelMeters) {
	const f = new Float64Array(cols * rows)
	let any = false
	for (let i = 0; i < f.length; i++) {
		if (mask[i]) any = true
		else f[i] = 1e20
	}
	if (!any) return new Float32Array(cols * rows).fill(Number.POSITIVE_INFINITY)
	return finishDistance(f, cols, rows, pixelMeters)
}

function finishDistance(f, cols, rows, pixelMeters) {
	edt2d(f, cols, rows)
	const out = new Float32Array(cols * rows)
	for (let i = 0; i < out.length; i++) out[i] = Math.sqrt(f[i]) * pixelMeters
	return out
}

function edt1d(f, n, d, v, z) {
	let k = 0
	v[0] = 0
	z[0] = Number.NEGATIVE_INFINITY
	z[1] = Number.POSITIVE_INFINITY
	for (let q = 1; q < n; q++) {
		let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
		while (s <= z[k]) {
			k--
			s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
		}
		k++
		v[k] = q
		z[k] = s
		z[k + 1] = Number.POSITIVE_INFINITY
	}
	k = 0
	for (let q = 0; q < n; q++) {
		while (z[k + 1] < q) k++
		d[q] = (q - v[k]) ** 2 + f[v[k]]
	}
}

function edt2d(grid, cols, rows) {
	const n = Math.max(cols, rows)
	const f = new Float64Array(n)
	const d = new Float64Array(n)
	const v = new Int32Array(n)
	const z = new Float64Array(n + 1)
	for (let c = 0; c < cols; c++) {
		for (let r = 0; r < rows; r++) f[r] = grid[r * cols + c]
		edt1d(f, rows, d, v, z)
		for (let r = 0; r < rows; r++) grid[r * cols + c] = d[r]
	}
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) f[c] = grid[r * cols + c]
		edt1d(f, cols, d, v, z)
		for (let c = 0; c < cols; c++) grid[r * cols + c] = d[c]
	}
}

/** Abstand jeder Zelle zum nächsten bekannten Lager (Meter). */
export function distanceToCamps(grid, camps) {
	const { cols, rows } = grid
	const out = new Float32Array(cols * rows).fill(Number.POSITIVE_INFINITY)
	if (!camps.length) return out
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const [lon, lat] = cellCenter(grid, c, r)
			let best = Number.POSITIVE_INFINITY
			for (const camp of camps) {
				const d = haversine(lon, lat, camp.lon, camp.lat)
				if (d < best) best = d
			}
			out[r * cols + c] = best
		}
	}
	return out
}

/**
 * Ringfaktor: Für jedes Lager eine Gaußglocke um den Tagesmarsch-Abstand,
 * das Maximum über alle Lager zählt.
 */
export function ringFactor(grid, camps, mean, sigma, multiples = 3) {
	// Vielfache eines Tagesmarschs: Fehlt ein Zwischenlager, liegt das nächste
	// bekannte zwei oder drei Märsche entfernt (Sennestadt–Barkhausen 39 km).
	// Je Vielfachem wächst die Streuung mit √k, das Gewicht sinkt um 20 %.
	const { cols, rows } = grid
	const out = new Float32Array(cols * rows)
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const [lon, lat] = cellCenter(grid, c, r)
			let best = 0
			for (const camp of camps) {
				const d = haversine(lon, lat, camp.lon, camp.lat)
				for (let k = 1; k <= multiples; k++) {
					const s2 = 2 * sigma * sigma * k
					const v = 0.8 ** (k - 1) * Math.exp(-((d - k * mean) ** 2) / s2)
					if (v > best) best = v
				}
			}
			out[r * cols + c] = best
		}
	}
	return out
}

export const factorFns = {
	water(dist, p) {
		if (dist <= p.waterNear) return 1
		return Math.exp(-((dist - p.waterNear) ** 2) / (2 * p.waterFalloff ** 2))
	},
	height(tpi) {
		// Logistisch ansteigend (Senke ~0, Ebene ~0,3, ab ~10 m ~0,85), über
		// 20 m wieder fallend: Hügel und Berge rangieren bei Ps.-Hyginus 56
		// hinter der sanften Erhebung
		const rise = 1 / (1 + Math.exp(-(tpi - 3) / 4))
		const tooHigh = tpi > 20 ? Math.max(0.4, 1 - (tpi - 20) / 40) : 1
		return rise * tooHigh
	},
	terrace(h) {
		// Höhe über dem Talboden: 0 m Aue, 3–15 m Terrasse, darüber Hang/Hügel
		if (h < 1) return 0.1
		if (h < 3) return 0.1 + (0.9 * (h - 1)) / 2
		if (h <= 15) return 1
		if (h >= 45) return 0.3
		return 1 - (0.7 * (h - 15)) / 30
	},
	slope(deg) {
		if (deg < 0.5) return 0.7 + deg * 0.6
		if (deg <= 6) return 1
		if (deg >= 15) return 0
		return 1 - (deg - 6) / 9
	},
	route(dist, p) {
		if (!Number.isFinite(dist)) return 0
		return Math.exp(-(dist * dist) / (2 * p.routeSigma ** 2))
	},
	corridor(dist, p) {
		if (!Number.isFinite(dist)) return 0
		return Math.exp(-(dist * dist) / (2 * p.corridorSigma ** 2))
	},
}

/** Faktoren und Gesamtwert aus den vorbereiteten Rastern berechnen. */
export function combine(layers, params) {
	const {
		ring,
		distWater,
		distRiver,
		distRoute,
		tpi,
		slope,
		distCamp,
		distKnown,
		valley,
	} = layers
	const n = ring.length
	const w = params.weights
	const total = Object.values(w).reduce((a, b) => a + b, 0) || 1
	const factors = {
		ring,
		water: new Float32Array(n),
		height: new Float32Array(n),
		slope: new Float32Array(n),
		route: new Float32Array(n),
		corridor: new Float32Array(n),
		terrace: new Float32Array(n),
	}
	const score = new Float32Array(n)
	for (let i = 0; i < n; i++) {
		factors.water[i] = factorFns.water(distWater[i], params)
		factors.height[i] = factorFns.height(tpi[i])
		factors.terrace[i] = valley ? factorFns.terrace(valley[i]) : 0
		factors.slope[i] = factorFns.slope(slope[i])
		factors.route[i] = distRoute ? factorFns.route(distRoute[i], params) : 0
		factors.corridor[i] = factorFns.corridor(distRiver[i], params)
		let s = 0
		for (const key in w) if (factors[key]) s += w[key] * factors[key][i]
		s /= total
		// Steiles Gelände schließt ein Lager praktisch aus
		if (slope[i] > 12) s *= 0.3
		// Umfeld bekannter Lager ist erforscht, dort nichts vorschlagen
		const known = distKnown ? distKnown[i] : distCamp[i]
		if (known < params.hideKnownRadius) s *= known / params.hideKnownRadius
		score[i] = s
	}
	return { factors, score }
}

/**
 * Lokale Maxima als Kandidatenliste: Zellen über der Schwelle, die in
 * einem Umkreis von minDistance den höchsten Wert haben.
 */
export function findCandidates(
	grid,
	score,
	{ threshold = 0.6, minDistance = 4000, limit = 30 } = {},
) {
	const { cols, rows } = grid
	const k = Math.max(1, Math.round(minDistance / grid.cellMeters))
	const peaks = []
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const v = score[r * cols + c]
			if (v < threshold) continue
			let isMax = true
			for (let dr = -k; dr <= k && isMax; dr++) {
				const rr = r + dr
				if (rr < 0 || rr >= rows) continue
				for (let dc = -k; dc <= k; dc++) {
					const cc = c + dc
					if (cc < 0 || cc >= cols || (dr === 0 && dc === 0)) continue
					if (dr * dr + dc * dc > k * k) continue
					const o = score[rr * cols + cc]
					// Bei Gleichstand gewinnt die erste Zelle in Leserichtung
					if (o > v || (o === v && rr * cols + cc < r * cols + c)) {
						isMax = false
						break
					}
				}
			}
			if (isMax) peaks.push({ index: r * cols + c, score: v })
		}
	}
	peaks.sort((a, b) => b.score - a.score)
	return peaks.slice(0, limit).map((p) => {
		const col = p.index % cols
		const row = Math.floor(p.index / cols)
		const [lon, lat] = cellCenter(grid, col, row)
		return { ...p, lon, lat }
	})
}
