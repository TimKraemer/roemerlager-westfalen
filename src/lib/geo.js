/**
 * Kleine Geo-Helfer ohne Abhängigkeiten. Das Analyse-Raster liegt in
 * Web-Mercator-Pixeln einer festen Zoomstufe, damit es als Bildquelle
 * deckungsgleich über der MapLibre-Karte liegt und die DEM-Kacheln
 * ohne Umprojektion gelesen werden können.
 */

export const EARTH_RADIUS = 6371008.8
const TILE_SIZE = 256

export function haversine(lon1, lat1, lon2, lat2) {
	const rad = Math.PI / 180
	const dLat = (lat2 - lat1) * rad
	const dLon = (lon2 - lon1) * rad
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
	return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(a))
}

// Weltpixel (0 … 256·2^z) <-> Länge/Breite
export function lonLatToPixel(lon, lat, z) {
	const scale = TILE_SIZE * 2 ** z
	const x = ((lon + 180) / 360) * scale
	const s = Math.sin((lat * Math.PI) / 180)
	const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale
	return [x, y]
}

export function pixelToLonLat(x, y, z) {
	const scale = TILE_SIZE * 2 ** z
	const lon = (x / scale) * 360 - 180
	const n = Math.PI - (2 * Math.PI * y) / scale
	const lat = (180 / Math.PI) * Math.atan(Math.sinh(n))
	return [lon, lat]
}

// Bodenauflösung eines Pixels in Metern
export function metersPerPixel(lat, z) {
	return (
		(Math.cos((lat * Math.PI) / 180) * 2 * Math.PI * 6378137) /
		(TILE_SIZE * 2 ** z)
	)
}

// Kreis als GeoJSON-Polygon (für die Tagesmarsch-Ringe)
export function circlePolygon(lon, lat, radiusMeters, steps = 96) {
	const rad = Math.PI / 180
	const coords = []
	const angular = radiusMeters / EARTH_RADIUS
	for (let i = 0; i <= steps; i++) {
		const bearing = (i / steps) * 2 * Math.PI
		const lat2 = Math.asin(
			Math.sin(lat * rad) * Math.cos(angular) +
				Math.cos(lat * rad) * Math.sin(angular) * Math.cos(bearing),
		)
		const lon2 =
			lon * rad +
			Math.atan2(
				Math.sin(bearing) * Math.sin(angular) * Math.cos(lat * rad),
				Math.cos(angular) - Math.sin(lat * rad) * Math.sin(lat2),
			)
		coords.push([lon2 / rad, lat2 / rad])
	}
	return coords
}

/** Punkt in (Multi-)Polygon, Ray-Casting über alle Ringe. */
export function pointInGeometry(lon, lat, geometry) {
	const polygons =
		geometry.type === "MultiPolygon"
			? geometry.coordinates
			: [geometry.coordinates]
	let inside = false
	for (const polygon of polygons) {
		for (const ring of polygon) {
			for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
				const [xi, yi] = ring[i]
				const [xj, yj] = ring[j]
				if (
					yi > lat !== yj > lat &&
					lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
				) {
					inside = !inside
				}
			}
		}
	}
	return inside
}

/**
 * Linien in die Stücke zerlegen, deren Punkte keep(punkt, index) erfüllen.
 * Stücke aus nur einem Punkt fallen weg.
 */
export function splitLines(features, keep) {
	const out = []
	for (const f of features) {
		let run = []
		const flush = () => {
			if (run.length > 1)
				out.push({ ...f, geometry: { type: "LineString", coordinates: run } })
			run = []
		}
		f.geometry.coordinates.forEach((p, i) => {
			if (keep(p, i)) run.push(p)
			else flush()
		})
		flush()
	}
	return out
}

const JOIN_END_M = 30

/** Länge einer Linie [[lon, lat], …] in Metern. */
export function lineLength(coords) {
	let m = 0
	for (let i = 1; i < coords.length; i++)
		m += haversine(...coords[i - 1], ...coords[i])
	return m
}

/**
 * Heutige Flüsse aus OSM als zusammenhängende Linien. OSM führt denselben
 * Fluss abschnittsweise als „river“ und als „stream“, und die Vektorkacheln
 * zerschneiden ihn an den Kachelkanten. Hier gehören zu einem Fluss alle
 * Stücke seines Namens, die an ihn anschließen, je Name zusammengefügt.
 * Was danach kürzer als minMeters ist, fällt weg.
 */
export function riverNetwork(features, minMeters) {
	const named = (f) => f.properties.name || ""
	const ends = (f) => {
		const c = f.geometry.coordinates
		return [c[0], c[c.length - 1]]
	}
	const touch = (a, b) =>
		ends(a).some((p) => ends(b).some((q) => haversine(...p, ...q) < JOIN_END_M))
	const byName = new Map()
	for (const f of features) {
		if (!named(f)) continue
		if (!byName.has(named(f))) byName.set(named(f), [])
		byName.get(named(f)).push(f)
	}
	const out = []
	for (const [name, all] of byName) {
		const chosen = all.filter((f) => f.properties.kind === "river")
		if (!chosen.length) continue
		// Bach-Stücke desselben Namens, die an den Fluss anschließen
		let rest = all.filter((f) => f.properties.kind !== "river")
		let grew = true
		while (grew && rest.length) {
			grew = false
			const next = []
			for (const f of rest) {
				if (chosen.some((g) => touch(f, g))) {
					chosen.push(f)
					grew = true
				} else next.push(f)
			}
			rest = next
		}
		// Stücke an gemeinsamen Enden zu Linien verbinden
		const lines = chosen.map((f) => [...f.geometry.coordinates])
		let joined = true
		while (joined) {
			joined = false
			outer: for (let i = 0; i < lines.length; i++) {
				for (let j = i + 1; j < lines.length; j++) {
					const a = lines[i]
					const b = lines[j]
					const pairs = [
						[a.at(-1), b[0], () => [...a, ...b.slice(1)]],
						[a.at(-1), b.at(-1), () => [...a, ...[...b].reverse().slice(1)]],
						[a[0], b.at(-1), () => [...b, ...a.slice(1)]],
						[a[0], b[0], () => [...[...b].reverse(), ...a.slice(1)]],
					]
					for (const [p, q, merge] of pairs) {
						if (haversine(...p, ...q) < JOIN_END_M) {
							lines[i] = merge()
							lines.splice(j, 1)
							joined = true
							break outer
						}
					}
				}
			}
		}
		for (const c of lines) {
			if (lineLength(c) < minMeters) continue
			out.push({
				type: "Feature",
				properties: { kind: "river", name },
				geometry: { type: "LineString", coordinates: c },
			})
		}
	}
	return out
}
