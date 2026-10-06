import { describe, expect, test } from "bun:test"
import {
	cellAt,
	combine,
	computeSlope,
	computeTpi,
	createGrid,
	DEFAULT_PARAMS,
	distanceToCamps,
	distanceToLines,
	findCandidates,
	ringFactor,
	sampleElevation,
} from "./model"

// ca. 40 × 30 km um Minden
const bbox = [8.6, 52.15, 9.2, 52.42]
const grid = createGrid(bbox, 250, 11)

describe("Potenzialmodell", () => {
	test("Raster hat plausible Größe", () => {
		expect(grid.cols).toBeGreaterThan(150)
		expect(grid.cols).toBeLessThan(180)
		expect(grid.rows).toBeGreaterThan(110)
	})

	test("Distanztransformation misst Meter zur Linie", () => {
		const line = [
			[
				[8.9, 52.15],
				[8.9, 52.42],
			],
		]
		const d = distanceToLines(grid, line)
		const i = cellAt(grid, 8.9 + 0.0147, 52.3) // ~1 km östlich
		expect(d[i]).toBeGreaterThan(700)
		expect(d[i]).toBeLessThan(1300)
	})

	test("Ring hat Maximum im Tagesmarsch-Abstand", () => {
		const camps = [{ lon: 8.65, lat: 52.3 }]
		const ring = ringFactor(grid, camps, 19000, 2500)
		const at19 =
			ring[
				cellAt(
					grid,
					8.65 + 19 / (111.32 * Math.cos((52.3 * Math.PI) / 180)),
					52.3,
				)
			]
		const at8 =
			ring[
				cellAt(
					grid,
					8.65 + 8 / (111.32 * Math.cos((52.3 * Math.PI) / 180)),
					52.3,
				)
			]
		expect(at19).toBeGreaterThan(0.95)
		expect(at8).toBeLessThan(0.01)
	})

	test("Hügel bekommt positiven TPI und wird Kandidat", () => {
		const hill = [8.95, 52.3]
		const elev = sampleElevation(grid, () => 50)
		// künstlicher flacher Hügel (30 m, Radius ~1,5 km)
		const hc = cellAt(grid, hill[0], hill[1])
		const hcCol = hc % grid.cols
		const hcRow = Math.floor(hc / grid.cols)
		for (let r = 0; r < grid.rows; r++)
			for (let c = 0; c < grid.cols; c++) {
				const d = Math.hypot(c - hcCol, r - hcRow) * 250
				elev[r * grid.cols + c] =
					50 + 30 * Math.exp(-(d * d) / (2 * 1500 * 1500))
			}
		const slope = computeSlope(grid, elev)
		const tpi = computeTpi(grid, elev, 1500)
		expect(tpi[hc]).toBeGreaterThan(5)
		const camps = [{ lon: 8.95 - 19 / 68.2, lat: 52.3 }]
		const water = distanceToLines(grid, [
			[
				[8.955, 52.15],
				[8.955, 52.42],
			],
		])
		const { score } = combine(
			{
				ring: ringFactor(grid, camps, 19000, 2500),
				distWater: water,
				distRiver: water,
				tpi,
				slope,
				distCamp: distanceToCamps(grid, camps),
			},
			DEFAULT_PARAMS,
		)
		const cands = findCandidates(grid, score, { threshold: 0.5 })
		expect(cands.length).toBeGreaterThan(0)
		expect(Math.abs(cands[0].lon - hill[0])).toBeLessThan(0.03)
		expect(Math.abs(cands[0].lat - hill[1])).toBeLessThan(0.02)
	})
})

describe("Gewässernetz aus dem Höhenmodell", () => {
	test("Tal sammelt das Einzugsgebiet, Senke wird durchflossen", async () => {
		const { flowAccumulation } = await import("./drainage")
		// 60 × 40 Pixel à 100 m: Tal in der Mitte, Gefälle nach Osten, Senke im Tal
		const w = 60
		const h = 40
		const dem = new Float32Array(w * h)
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++)
				dem[y * w + x] = 100 - x * 0.5 + Math.abs(y - 20) * 2
		dem[20 * w + 30] = 50 // Senke
		const { acc } = flowAccumulation(dem, w, h, 100)
		const outlet = acc[20 * w + (w - 2)]
		const slopeCell = acc[5 * w + 30]
		expect(outlet).toBeGreaterThan(5) // km², fast das ganze Gebiet
		expect(slopeCell).toBeLessThan(0.1)
		expect(acc[20 * w + 31]).toBeGreaterThan(acc[20 * w + 29])
	})
})

describe("Marschrouten", () => {
	test("Route zwischen zwei Lagern, Umweg um steilen Rücken, Etappen", async () => {
		const { computeRoutes, costSurface, edgeHours, routeStages, terrainLanes } =
			await import("./routes")
		const n = grid.cols * grid.rows
		// 150 m hoher Kamm mit 50 % Flanken quer durch die Mitte, Pass im Süden
		const midCol = Math.floor(grid.cols / 2)
		const ridgeX = grid.x0 + (midCol + 0.5) * grid.cellPx
		const passY = grid.y0 + (grid.rows - 15) * grid.cellPx
		const metersPerPx = grid.cellMeters / grid.cellPx
		const sampler = (x, y) =>
			y < passY
				? Math.max(0, 150 - Math.abs(x - ridgeX) * metersPerPx * 0.5)
				: 0
		const edges = edgeHours(grid, terrainLanes(grid, sampler))
		const flat = new Float32Array(n)
		const far = new Float32Array(n).fill(1e6)
		const cost = costSurface(grid, {
			slope: flat,
			tpi: flat,
			distWater: far,
			distRiver: far,
		})
		const camps = [
			{ id: "a", name: "A", lon: 8.65, lat: 52.3 },
			{ id: "b", name: "B", lon: 9.15, lat: 52.3 },
		]
		const routes = computeRoutes(grid, cost, camps, 19000, undefined, {
			edges,
		})
		expect(routes.length).toBe(1)
		const r = routes[0]
		expect(r.length).toBeGreaterThan(r.crow)
		expect(r.length).toBeLessThan(r.crow * 1.6)
		// über den Kamm nur durch den Pass
		for (const c of r.cells) {
			if (Math.abs((c % grid.cols) - midCol) <= 1)
				expect(Math.floor(c / grid.cols)).toBeGreaterThanOrEqual(grid.rows - 15)
		}
		const score = new Float32Array(n).fill(0.5)
		const stages = routeStages(grid, routes, score, 19000)
		expect(stages.length).toBe(Math.max(0, Math.round(r.length / 19000) - 1))
	})
})

describe("Gerade Strukturen im Laserscan", () => {
	test("findet die vier Seiten und Ecken eines Grabengevierts", async () => {
		const { detectLineaments } = await import("./lineaments")
		const px = 2
		const w = 500
		const h = 500
		const dem = new Float32Array(w * h)
		const masked = new Uint8Array(w * h)
		let seed = 1
		const rand = () => {
			seed = (seed * 16807) % 2147483647
			return seed / 2147483647
		}
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				// Hang plus Rauschen
				let z = 100 + x * px * 0.02 + (rand() - 0.5) * 0.06
				// Graben 6 m breit, 0,5 m tief, Geviert 400 × 400 m ab (100, 100) px
				const gx = x >= 100 && x <= 300
				const gy = y >= 100 && y <= 300
				const nearV = gy && (Math.abs(x - 100) <= 1 || Math.abs(x - 300) <= 1)
				const nearH = gx && (Math.abs(y - 100) <= 1 || Math.abs(y - 300) <= 1)
				if (nearV || nearH) z -= 0.5
				// moderner Weg diagonal, als OSM-Linie maskiert
				const road = Math.abs(x - y * 0.5 - 330)
				if (road <= 2) z += 0.4
				// OSM-Puffer wie im echten Lauf: 7 Pixel um die Mittellinie
				if (road <= 7) masked[y * w + x] = 1
				dem[y * w + x] = z
			}
		}
		const { segments, corners } = detectLineaments(dem, w, h, px, masked)
		const long = segments.filter((s) => s.length >= 300)
		expect(long.length).toBeGreaterThanOrEqual(4)
		expect(corners.length).toBeGreaterThanOrEqual(4)
		// keine Linie entlang des maskierten Wegs (Normale ~153°)
		expect(
			segments.some((s) => Math.abs(s.angle - 153.4) < 3 && s.length > 200),
		).toBe(false)
	})
})
