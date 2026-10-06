import { describe, expect, test } from "bun:test"
import {
	correction,
	editDistance,
	parseCoordinates,
	searchLocal,
	searchPlaces,
} from "./search"

describe("editDistance", () => {
	test("Vertauschung zählt als ein Fehler", () => {
		expect(editDistance("barkhasuen", "barkhausen", 2)).toBe(1)
	})
	test("bricht über dem Maximum ab", () => {
		expect(editDistance("varus", "weser", 1)).toBe(2)
	})
})

describe("searchLocal", () => {
	test("findet Texte über das Stichwort", () => {
		const hits = searchLocal("Varus")
		expect(hits[0].label).toContain("Kalkriese")
		expect(hits.some((h) => h.kind === "text")).toBe(true)
	})
	test("lateinischer Flussname", () => {
		expect(searchLocal("Lupia")[0].label).toBe("Lippe")
	})
	test("lateinisches Wort trifft die Übersetzung", () => {
		const hits = searchLocal("Cherusci", { kinds: ["text"] })
		expect(hits.map((h) => h.id)).toContain("dio-54-33")
	})
	test("Tippfehler mit Vorschlag", () => {
		const hits = searchLocal("Kalkrise")
		expect(hits[0].fuzzy).toBe(true)
		expect(correction("Kalkrise", hits)).toBe("Kalkriese")
	})
	test("kein Vorschlag bei genauen Treffern", () => {
		expect(correction("Varus", searchLocal("Varus"))).toBeNull()
	})
	test("Filter nach Art", () => {
		const hits = searchLocal("Haltern", { kinds: ["source"] })
		expect(hits.every((h) => h.kind === "source")).toBe(true)
	})
})

describe("searchPlaces", () => {
	const place = (name, cls, lon, lat) => ({
		name,
		cls,
		lon,
		lat,
		near: "Minden",
		n: name.toLowerCase(),
		alias: null,
		words: [{ n: name.toLowerCase(), o: name }],
	})
	const index = [
		place("Hille", "v", 8.75, 52.34),
		place("Hillegossen", "s", 8.6, 52.0),
		place("Lübbecke", "t", 8.62, 52.3),
	]
	index[2].n = "lubbecke"
	index[2].words = [{ n: "lubbecke", o: "Lübbecke" }]

	test("genauer Name zuerst", () => {
		expect(searchPlaces(index, "Hille")[0].label).toBe("Hille")
	})
	test("Umschrift mit ue findet den Umlaut", () => {
		const [hit] = searchPlaces(index, "Luebbecke")
		expect(hit.label).toBe("Lübbecke")
		expect(hit.fuzzy).toBe(true)
	})
})

describe("parseCoordinates", () => {
	const at = (q) => {
		const c = parseCoordinates(q)
		return c && [Number(c.lat.toFixed(3)), Number(c.lon.toFixed(3))]
	}
	test("dezimal, auch mit Komma und vertauscht", () => {
		expect(at("52.2512, 8.9116")).toEqual([52.251, 8.912])
		expect(at("52,2512 8,9116")).toEqual([52.251, 8.912])
		expect(at("8.9116, 52.2512")).toEqual([52.251, 8.912])
	})
	test("Grad, Minuten, Sekunden", () => {
		expect(at(`52°15'04" N 8°54'41" O`)).toEqual([52.251, 8.911])
		expect(at("N 52° 15.07' E 8° 54.68'")).toEqual([52.251, 8.911])
	})
	test("UTM Zone 32", () => {
		expect(at("32U 489000 5789000")).toEqual([52.251, 8.839])
		expect(at("32489000 5789000")).toEqual([52.251, 8.839])
	})
	test("keine Koordinaten", () => {
		expect(parseCoordinates("Minden")).toBeNull()
		expect(parseCoordinates("1 2")).toBeNull()
	})
	test("eigene Beschriftung lässt sich wieder lesen", () => {
		const c = parseCoordinates("52.2512, 8.9116")
		expect(parseCoordinates(c.label).key).toBe(c.key)
	})
})
