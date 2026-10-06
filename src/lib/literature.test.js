import { describe, expect, test } from "bun:test"
import fundstellen from "@/data/fundstellen.json"
import quellen from "@/data/quellen.json"
import { CRITERIA_SOURCES } from "./criteria"
import { hasLayerSources, LAYER_SOURCE_IDS, layerCsl } from "./layer-sources"
import { OVERLAYS } from "./layers"
import { ALL_REFS, getRef, REFS, resolveSource, shortLabel } from "./literature"

const allSources = [
	...quellen.flatMap((g) => g.items),
	...fundstellen.features.flatMap((f) => f.properties.sources ?? []),
	...Object.values(CRITERIA_SOURCES).flat(),
]

describe("literatur.json", () => {
	test("Schlüssel sind eindeutig und BibTeX-tauglich", () => {
		expect(REFS.size).toBe(ALL_REFS.length)
		for (const r of ALL_REFS) expect(r.id).toMatch(/^[a-z0-9-]+$/)
	})

	test("jeder Eintrag hat Titel, Typ und einen Link", () => {
		for (const r of ALL_REFS) {
			expect(r.title).toBeTruthy()
			expect(r.type).toBeTruthy()
			expect(r.DOI || r.URL).toBeTruthy()
		}
	})

	test("jeder Verweis in den Daten existiert", () => {
		for (const s of allSources) if (s.ref) expect(REFS.has(s.ref)).toBe(true)
	})

	test("jede Quellenangabe hat nach dem Auflösen Label und Link", () => {
		for (const s of allSources.map(resolveSource)) {
			expect(s.label).toBeTruthy()
			expect(s.url).toMatch(/^https?:\/\//)
		}
	})
})

describe("shortLabel", () => {
	test("Jahrbuch mit abweichendem Erscheinungsjahr", () => {
		expect(shortLabel(getRef("tremmel2011a"))).toBe(
			"Tremmel 2011: Augusteische Marschlager in Porta Westfalica-Barkhausen „Auf der Lake“. Archäologie in Westfalen-Lippe 2010 (2011), S. 79–81",
		)
	})
	test("Reihe mit Auflage", () => {
		expect(shortLabel(getRef("rudnick2014"))).toBe(
			"Rudnick 2014: Kneblinghausen, Stadt Rüthen, Kreis Soest. Römerlager in Westfalen 1, 2. Aufl.",
		)
	})
	test("Zeitungsartikel mit Datum", () => {
		expect(shortLabel(getRef("besserer2023a"))).toBe(
			"Dieter Besserer, Westfalen-Blatt, 08.12.2023: Varus trifft Preußisch Oldendorf",
		)
	})
})

describe("Ebenen", () => {
	test("jede zuschaltbare Ebene hat Quellen", () => {
		for (const o of OVERLAYS) expect(hasLayerSources(o.id)).toBe(true)
		// Schalter unter „Analyse und Wege“ in layer-panel.jsx
		for (const id of [
			"heatmap",
			"candidates",
			"boundary",
			"rings",
			"routes",
			"stops",
			"roads",
			"waterways",
			"model3d",
		])
			expect(hasLayerSources(id)).toBe(true)
	})
	test("eigene Ebenen stehen vorn, alle Verweise lösen auf", () => {
		for (const id of LAYER_SOURCE_IDS) {
			const items = layerCsl(id)
			expect(items.length).toBeGreaterThan(0)
			expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
		}
		expect(layerCsl("heatmap")[0].title).toBe(
			"Potenzialkarte für unentdeckte Marschlager",
		)
	})
})

test("keine Quelle steht doppelt in einer Gruppe", () => {
	for (const g of quellen) {
		const refs = g.items.map((i) => i.ref).filter(Boolean)
		expect(new Set(refs).size).toBe(refs.length)
	}
})
