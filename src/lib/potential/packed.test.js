import { describe, expect, test } from "bun:test"
import { FACTORS } from "./model"
import { pack, unpack } from "./packed"

// Zufällige, schon quantisierte Werte, damit die Rundreise exakt sein muss.
// "+ 0" macht aus -0 eine 0, die Datei kennt kein Vorzeichen bei null.
function sample(n) {
	let seed = 7
	const rnd = () => {
		seed = (seed * 16807) % 2147483647
		return seed / 2147483647
	}
	const unit = () =>
		Float32Array.from({ length: n }, () => Math.round(rnd() * 255) / 255)
	const dist = () =>
		Float32Array.from({ length: n }, (_, i) =>
			i % 17 === 0 ? Number.POSITIVE_INFINITY : Math.round(rnd() * 60000) * 10,
		)
	return {
		region: "test",
		grid: { cols: n, rows: 1 },
		score: unit(),
		factors: Object.fromEntries(FACTORS.map((f) => [f.key, unit()])),
		raw: {
			lines: unit(),
			wet: unit(),
			moor: unit(),
			forest: unit(),
			elev: Float32Array.from(
				{ length: n },
				() => Math.round(rnd() * 600 - 50) + 0,
			),
			slope: Float32Array.from(
				{ length: n },
				() => Math.round(rnd() * 400) / 10,
			),
			tpi: Float32Array.from(
				{ length: n },
				() => Math.round(rnd() * 80 - 40) / 2 + 0,
			),
			valley: Float32Array.from(
				{ length: n },
				() => Math.round(rnd() * 80 - 40) / 2 + 0,
			),
			distWater: dist(),
			distRiver: dist(),
			distCamp: dist(),
			distRoute: dist(),
		},
	}
}

describe("packed", () => {
	test("Rundreise ist verlustfrei", () => {
		const result = sample(1001)
		const { meta, buffer } = pack(result)
		expect(meta.encoding).toBe("delta")
		const back = unpack(JSON.parse(JSON.stringify(meta)), buffer.buffer)
		expect(back.region).toBe("test")
		expect(back.encoding).toBeUndefined()
		expect([...back.score]).toEqual([...result.score])
		for (const f of FACTORS)
			expect([...back.factors[f.key]]).toEqual([...result.factors[f.key]])
		for (const k of Object.keys(result.raw))
			expect([...back.raw[k]]).toEqual([...result.raw[k]])
	})
})
