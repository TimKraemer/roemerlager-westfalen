/**
 * Baut public/precomputed/gebiete.json für die globale Suche: Höhenzüge
 * und Gebirge (Wiehengebirge, Wesergebirge, Teutoburger Wald) sowie
 * Bundesländer, Regierungsbezirke, Kreise und Gemeinden.
 *
 * Die Kacheln von tiles.erleben.app enthalten dafür keine Namen (Grenzen
 * nur als namenlose Linien, keine Höhenzüge), deshalb kommen diese Daten
 * einmalig beim Bauen aus OpenStreetMap über Overpass. Zur Laufzeit lädt
 * die Suche nur die fertige Datei vom eigenen Server.
 *
 * Verläufe und Grenzen werden vereinfacht (Douglas-Peucker in Metern),
 * Gemeinden nur mit Ausdehnung, ihre Grenzen wären zu groß.
 *
 *   bun scripts/build-areas.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
// Wie das Ortsverzeichnis (scripts/build-places.mjs): alle Fundstellen
const BBOX = [50.2, 5.8, 53.6, 11.0] // Süd, West, Nord, Ost
const SERVERS = [
	"https://overpass-api.de/api/interpreter",
	"https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
const UA = "roemerlager-westfalen/0.1 (build script, scripts/build-areas.mjs)"

async function overpass(query) {
	const body = new URLSearchParams({ data: query })
	for (let attempt = 0; attempt < 12; attempt++) {
		const url = SERVERS[attempt % SERVERS.length]
		try {
			const res = await fetch(url, {
				method: "POST",
				body,
				headers: { "User-Agent": UA },
				signal: AbortSignal.timeout(300_000),
			})
			const text = await res.text()
			if (res.ok && text.startsWith("{")) return JSON.parse(text)
			const why = text.replace(/<[^>]+>/g, " ").match(/Error:[^\n]*/)
			console.log(`${url}: ${res.status} ${why?.[0] ?? ""}`)
		} catch (e) {
			console.log(`${url}: ${e.message}`)
		}
		await new Promise((r) => setTimeout(r, 15_000))
	}
	throw new Error("Overpass nicht erreichbar")
}

const bb = BBOX.join(",")
const M_LAT = 110_570
const mLon = (lat) => 111_320 * Math.cos((lat * Math.PI) / 180)

// Douglas-Peucker in Metern
function simplify(points, tol) {
	if (points.length < 3) return points
	const [x0, y0] = points[0]
	const [x1, y1] = points.at(-1)
	const k = mLon((y0 + y1) / 2)
	const ax = (x1 - x0) * k
	const ay = (y1 - y0) * M_LAT
	const len = Math.hypot(ax, ay) || 1e-9
	let max = 0
	let idx = 0
	for (let i = 1; i < points.length - 1; i++) {
		const px = (points[i][0] - x0) * k
		const py = (points[i][1] - y0) * M_LAT
		const d = Math.abs(ax * py - ay * px) / len
		if (d > max) {
			max = d
			idx = i
		}
	}
	if (max <= tol) return [points[0], points.at(-1)]
	return [
		...simplify(points.slice(0, idx + 1), tol).slice(0, -1),
		...simplify(points.slice(idx), tol),
	]
}

const round = (v) => Math.round(v * 1e4) / 1e4

/** Linien eines Elements (Weg oder Relation), aneinanderhängende verbunden. */
function linesOf(el, tol) {
	const ways =
		el.type === "way"
			? [el.geometry]
			: (el.members ?? [])
					.filter((m) => m.type === "way" && m.geometry && m.role !== "inner")
					.map((m) => m.geometry)
	const lines = ways
		.filter(Boolean)
		.map((g) => g.filter(Boolean).map((p) => [p.lon, p.lat]))
		.filter((l) => l.length > 1)
	// Wege mit gemeinsamem Endpunkt zusammenfügen, sonst zerfällt jede
	// Grenze in Hunderte Stücke
	const same = (a, b) => a[0] === b[0] && a[1] === b[1]
	const merged = []
	const rest = [...lines]
	while (rest.length) {
		let line = rest.shift()
		let grown = true
		while (grown) {
			grown = false
			for (let i = 0; i < rest.length; i++) {
				const o = rest[i]
				if (same(line.at(-1), o[0])) line = [...line, ...o.slice(1)]
				else if (same(line.at(-1), o.at(-1)))
					line = [...line, ...o.slice(0, -1).reverse()]
				else if (same(line[0], o.at(-1))) line = [...o.slice(0, -1), ...line]
				else if (same(line[0], o[0])) line = [...o.slice(1).reverse(), ...line]
				else continue
				rest.splice(i, 1)
				grown = true
				break
			}
		}
		merged.push(line)
	}
	return merged
		.map((l) => simplify(l, tol).map(([x, y]) => [round(x), round(y)]))
		.filter((l) => l.length > 1)
}

const ADMIN = {
	4: "Bundesland",
	5: "Regierungsbezirk",
	6: "Kreis",
	8: "Gemeinde",
}
// Toleranz der Vereinfachung je Art in Metern
const TOL = { 4: 800, 5: 500, 6: 250, ridge: 80 }

function typeOf(t) {
	if (t.natural === "mountain_range") return "Gebirge"
	if (t.natural === "ridge") return "Höhenzug"
	const lvl = Number(t.admin_level)
	if (lvl === 6 && /kreisfrei|city/i.test(t["de:place"] ?? t.place ?? ""))
		return "Kreisfreie Stadt"
	if (lvl === 8 && /city|town/.test(t.place ?? "")) return "Stadt"
	if (lvl === 4 && t["ISO3166-2"]?.startsWith("NL")) return "Provinz"
	if (lvl === 8 && t["ISO3166-2"]?.startsWith("NL")) return "Gemeinde"
	return ADMIN[lvl]
}

console.log("Höhenzüge und Gebirge …")
const ridges = await overpass(
	`[out:json][timeout:300];nwr["natural"~"^(ridge|mountain_range)$"]["name"](${bb});out geom;`,
)
// Je Ebene einzeln, eine Abfrage für alle überlastet Overpass
const admin = { elements: [] }
for (const level of [4, 5, 6]) {
	console.log(`Verwaltungsebene ${level} …`)
	const res = await overpass(
		`[out:json][timeout:300];relation["boundary"="administrative"]["admin_level"="${level}"](${bb});out geom(${bb});`,
	)
	admin.elements.push(...res.elements)
}
console.log("Gemeinden …")
const towns = await overpass(
	`[out:json][timeout:300];relation["boundary"="administrative"]["admin_level"="8"](${bb});out tags bb;`,
)

const areas = []
const seen = new Set()
const add = (el, kind, lines) => {
	const t = el.tags
	const name = t["name:de"] ?? t.name
	if (!name) return
	const type = typeOf(t)
	const key = `${type}:${name}`
	// Höhenzüge sind oft in mehrere gleichnamige Wege zerlegt
	const prev = areas.find((a) => a.key === key && kind === "ridge")
	if (prev && lines) {
		prev.lines.push(...lines)
		return
	}
	if (seen.has(key)) return
	seen.add(key)
	const b = el.bounds
	areas.push({
		key,
		name,
		type,
		kind,
		bounds: [b.minlon, b.minlat, b.maxlon, b.maxlat].map(round),
		lines,
	})
}

for (const el of ridges.elements) {
	if (!el.bounds) continue
	add(el, "ridge", linesOf(el, TOL.ridge))
}
for (const el of admin.elements) {
	add(el, "admin", linesOf(el, TOL[el.tags.admin_level]))
}
for (const el of towns.elements) add(el, "admin", null)

const out = areas
	.sort((a, b) => a.name.localeCompare(b.name, "de"))
	.map(({ name, type, bounds, lines }) => {
		const row = [name, type, bounds]
		if (lines?.length) row.push(lines)
		return row
	})
const target = join(ROOT, "public/precomputed/gebiete.json")
mkdirSync(dirname(target), { recursive: true })
writeFileSync(
	target,
	JSON.stringify({
		source: "OpenStreetMap über Overpass, © OpenStreetMap-Mitwirkende (ODbL)",
		fields: ["name", "type", "bounds", "lines"],
		areas: out,
	}),
)
const count = {}
for (const a of areas) count[a.type] = (count[a.type] ?? 0) + 1
console.log(`${out.length} Gebiete nach ${target}`, count)
