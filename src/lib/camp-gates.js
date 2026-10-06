/**
 * Marschrouten enden in der Lagermitte, das Analyse-Raster kennt aber
 * keine Mauer. Am Ende jeder Fußroute zu einem Lager mit bekannten Toren
 * wird der letzte Abschnitt ersetzt: über das Tor, das den kürzesten Weg
 * ergibt, ohne die Mauer zu schneiden, dann die Lagerstraße entlang bis
 * zur Kreuzung in der Mitte.
 *
 * Oberaden: Wall (konvexe Hülle des Erdwerks) und Torwege aus dem
 * 3D-Modell (oberaden-model.js, Meshes „Soil“ und „Pfad“), mit dessen
 * Lage, Maßstab und Drehung in Länge/Breite umgerechnet. Wege aus dem
 * Lager hat das Modell nur am Nord-, West- und Südtor, das Osttor gilt
 * als Entwässerungstor und bleibt außen vor.
 */

const CAMPS = [
	{
		name: "Bergkamen-Oberaden",
		// Kreuzung von Nord-Süd- und West-Straße
		center: [7.581708, 51.610212],
		wall: [
			[7.587707, 51.607136],
			[7.587477, 51.606891],
			[7.587096, 51.606829],
			[7.577822, 51.607446],
			[7.577328, 51.607512],
			[7.576665, 51.607723],
			[7.575999, 51.60818],
			[7.57496, 51.609709],
			[7.575414, 51.612448],
			[7.575789, 51.612723],
			[7.579962, 51.61425],
			[7.585151, 51.613933],
			[7.585945, 51.613741],
			[7.588346, 51.612646],
			[7.588576, 51.612397],
		],
		// Je Tor von außen nach innen: 110 m vor dem Tor, Ende des Torwegs,
		// Durchlass in der Mauer
		gates: [
			[
				[7.582481, 51.615128],
				[7.582307, 51.614119],
				[7.58224, 51.613728],
			],
			[
				[7.573467, 51.610761],
				[7.57507, 51.610654],
				[7.575711, 51.610612],
			],
			[
				[7.581093, 51.606211],
				[7.581268, 51.607224],
				[7.581336, 51.607618],
			],
		],
	},
]

// Ein Routenende so nah an der Lagermitte gehört zu diesem Lager
const REACH = 800

/** Ebene Meter um einen Bezugspunkt, auf wenigen Kilometern genau genug. */
function planar([lon0, lat0]) {
	const kx = 111320 * Math.cos((lat0 * Math.PI) / 180)
	const ky = 110574
	return ([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky]
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const cross = (o, a, b) =>
	(a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

function inside(p, ring) {
	let hit = false
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const [xi, yi] = ring[i]
		const [xj, yj] = ring[j]
		if (
			yi > p[1] !== yj > p[1] &&
			p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi
		)
			hit = !hit
	}
	return hit
}

function crossesRing(a, b, ring) {
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const c = ring[j]
		const d = ring[i]
		if (
			cross(a, b, c) * cross(a, b, d) < 0 &&
			cross(c, d, a) * cross(c, d, b) < 0
		)
			return true
	}
	return false
}

/**
 * Ersetzt das Ende von coords (Länge/Breite), falls es in einem Lager mit
 * Toren liegt. Gibt die neuen Koordinaten zurück oder null.
 */
function gateEnd(coords) {
	const last = coords[coords.length - 1]
	for (const camp of CAMPS) {
		const xy = planar(camp.center)
		if (dist(xy(last), [0, 0]) > REACH) continue
		const pts = coords.map(xy)
		const wall = camp.wall.map(xy)
		const along = [0]
		for (let k = 1; k < pts.length; k++)
			along.push(along[k - 1] + dist(pts[k - 1], pts[k]))
		let best = null
		for (const gate of camp.gates) {
			const front = xy(gate[0])
			// Der Punkt der Route, der dem Lager am nächsten liegt und von
			// dem aus das Vorfeld des Tors frei erreichbar ist
			for (let k = pts.length - 1; k >= 0; k--) {
				if (inside(pts[k], wall) || crossesRing(pts[k], front, wall)) continue
				const cost = along[k] + dist(pts[k], front)
				if (!best || cost < best.cost) best = { cost, k, gate }
				break
			}
		}
		if (!best) return null
		return [...coords.slice(0, best.k + 1), ...best.gate, camp.center]
	}
	return null
}

/** Fußrouten als GeoJSON: Enden in Lagern durch die Tore führen. */
export function throughGates(fc) {
	return {
		...fc,
		features: fc.features.map((f) => {
			if (f.properties?.mode === "Schiff" || f.geometry?.type !== "LineString")
				return f
			let coords = f.geometry.coordinates
			const end = gateEnd(coords)
			if (end) coords = end
			const start = gateEnd([...coords].reverse())
			if (start) coords = start.reverse()
			if (coords === f.geometry.coordinates) return f
			return { ...f, geometry: { ...f.geometry, coordinates: coords } }
		}),
	}
}
