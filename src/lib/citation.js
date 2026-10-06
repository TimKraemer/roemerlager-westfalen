import { CITATION } from "@/config"

export { CITATION }

export const SHORT_CREDIT = `Potenzialkarte: ${CITATION.author} ${CITATION.year}`

const author = [{ family: CITATION.family, given: CITATION.given }]
const accessed = (date) => ({
	"date-parts": [[date.getFullYear(), date.getMonth() + 1, date.getDate()]],
})

/** Die Anwendung als Ganzes, CSL-JSON wie in src/data/literatur.json. */
export function projectCsl(date = new Date()) {
	return {
		id: `${CITATION.family.toLowerCase().replace("ä", "ae")}${CITATION.year}roemerlager`,
		type: "software",
		author,
		issued: { "date-parts": [[CITATION.year]] },
		title: CITATION.title,
		version: CITATION.version,
		URL: CITATION.url,
		accessed: accessed(date),
	}
}

/**
 * Eine eigene Ebene der Anwendung (Potenzialkarte, Marschwege, entzerrte
 * Altkarte …) als Teil des Gesamtwerks.
 */
export function componentCsl(key, title, date = new Date()) {
	const project = projectCsl(date)
	return {
		id: `${project.id}-${key}`,
		type: "dataset",
		author,
		issued: project.issued,
		title,
		"container-title": CITATION.title,
		genre: "Kartenebene",
		version: CITATION.version,
		URL: CITATION.url,
		accessed: project.accessed,
	}
}
