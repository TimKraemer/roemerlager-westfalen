import { describe, expect, test } from "bun:test"
import { pixelToLonLat } from "./geo"
import { polygonCover } from "./moor"

describe("Moore aus der Kreiskarte 1844", () => {
	const grid = { zoom: 11, x0: 1000, y0: 2000, cellPx: 2, cols: 6, rows: 4 }
	const lonLat = (c, r) => pixelToLonLat(grid.x0 + c * 2, grid.y0 + r * 2, 11)
	const square = (kind, c0, r0, c1, r1) => ({
		type: "Feature",
		properties: { kind },
		geometry: {
			type: "Polygon",
			coordinates: [
				[
					lonLat(c0, r0),
					lonLat(c1, r0),
					lonLat(c1, r1),
					lonLat(c0, r1),
					lonLat(c0, r0),
				],
			],
		},
	})

	test("deckt genau die Zellen im Umriss ab", () => {
		const cover = polygonCover(grid, [square("moor", 1, 1, 3, 2)])
		expect(cover[1 * 6 + 1]).toBeCloseTo(1)
		expect(cover[1 * 6 + 2]).toBeCloseTo(1)
		expect(cover[1 * 6 + 3]).toBe(0)
		expect(cover[0]).toBe(0)
		expect(cover[2 * 6 + 1]).toBe(0)
	})

	test("halbe Zelle zählt halb, Bruch schwächer als Moor", () => {
		const half = polygonCover(grid, [square("moor", 0, 0, 0.5, 1)])
		expect(half[0]).toBeCloseTo(0.5)
		const bruch = polygonCover(grid, [square("bruch", 0, 0, 1, 1)])
		expect(bruch[0]).toBeCloseTo(0.6)
	})
})
