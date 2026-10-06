import { BASE_PATH } from "@/config"

/**
 * Zitierstile und Exportformate für CSL-JSON-Einträge. citation-js mit
 * citeproc lädt erst beim ersten Aufruf (rund 300 kB), die Stildateien
 * liegen unter public/csl (Citation Style Language, CC BY-SA 3.0).
 */
export const FORMATS = [
	{
		id: "dai",
		label: "DAI",
		title: "Deutsches Archäologisches Institut",
		style: "deutsches-archaologisches-institut",
	},
	{ id: "din", label: "DIN 1505-2", title: "DIN 1505-2", style: "din-1505-2" },
	{ id: "apa", label: "APA 7", title: "APA, 7. Auflage", style: "apa" },
	{
		id: "chicago",
		label: "Chicago",
		title: "Chicago Manual of Style, Autor-Jahr",
		style: "chicago-author-date",
	},
	{
		id: "harvard",
		label: "Harvard",
		title: "Harvard (Cite Them Right)",
		style: "harvard-cite-them-right",
	},
	{
		id: "bibtex",
		label: "BibTeX",
		title: "BibTeX für LaTeX mit natbib oder bibtex",
		ext: "bib",
		mime: "application/x-bibtex",
	},
	{
		id: "biblatex",
		label: "BibLaTeX",
		title: "BibLaTeX für LaTeX mit biber",
		ext: "bib",
		mime: "application/x-bibtex",
	},
	{
		id: "ris",
		label: "RIS",
		title: "RIS für Zotero, Citavi, EndNote und Mendeley",
		ext: "ris",
		mime: "application/x-research-info-systems",
	},
	{
		id: "csl",
		label: "CSL-JSON",
		title: "CSL-JSON für Zotero, Pandoc und citeproc",
		ext: "json",
		mime: "application/vnd.citationstyles.csl+json",
	},
]

export const FORMAT_BY_ID = Object.fromEntries(FORMATS.map((f) => [f.id, f]))

/**
 * BibTeX-Schlüssel aus der id. citation-js verwirft Schlüssel mit
 * Bindestrich und erfindet dann eigene, der Unterstrich ist erlaubt.
 */
export const bibKey = (id) => id.replace(/-/g, "_")

// APA bringt citation-js selbst mit
const BUILTIN = new Set(["apa"])

let engine
function loadEngine() {
	engine ??= Promise.all([
		import("@citation-js/core"),
		import("@citation-js/plugin-csl"),
		import("@citation-js/plugin-bibtex"),
		import("@citation-js/plugin-ris"),
	]).then(([core]) => core)
	return engine
}

let loadStyle = async (name) => {
	const res = await fetch(`${BASE_PATH}/csl/${name}.csl`)
	if (!res.ok)
		throw new Error(`Zitierstil ${name} nicht geladen (${res.status})`)
	return res.text()
}

/** Für Tests: Stildateien ohne Server lesen. */
export function setStyleLoader(fn) {
	loadStyle = fn
}

const styles = new Map()
function ensureStyle(plugins, name) {
	if (BUILTIN.has(name)) return Promise.resolve()
	if (!styles.has(name)) {
		const p = loadStyle(name).then((xml) => {
			plugins.config.get("@csl").styles.add(name, xml)
		})
		p.catch(() => styles.delete(name))
		styles.set(name, p)
	}
	return styles.get(name)
}

const SUP = {
	0: "⁰",
	1: "¹",
	2: "²",
	3: "³",
	4: "⁴",
	5: "⁵",
	6: "⁶",
	7: "⁷",
	8: "⁸",
	9: "⁹",
}

function decode(s) {
	return s
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/&#x([0-9a-f]+);/gi, (_, n) =>
			String.fromCodePoint(parseInt(n, 16)),
		)
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
}

/**
 * Bibliographie-HTML von citeproc als Klartext, ein Eintrag je Zeile.
 * Beim DAI-Stil steht das Kurzzitat vor dem Eintrag, getrennt durch einen
 * Tabulator, Auflagen als hochgestellte Ziffer (²2014).
 */
export function htmlToText(html) {
	const entries = html.match(
		/<div[^>]*class="csl-entry"[^>]*>[\s\S]*?<\/div>\s*(?=<div[^>]*class="csl-entry"|<\/div>\s*$)/g,
	) ?? [html]
	return entries
		.map((e) =>
			decode(
				e
					// DAI: Kurzzitat als eigener Block (csl-block) oder Randspalte
					.replace(/<div class="csl-block">([\s\S]*?)<\/div>\s*/g, "$1\t")
					.replace(/<\/div>\s*<div class="csl-right-inline">/g, "\t")
					.replace(/<sup>(\d+)<\/sup>/g, (_, d) =>
						[...d].map((c) => SUP[c]).join(""),
					)
					.replace(/<[^>]+>/g, ""),
			)
				.replace(/[ \t]*\n[ \t]*/g, " ")
				.trim(),
		)
		.join("\n")
}

/**
 * Formatiert CSL-JSON-Einträge. Zitierstile liefern { text, html },
 * Exportformate nur { text }. Der Schlüssel in BibTeX ist bibKey(id).
 */
export async function formatCitations(items, formatId) {
	const format = FORMAT_BY_ID[formatId]
	if (!format) throw new Error(`Unbekanntes Format: ${formatId}`)
	if (format.id === "csl")
		return { text: `${JSON.stringify(items, null, 2)}\n` }

	const { Cite, plugins } = await loadEngine()
	const cite = new Cite(
		items.map((r) => ({ ...r, "citation-key": bibKey(r.id) })),
	)

	if (!format.style) {
		let text = cite.format(format.id)
		const accessed =
			/^\s*note = \{\[Online; accessed (\d{4})-(\d{2})-(\d{2})\]\},\n/gm
		// BibLaTeX kennt urldate, klassisches BibTeX druckt den Hinweis wörtlich
		text =
			format.id === "biblatex"
				? text.replace(accessed, "")
				: text.replace(
						accessed,
						(_, y, m, d) => `\tnote = {Abgerufen am ${d}.${m}.${y}},\n`,
					)
		return { text }
	}

	await ensureStyle(plugins, format.style)
	const html = cite.format("bibliography", {
		format: "html",
		template: format.style,
		lang: "de-DE",
	})
	return { html, text: htmlToText(html) }
}

/** Dateiname für den Download, z. B. roemerlager-literatur.bib */
export function fileName(base, formatId) {
	const format = FORMAT_BY_ID[formatId]
	return `${base}.${format.ext ?? "txt"}`
}
