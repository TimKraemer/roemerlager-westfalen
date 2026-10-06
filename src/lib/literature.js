import LITERATUR from "@/data/literatur.json"

/**
 * Literatur und Datenquellen als CSL-JSON (src/data/literatur.json), dem
 * Austauschformat von Zotero, Pandoc und citeproc. Quellenangaben in
 * quellen.json, fundstellen.json und criteria.js verweisen per `ref` auf
 * einen Eintrag. Kurzlabels für Listen entstehen hier ohne Bibliothek,
 * die Zitierstile und BibTeX/RIS erzeugt src/lib/cite.js bei Bedarf.
 */

export const REFS = new Map(LITERATUR.map((r) => [r.id, r]))

export function getRef(id) {
	const ref = REFS.get(id)
	if (!ref) throw new Error(`Unbekannte Quelle: ${id}`)
	return ref
}

/** Link auf die Quelle, DOI vor URL. */
export function refUrl(ref) {
	return ref.DOI ? `https://doi.org/${ref.DOI}` : ref.URL
}

const year = (ref) => ref.issued?.["date-parts"]?.[0]?.[0]

function nameOf(n) {
	if (n.literal) return n.literal
	return [n["non-dropping-particle"], n.family].filter(Boolean).join(" ")
}

function names(list) {
	if (!list?.length) return ""
	if (list.length > 3) return `${nameOf(list[0])} u. a.`
	return list.map(nameOf).join("/")
}

function dateDE(ref) {
	const [y, m, d] = ref.issued?.["date-parts"]?.[0] ?? []
	if (!y) return ""
	const pad = (x) => String(x).padStart(2, "0")
	if (d) return `${pad(d)}.${pad(m)}.${y}`
	if (m) return `${pad(m)}/${y}`
	return String(y)
}

// Seiten mit Bis-Strich, Artikelnummern (e22031) ohne „S.“
function pages(p) {
	if (!p) return ""
	const range = p.replace("-", "–")
	return /^\d/.test(p) ? `S. ${range}` : range
}

function series(ref) {
	return [ref["collection-title"], ref["collection-number"]]
		.filter(Boolean)
		.join(" ")
}

/**
 * Kurzangabe im Stil der bisherigen Quellenlisten, z. B.
 * „Tremmel 2011: Titel. Archäologie in Westfalen-Lippe 2010 (2011), S. 79–81“.
 */
export function shortLabel(ref) {
	const y = year(ref)
	const web = ["webpage", "article-newspaper", "post-weblog"].includes(ref.type)
	if (web) {
		// Personen mit Vornamen wie in der Zeitung, Herausgeber nur ohne Reihe
		const people = (ref.author ?? [])
			.filter((a) => !a.literal)
			.map((a) => [a.given, a.family].filter(Boolean).join(" "))
			.join(", ")
		const who = ref["container-title"]
			? [people, ref["container-title"]].filter(Boolean).join(", ")
			: names(ref.author)
		const when = dateDE(ref)
		return `${[who, when].filter(Boolean).join(", ")}: ${ref.title}`
	}

	const who = ref.author?.length
		? names(ref.author)
		: ref.editor?.length
			? `${names(ref.editor)} (Hrsg.)`
			: ""
	const head = [who, y].filter(Boolean).join(" ")
	const parts = [ref.title]
	const volume = ref.volume
	switch (ref.type) {
		case "article-journal": {
			// Jahrbücher: Band 2009 erschienen 2010
			const vol =
				volume && /^\d{4}$/.test(volume) && Number(volume) !== y
					? `${volume} (${y})`
					: volume
			const issue = ref.issue ? `, Heft ${ref.issue}` : ""
			parts.push(
				[
					`${ref["container-title"]} ${vol ?? ""}`.trim() + issue,
					pages(ref.page),
				]
					.filter(Boolean)
					.join(", "),
			)
			break
		}
		case "chapter":
			parts.push(
				`In: ${[ref["container-title"], series(ref)].filter(Boolean).join(". ")}${ref.page ? `, ${pages(ref.page)}` : ""}`,
			)
			break
		case "book":
		case "report": {
			const s = [series(ref), ref.number].filter(Boolean).join(" ")
			const ed = ref.edition ? `${ref.edition}. Aufl.` : ""
			const vol = volume && !s ? `Bd. ${volume}` : ""
			const tail = [s, vol, ed].filter(Boolean).join(", ")
			if (tail) parts.push(tail)
			break
		}
		case "dataset":
			if (ref.version) parts.push(`Version ${ref.version}`)
			if (ref.genre) parts.push(ref.genre)
			if (ref.license) parts.push(`Lizenz ${ref.license}`)
			break
		case "map":
			if (ref["container-title"]) parts.push(ref["container-title"])
			break
	}
	return `${head ? `${head}: ` : ""}${parts.filter(Boolean).join(". ")}`
}

/**
 * Quellenangabe für die Anzeige. Mit `ref` kommen Label und Link aus der
 * Literaturliste, ein eigenes `label` (z. B. eine Aussage mit Stellenangabe)
 * hat Vorrang. Ohne `ref` bleibt der Eintrag, wie er ist.
 */
export function resolveSource(item) {
	if (!item.ref) return item
	const ref = getRef(item.ref)
	return {
		...item,
		label: item.label ?? shortLabel(ref),
		url: item.url ?? refUrl(ref),
		csl: ref,
	}
}

/** CSL-Einträge zu einer Liste von Quellenangaben, ohne Doppelte. */
export function cslOf(items) {
	const ids = new Set(items.filter((s) => s.ref).map((s) => s.ref))
	return [...ids].map(getRef)
}

export const ALL_REFS = LITERATUR
