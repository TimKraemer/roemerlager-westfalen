/**
 * Gewässernetz aus dem Höhenmodell: Senken füllen (Priority-Flood+ε,
 * Barnes et al. 2014), Abfluss nach steilstem Gefälle (D8) und
 * Einzugsgebiet je Pixel aufsummieren. Pixel mit genügend Einzugsgebiet
 * gelten als Bach bzw. Fluss. Das folgt den natürlichen Talzügen und
 * kennt weder Kanäle noch Begradigungen.
 */

const EPS = 1e-4
const NEIGHBORS = [
	[-1, -1],
	[0, -1],
	[1, -1],
	[-1, 0],
	[1, 0],
	[-1, 1],
	[0, 1],
	[1, 1],
]

/** Min-Heap über Pixelindizes mit Float64-Schlüsseln. */
class Heap {
	constructor(capacity) {
		this.ids = new Int32Array(capacity)
		this.keys = new Float64Array(capacity)
		this.size = 0
	}
	push(id, key) {
		let i = this.size++
		while (i > 0) {
			const p = (i - 1) >> 1
			if (this.keys[p] <= key) break
			this.ids[i] = this.ids[p]
			this.keys[i] = this.keys[p]
			i = p
		}
		this.ids[i] = id
		this.keys[i] = key
	}
	pop() {
		const top = this.ids[0]
		const lastId = this.ids[--this.size]
		const lastKey = this.keys[this.size]
		let i = 0
		while (true) {
			let c = 2 * i + 1
			if (c >= this.size) break
			if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++
			if (this.keys[c] >= lastKey) break
			this.ids[i] = this.ids[c]
			this.keys[i] = this.keys[c]
			i = c
		}
		this.ids[i] = lastId
		this.keys[i] = lastKey
		return top
	}
}

/**
 * @param {Float32Array} dem Höhen (Meter), Zeilen von oben
 * @param {number} width
 * @param {number} height
 * @param {number} pixelMeters Kantenlänge eines Pixels
 * @returns {{acc: Float32Array, receiver: Int32Array}} Einzugsgebiet je
 *   Pixel in km² und Abflussziel je Pixel (-1 am Rand)
 */
export function flowAccumulation(dem, width, height, pixelMeters) {
	const n = width * height
	const filled = Float64Array.from(dem)
	const closed = new Uint8Array(n)
	const order = new Int32Array(n)
	const heap = new Heap(n)

	for (let x = 0; x < width; x++) {
		for (const y of [0, height - 1]) {
			const i = y * width + x
			if (!closed[i]) {
				closed[i] = 1
				heap.push(i, filled[i])
			}
		}
	}
	for (let y = 1; y < height - 1; y++) {
		for (const x of [0, width - 1]) {
			const i = y * width + x
			closed[i] = 1
			heap.push(i, filled[i])
		}
	}

	// Pixel kommen in aufsteigender (gefüllter) Höhe aus dem Heap
	let k = 0
	while (heap.size) {
		const c = heap.pop()
		order[k++] = c
		const cx = c % width
		const cy = (c - cx) / width
		for (const [dx, dy] of NEIGHBORS) {
			const nx = cx + dx
			const ny = cy + dy
			if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
			const nb = ny * width + nx
			if (closed[nb]) continue
			closed[nb] = 1
			if (filled[nb] <= filled[c]) filled[nb] = filled[c] + EPS
			heap.push(nb, filled[nb])
		}
	}

	// D8: steilstes Gefälle zum Nachbarn, Diagonalen mit √2
	const receiver = new Int32Array(n).fill(-1)
	for (let i = 0; i < n; i++) {
		const x = i % width
		const y = (i - x) / width
		let best = 0
		for (const [dx, dy] of NEIGHBORS) {
			const nx = x + dx
			const ny = y + dy
			if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
			const nb = ny * width + nx
			const drop = (filled[i] - filled[nb]) / (dx && dy ? Math.SQRT2 : 1)
			if (drop > best) {
				best = drop
				receiver[i] = nb
			}
		}
	}

	// Von oben nach unten aufsummieren (umgekehrte Heap-Reihenfolge)
	const cellKm2 = (pixelMeters * pixelMeters) / 1e6
	const acc = new Float32Array(n).fill(cellKm2)
	for (let j = n - 1; j >= 0; j--) {
		const i = order[j]
		const r = receiver[i]
		if (r >= 0) acc[r] += acc[i]
	}
	return { acc, receiver }
}

/**
 * Gewässerpixel zu Linien verketten: Eine Linie beginnt an einer Quelle
 * oder einem Zusammenfluss und läuft abwärts bis zum nächsten.
 * @param {(i: number) => [number, number]} toLonLat Pixelmitte -> Länge/Breite
 */
export function streamLines({ acc, receiver }, minKm2, riverKm2, toLonLat) {
	const n = acc.length
	const donors = new Uint8Array(n)
	for (let i = 0; i < n; i++) {
		if (acc[i] >= minKm2 && receiver[i] >= 0) donors[receiver[i]]++
	}
	const features = []
	for (let i = 0; i < n; i++) {
		if (acc[i] < minKm2 || donors[i] === 1) continue
		const coords = [toLonLat(i)]
		let c = i
		while (receiver[c] >= 0) {
			c = receiver[c]
			coords.push(toLonLat(c))
			if (donors[c] !== 1) break
		}
		if (coords.length < 2) continue
		features.push({
			type: "Feature",
			properties: {
				kind: acc[c] >= riverKm2 ? "river" : "stream",
				km2: Math.round(acc[c]),
			},
			geometry: { type: "LineString", coordinates: coords },
		})
	}
	return { type: "FeatureCollection", features }
}
