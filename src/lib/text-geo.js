import riverData from "@/data/fluesse.json"
import roadData from "@/data/roemerstrassen.json"
import { circlePolygon } from "./geo"
import { SITES } from "./sites"

/**
 * Kartenbezug der antiken Texte: genannte Flüsse, Orte, Räume und
 * Bewegungsrichtungen. Unsichere Lagen und erschlossene Wege werden
 * gestrichelt gezeichnet. Flussverläufe sind die alten Läufe aus
 * scripts/build-rivers.mjs: Uraufnahme um 1840, bei Haltern und Xanten
 * römerzeitlich, sonst heute.
 */

const rivers = Object.fromEntries(
	Object.entries(riverData).map(([k, v]) => [
		k,
		Array.isArray(v) ? v : v.coords,
	]),
)

const siteAt = (id) => {
	const f = SITES.features.find((s) => s.properties.id === id)
	if (!f) throw new Error(`Fundstelle ${id} fehlt`)
	return f.geometry.coordinates
}

const nearest = (line, [lon, lat]) => {
	let best = 0
	let bd = Infinity
	line.forEach(([x, y], i) => {
		const d = (x - lon) ** 2 + (y - lat) ** 2
		if (d < bd) {
			bd = d
			best = i
		}
	})
	return best
}

/** Abschnitt eines Flusses zwischen den Punkten, die from und to am nächsten liegen. */
const along = (name, from, to) => {
	const line = rivers[name]
	const i = nearest(line, from)
	const j = nearest(line, to)
	return i <= j ? line.slice(i, j + 1) : line.slice(j, i + 1).reverse()
}

const LIPPE_MOUTH = [6.6, 51.65]
const LIPPE_SOURCE = rivers.Lippe[0]
const HALTERN = siteAt("haltern-hauptlager")
const ANREPPEN = siteAt("anreppen")
const VETERA = siteAt("vetera")
const BARKHAUSEN = siteAt("barkhausen")

// Ungefähre Räume, bewusst grob
const BRUKTERER = [
	[7.25, 51.76],
	[7.6, 51.66],
	[8.0, 51.68],
	[8.35, 51.68],
	[8.6, 51.74],
	[8.72, 51.8],
	[8.66, 51.88],
	[8.3, 51.86],
	[7.99, 51.95],
	[7.78, 51.99],
	[7.6, 52.1],
	[7.35, 52.02],
]
const SUGAMBRER = [
	[6.75, 51.62],
	[7.6, 51.58],
	[8.0, 51.45],
	[7.9, 51.1],
	[7.4, 50.8],
	[7.0, 50.85],
	[6.8, 51.3],
]
const CHERUSKER = [
	[8.6, 52.35],
	[9.5, 52.45],
	[10.1, 52.2],
	[9.9, 51.85],
	[9.3, 51.8],
	[8.8, 51.95],
]
const EMS_RHEIN = [
	[6.45, 51.75],
	[7.05, 51.85],
	[7.5, 52.15],
	[7.45, 52.45],
	[6.9, 52.55],
	[6.3, 52.2],
]
// Kamm des heutigen Teutoburger Waldes (Osning), Bevergern bis Horn
const OSNING = [
	[7.58, 52.27],
	[7.9, 52.2],
	[8.1, 52.15],
	[8.35, 52.08],
	[8.53, 52.02],
	[8.7, 51.94],
	[8.85, 51.87],
	[8.95, 51.82],
]

const MILE = 1480

// Neuere Thesen zum Weg über das Wiehengebirge
const KALKRIESE = siteAt("kalkriese")
const MINDEN = [8.917, 52.288]
const PORTA = [8.925, 52.236]
// Sattel der Großen Aue und sein Nordausgang bei Bad Holzhausen
const PASS = [8.525, 52.266]
const HOLZHAUSEN = [8.535, 52.289]
// Am Südhang entlang zum Pass, danach etwa auf der B 65 nach Kalkriese
const SOUTH_SLOPE = [PORTA, [8.86, 52.228], [8.76, 52.245], [8.64, 52.252]]
const NORTH_EDGE = [
	HOLZHAUSEN,
	[8.497, 52.305],
	[8.344, 52.32],
	[8.227, 52.345],
	KALKRIESE,
]

/**
 * Teilstücke eines Hellwegs aus den Römerstraßen als gestrichelte Linien,
 * das längste trägt die Beschriftung.
 */
const hellweg = (prefix, label) => {
	const parts = roadData.features
		.filter((f) => f.properties.name.startsWith(prefix))
		.map((f) => f.geometry.coordinates)
	const longest = parts.reduce((a, b) => (b.length > a.length ? b : a))
	return parts.map((coords) => ({
		kind: "line",
		coords,
		uncertain: true,
		label: coords === longest ? label : undefined,
	}))
}

/** Bausteine je Textstelle. */
const GEO = {
	"tac-ann-1-60": [
		{ kind: "river", name: "Ems" },
		{ kind: "river", name: "Lippe" },
		{
			kind: "area",
			coords: BRUKTERER,
			label: "Land zwischen Ems und Lippe, verwüstet",
			uncertain: true,
		},
		{
			kind: "arrow",
			path: [
				[7.62, 52.1],
				[8.0, 51.98],
				[8.45, 51.86],
			],
			label: "zu den entlegensten Brukterern",
			uncertain: true,
		},
		{
			kind: "line",
			coords: OSNING,
			label: "heutiger Teutoburger Wald (Name erst seit dem 17. Jh.)",
		},
		{
			kind: "point",
			at: siteAt("kalkriese"),
			label: "Kalkriese, mögliches Varus-Schlachtfeld",
			uncertain: true,
		},
	],
	"tac-ann-1-61": [
		{
			kind: "arrow",
			path: [[8.45, 51.86], [8.2, 52.15], siteAt("kalkriese")],
			label: "Zug zur Stätte der Varusschlacht, Weg unbekannt",
			uncertain: true,
		},
		{
			kind: "point",
			at: siteAt("kalkriese"),
			label: "Kalkriese, möglicher Ort",
			uncertain: true,
		},
		{
			kind: "point",
			at: siteAt("moorweg-pr6"),
			label: "Bohlenweg Pr VI, Bauweise solcher Moorwege",
		},
	],
	"tac-ann-1-63": [
		{ kind: "river", name: "Ems" },
		{ kind: "river", name: "Rhein" },
		{
			kind: "area",
			coords: EMS_RHEIN,
			label: "„lange Brücken“, irgendwo zwischen Ems und Rhein",
			uncertain: true,
		},
		{
			kind: "arrow",
			path: [[7.4, 52.3], [6.9, 51.95], VETERA],
			label: "Caecinas Rückmarsch zum Rhein",
			uncertain: true,
		},
	],
	"tac-ann-2-7": [
		{ kind: "river", name: "Lippe" },
		{
			kind: "band",
			path: along("Lippe", LIPPE_MOUTH, HALTERN),
			width: 10000,
			label: "zwischen Aliso und Rhein: neue Wege und Dämme",
			uncertain: true,
		},
		{
			kind: "arrow",
			path: [VETERA, ...along("Lippe", LIPPE_MOUTH, [7.12, 51.72])],
			label: "Germanicus mit sechs Legionen",
		},
		{ kind: "point", at: HALTERN, label: "Aliso? Haltern", uncertain: true },
		{ kind: "point", at: ANREPPEN, label: "Aliso? Anreppen", uncertain: true },
		{
			kind: "point",
			at: siteAt("oberaden"),
			label: "Aliso? Oberaden",
			uncertain: true,
		},
	],
	"vell-2-105": [
		{ kind: "river", name: "Lippe" },
		{
			kind: "arrow",
			path: [VETERA, ...along("Lippe", LIPPE_MOUTH, [8.55, 51.72])],
			label: "vom Rhein ins Landesinnere",
			uncertain: true,
		},
		{ kind: "point", at: LIPPE_SOURCE, label: "Lippequelle (caput Iuliae)" },
		{ kind: "point", at: ANREPPEN, label: "Anreppen, Lager 4/5 n. Chr." },
	],
	"vell-2-120": [
		{ kind: "river", name: "Lippe" },
		{
			kind: "arrow",
			path: [...along("Lippe", [7.2, 51.73], LIPPE_MOUTH), VETERA],
			label: "Ausbruch der Besatzung zum Rhein",
		},
		{ kind: "point", at: HALTERN, label: "Aliso? Haltern", uncertain: true },
		{ kind: "point", at: ANREPPEN, label: "Aliso? Anreppen", uncertain: true },
		{ kind: "point", at: VETERA, label: "Vetera am Rhein" },
	],
	"florus-2-30": [
		{ kind: "river", name: "Weser" },
		{ kind: "river", name: "Elbe" },
		{
			kind: "band",
			path: along("Rhein", [8.27, 50.0], [6.1, 51.85]),
			width: 8000,
			label: "mehr als fünfzig Kastelle am Rhein",
		},
		{ kind: "point", at: BARKHAUSEN, label: "Barkhausen an der Weser" },
	],
	"vegetius-1-9": [
		{
			kind: "ring",
			center: BARKHAUSEN,
			radius: 20000,
			label: "20 km, Tagesmarsch der Karte",
		},
		{
			kind: "ring",
			center: BARKHAUSEN,
			radius: 20 * MILE,
			label: "20 Meilen (30 km), Militärschritt",
			uncertain: true,
		},
		{
			kind: "ring",
			center: BARKHAUSEN,
			radius: 24 * MILE,
			label: "24 Meilen (36 km), voller Schritt",
			uncertain: true,
		},
		{ kind: "point", at: BARKHAUSEN, label: "Barkhausen" },
	],
	"dio-54-33": [
		{ kind: "river", name: "Lippe" },
		{ kind: "river", name: "Weser" },
		{ kind: "river", name: "Stever" },
		{ kind: "river", name: "Seseke" },
		{ kind: "river", name: "Alme" },
		{
			kind: "area",
			coords: SUGAMBRER,
			label: "Sugambrer (ungefähr)",
			uncertain: true,
		},
		{
			kind: "area",
			coords: CHERUSKER,
			label: "Cherusker (ungefähr)",
			uncertain: true,
		},
		{
			kind: "arrow",
			path: [
				VETERA,
				...along("Lippe", LIPPE_MOUTH, [8.7, 51.74]),
				[8.85, 51.95],
				BARKHAUSEN,
			],
			label: "Drusus zieht bis zur Weser, Weg unbekannt",
			labelAt: [8.1, 52.0],
			uncertain: true,
		},
		{
			kind: "point",
			at: siteAt("oberaden"),
			label: "Lippe und Seseke? Oberaden",
			uncertain: true,
		},
		{
			kind: "point",
			at: HALTERN,
			label: "Lippe und Stever? Haltern",
			uncertain: true,
		},
		{
			kind: "point",
			at: rivers.Alme[0],
			label: "Lippe und Alme? Paderborn-Elsen",
			uncertain: true,
		},
	],
	"wiki-hellwege": [
		...hellweg("Hellweg unter dem Berg", "Hellweg unter dem Berg"),
		...hellweg("Hellweg vor dem Santforde", "Hellweg vor dem Santforde"),
		{ kind: "point", at: MINDEN, label: "Minden" },
	],
	"lwl-2009-barkhausen": [
		{ kind: "river", name: "Weser" },
		{
			kind: "arrow",
			path: [[8.75, 52.08], [8.86, 52.18], PORTA, BARKHAUSEN],
			label: "Varus 9 n. Chr. auf dem Weg hierher?",
			labelAt: [8.83, 52.15],
			uncertain: true,
		},
		{
			kind: "point",
			at: BARKHAUSEN,
			label: "Barkhausen, wenige Tage in Zelten",
		},
	],
	"lwl-2015-porta": [
		{ kind: "river", name: "Weser" },
		{ kind: "point", at: BARKHAUSEN, label: "Lager Barkhausen" },
		{
			kind: "ring",
			center: BARKHAUSEN,
			radius: 2500,
			label: "Hofstelle im Umfeld des Lagers, Lage ungefähr",
			uncertain: true,
		},
	],
	"nw-2017-wiegel": [
		{
			kind: "arrow",
			path: [BARKHAUSEN, ...SOUTH_SLOPE, PASS, ...NORTH_EDGE],
			label: "Varus nach Wiegel",
			labelAt: [8.72, 52.24],
			uncertain: true,
		},
		{ kind: "point", at: PASS, label: "Holzhausener Pass" },
		{ kind: "point", at: BARKHAUSEN, label: "Barkhausen" },
		{ kind: "point", at: KALKRIESE, label: "Kalkriese" },
	],
	"lwl-2019-sennestadt": [
		{
			kind: "line",
			coords: OSNING,
			label: "heutiger Teutoburger Wald",
		},
		{
			kind: "point",
			at: siteAt("sennestadt"),
			label: "Marschlager Sennestadt, 26 ha",
		},
		{
			kind: "point",
			at: siteAt("sparrenberg"),
			label: "Sparrenberger Egge, Graben nur zur Hälfte",
		},
	],
	"lwl-2021-lerbeck": [
		{ kind: "river", name: "Weser" },
		{ kind: "point", at: PORTA, label: "Weserdurchbruch" },
		{
			kind: "point",
			at: [8.943, 52.251],
			label: "Lerbeck, Siedlung und Grabanlage",
		},
		{ kind: "point", at: BARKHAUSEN, label: "Lager Barkhausen" },
	],
	"lwl-2023-varus": [
		{ kind: "river", name: "Lippe" },
		{ kind: "river", name: "Weser" },
		{
			kind: "arrow",
			path: [
				HALTERN,
				...along("Lippe", HALTERN, [8.4, 51.68]),
				[8.75, 51.95],
				PORTA,
			],
			label: "Sommer 9 n. Chr. zur Weser, Weg unbekannt",
			labelAt: [8.2, 51.82],
			uncertain: true,
		},
		{ kind: "point", at: HALTERN, label: "Haltern, Amtssitz des Varus" },
		{
			kind: "point",
			at: KALKRIESE,
			label: "Kalkriese, Metallfunde wie in Haltern",
		},
	],
	"wb-2023-varus": [
		...hellweg("Hellweg unter dem Berg", "alter Heerweg etwa entlang der B 65"),
		{
			kind: "arrow",
			path: [MINDEN, ...SOUTH_SLOPE, PASS, ...NORTH_EDGE],
			label: "am Südhang zum Pass, dann nach Kalkriese",
			labelAt: [8.72, 52.24],
			uncertain: true,
		},
		{ kind: "point", at: PASS, label: "Pass der Großen Aue" },
		{ kind: "point", at: KALKRIESE, label: "Kalkriese" },
	],
	"wb-2023-germanicus": [
		{ kind: "river", name: "Weser" },
		{
			kind: "point",
			at: siteAt("idistaviso-evesen"),
			label: "Idistaviso? (Evesen)",
			uncertain: true,
		},
		{
			kind: "point",
			at: siteAt("angrivarierwall-leese"),
			label: "Angrivarierwall? (Leese)",
			uncertain: true,
		},
		{
			kind: "point",
			at: [8.497, 52.305],
			label: "Bohlenwege beim Bau der B 65? Ohne Beleg",
			uncertain: true,
		},
	],
}

export const hasTextGeo = (id) => Boolean(GEO[id])

// Douglas-Peucker in Grad: ein Band aus vielen kurzen Stücken würde an
// den Gelenken dunkle Flecken bekommen
function simplify(points, tol) {
	if (points.length < 3) return points
	const [x0, y0] = points[0]
	const [x1, y1] = points.at(-1)
	const len = Math.hypot(x1 - x0, y1 - y0) || 1e-12
	let max = 0
	let idx = 0
	for (let i = 1; i < points.length - 1; i++) {
		const [x, y] = points[i]
		const d = Math.abs((y1 - y0) * x - (x1 - x0) * y + x1 * y0 - y1 * x0) / len
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

const midpoint = (coords) => coords[Math.floor(coords.length / 2)]
const centroid = (coords) => [
	coords.reduce((a, c) => a + c[0], 0) / coords.length,
	coords.reduce((a, c) => a + c[1], 0) / coords.length,
]
// Richtung des letzten Abschnitts, im Uhrzeigersinn ab Nord
const bearing = ([x0, y0], [x1, y1]) =>
	(Math.atan2((x1 - x0) * Math.cos((y1 * Math.PI) / 180), y1 - y0) * 180) /
	Math.PI

/** GeoJSON und Ausdehnung für eine Textstelle, null ohne Ortsbezug. */
export function textGeo(id) {
	const parts = GEO[id]
	if (!parts) return null
	const features = []
	const add = (geometry, props) =>
		features.push({ type: "Feature", properties: props, geometry })
	for (const p of parts) {
		const label = (at, text, kind) =>
			text &&
			add(
				{ type: "Point", coordinates: at },
				{
					kind: "label",
					label: text,
					of: kind,
					uncertain: Boolean(p.uncertain),
				},
			)
		const props = { kind: p.kind, uncertain: Boolean(p.uncertain) }
		if (p.kind === "river") {
			const coords = rivers[p.name]
			add(
				{ type: "LineString", coordinates: coords },
				{ ...props, label: p.name },
			)
		} else if (p.kind === "area") {
			add({ type: "Polygon", coordinates: [[...p.coords, p.coords[0]]] }, props)
			label(centroid(p.coords), p.label, p.kind)
		} else if (p.kind === "line") {
			add({ type: "LineString", coordinates: p.coords }, props)
			label(midpoint(p.coords), p.label, p.kind)
		} else if (p.kind === "band") {
			add(
				{ type: "LineString", coordinates: simplify(p.path, 0.02) },
				{ ...props, width: p.width },
			)
			label(midpoint(p.path), p.label, p.kind)
		} else if (p.kind === "arrow") {
			add({ type: "LineString", coordinates: p.path }, props)
			const end = p.path.at(-1)
			add(
				{ type: "Point", coordinates: end },
				{ kind: "head", bearing: bearing(p.path.at(-2), end) },
			)
			label(p.labelAt ?? midpoint(p.path), p.label, p.kind)
		} else if (p.kind === "ring") {
			const coords = circlePolygon(p.center[0], p.center[1], p.radius)
			add({ type: "LineString", coordinates: coords }, props)
			// Beschriftung oben auf dem Ring
			label(coords[0], p.label, p.kind)
		} else if (p.kind === "point") {
			add({ type: "Point", coordinates: p.at }, props)
			label(p.at, p.label, p.kind)
		}
	}
	let bounds = [180, 90, -180, -90]
	const extend = ([lon, lat]) => {
		bounds = [
			Math.min(bounds[0], lon),
			Math.min(bounds[1], lat),
			Math.max(bounds[2], lon),
			Math.max(bounds[3], lat),
		]
	}
	for (const f of features) {
		// Ganze Flüsse würden die Ansicht zu weit aufziehen
		if (f.properties.kind === "river") continue
		const g = f.geometry
		if (g.type === "Point") extend(g.coordinates)
		else if (g.type === "LineString") g.coordinates.forEach(extend)
		else g.coordinates[0].forEach(extend)
	}
	return { data: { type: "FeatureCollection", features }, bounds }
}
