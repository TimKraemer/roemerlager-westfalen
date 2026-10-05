/**
 * UTM (ETRS89/WGS84, Zone 32) <-> Länge/Breite nach den Reihen von Krüger
 * (Karney 2011, 6. Ordnung reicht für Millimeter). Gebraucht für das
 * DGM1 NRW, das in EPSG:25832 geliefert wird.
 */

const A = 6378137
const F = 1 / 298.257223563
const K0 = 0.9996
const N = F / (2 - F)
const AA = (A / (1 + N)) * (1 + N ** 2 / 4 + N ** 4 / 64)
const ALPHA = [
	N / 2 - (2 / 3) * N ** 2 + (5 / 16) * N ** 3,
	(13 / 48) * N ** 2 - (3 / 5) * N ** 3,
	(61 / 240) * N ** 3,
]
const BETA = [
	N / 2 - (2 / 3) * N ** 2 + (37 / 96) * N ** 3,
	(1 / 48) * N ** 2 + (1 / 15) * N ** 3,
	(17 / 480) * N ** 3,
]
const DELTA = [
	2 * N - (2 / 3) * N ** 2 - 2 * N ** 3,
	(7 / 3) * N ** 2 - (8 / 5) * N ** 3,
	(56 / 15) * N ** 3,
]
const E0 = 500000
const RAD = Math.PI / 180

export function lonLatToUtm(lon, lat, zone = 32) {
	const lon0 = (zone * 6 - 183) * RAD
	const phi = lat * RAD
	const lam = lon * RAD - lon0
	const e = Math.sqrt(F * (2 - F))
	const t = Math.sinh(
		Math.atanh(Math.sin(phi)) - e * Math.atanh(e * Math.sin(phi)),
	)
	const xi = Math.atan2(t, Math.cos(lam))
	const eta = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t))
	let x = eta
	let y = xi
	for (let j = 1; j <= 3; j++) {
		x += ALPHA[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta)
		y += ALPHA[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta)
	}
	return [E0 + K0 * AA * x, K0 * AA * y]
}

export function utmToLonLat(easting, northing, zone = 32) {
	const lon0 = (zone * 6 - 183) * RAD
	const xi = northing / (K0 * AA)
	const eta = (easting - E0) / (K0 * AA)
	let xi1 = xi
	let eta1 = eta
	for (let j = 1; j <= 3; j++) {
		xi1 -= BETA[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta)
		eta1 -= BETA[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta)
	}
	const chi = Math.asin(Math.sin(xi1) / Math.cosh(eta1))
	let phi = chi
	for (let j = 1; j <= 3; j++) phi += DELTA[j - 1] * Math.sin(2 * j * chi)
	const lam = Math.atan2(Math.sinh(eta1), Math.cos(xi1))
	return [(lon0 + lam) / RAD, phi / RAD]
}
