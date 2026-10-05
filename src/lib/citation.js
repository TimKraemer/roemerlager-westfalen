/** Zitiervorschlag für Karte, Quellen-Reiter und Metadaten. */
export const CITATION = {
	author: "Tim Krämer",
	year: 2026,
	title: "Römerlager in Westfalen. Potenzialkarte für unentdeckte Marschlager",
	url: "https://experiments.erleben.app/roemer/",
}

export function citationText(date = new Date()) {
	const today = date.toLocaleDateString("de-DE")
	return `Krämer, Tim (${CITATION.year}): ${CITATION.title}. Online: ${CITATION.url} (abgerufen am ${today}).`
}

export const SHORT_CREDIT = `Potenzialkarte: ${CITATION.author} ${CITATION.year}`
