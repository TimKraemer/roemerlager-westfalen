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
