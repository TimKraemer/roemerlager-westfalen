import rivers from "@/data/fluesse.json"
import sources from "@/data/quellen.json"
import roads from "@/data/roemerstrassen.json"
import texts from "@/data/texte.json"
import { BASE_LAYERS, OVERLAYS } from "./layers"
import { SITE_TYPE_BY_ID, SITES } from "./sites"
import { hasTextGeo } from "./text-geo"
import { utmToLonLat } from "./utm"

/**
 * Globale Suche über alles, was die Karte kennt: Fundorte, Flüsse,
 * Römerstraßen, antike Texte, Ebenen und Quellen. Heutige Orte kommen
 * zusätzlich aus OpenStreetMap (Photon).
 */

// Lateinische Namen, die in den Daten selbst nicht stehen
const SITE_ALIASES = {
	vetera: ["Castra Vetera"],
	"haltern-hauptlager": ["Aliso?"],
	anreppen: ["Aliso?"],
	oberaden: ["Aliso?"],
	kalkriese: ["Varusschlacht", "clades Variana", "saltus Teutoburgiensis"],
}

const RIVER_LATIN = {
	Rhein: "Rhenus",
	Lippe: "Lupia",
	Ems: "Amisia",
	Weser: "Visurgis",
	Elbe: "Albis",
}

// Lateinische Suchwörter, die in deutschen Übersetzungen anders heißen.
// Nur für die Texte, Dio ist griechisch überliefert.
const LATIN_TERMS = {
	rhenus: "rhein",
	lupia: "lippe",
	luppia: "lippe",
	amisia: "ems",
	visurgis: "weser",
	albis: "elbe",
	mosa: "maas",
	bructeri: "brukterer",
	sugambri: "sugambrer",
	sygambri: "sugambrer",
	cherusci: "cherusker",
	chatti: "chatten",
	marsi: "marser",
	angrivarii: "angrivarier",
	teutoburgiensis: "teutoburger",
	castra: "lager",
	castellum: "kastell",
	legio: "legion",
	pontes: "brucken",
}

const normChar = (c) =>
	c === "ß" ? "ss" : c.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")

/** Kleinschreibung ohne Akzente, dazu je Zeichen die Stelle im Original. */
export function normalize(s) {
	let out = ""
	const map = []
	let i = 0
	for (const c of s) {
		const n = normChar(c)
		for (let k = 0; k < n.length; k++) map.push(i)
		out += n
		i += c.length
	}
	map.push(i)
	return { text: out, map }
}

const norm = (s) => normalize(s).text

const tokenize = (q) =>
	norm(q)
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean)

function boundsOf(coords) {
	const b = [180, 90, -180, -90]
	const walk = (c) => {
		if (typeof c[0] === "number") {
			b[0] = Math.min(b[0], c[0])
			b[1] = Math.min(b[1], c[1])
			b[2] = Math.max(b[2], c[0])
			b[3] = Math.max(b[3], c[1])
		} else c.forEach(walk)
	}
	walk(coords)
	return b
}

// Felder mit Gewicht: Name zählt mehr als Beschreibung
const field = (text, weight, snip = weight === 1) => ({
	text: text ?? "",
	n: norm(text ?? ""),
	weight,
	snip,
	// Unscharf nur in Namen und Titeln, in langen Texten gäbe es Fehltreffer
	words: weight >= 2 ? wordsOf(text ?? "") : [],
})

/** Wörter eines Textes, normalisiert und im Original. */
function wordsOf(text) {
	const seen = new Map()
	for (const [o] of text.matchAll(/[\p{L}\p{N}]+/gu)) {
		const n = norm(o)
		if (!seen.has(n)) seen.set(n, { n, o })
	}
	return [...seen.values()]
}

/** Damerau-Levenshtein (Vertauschung zählt als ein Fehler), Abbruch über max. */
export function editDistance(a, b, max) {
	if (Math.abs(a.length - b.length) > max) return max + 1
	let prev2 = null
	let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
	for (let i = 1; i <= a.length; i++) {
		const cur = [i]
		let rowMin = i
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1
			let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				v = Math.min(v, prev2[j - 2] + 1)
			}
			cur.push(v)
			if (v < rowMin) rowMin = v
		}
		if (rowMin > max) return max + 1
		prev2 = prev
		prev = cur
	}
	return prev[b.length]
}

// Erlaubte Tippfehler je Wortlänge
const maxErrors = (len) => (len < 4 ? 0 : len < 7 ? 1 : 2)

/**
 * Bestes Wort mit höchstens maxErrors Fehlern zum Suchwort. Verglichen
 * wird das ganze Wort und sein Anfang, man tippt ja oft noch.
 */
function fuzzyWord(tok, words) {
	const max = maxErrors(tok.length)
	if (!max) return null
	let best = null
	for (const w of words) {
		if (w.n.length < tok.length - max) continue
		// Erster oder zweiter Buchstabe stimmt fast immer, das spart Zeit
		if (w.n[0] !== tok[0] && w.n[1] !== tok[1]) continue
		let d = editDistance(tok, w.n, max)
		if (d > max && w.n.length > tok.length) {
			d = editDistance(tok, w.n.slice(0, tok.length), max)
		}
		if (d <= max && (!best || d < best.d)) {
			best = { ...w, d }
			if (d === 1) break
		}
	}
	return best
}

function buildIndex() {
	const entries = []

	for (const f of SITES.features) {
		const p = f.properties
		const aliases = SITE_ALIASES[p.id] ?? []
		entries.push({
			kind: "site",
			key: `site:${p.id}`,
			id: p.id,
			type: p.type,
			coordinates: f.geometry.coordinates,
			label: p.name,
			secondary: [SITE_TYPE_BY_ID[p.type]?.label, p.dating]
				.filter(Boolean)
				.join(", "),
			color: SITE_TYPE_BY_ID[p.type]?.color,
			fields: [
				field(p.name, 4),
				...aliases.map((a) => field(a, 4)),
				field(p.place, 3),
				field(p.description, 1),
			],
		})
	}

	for (const [name, river] of Object.entries(rivers)) {
		// Verlauf als Liste oder als { coords, parts }
		const coords = Array.isArray(river) ? river : river.coords
		const latin = RIVER_LATIN[name]
		entries.push({
			kind: "river",
			key: `river:${name}`,
			label: name,
			secondary: latin ? `lat. ${latin}, heutiger Verlauf` : "heutiger Verlauf",
			geometry: { type: "LineString", coordinates: coords },
			bounds: boundsOf(coords),
			fields: [field(name, 4), field(latin, 4)],
		})
	}

	// Römerstraßen bestehen aus vielen Abschnitten gleichen Namens
	const byName = new Map()
	for (const f of roads.features) {
		const p = f.properties
		const e = byName.get(p.name) ?? { lines: [], certainty: new Set(), p }
		e.lines.push(f.geometry.coordinates)
		e.certainty.add(p.certainty)
		byName.set(p.name, e)
	}
	const CERTAINTY = ["belegt", "vermutet", "hypothetisch"]
	for (const [name, e] of byName) {
		const certainty = CERTAINTY.find((c) => e.certainty.has(c))
		entries.push({
			kind: "road",
			key: `road:${name}`,
			label: name,
			secondary: `Römerstraße, Verlauf ${certainty === "hypothetisch" ? "Hypothese" : certainty}`,
			geometry: { type: "MultiLineString", coordinates: e.lines },
			bounds: boundsOf(e.lines),
			fields: [field(name.replace(/-/g, " "), 3)],
		})
	}

	for (const t of texts) {
		entries.push({
			kind: "text",
			key: `text:${t.id}`,
			id: t.id,
			label: t.title,
			secondary: `${t.author}, ${t.work} ${t.passage} · ${t.year}`,
			geo: hasTextGeo(t.id),
			fields: [
				field(t.title, 4),
				field(`${t.author} ${t.work} ${t.passage}`, 3),
				field(t.german, 1),
				field(t.latin, 1),
				field(t.map, 1),
			],
		})
	}

	for (const l of [...BASE_LAYERS, ...OVERLAYS]) {
		const base = BASE_LAYERS.includes(l)
		entries.push({
			kind: "layer",
			key: `layer:${l.id}`,
			id: l.id,
			base,
			label: l.label,
			secondary: base ? "Grundkarte" : `Ebene, ${l.group ?? "Karte"}`,
			fields: [field(l.label, 3), field(l.group, 1, false), field(l.note, 1)],
		})
	}

	sources.forEach((g, gi) => {
		g.items.forEach((item, ii) => {
			entries.push({
				kind: "source",
				key: `source:${gi}:${ii}`,
				anchor: `quelle-${gi}-${ii}`,
				label: item.label,
				secondary: g.title,
				url: item.url,
				fields: [
					field(item.label, 2),
					field(g.title, 1, false),
					field(item.note, 1),
				],
			})
		})
	})

	return entries
}

let INDEX = null

// Wortanfang zählt mehr als ein Treffer mitten im Wort
function tokenScore(entry, tok) {
	let best = 0
	for (const f of entry.fields) {
		const at = f.n.indexOf(tok)
		if (at < 0) continue
		const start = at === 0 ? 3 : /[^\p{L}\p{N}]/u.test(f.n[at - 1]) ? 2 : 1
		best = Math.max(best, f.weight * start)
	}
	return best
}

/** Erste Fundstelle eines Suchworts in einem langen Feld, mit Umgebung. */
function snippet(entry, tokens) {
	// Steht schon alles im Namen, braucht es keinen Auszug
	const label = norm(entry.label)
	if (tokens.every((t) => label.includes(t))) return null
	for (const f of entry.fields) {
		if (!f.snip) continue
		for (const tok of tokens) {
			const at = f.n.indexOf(tok)
			if (at < 0) continue
			const { map } = normalize(f.text)
			const from = map[at]
			const to = map[at + tok.length]
			const a = Math.max(0, f.text.lastIndexOf(" ", Math.max(0, from - 40)))
			const bEnd = f.text.indexOf(" ", Math.min(f.text.length, to + 50))
			const b = bEnd < 0 ? f.text.length : bEnd
			return `${a > 0 ? "…" : ""}${f.text.slice(a, b).trim()}${b < f.text.length ? " …" : ""}`
		}
	}
	return null
}

const LIMITS = { site: 6, river: 4, road: 4, text: 6, layer: 4, source: 4 }

/**
 * Lokale Treffer, nach Relevanz sortiert und je Art begrenzt. Mit kinds
 * nur diese Arten, dann mit höherem Limit. Unscharfe Treffer tragen
 * fuzzy und in fix die vermutlich gemeinten Wörter.
 */
export function searchLocal(query, { kinds, limit } = {}) {
	const tokens = tokenize(query)
	if (!tokens.length) return []
	INDEX ??= buildIndex()
	const hits = []
	for (const entry of INDEX) {
		if (kinds && !kinds.includes(entry.kind)) continue
		let score = 0
		let fuzzy = false
		const used = []
		const fix = []
		for (const tok of tokens) {
			let s = tokenScore(entry, tok)
			let t = tok
			let f = null
			// Lateinisches Wort, deutsch übersetzt: lupia -> lippe
			if (!s && entry.kind === "text") {
				const latin = Object.keys(LATIN_TERMS).find(
					(k) => tok.length >= 3 && k.startsWith(tok),
				)
				if (latin) {
					t = LATIN_TERMS[latin]
					s = tokenScore(entry, t)
				}
			}
			// Tippfehler: "Kalkrise" -> Kalkriese
			if (!s) {
				for (const fl of entry.fields) {
					const w = fuzzyWord(tok, fl.words)
					if (!w) continue
					const ws = fl.weight * (w.d === 1 ? 0.5 : 0.3)
					if (ws > s) {
						s = ws
						t = w.n
						f = w.o
					}
				}
				if (s) fuzzy = true
			}
			if (!s) {
				score = 0
				break
			}
			score += s
			used.push(t)
			fix.push(f)
		}
		if (score) hits.push({ ...entry, score, tokens: used, fuzzy, fix })
	}
	hits.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
	const count = {}
	return hits
		.filter((h) => {
			count[h.kind] = (count[h.kind] ?? 0) + 1
			return count[h.kind] <= (limit ?? LIMITS[h.kind])
		})
		.map((h) => ({ ...h, snippet: snippet(h, h.tokens) }))
}

/** Vollständiger Eintrag zu einem gespeicherten Treffer (Verlauf). */
export function entryByKey(key) {
	INDEX ??= buildIndex()
	return INDEX.find((e) => e.key === key) ?? null
}

/**
 * "Meinten Sie …": Sind alle Treffer unscharf, die Suche mit den
 * vermutlich gemeinten Wörtern des besten Treffers.
 */
export function correction(query, hits) {
	if (!hits.length || hits.some((h) => !h.fuzzy)) return null
	const words = query.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
	const fix = hits[0].fix
	if (words.length !== fix.length) return null
	const fixed = words.map((w, i) => fix[i] ?? w).join(" ")
	return norm(fixed) === norm(query) ? null : fixed
}

/** Suchwörter für das Hervorheben in der Trefferliste. */
export const queryTokens = tokenize

const PLACE_TYPES = {
	c: "Stadt",
	t: "Stadt",
	v: "Dorf",
	s: "Ortsteil",
	h: "Weiler",
	l: "Flur",
	p: "Berg",
	r: "Höhenzug",
	n: "Schutzgebiet",
}
// Bei gleichem Treffer gehen Städte vor, sonst der nähere Ort
const PLACE_RANK = { c: 0, t: 0, v: 1, s: 1, h: 1, p: 1, r: 1, n: 2, l: 2 }

let places = null

/**
 * Heutige Orte aus OpenStreetMap, vorab aus den Kacheln von
 * tiles.erleben.app gezogen (scripts/build-places.mjs). Wird erst beim
 * ersten Suchen geladen.
 */
export function loadPlaces() {
	places ??= fetch(`${process.env.NEXT_PUBLIC_BASE_PATH}/precomputed/orte.json`)
		.then((r) => {
			if (!r.ok) throw new Error(`Ortsindex: HTTP ${r.status}`)
			return r.json()
		})
		.then(({ near, places: rows }) =>
			rows.map(([name, cls, lon, lat, n, alias]) => ({
				name,
				cls,
				lon,
				lat,
				near: near[n],
				n: norm(name),
				alias: alias ? norm(alias) : null,
				words: wordsOf(alias ? `${name} ${alias}` : name),
			})),
		)
		.catch((e) => {
			places = null
			throw e
		})
	return places
}

/**
 * Orte, deren Name mit der Suche beginnt oder ein Suchwort enthält.
 * Gibt es kaum genaue Treffer, auch Orte mit Tippfehlern.
 */
export function searchPlaces(index, query, center, limit = 6) {
	const tokens = tokenize(query)
	if (!tokens.length) return []
	const q = tokens.join(" ")
	let hits = []
	for (const p of index) {
		const names = p.alias ? [p.n, p.alias] : [p.n]
		let score = 0
		for (const n of names) {
			if (n === q) score = Math.max(score, 4)
			else if (n.startsWith(q)) score = Math.max(score, 3)
			else if (tokens.every((t) => n.includes(t))) {
				// Wortanfang mitten im Namen: "porta" in "Porta Westfalica"
				const word = tokens.every((t) =>
					new RegExp(`(^|[^\\p{L}])${t}`, "u").test(n),
				)
				score = Math.max(score, word ? 2 : 1)
			}
		}
		if (score) hits.push({ p, score, fix: tokens.map(() => null) })
	}
	if (hits.length < 3 && tokens.some((t) => maxErrors(t.length))) {
		hits = hits.concat(fuzzyPlaces(index, tokens, hits))
	}
	const dist = (p) =>
		center ? (p.lon - center.lng) ** 2 * 0.37 + (p.lat - center.lat) ** 2 : 0
	hits.sort(
		(a, b) =>
			b.score - a.score ||
			PLACE_RANK[a.p.cls] - PLACE_RANK[b.p.cls] ||
			dist(a.p) - dist(b.p),
	)
	return hits.slice(0, limit).map(({ p, score, fix }) => ({
		kind: "place",
		fuzzy: score < 1,
		fix,
		tokens: tokenize(fix.map((f, i) => f ?? tokens[i]).join(" ")),
		key: `place:${p.name}:${p.lon}:${p.lat}`,
		label: p.name,
		secondary: [
			PLACE_TYPES[p.cls],
			// Städte brauchen keinen Nachbarort
			p.near && !"ct".includes(p.cls) ? `bei ${p.near}` : null,
		]
			.filter(Boolean)
			.join(" "),
		lon: p.lon,
		lat: p.lat,
		zoom: p.cls === "c" ? 11 : p.cls === "t" ? 12 : p.cls === "n" ? 11 : 14,
	}))
}

function fuzzyPlaces(index, tokens, exact) {
	const have = new Set(exact.map((h) => h.p))
	const out = []
	for (const p of index) {
		if (have.has(p)) continue
		let d = 0
		const fix = []
		for (const t of tokens) {
			const exactWord = p.words.find((w) => w.n.startsWith(t))
			if (exactWord) {
				fix.push(null)
				continue
			}
			const w = fuzzyWord(t, p.words)
			if (!w) {
				d = -1
				break
			}
			d += w.d
			fix.push(w.o)
		}
		if (d > 0) out.push({ p, score: 0.5 / d, fix })
	}
	return out
}

const DIR = { n: 1, s: -1, e: 1, o: 1, w: -1 }

/** Ein Wert in Grad, Minuten, Sekunden oder dezimal, mit Himmelsrichtung. */
function parseAngle(part) {
	const m = part
		.trim()
		.match(
			/^([NSOEW])?\s*(-?\d+(?:[.,]\d+)?)\s*°?\s*(?:(\d+(?:[.,]\d+)?)\s*['′]\s*)?(?:(\d+(?:[.,]\d+)?)\s*["″]\s*)?([NSOEW])?$/i,
		)
	if (!m) return null
	const num = (v) => Number((v ?? "0").replace(",", "."))
	const value = num(m[2]) + num(m[3]) / 60 + num(m[4]) / 3600
	const dir = (m[1] ?? m[5])?.toLowerCase()
	return { value: dir ? Math.abs(value) * DIR[dir] : value, dir }
}

const fmtDeg = (v) =>
	v.toLocaleString("de-DE", {
		minimumFractionDigits: 4,
		maximumFractionDigits: 4,
	})

/**
 * Koordinaten aus der Suche: "52.2512, 8.9116", "52,2512 8,9116",
 * "52°15'04\" N 8°54'41\" O" oder UTM Zone 32 "489000 5789000".
 */
export function parseCoordinates(query) {
	const q = query.trim()
	let lon
	let lat
	const utm = q.match(
		/^(?:32\s*[A-Z]?\s*)?(\d{6}(?:[.,]\d+)?)\s*[,;\s]\s*(\d{7}(?:[.,]\d+)?)$/i,
	)
	const glued = q.match(
		/^32(\d{6}(?:[.,]\d+)?)\s*[,;\s]\s*(\d{7}(?:[.,]\d+)?)$/,
	)
	const en = glued ?? utm
	if (en) {
		;[lon, lat] = utmToLonLat(
			Number(en[1].replace(",", ".")),
			Number(en[2].replace(",", ".")),
		)
	} else {
		// Ohne Nachkommastellen, Grad oder Richtung sind es keine Koordinaten
		if (!/[.,°'′NSOEW]/i.test(q)) return null
		// Zwei Teile: an Semikolon, Komma mit Leerzeichen, Himmelsrichtung
		// oder Leerzeichen trennen. "52,25 8,91" hat Dezimalkommas.
		const parts =
			q.match(/^(.+?[NS])\s*,?\s*(.+?[OEW])$/i)?.slice(1) ??
			q.match(/^([NS].+?)\s*,?\s*([OEW].+)$/i)?.slice(1) ??
			q.match(/^(.+?)\s*;\s*(.+)$/)?.slice(1) ??
			q.match(/^(\S+?),\s+(\S+)$/)?.slice(1) ??
			q.match(/^(-?\d+\.\d+),(-?\d+\.\d+)$/)?.slice(1) ??
			q.match(/^(\S+)\s+(\S+)$/)?.slice(1) ??
			(q.match(/°.*°/) ? q.split(/\s+(?=\d)/) : null)
		if (parts?.length !== 2) return null
		const a = parseAngle(parts[0])
		const b = parseAngle(parts[1])
		if (!a || !b) return null
		// Himmelsrichtung entscheidet, sonst Breite zuerst wie üblich, außer
		// die Werte passen nur andersherum nach Mitteleuropa
		if (["o", "e", "w"].includes(a.dir)) [lon, lat] = [a.value, b.value]
		else if (["n", "s"].includes(b.dir)) [lon, lat] = [a.value, b.value]
		else if (Math.abs(a.value) <= 20 && b.value >= 45 && b.value <= 58)
			[lon, lat] = [a.value, b.value]
		else [lat, lon] = [a.value, b.value]
	}
	if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return null
	const label = `${fmtDeg(Math.abs(lat))}° ${lat < 0 ? "S" : "N"}, ${fmtDeg(Math.abs(lon))}° ${lon < 0 ? "W" : "O"}`
	return {
		kind: "coord",
		key: `coord:${lon.toFixed(5)}:${lat.toFixed(5)}`,
		label,
		secondary: "Koordinate anspringen",
		lon,
		lat,
		zoom: 15,
	}
}
