import { beforeAll, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { projectCsl } from "./citation"
import { formatCitations, setStyleLoader } from "./cite"
import { getRef } from "./literature"

beforeAll(() => {
	setStyleLoader(async (name) =>
		readFileSync(
			join(import.meta.dir, "../../public/csl", `${name}.csl`),
			"utf8",
		),
	)
})

const sample = ["tremmel2011a", "rudnick2014", "lwl2023paderborn"].map(getRef)

describe("formatCitations", () => {
	test("BibTeX nutzt die eigenen Schlüssel", async () => {
		const { text } = await formatCitations(sample, "bibtex")
		expect(text).toContain("@article{tremmel2011a,")
		expect(text).toContain("doi = {10.11588/aiw.0.0.25926}")
		expect(text).toContain("note = {Abgerufen am 06.10.2026}")
	})

	test("Schlüssel mit Bindestrich werden zu Unterstrichen", async () => {
		const { text } = await formatCitations(
			[getRef("geobasis-dgm1-wcs")],
			"bibtex",
		)
		expect(text).toContain("@misc{geobasis_dgm1_wcs,")
	})

	test("BibLaTeX ohne doppelten Abrufhinweis", async () => {
		const { text } = await formatCitations(sample, "biblatex")
		expect(text).toContain("urldate = {2026-10-06}")
		expect(text).not.toContain("[Online; accessed")
		expect(text).toContain("„{Auf} der {Lake}“")
		expect(text).not.toContain("\\")
		expect(text).not.toContain("\t")
	})

	test("BibTeX mit Akzenten in der üblichen Form", async () => {
		const { text } = await formatCitations(
			[projectCsl(new Date(2026, 9, 6))],
			"bibtex",
		)
		expect(text).toContain('author = {Kr{\\"a}mer, Tim}')
		expect(text).toContain("note = {Abgerufen am 06.10.2026}")
	})

	test("DAI behält Groß- und Kleinschreibung in URLs", async () => {
		const { text } = await formatCitations(sample, "dai")
		expect(text).toContain("urlID=57212")
		expect(text).toMatch(/^Rudnick 2014\tB\. Rudnick, Kneblinghausen/m)
		expect(text).toContain("²2014")
	})

	test("alle Stile liefern einen Eintrag je Quelle", async () => {
		for (const f of ["dai", "din", "apa", "chicago", "harvard"]) {
			const { text } = await formatCitations(sample, f)
			expect(text.split("\n")).toHaveLength(3)
		}
	})

	test("Anwendung als Software mit Version und Abrufdatum", async () => {
		const csl = projectCsl(new Date(2026, 9, 6))
		const { text } = await formatCitations([csl], "apa")
		expect(text).toBe(
			"Krämer, T. (2026). Römerlager in Westfalen. Potenzialkarte für unentdeckte Marschlager (Version 0.1.0) [Software]. https://experiments.erleben.app/roemer/",
		)
		const ris = await formatCitations([csl], "ris")
		expect(ris.text).toContain("TY  - COMP")
	})
})
