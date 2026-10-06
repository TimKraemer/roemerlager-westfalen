import { FACTORS } from "./model"

/**
 * Kompaktes Format für vorberechnete Ergebnisse: Metadaten als JSON,
 * Raster als quantisierte Binärdatei. Faktoren und Gesamtwert 0–1 in
 * 1/255-Schritten, Höhen in 1 m, Neigung in 0,1°, Höhe über Umgebung in
 * 0,5 m, Abstände in 10 m. Gröber lässt es sich besser komprimieren.
 */

const NO_DISTANCE = 65535

const FIELDS = [
	{ path: ["score"], type: Uint8Array, scale: 255 },
	...FACTORS.map((f) => ({
		path: ["factors", f.key],
		type: Uint8Array,
		scale: 255,
	})),
	{ path: ["raw", "lines"], type: Uint8Array, scale: 255 },
	{ path: ["raw", "wet"], type: Uint8Array, scale: 255 },
	{ path: ["raw", "moor"], type: Uint8Array, scale: 255 },
	{ path: ["raw", "forest"], type: Uint8Array, scale: 255 },
	{ path: ["raw", "elev"], type: Int16Array, scale: 1 },
	{ path: ["raw", "slope"], type: Uint16Array, scale: 10 },
	{ path: ["raw", "tpi"], type: Int16Array, scale: 2 },
	{ path: ["raw", "valley"], type: Int16Array, scale: 2 },
	{ path: ["raw", "distWater"], type: Uint16Array, scale: 0.1, distance: true },
	{ path: ["raw", "distRiver"], type: Uint16Array, scale: 0.1, distance: true },
	{ path: ["raw", "distCamp"], type: Uint16Array, scale: 0.1, distance: true },
	{ path: ["raw", "distRoute"], type: Uint16Array, scale: 0.1, distance: true },
]

const get = (obj, path) => path.reduce((o, k) => o?.[k], obj)

export function pack(result) {
	const n = result.score.length
	const chunks = []
	const fields = []
	let offset = 0
	for (const field of FIELDS) {
		const src = get(result, field.path)
		const out = new field.type(n)
		const max =
			field.type === Int16Array
				? 32767
				: field.type === Uint16Array
					? 65534
					: 255
		const min = field.type === Int16Array ? -32768 : 0
		for (let i = 0; i < n; i++) {
			const v = src?.[i]
			if (field.distance && !Number.isFinite(v)) out[i] = NO_DISTANCE
			else
				out[i] = Math.max(
					min,
					Math.min(max, Math.round((v ?? 0) * field.scale)),
				)
		}
		// 16-Bit-Felder brauchen eine gerade Startadresse
		if (offset % out.BYTES_PER_ELEMENT) {
			chunks.push(new Uint8Array(1))
			offset += 1
		}
		fields.push({ path: field.path, offset })
		chunks.push(new Uint8Array(out.buffer))
		offset += out.byteLength
	}
	const buffer = new Uint8Array(offset)
	let pos = 0
	for (const c of chunks) {
		buffer.set(c, pos)
		pos += c.byteLength
	}
	const { score, factors, raw, ...meta } = result
	return { meta: { ...meta, cells: n, fields }, buffer }
}

export function unpack(meta, arrayBuffer) {
	const result = { ...meta, factors: {}, raw: {} }
	FIELDS.forEach((field, k) => {
		const { offset } = meta.fields[k]
		const src = new field.type(arrayBuffer, offset, meta.cells)
		const out = new Float32Array(meta.cells)
		for (let i = 0; i < meta.cells; i++) {
			out[i] =
				field.distance && src[i] === NO_DISTANCE
					? Number.POSITIVE_INFINITY
					: src[i] / field.scale
		}
		const [a, b] = field.path
		if (b) result[a][b] = out
		else result[a] = out
	})
	delete result.fields
	delete result.cells
	return result
}
