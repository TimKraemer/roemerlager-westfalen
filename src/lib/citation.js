import { CITATION } from "@/config"

export { CITATION }

/** Zitiervorschlag mit Abrufdatum, für Karte und Quellen-Reiter. */
export function citationText(date = new Date()) {
	const today = date.toLocaleDateString("de-DE")
	return `${CITATION.authorInverted} (${CITATION.year}): ${CITATION.title}. Online: ${CITATION.url} (abgerufen am ${today}).`
}

export const SHORT_CREDIT = `Potenzialkarte: ${CITATION.author} ${CITATION.year}`
