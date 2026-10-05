import { lonLatToPixel } from "../geo"

/**
 * Gerade Strukturen im Laserscan (Wälle, Gräben) als Hinweis auf
 * Lagerumwehrungen.
 *
 * 1. Local Relief Model: Gelände minus geglättetes Gelände (Hesse 2010).
 *    Kleinformen von wenigen Dezimetern treten hervor, Hänge verschwinden.
 * 2. Auffällige Pixel: |LRM| über einer robusten Schwelle, bekannte moderne
 *    Linien (Wege, Bahn, Gewässer, Gebäude aus OSM) maskiert.
 * 3. Hough-Transformation: gerade Linien mit vielen Stimmen, danach entlang
 *    jeder Linie zusammenhängende Abschnitte ab Mindestlänge.
 * 4. Ecken: zwei Abschnitte etwa im rechten Winkel, deren Enden nah
 *    beieinander liegen. Marschlager haben vier abgerundete Ecken
 *    („Spielkartenform“), einzelne gerade Linien sind dagegen alltäglich.
 *
 * Alle Größen in Pixeln eines metrischen Rasters (Kantenlänge px Meter).
 */

export const LINEAMENT_PARAMS = {
	lrmSigma: 16, // m, Glättung für das Local Relief Model (Vorschau)
	lineScale: 4, // m, Breite der gesuchten Strukturen (Gauß-Sigma)
	minLine: 0.04, // Mindeststärke des Linienfilters
	quantile: 0.88, // nur die stärksten 12 % der Pixel
	elongation: 0.5, // Querkrümmung mindestens doppelt so stark wie längs
	maxSlope: 25, // °, steilere Böschungen sind Dämme oder Terrassen
	// °, im 30-m-Maßstab: steiles Gelände trägt Erosionsrinnen, keine Lager
	maxTerrainSlope: 8,
	minLength: 80, // m, kürzere Abschnitte zählen nicht
	maxGap: 10, // m, Lücken innerhalb eines Abschnitts
	fill: 0.6, // Anteil belegter Pixel in einem Abschnitt
	maxSegments: 60,
	cornerAngle: 18, // ° Abweichung vom rechten Winkel
	cornerGap: 45, // m zwischen den Enden zweier Abschnitte
}

/** Gaußglättung über drei Kastenfilter (Summed-Area-Table). */
export function gaussianBlur(src, w, h, sigmaPx) {
	// Kastenradius für drei Durchläufe (Kovesi)
	const r = Math.max(
		1,
		Math.round(Math.sqrt((12 * sigmaPx * sigmaPx) / 3 + 1) / 2),
	)
	let a = Float32Array.from(src)
	for (let pass = 0; pass < 3; pass++) a = boxBlur(a, w, h, r)
	return a
}

function boxBlur(src, w, h, r) {
	const sat = new Float64Array((w + 1) * (h + 1))
	for (let y = 0; y < h; y++) {
		let row = 0
		for (let x = 0; x < w; x++) {
			row += src[y * w + x]
			sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + row
		}
	}
	const out = new Float32Array(w * h)
	for (let y = 0; y < h; y++) {
		const y0 = Math.max(0, y - r)
		const y1 = Math.min(h, y + r + 1)
		for (let x = 0; x < w; x++) {
			const x0 = Math.max(0, x - r)
			const x1 = Math.min(w, x + r + 1)
			const s =
				sat[y1 * (w + 1) + x1] -
				sat[y0 * (w + 1) + x1] -
				sat[y1 * (w + 1) + x0] +
				sat[y0 * (w + 1) + x0]
			out[y * w + x] = s / ((y1 - y0) * (x1 - x0))
		}
	}
	return out
}

export function localRelief(dem, w, h, px, p = LINEAMENT_PARAMS) {
	const smooth = gaussianBlur(dem, w, h, p.lrmSigma / px)
	const lrm = new Float32Array(w * h)
	for (let i = 0; i < lrm.length; i++) lrm[i] = dem[i] - smooth[i]
	return lrm
}

/**
 * Linienfilter über die Hesse-Matrix (Krümmung quer stark, längs schwach):
 * Gräben und Wälle von einigen Metern Breite treten hervor, Mulden,
 * Kuppen und flächige Rauheit fallen heraus. masked[i] = 1 schließt
 * moderne Linien aus.
 */
export function lineMask(dem, w, h, px, masked, p = LINEAMENT_PARAMS) {
	const s = p.lineScale / px
	const g = gaussianBlur(dem, w, h, s)
	const fine = gaussianBlur(dem, w, h, 1)
	const coarse = gaussianBlur(dem, w, h, 15 / px)
	const coarseStep = Math.max(1, Math.round(15 / px))
	const strength = new Float32Array(w * h)
	// Richtung quer zur Linie (Eigenvektor der stärkeren Krümmung)
	const nx = new Float32Array(w * h)
	const ny = new Float32Array(w * h)
	const concave = new Uint8Array(w * h)
	for (let y = 1; y < h - 1; y++) {
		for (let x = 1; x < w - 1; x++) {
			const i = y * w + x
			const gxx = g[i + 1] - 2 * g[i] + g[i - 1]
			const gyy = g[i + w] - 2 * g[i] + g[i - w]
			const gxy =
				(g[i + w + 1] - g[i + w - 1] - g[i - w + 1] + g[i - w - 1]) / 4
			const tr = gxx + gyy
			const disc = Math.sqrt(
				Math.max(0, (tr * tr) / 4 - (gxx * gyy - gxy * gxy)),
			)
			const l1 = tr / 2 + disc
			const l2 = tr / 2 - disc
			const big = Math.abs(l1) > Math.abs(l2) ? l1 : l2
			const small = Math.abs(l1) > Math.abs(l2) ? l2 : l1
			if (Math.abs(small) > p.elongation * Math.abs(big)) continue
			// Neigung aus der feinen Glättung
			const dx = (fine[i + 1] - fine[i - 1]) / (2 * px)
			const dy = (fine[i + w] - fine[i - w]) / (2 * px)
			if ((Math.atan(Math.hypot(dx, dy)) * 180) / Math.PI > p.maxSlope) continue
			if (
				x >= coarseStep &&
				y >= coarseStep &&
				x < w - coarseStep &&
				y < h - coarseStep
			) {
				const cx =
					(coarse[i + coarseStep] - coarse[i - coarseStep]) /
					(2 * coarseStep * px)
				const cy =
					(coarse[i + coarseStep * w] - coarse[i - coarseStep * w]) /
					(2 * coarseStep * px)
				if ((Math.atan(Math.hypot(cx, cy)) * 180) / Math.PI > p.maxTerrainSlope)
					continue
			}
			strength[i] = (Math.abs(big) - Math.abs(small)) * s * s
			// Vorzeichen merken: konkav (Graben) oder konvex (Wall)
			if (big < 0) concave[i] = 0
			else concave[i] = 1
			let vx = gxy
			let vy = big - gxx
			if (Math.abs(vx) + Math.abs(vy) < 1e-12) {
				vx = big - gyy
				vy = gxy
			}
			const vl = Math.hypot(vx, vy) || 1
			nx[i] = vx / vl
			ny[i] = vy / vl
		}
	}
	// Nur die Mittellinie behalten: Maximum quer zur Linie
	const thin = new Float32Array(w * h)
	for (let y = 2; y < h - 2; y++) {
		for (let x = 2; x < w - 2; x++) {
			const i = y * w + x
			const v = strength[i]
			if (!v) continue
			const ox = Math.round(nx[i])
			const oy = Math.round(ny[i])
			if (v >= strength[i + oy * w + ox] && v >= strength[i - oy * w - ox])
				thin[i] = v
		}
	}
	const sample = []
	for (let i = 0; i < thin.length; i += 3) if (thin[i] > 0) sample.push(thin[i])
	sample.sort((a, b) => a - b)
	const q = sample[Math.floor(sample.length * p.quantile)] ?? p.minLine
	const threshold = Math.max(p.minLine, q)
	// Randstreifen ausschließen: dort verfälscht die Glättung die Krümmung
	const border = Math.ceil(3 * s) + 2
	const core = new Uint8Array(w * h)
	for (let y = border; y < h - border; y++) {
		for (let x = border; x < w - border; x++) {
			const i = y * w + x
			if (thin[i] >= threshold && !masked?.[i]) core[i] = 1
		}
	}
	// Um 1 Pixel verbreitern, damit gerundete Richtungen keine Lücken reißen.
	// Gräben (1) und Wälle (2) getrennt, damit eine schräge Linie nicht
	// Mitte und Flanke desselben Grabens zusammenzählt.
	const mask = new Uint8Array(w * h)
	for (let y = 1; y < h - 1; y++) {
		for (let x = 1; x < w - 1; x++) {
			const i = y * w + x
			if (!core[i]) continue
			const kind = concave[i] ? 1 : 2
			for (let dy = -1; dy <= 1; dy++)
				for (let dx = -1; dx <= 1; dx++)
					if (!masked?.[i + dy * w + dx]) mask[i + dy * w + dx] |= kind
		}
	}
	return { mask, threshold }
}

/**
 * Hough-Transformation und Abschnittssuche.
 * @returns {{x0, y0, x1, y1, length, angle}[]} Pixelkoordinaten, Länge in m
 */
export function findSegments(mask, w, h, px, p = LINEAMENT_PARAMS) {
	const thetas = 180
	const cos = new Float64Array(thetas)
	const sin = new Float64Array(thetas)
	for (let t = 0; t < thetas; t++) {
		cos[t] = Math.cos((t * Math.PI) / thetas)
		sin[t] = Math.sin((t * Math.PI) / thetas)
	}
	const diag = Math.ceil(Math.hypot(w, h))
	const rhos = 2 * diag + 1
	const acc = new Uint32Array(thetas * rhos)
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			if (!mask[y * w + x]) continue
			for (let t = 0; t < thetas; t++) {
				const r = Math.round(x * cos[t] + y * sin[t]) + diag
				acc[t * rhos + r]++
			}
		}
	}
	const minVotes = Math.round((p.minLength / px) * p.fill)
	const peaks = []
	for (let i = 0; i < acc.length; i++) if (acc[i] >= minVotes) peaks.push(i)
	peaks.sort((a, b) => acc[b] - acc[a])

	const minLen = p.minLength / px
	const maxGap = p.maxGap / px
	const used = new Uint8Array(acc.length)
	const segments = []
	for (const peak of peaks) {
		if (segments.length >= p.maxSegments) break
		if (used[peak]) continue
		const t = Math.floor(peak / rhos)
		const r = (peak % rhos) - diag
		// Nachbarschaft unterdrücken: ±4° und ±8 Pixel (Grabenflanken)
		for (let dt = -4; dt <= 4; dt++) {
			const tt = (t + dt + thetas) % thetas
			for (let dr = -8; dr <= 8; dr++) {
				const rr = r + dr + diag
				if (rr >= 0 && rr < rhos) used[tt * rhos + rr] = 1
			}
		}
		// Entlang der Linie laufen, Treffer mit ±1 Pixel Toleranz
		const dx = -sin[t]
		const dy = cos[t]
		const cx = r * cos[t]
		const cy = r * sin[t]
		let runStart = null
		let last = null
		let hits = 0
		const flush = (end) => {
			if (runStart === null) return
			const len = end - runStart
			if (len >= minLen && hits / (len + 1) >= p.fill) {
				segments.push({
					x0: cx + dx * runStart,
					y0: cy + dy * runStart,
					x1: cx + dx * end,
					y1: cy + dy * end,
					length: len * px,
					angle: (t * 180) / thetas,
				})
			}
			runStart = null
			hits = 0
		}
		for (let s = -diag; s <= diag; s++) {
			const x = Math.round(cx + dx * s)
			const y = Math.round(cy + dy * s)
			if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) {
				flush(last ?? s)
				continue
			}
			let hit = false
			for (let o = -1; o <= 1 && !hit; o++) {
				const ox = Math.round(x + cos[t] * o)
				const oy = Math.round(y + sin[t] * o)
				if (mask[oy * w + ox]) hit = true
			}
			if (hit) {
				if (runStart === null) runStart = s
				last = s
				hits++
			} else if (runStart !== null && s - last > maxGap) {
				flush(last)
			}
		}
		flush(last)
	}
	return dedupe(segments, px)
}

/**
 * Parallele Doppeltreffer zusammenfassen: gleiche Richtung (±10°), Abstand
 * unter 20 m und überlappend. Der längere Abschnitt bleibt.
 */
function dedupe(segments, px) {
	const keep = []
	const sorted = [...segments].sort((a, b) => b.length - a.length)
	for (const s of sorted) {
		const dup = keep.some((k) => {
			let diff = Math.abs(k.angle - s.angle) % 180
			if (diff > 90) diff = 180 - diff
			if (diff > 10) return false
			// Abstand der Mitte von s zur Geraden durch k
			const mx = (s.x0 + s.x1) / 2
			const my = (s.y0 + s.y1) / 2
			const kx = k.x1 - k.x0
			const ky = k.y1 - k.y0
			const len = Math.hypot(kx, ky) || 1
			const d = Math.abs(kx * (k.y0 - my) - (k.x0 - mx) * ky) / len
			if (d * px > 20) return false
			// Überlappung entlang k
			const t = ((mx - k.x0) * kx + (my - k.y0) * ky) / (len * len)
			return t > -0.2 && t < 1.2
		})
		if (!dup) keep.push(s)
	}
	return keep
}

/** Ecken: Paare etwa rechtwinkliger Abschnitte mit nahen Enden. */
export function findCorners(segments, px, p = LINEAMENT_PARAMS) {
	const corners = []
	const ends = (s) => [
		[s.x0, s.y0],
		[s.x1, s.y1],
	]
	for (let i = 0; i < segments.length; i++) {
		for (let j = i + 1; j < segments.length; j++) {
			const a = segments[i]
			const b = segments[j]
			let diff = Math.abs(a.angle - b.angle) % 180
			if (diff > 90) diff = 180 - diff
			if (Math.abs(90 - diff) > p.cornerAngle) continue
			let best = Number.POSITIVE_INFINITY
			let at = null
			for (const [ax, ay] of ends(a)) {
				for (const [bx, by] of ends(b)) {
					const d = Math.hypot(ax - bx, ay - by) * px
					if (d < best) {
						best = d
						at = [(ax + bx) / 2, (ay + by) / 2]
					}
				}
			}
			if (best <= p.cornerGap)
				corners.push({ a: i, b: j, x: at[0], y: at[1], gap: best })
		}
	}
	return corners
}

/** Ganze Kette für ein Fenster. */
export function detectLineaments(dem, w, h, px, masked, p = LINEAMENT_PARAMS) {
	const { mask, threshold } = lineMask(dem, w, h, px, masked, p)
	const pass = (bit) => {
		const m = new Uint8Array(mask.length)
		for (let i = 0; i < m.length; i++) if (mask[i] & bit) m[i] = 1
		return findSegments(m, w, h, px, p).map((s) => ({
			...s,
			kind: bit === 1 ? "Graben" : "Wall",
		}))
	}
	const segments = dedupe([...pass(1), ...pass(2)], px).slice(0, p.maxSegments)
	const corners = findCorners(segments, px, p)
	const inCorner = new Set(corners.flatMap((c) => [c.a, c.b]))
	segments.forEach((s, i) => {
		s.corner = inCorner.has(i)
	})
	return { segments, corners, threshold }
}

/**
 * Faktor je Rasterzelle aus erkannten Abschnitten (GeoJSON-Linien mit
 * properties.corner). Nur innerhalb untersuchter Fenster, sonst 0.
 * Abschnitte mit Ecke zählen voll, einzelne gerade Linien zu 30 %.
 */
export function linesFactor(grid, lineaments, cellCenter, sigma = 150) {
	const n = grid.cols * grid.rows
	const out = new Float32Array(n)
	if (!lineaments?.segments?.features.length) return out
	const reach = sigma * 3
	const toCell = (lon, lat) => {
		const [x, y] = lonLatToPixel(lon, lat, grid.zoom)
		return [(x - grid.x0) / grid.cellPx, (y - grid.y0) / grid.cellPx]
	}
	const reachCells = reach / grid.cellMeters + 1
	for (const f of lineaments.segments.features) {
		const [[lon0, lat0], [lon1, lat1]] = f.geometry.coordinates
		const weight = f.properties.corner ? 1 : 0.3
		const mx = 111320 * Math.cos((lat0 * Math.PI) / 180)
		const my = 110540
		const bx = (lon1 - lon0) * mx
		const by = (lat1 - lat0) * my
		const len2 = bx * bx + by * by || 1
		const [c0, r0] = toCell(lon0, lat0)
		const [c1, r1] = toCell(lon1, lat1)
		const cMin = Math.max(0, Math.floor(Math.min(c0, c1) - reachCells))
		const cMax = Math.min(
			grid.cols - 1,
			Math.ceil(Math.max(c0, c1) + reachCells),
		)
		const rMin = Math.max(0, Math.floor(Math.min(r0, r1) - reachCells))
		const rMax = Math.min(
			grid.rows - 1,
			Math.ceil(Math.max(r0, r1) + reachCells),
		)
		for (let r = rMin; r <= rMax; r++) {
			for (let c = cMin; c <= cMax; c++) {
				const [lon, lat] = cellCenter(grid, c, r)
				const px = (lon - lon0) * mx
				const py = (lat - lat0) * my
				const t = Math.max(0, Math.min(1, (px * bx + py * by) / len2))
				const d = Math.hypot(px - t * bx, py - t * by)
				if (d > reach) continue
				const v = weight * Math.exp(-(d * d) / (2 * sigma * sigma))
				const i = r * grid.cols + c
				if (v > out[i]) out[i] = v
			}
		}
	}
	return out
}
