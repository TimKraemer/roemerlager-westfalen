import { describe, expect, test } from "bun:test"
import texts from "@/data/texte.json"
import {
	CHAPTERS,
	chapterOf,
	laterBy,
	neighbours,
	ORDERED,
	yearSpan,
} from "./text-timeline"

describe("Kapitel", () => {
	test("jeder Text steht in genau einem Kapitel", () => {
		expect(ORDERED).toHaveLength(texts.length)
		for (const t of texts) {
			expect(ORDERED.filter((x) => x?.id === t.id)).toHaveLength(1)
		}
	})

	test("die Feldzüge laufen in zeitlicher Folge", () => {
		const campaign = ORDERED.filter((t) => t.group === "feldzug")
		const starts = campaign.map((t) => yearSpan(t.year)[0])
		expect(starts).toEqual([...starts].sort((a, b) => a - b))
	})

	test("chapterOf findet das Kapitel", () => {
		expect(chapterOf("tac-ann-1-61").id).toBe("germanicus")
		expect(chapterOf("gibt-es-nicht")).toBeNull()
		expect(CHAPTERS.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6])
	})
})

describe("yearSpan", () => {
	test("liest die Angaben aus texte.json", () => {
		expect(yearSpan("12–9 v. Chr.")).toEqual([-12, -9])
		expect(yearSpan("11 v. Chr.")).toEqual([-11, -11])
		expect(yearSpan("um 115 n. Chr.")).toEqual([115, 115])
		expect(yearSpan("2. Jh. n. Chr.")).toEqual([101, 200])
		expect(yearSpan("1./2. Jh. n. Chr.")).toEqual([1, 200])
		expect(yearSpan("30 n. Chr., Velleius diente selbst")).toEqual([30, 30])
		expect(yearSpan("2019")).toEqual([2019, 2019])
		expect(yearSpan("Mittelalter")).toEqual([800, 1500])
	})
})

describe("laterBy", () => {
	test("zählt ohne Jahr 0", () => {
		expect(laterBy("4 n. Chr.", "30 n. Chr., Velleius")).toBe("26 Jahre später")
		expect(laterBy("11 v. Chr.", "um 220 n. Chr.")).toBe(
			"rund 230 Jahre später",
		)
		expect(laterBy("15 n. Chr.", "um 115 n. Chr.")).toBe(
			"rund 100 Jahre später",
		)
		expect(laterBy("12–9 v. Chr.", "2. Jh. n. Chr.")).toBe(
			"mehr als 100 Jahre später",
		)
	})
})

test("Blättern folgt der Erzählung", () => {
	expect(neighbours(ORDERED[0].id).prev).toBeNull()
	expect(neighbours(ORDERED[1].id).prev.id).toBe(ORDERED[0].id)
	expect(neighbours(ORDERED.at(-1).id).next).toBeNull()
})
