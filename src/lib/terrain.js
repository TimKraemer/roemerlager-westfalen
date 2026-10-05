/**
 * Höhenmodell aus Terrarium-Kacheln (AWS Open Data, wie in erleben.app
 * scripts/map-styles/build-dem.mjs). Höhe = R·256 + G + B/256 − 32768.
 * Läuft im Worker: fetch -> createImageBitmap -> OffscreenCanvas.
 */

export const TERRARIUM_URL =
	"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
const TILE = 256

const tileCache = new Map()

async function loadTile(z, x, y) {
	const key = `${z}/${x}/${y}`
	if (!tileCache.has(key)) {
		tileCache.set(
			key,
			(async () => {
				const url = TERRARIUM_URL.replace("{z}", z)
					.replace("{x}", x)
					.replace("{y}", y)
				const res = await fetch(url)
				if (!res.ok) return null
				const bitmap = await createImageBitmap(await res.blob())
				const canvas = new OffscreenCanvas(TILE, TILE)
				const ctx = canvas.getContext("2d", { willReadFrequently: true })
				ctx.drawImage(bitmap, 0, 0)
				const { data } = ctx.getImageData(0, 0, TILE, TILE)
				const heights = new Float32Array(TILE * TILE)
				for (let i = 0; i < heights.length; i++) {
					heights[i] =
						data[i * 4] * 256 + data[i * 4 + 1] + data[i * 4 + 2] / 256 - 32768
				}
				return heights
			})().catch(() => null),
		)
	}
	return tileCache.get(key)
}

/**
 * Lädt alle Kacheln für einen Weltpixel-Ausschnitt und liefert einen
 * bilinearen Sampler (x, y in Weltpixeln der Zoomstufe z).
 */
export async function loadElevationSampler(z, x0, y0, x1, y1, onProgress) {
	const tx0 = Math.floor(x0 / TILE)
	const ty0 = Math.floor(y0 / TILE)
	const tx1 = Math.floor(x1 / TILE)
	const ty1 = Math.floor(y1 / TILE)
	const tiles = new Map()
	const jobs = []
	for (let ty = ty0; ty <= ty1; ty++) {
		for (let tx = tx0; tx <= tx1; tx++) jobs.push([tx, ty])
	}
	let done = 0
	// Höchstens 8 parallele Anfragen
	const queue = [...jobs]
	await Promise.all(
		Array.from({ length: 8 }, async () => {
			while (queue.length) {
				const [tx, ty] = queue.shift()
				tiles.set(`${tx}/${ty}`, await loadTile(z, tx, ty))
				done++
				onProgress?.(done / jobs.length)
			}
		}),
	)

	const raw = (px, py) => {
		const tx = Math.floor(px / TILE)
		const ty = Math.floor(py / TILE)
		const tile = tiles.get(`${tx}/${ty}`)
		if (!tile) return Number.NaN
		const ix = Math.min(TILE - 1, Math.max(0, Math.floor(px - tx * TILE)))
		const iy = Math.min(TILE - 1, Math.max(0, Math.floor(py - ty * TILE)))
		return tile[iy * TILE + ix]
	}

	return (x, y) => {
		const fx = x - 0.5
		const fy = y - 0.5
		const ix = Math.floor(fx)
		const iy = Math.floor(fy)
		const ax = fx - ix
		const ay = fy - iy
		const a = raw(ix, iy)
		const b = raw(ix + 1, iy)
		const c = raw(ix, iy + 1)
		const d = raw(ix + 1, iy + 1)
		return (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay
	}
}
