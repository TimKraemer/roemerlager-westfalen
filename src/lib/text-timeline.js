import chapters from "@/data/kapitel.json"
import texts from "@/data/texte.json"

/**
 * Die Texte als Erzählung: sechs Kapitel in zeitlicher Folge, von den
 * Feldzügen des Drusus bis zur Forschung heute. Man blättert Text für Text
 * vorwärts, die Karte zeigt jeweils die Orte.
 */

export const GROUPS = {
	feldzug: { title: "Die Feldzüge", accent: "#8d2a1e" },
	regel: { title: "Lagerbau und Marsch", accent: "#5d6b2f" },
	forschung: { title: "Neuere Thesen", accent: "#1f5f7a" },
}

const BY_ID = Object.fromEntries(texts.map((t) => [t.id, t]))

/** Kapitel mit ihren Texten, Farbe nach der Gruppe des ersten Textes. */
export const CHAPTERS = chapters.map((c, i) => ({
	...c,
	number: i + 1,
	accent: GROUPS[BY_ID[c.texts[0]].group].accent,
	texts: c.texts.map((id) => BY_ID[id]),
}))

/** Alle Texte in Erzählreihenfolge. */
export const ORDERED = CHAPTERS.flatMap((c) => c.texts)

/** Kapitel eines Textes. */
export const chapterOf = (id) =>
	CHAPTERS.find((c) => c.texts.some((t) => t.id === id)) ?? null

/** Stelle in der Erzählung, voriger und nächster Text. */
export function neighbours(id) {
	const i = ORDERED.findIndex((t) => t.id === id)
	if (i < 0) return { index: -1, prev: null, next: null }
	return {
		index: i,
		prev: ORDERED[i - 1] ?? null,
		next: ORDERED[i + 1] ?? null,
	}
}

/**
 * Jahresspanne aus „12–9 v. Chr.“, „um 115 n. Chr.“, „1./2. Jh. n. Chr.“
 * oder „2009“. Jahre vor Christus sind negativ. Was nach dem ersten Komma
 * steht, ist Anmerkung.
 */
export function yearSpan(s) {
	if (!s) return null
	const text = s.split(",")[0]
	if (/Mittelalter/.test(text)) return [800, 1500]
	let from
	let to
	const century = text.match(/(\d+)\.(?:\/(\d+)\.)?\s*Jh\./)
	if (century) {
		from = (Number(century[1]) - 1) * 100 + 1
		to = Number(century[2] ?? century[1]) * 100
	} else {
		const n = (text.match(/\d+/g) ?? []).map(Number)
		if (!n.length) return null
		from = n[0]
		to = n.at(-1)
	}
	if (/v\. Chr\./.test(text)) return [-Math.max(from, to), -Math.min(from, to)]
	return [Math.min(from, to), Math.max(from, to)]
}

/** Jahre zwischen a und b, ohne ein Jahr 0. */
export function yearsBetween(a, b) {
	return b - a - (a < 0 && b > 0 ? 1 : 0)
}

/**
 * Wie lange nach dem Geschehen ein Text entstand, etwa „26 Jahre später“
 * oder „rund 100 Jahre später“. null, wenn eine Angabe fehlt.
 */
export function laterBy(year, written) {
	const event = yearSpan(year)
	const when = yearSpan(written)
	if (!event || !when) return null
	const gap = yearsBetween(event[1], when[0])
	if (gap <= 0) return null
	if (when[1] - when[0] >= 50)
		return `mehr als ${Math.floor(gap / 10) * 10} Jahre später`
	if (/^um\b/.test(written))
		return `rund ${Math.round(gap / 10) * 10} Jahre später`
	return `${gap} Jahre später`
}

/** „30 n. Chr., Velleius diente …“ -> ["30 n. Chr.", "Velleius diente …"] */
export function splitWritten(written) {
	if (!written) return [null, null]
	const i = written.indexOf(", ")
	return i < 0 ? [written, null] : [written.slice(0, i), written.slice(i + 2)]
}
