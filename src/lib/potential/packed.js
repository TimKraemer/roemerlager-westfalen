import { FACTORS } from "./model"

/**
 * Kompaktes Format für vorberechnete Ergebnisse: Metadaten als JSON,
 * Raster als quantisierte Binärdatei. Faktoren und Gesamtwert 0–1 in
 * 1/255-Schritten, Höhen in 1 m, Neigung in 0,1°, Höhe über Umgebung in
 * 0,5 m, Abstände in 10 m. Gröber lässt es sich besser komprimieren.
 *
 * Mit encoding "delta" steht je Feld statt des Werts der Abstand zum
 * vorigen Wert, bei 16-Bit-Feldern erst alle unteren, dann alle oberen
 * Bytes. Benachbarte Zellen ähneln sich, gzip packt das rund 20 % kleiner
 * (Kreis Minden-Lübbecke 1,37 → 1,09 MB). Ältere Dateien ohne encoding
 * lassen sich weiter lesen.
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

/** Differenzen, bei 16 Bit nach Bytes getrennt. Typed Arrays rechnen modulo. */
function encode(values) {
	const delta = new values.constructor(values.length)
	for (let i = 0; i < values.length; i++)
		delta[i] = values[i] - (i ? values[i - 1] : 0)
	const bytes = new Uint8Array(delta.buffer)
	const w = values.BYTES_PER_ELEMENT
	if (w === 1) return bytes
	const n = values.length
	const out = new Uint8Array(bytes.length)
	for (let i = 0; i < n; i++)
		for (let b = 0; b < w; b++) out[b * n + i] = bytes[i * w + b]
	return out
}

function decode(type, bytes, n) {
	const w = type.BYTES_PER_ELEMENT
	const joined = new Uint8Array(n * w)
	for (let i = 0; i < n; i++)
		for (let b = 0; b < w; b++) joined[i * w + b] = bytes[b * n + i]
	const values = new type(joined.buffer)
	for (let i = 1; i < n; i++) values[i] += values[i - 1]
	return values
}

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
		const bytes = encode(out)
		fields.push({ path: field.path, offset })
		chunks.push(bytes)
		offset += bytes.byteLength
	}
	const buffer = new Uint8Array(offset)
	let pos = 0
	for (const c of chunks) {
		buffer.set(c, pos)
		pos += c.byteLength
	}
	const { score, factors, raw, ...meta } = result
	return { meta: { ...meta, cells: n, fields, encoding: "delta" }, buffer }
}

export function unpack(meta, arrayBuffer) {
	const result = { ...meta, factors: {}, raw: {} }
	const n = meta.cells
	FIELDS.forEach((field, k) => {
		const { offset } = meta.fields[k]
		const src =
			meta.encoding === "delta"
				? decode(
						field.type,
						new Uint8Array(
							arrayBuffer,
							offset,
							n * field.type.BYTES_PER_ELEMENT,
						),
						n,
					)
				: new field.type(arrayBuffer, offset, n)
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
	delete result.encoding
	return result
}
