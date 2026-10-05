import { haversine } from "./geo"
import { SITE_TYPE_BY_ID, SITES } from "./sites"

/**
 * Quellen je Kriterium und Erklärtexte für die Info-Karte. Jede Aussage
 * zu einer Stelle nennt den gemessenen Wert, die Schwelle und woher die
 * Schwelle stammt.
 */

export const CRITERIA_SOURCES = {
	ring: [
		{
			label: "LWL 2023: Marschlager im Abstand von Tagesmärschen (rund 20 km)",
			url: "https://www.lwl.org/pressemitteilungen/nr_mitteilung.php?urlID=57212",
		},
		{
			label:
				"Vegetius, Epitoma rei militaris 1,9: 20 römische Meilen in fünf Sommerstunden",
			url: "https://www.thelatinlibrary.com/vegetius1.html",
		},
	],
	water: [
		{
			label:
				"Kaye 2013: 60 % der Lager in Britannien bis 100 m, fast 90 % bis 300 m vom Wasser",
			url: "https://www.bandaarcgeophysics.co.uk/arch/roman-marching-camps-uk.pdf",
		},
		{
			label:
				"Vegetius 1,22: Holz, Futter und Wasser in der Nähe, keine Überschwemmungsgefahr",
			url: "https://www.thelatinlibrary.com/vegetius1.html",
		},
	],
	height: [
		{
			label:
				"Vegetius 1,22: kein höherer Hügel in der Nähe, der das Lager überragt",
			url: "https://www.thelatinlibrary.com/vegetius1.html",
		},
		{
			label: "Vegetius 3,8: Anlage und Befestigung des Lagers",
			url: "https://www.thelatinlibrary.com/vegetius3.html",
		},
	],
	slope: [
		{
			label: "Kaye 2013: Hangneigung als Standortfaktor in der GIS-Analyse",
			url: "https://www.bandaarcgeophysics.co.uk/arch/roman-marching-camps-uk.pdf",
		},
	],
	route: [
		{
			label: "Tobler 1993: Wanderfunktion, Gehgeschwindigkeit über Hangneigung",
			url: "https://escholarship.org/uc/item/05r820mz",
		},
		{
			label: "Hoog Buurlo (NL): Marschlager über ein Routenmodell gefunden",
			url: "https://www.staatsbosbeheer.nl/wat-we-doen/nieuws/2025/05/ontdekking-romeins-legerkamp-nabij-hoog-buurlo",
		},
	],
	corridor: [
		{
			label:
				"Römerlager in Westfalen: die Lager reihen sich an Lippe und Weser",
			url: "https://www.altertumskommission.lwl.org/de/publikationen/roemerlager-westfalen/",
		},
	],
}

const km = (m) =>
	`${(m / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} km`
const meters = (m) =>
	!Number.isFinite(m)
		? "nicht im Ausschnitt"
		: m >= 1000
			? km(m)
			: `${Math.round(m)} m`

/** Bekannte Lager nach Entfernung zu einem Punkt. */
export function nearestSites(lon, lat, limit = 3) {
	return SITES.features
		.filter((f) =>
			["marschlager", "legionslager", "kastell"].includes(f.properties.type),
		)
		.map((f) => ({
			name: f.properties.name,
			type: SITE_TYPE_BY_ID[f.properties.type]?.label,
			d: haversine(
				lon,
				lat,
				f.geometry.coordinates[0],
				f.geometry.coordinates[1],
			),
		}))
		.sort((a, b) => a.d - b.d)
		.slice(0, limit)
}

/**
 * Ein Satz je Kriterium: Messwert, Bewertung, Begründung.
 * @returns {{key, verdict: "gut"|"mittel"|"schwach", text}[]}
 */
export function explain(data, params) {
	const f = data.factors
	const verdict = (v) => (v >= 0.7 ? "gut" : v >= 0.35 ? "mittel" : "schwach")
	const near = nearestSites(data.lon, data.lat, 1)[0]
	const water =
		data.waterSource === "osm"
			? "heutigen Bach oder Fluss (OSM)"
			: "Bach im natürlichen Gewässernetz aus dem Höhenmodell"
	return [
		{
			key: "ring",
			verdict: verdict(f.ring),
			text: near
				? `${km(data.distCamp)} bis zum nächsten bekannten Lager (${near.name}). Ein Tagesmarsch ist hier mit ${km(params.ringMean)} ± ${km(params.ringSigma)} angesetzt.`
				: "Kein bekanntes Lager in der Nähe.",
		},
		{
			key: "water",
			verdict: verdict(f.water),
			text: `${meters(data.distWater)} bis zum nächsten ${water}. Bis ${params.waterNear} m gilt als ideal, in Britannien lagen fast 90 % der Marschlager höchstens 300 m vom Wasser.`,
		},
		{
			key: "height",
			verdict: verdict(f.height),
			text:
				data.tpi >= 0
					? `${data.tpi.toFixed(1)} m höher als das Mittel im Umkreis von ${km(params.tpiRadius)}. Die antiken Handbücher empfehlen eine leichte Anhöhe, die nicht von höherem Gelände überragt wird.`
					: `${Math.abs(data.tpi).toFixed(1)} m tiefer als die Umgebung. Senken und Auen meiden die antiken Regeln wegen Nässe und schlechter Übersicht.`,
		},
		{
			key: "slope",
			verdict: verdict(f.slope),
			text: `${data.slope.toFixed(1)}° Neigung. Ein Lager für mehrere tausend Mann braucht 20–50 ha fast ebene Fläche, ideal sind 0,5–6°.`,
		},
		{
			key: "route",
			verdict: verdict(f.route),
			text: Number.isFinite(data.distRoute)
				? `${meters(data.distRoute)} bis zur nächsten berechneten Marschroute zwischen zwei bekannten Lagern.`
				: "Im Ausschnitt liegt keine berechnete Marschroute.",
		},
		{
			key: "corridor",
			verdict: verdict(f.corridor),
			text: `${meters(data.distRiver)} bis zum nächsten größeren Fluss. Die bekannten Lager reihen sich an Lippe und Weser, die Flüsse dienten als Leitlinie und Nachschubweg.`,
		},
	]
}

const PLACE_RANK = { city: 0, town: 1, village: 2, suburb: 3, hamlet: 4 }

/** Nächster Ortsname aus den vorberechneten Orten, bevorzugt Dörfer und Städte. */
export function nearestPlace(places, lon, lat) {
	if (!places?.length) return null
	let best = null
	for (const p of places) {
		// Kleine Weiler zählen nur, wenn sie deutlich näher liegen
		const d =
			haversine(lon, lat, p.lon, p.lat) * (1 + PLACE_RANK[p.class] * 0.15)
		if (!best || d < best.score) best = { ...p, score: d }
	}
	return { ...best, d: haversine(lon, lat, best.lon, best.lat) }
}

export function placeLabel(places, lon, lat) {
	const p = nearestPlace(places, lon, lat)
	if (!p) return null
	return p.d < 1500 ? `bei ${p.name}` : `${km(p.d)} von ${p.name}`
}

/**
 * Begründungen ohne Fachbegriffe für die einfache Ansicht. Nur was für
 * die Stelle spricht, dazu höchstens ein Hinweis, was dagegen spricht.
 */
export function explainSimple(data) {
	const f = data.factors
	const pro = []
	const contra = []
	const near = nearestSites(data.lon, data.lat, 1)[0]
	if (f.ring >= 0.5 && near) {
		pro.push(
			`Etwa ein Tagesmarsch (${km(data.distCamp)}) vom bekannten Römerlager ${near.name}. In diesem Abstand bauten die Legionen ihr nächstes Nachtlager.`,
		)
	}
	if (f.route >= 0.5) {
		pro.push(
			"Liegt an einem Weg, den ein Heer zwischen zwei bekannten Lagern wahrscheinlich genommen hätte.",
		)
	}
	if (f.water >= 0.7) {
		pro.push(
			`Ein Bach fließt in ${meters(data.distWater)} Entfernung. Ein Lager mit tausenden Soldaten und Tieren brauchte Wasser in der Nähe.`,
		)
	}
	if (f.height >= 0.6) {
		pro.push(
			`Liegt etwas höher als die Umgebung (${Math.round(data.tpi)} m). Von dort war das Umland gut zu überblicken und der Boden trocken.`,
		)
	}
	if (f.slope >= 0.8) {
		pro.push("Fast ebenes Gelände, genug Platz für ein großes Lager.")
	}
	if (f.corridor >= 0.7) {
		pro.push("Nahe an einem größeren Fluss, entlang dem die Heere zogen.")
	}
	if (f.water < 0.35)
		contra.push("Das nächste Gewässer ist recht weit entfernt.")
	if (data.tpi < -2)
		contra.push("Liegt eher in einer Senke, das mieden die Römer.")
	if (data.slope > 8) contra.push("Das Gelände ist für ein Lager recht steil.")
	return { pro, contra: contra.slice(0, 1) }
}
