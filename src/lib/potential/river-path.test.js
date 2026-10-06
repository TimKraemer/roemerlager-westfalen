import { describe, expect, test } from "bun:test"
import { haversine } from "../geo"
import { riverGraph, riverPath } from "./river-path"

// Hauptfluss von West nach Ost mit einer Schleife nach Norden, Nebenfluss
// mündet von Süden bei 7,3° (Ende 500 m neben dem Hauptfluss)
const main = [
	[7.0, 51.7],
	[7.1, 51.7],
	[7.1, 51.75],
	[7.2, 51.75],
	[7.2, 51.7],
	[7.4, 51.7],
]
const side = [
	[7.3, 51.6],
	[7.3, 51.6955],
]
const graph = riverGraph([main, side])

const lengthOf = (coords) => {
	let d = 0
	for (let k = 1; k < coords.length; k++)
		d += haversine(...coords[k - 1], ...coords[k])
	return d
}

describe("Schiffsweg auf dem Flussnetz", () => {
	test("folgt der Schleife statt abzukürzen", () => {
		const path = riverPath(
			graph,
			{ lon: 7.05, lat: 51.702 },
			{ lon: 7.3, lat: 51.701 },
		)
		expect(path.coords).toContainEqual([7.1, 51.75])
		expect(path.coords).toContainEqual([7.2, 51.75])
		// Lager → Ufer, Fluss, Ufer → Lager
		expect(path.coords[0]).toEqual([7.05, 51.702])
		expect(path.coords.at(-1)).toEqual([7.3, 51.701])
		expect(path.length).toBeCloseTo(lengthOf(path.coords), 3)
		expect(path.length).toBeGreaterThan(
			haversine(7.05, 51.702, 7.3, 51.701) + 10000,
		)
	})

	test("fährt über die Mündung in den Nebenfluss", () => {
		const path = riverPath(
			graph,
			{ lon: 7.35, lat: 51.7 },
			{ lon: 7.301, lat: 51.62 },
		)
		expect(path).not.toBeNull()
		expect(path.coords).toContainEqual([7.3, 51.6955])
	})

	test("zwei Lager am selben Abschnitt: gerade am Ufer entlang", () => {
		const path = riverPath(
			graph,
			{ lon: 7.25, lat: 51.701 },
			{ lon: 7.35, lat: 51.701 },
		)
		expect(path.coords).toHaveLength(4)
		expect(path.coords[1][1]).toBeCloseTo(51.7, 6)
		expect(path.coords[2][1]).toBeCloseTo(51.7, 6)
	})

	test("kein Weg für Lager fern vom Fluss", () => {
		expect(
			riverPath(graph, { lon: 7.05, lat: 51.702 }, { lon: 7.3, lat: 51.9 }),
		).toBeNull()
	})
})
