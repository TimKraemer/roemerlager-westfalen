import rivers from "../../data/fluesse.json"
import { lonLatToPixel } from "../geo"
import { distanceToMask } from "./model"

/**
 * Alte Flussläufe (scripts/build-rivers.mjs) im Potenzialmodell: Uraufnahme
 * um 1840, die Weser im Kreis Minden-Lübbecke nach der Kreiskarte 1843, an
 * Vetera und Haltern der römerzeitliche Lauf, sonst der heutige.
 * Sie ersetzen den heutigen bzw. aus dem Höhenmodell abgeleiteten Lauf
 * derselben Flüsse beim Abstand zu Fluss und Bach.
 */

export const OLD_RIVER_NAMES = Object.keys(rivers)

// Abgeleitete Flusspixel so nah an einem alten Lauf gehören zum selben Fluss
const SAME_RIVER_M = 1500
const SAME_SHARE = 0.3
// Mündung in einen weggefallenen, grob gerechneten Lauf: so weit darf der
// Anschluss an den alten Lauf reichen
const FAR_MOUTH_M = 8000

const coordsOf = (v) => (Array.isArray(v) ? v : v.coords)

/** Linien der alten Läufe, die den Ausschnitt (mit Rand) berühren. */
export function oldRiverLines(bbox, padDeg = 0.05) {
	const [w, s, e, n] = bbox
	const inBox = ([lon, lat]) =>
		lon >= w - padDeg &&
		lon <= e + padDeg &&
		lat >= s - padDeg &&
		lat <= n + padDeg
	const out = []
	for (const v of Object.values(rivers)) {
		let run = []
		for (const p of coordsOf(v)) {
			if (inBox(p)) run.push(p)
			else {
				if (run.length > 1) out.push(run)
				run = []
			}
		}
		if (run.length > 1) out.push(run)
	}
	return out
}

/** Linien [[lon, lat], …] als Maske im Abflussraster. */
export function rasterizeLines(lines, raster, zoom) {
	const { width, height, x0, y0, step } = raster
	const mask = new Uint8Array(width * height)
	let any = false
	for (const line of lines) {
		let prev = null
		for (const [lon, lat] of line) {
			const [px, py] = lonLatToPixel(lon, lat, zoom)
			const cur = [(px - x0) / step, (py - y0) / step]
			if (prev) {
				const n = Math.ceil(Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) * 2)
				for (let k = 0; k <= n; k++) {
					const t = n ? k / n : 0
					const c = Math.floor(prev[0] + (cur[0] - prev[0]) * t)
					const r = Math.floor(prev[1] + (cur[1] - prev[1]) * t)
					if (c >= 0 && r >= 0 && c < width && r < height) {
						mask[r * width + c] = 1
						any = true
					}
				}
			}
			prev = cur
		}
	}
	return { mask, any }
}

/**
 * Alte Läufe in die Masken des Abflussrasters einbrennen. Fluss-Pixel aus
 * dem Höhenmodell, die näher als 1,5 km an einem alten Lauf liegen, werden
 * entfernt: dort ist es derselbe Fluss, nur heute anders geführt. Kleinere
 * Bäche bleiben.
 */
export function burnOldRivers(streams, riverMask, raster, zoom, bbox) {
	const { width, height, meters } = raster
	const { mask: old, any } = rasterizeLines(
		oldRiverLines(bbox, 0.2),
		raster,
		zoom,
	)
	if (!any) return
	const dOld = distanceToMask(old, width, height, meters)
	for (let i = 0; i < old.length; i++) {
		if (old[i]) {
			riverMask[i] = 1
			streams[i] = 1
		} else if (riverMask[i] && dOld[i] < SAME_RIVER_M) {
			riverMask[i] = 0
			streams[i] = 0
		}
	}
}

// Raster der alten Stützpunkte (0,01°) für schnelle Nähe-Abfragen
let cells = null
const CELL = 0.01
function oldCells() {
	if (cells) return cells
	cells = new Map()
	for (const v of Object.values(rivers)) {
		const pts = coordsOf(v)
		for (let i = 0; i < pts.length; i++) {
			// Zwischenpunkte, damit lange gerade Stücke nicht durchrutschen
			const [x0, y0] = pts[Math.max(0, i - 1)]
			const [x1, y1] = pts[i]
			const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.002)
			for (let k = 0; k <= n; k++) {
				const p = [
					x0 + ((x1 - x0) * k) / (n || 1),
					y0 + ((y1 - y0) * k) / (n || 1),
				]
				const key = `${Math.floor(p[0] / CELL)}|${Math.floor(p[1] / CELL)}`
				if (!cells.has(key)) cells.set(key, [])
				cells.get(key).push(p)
			}
		}
	}
	return cells
}

function nearOld([lon, lat], meters) {
	const kx = 111320 * Math.cos((lat * Math.PI) / 180)
	const cx = Math.floor(lon / CELL)
	const cy = Math.floor(lat / CELL)
	const r = Math.ceil(meters / 111320 / CELL)
	const map = oldCells()
	for (let dy = -r; dy <= r; dy++)
		for (let dx = -r; dx <= r; dx++)
			for (const [x, y] of map.get(`${cx + dx}|${cy + dy}`) ?? [])
				if (Math.hypot((x - lon) * kx, (y - lat) * 111320) < meters) return true
	return false
}

/** Nächster Punkt eines alten Laufs bis meters entfernt, sonst null. */
function nearestOld([lon, lat], meters) {
	const kx = 111320 * Math.cos((lat * Math.PI) / 180)
	const cx = Math.floor(lon / CELL)
	const cy = Math.floor(lat / CELL)
	const r = Math.ceil(meters / 111320 / CELL)
	const map = oldCells()
	let best = null
	let bestD = meters
	for (let dy = -r; dy <= r; dy++)
		for (let dx = -r; dx <= r; dx++)
			for (const q of map.get(`${cx + dx}|${cy + dy}`) ?? []) {
				const d = Math.hypot((q[0] - lon) * kx, (q[1] - lat) * 111320)
				if (d < bestD) {
					best = q
					bestD = d
				}
			}
	return best
}

/**
 * Abgeleitete Flussabschnitte ohne die, die einem alten Lauf folgen. Liegt
 * ein Abschnitt zu einem guten Teil (SAME_SHARE) neben einem alten Lauf, ist
 * er derselbe Fluss und fällt ganz weg, auch wo er grob abweicht. Die
 * übrigen bleiben ganz. Endet einer nahe an einem alten Lauf (ein
 * Nebenfluss vor der Mündung), führt das Ende bis an den alten Lauf.
 */
export function withoutOldRivers(features) {
	const same = (f) => {
		const pts = f.geometry.coordinates
		let near = 0
		for (const p of pts) if (nearOld(p, SAME_RIVER_M)) near++
		return near >= pts.length * SAME_SHARE
	}
	const rivers = features.filter((f) => f.properties.kind === "river")
	const dropped = new Set(rivers.filter(same))
	// Punkte weggefallener Abschnitte: Wer dort mündet, mündet in den alten
	// Lauf, auch wenn der grob gerechnete Lauf weit daneben lag
	const droppedPts = new Set(
		[...dropped].flatMap((f) => f.geometry.coordinates.map((p) => `${p}`)),
	)
	const mouth = (p) =>
		nearestOld(p, droppedPts.has(`${p}`) ? FAR_MOUTH_M : SAME_RIVER_M)
	const out = features.filter((f) => f.properties.kind !== "river")
	for (const f of rivers) {
		if (dropped.has(f)) continue
		const pts = f.geometry.coordinates
		const head = mouth(pts[0])
		const tail = mouth(pts[pts.length - 1])
		out.push({
			...f,
			geometry: {
				type: "LineString",
				coordinates: [...(head ? [head] : []), ...pts, ...(tail ? [tail] : [])],
			},
		})
	}
	return out
}

/** Alle alten Läufe als Linien [[lon, lat], …], etwa für Schiffswege. */
export function oldRiverCourses() {
	return Object.values(rivers).map(coordsOf)
}

/** Alte Läufe als Linien für die Gewässer-Darstellung der Analyse. */
export function oldRiverFeatures() {
	// je Teilstück mit Herkunft: "heute" wo der heutige Lauf gilt, sonst alt
	return Object.entries(rivers).flatMap(([name, v]) =>
		(v.parts ?? [[0, coordsOf(v).length - 1, "osm"]]).map(([a, b, kind]) => ({
			type: "Feature",
			properties: {
				kind: "river",
				name,
				herkunft: kind === "osm" ? "heute" : "alt",
			},
			geometry: {
				type: "LineString",
				coordinates: coordsOf(v).slice(a, b + 1),
			},
		})),
	)
}
