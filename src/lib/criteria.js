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
			label:
				"LWL 2023: Marschlager im Abstand von Tagesmärschen (rund 20 km), Paderborn",
			url: "https://www.lwl.org/pressemitteilungen/nr_mitteilung.php?urlID=57212",
		},
		{
			label:
				"LWL-Blog 2022 (Jüngerich): etwa 20 km am Tag mit rund 48 kg Gepäck, Lager an der Lippe je einen Tagesmarsch auseinander",
			url: "https://zeitmaschine.lwl.org/de/blog-neues-wissen-uber-alte-dinge/das-grosse-graben/",
		},
		{
			label:
				"Vegetius 1,9: 20 römische Meilen (rund 30 km) in fünf Sommerstunden im Militärschritt, ohne Tross",
			url: "https://www.thelatinlibrary.com/vegetius1.html",
		},
	],
	water: [
		{
			label:
				"Kaye 2013: 307 Marschlager in Britannien, 60 % bis 100 m und 90 % bis 300 m vom Fluss",
			url: "https://zenodo.org/records/839026",
		},
		{
			label:
				"Ps.-Hyginus, De munitionibus castrorum 57: auf einer Seite ein Fluss oder eine Quelle",
			url: "https://www.thelatinlibrary.com/hyginus/hyginus6.shtml",
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
				"Ps.-Hyginus 56–57: am besten sanft aus der Ebene ansteigend, überragende Höhen (novercae) meiden",
			url: "https://www.thelatinlibrary.com/hyginus/hyginus6.shtml",
		},
		{
			label:
				"Vegetius 1,22: kein höherer Hügel in der Nähe, der das Lager überragt",
			url: "https://www.thelatinlibrary.com/vegetius1.html",
		},
		{
			label: "Vegetius 3,8: kein Beschuss von oben, kein schwieriger Ausgang",
			url: "https://www.thelatinlibrary.com/vegetius3.html",
		},
	],
	terrace: [
		{
			label:
				"Ps.-Hyginus 56: an erster Stelle Plätze, die sich sanft aus der Ebene erheben",
			url: "https://www.thelatinlibrary.com/hyginus/hyginus6.shtml",
		},
		{
			label: "Vegetius 1,22: kein Feld, das von Sturzbächen überschwemmt wird",
			url: "https://www.thelatinlibrary.com/vegetius1.html",
		},
	],
	slope: [
		{
			label: "Kaye 2013: Hangneigung und Geländeform als Standortfaktoren",
			url: "https://zenodo.org/records/839026",
		},
		{
			label: "Jones 2011: Roman Camps in Scotland (frei verfügbar)",
			url: "https://books.socantscot.org/digital-books/catalog/book/26",
		},
	],
	route: [
		{
			label:
				"Tobler 1993: Wanderfunktion, Gehgeschwindigkeit über Hangneigung (NCGIA TR 93-1)",
			url: "https://escholarship.org/uc/item/05r820mz",
		},
		{
			label: "Hoog Buurlo (NL): Marschlager über ein Routenmodell gefunden",
			url: "https://www.staatsbosbeheer.nl/wat-we-doen/nieuws/2025/05/ontdekking-romeins-legerkamp-nabij-hoog-buurlo",
		},
		{
			label:
				"Schatzfund Gehrden: Hinweis auf eine Ost-West-Route über Wilkenburg",
			url: "https://de.wikipedia.org/wiki/Schatzfund_von_Gehrden",
		},
	],
	moor: [
		{
			label: "GD NRW: Bodenkarte BK50, Bodentyp (Hoch- und Niedermoor)",
			url: "https://www.wms.nrw.de/gd/bk050?SERVICE=WMS&REQUEST=GetCapabilities",
		},
		{
			label: "LBEG: GUM50, ursprüngliche Moorverbreitung in Niedersachsen",
			url: "https://nibis.lbeg.de/cardomap3/",
		},
		{
			label: "Tacitus, Annalen 1,61–63: Bohlenwege (pontes longi) durch Moore",
			url: "https://www.thelatinlibrary.com/tacitus/tac.ann1.shtml",
		},
	],
	wet: [
		{
			label: "Beven & Kirkby 1979: Topographischer Feuchteindex (TWI)",
			url: "https://doi.org/10.1080/02626667909491834",
		},
		{
			label: "Kaye 2013: SAGA Wetness Index als Standortfaktor für Marschlager",
			url: "https://zenodo.org/records/839026",
		},
		{
			label: "Vegetius 1,22: kein Feld, das von Wildbächen überschwemmt wird",
			url: "https://www.thelatinlibrary.com/vegetius1.html",
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
				? `${km(data.distCamp)} bis zum nächsten bekannten Lager (${near.name}). Ein Tagesmarsch ist hier mit ${km(params.ringMean)} ± ${km(params.ringSigma)} angesetzt, auch zwei oder drei Märsche zählen, falls ein Zwischenlager fehlt.`
				: "Kein bekanntes Lager in der Nähe.",
		},
		{
			key: "water",
			verdict: verdict(f.water),
			text: `${meters(data.distWater)} bis zum nächsten ${water}. Bis ${params.waterNear} m gilt als ideal, in Britannien lagen 90 % der Marschlager höchstens 300 m vom Fluss.`,
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
			key: "terrace",
			verdict: verdict(f.terrace),
			text: `${Math.round(data.valley)} m über dem tiefsten Punkt im Umkreis von 1,5 km. Ideal sind 3–15 m, also trocken über Aue und Bach, aber noch nah am Wasser.`,
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
			key: "moor",
			verdict: data.moor > 0.3 ? "schwach" : data.moor > 0 ? "mittel" : "gut",
			text:
				data.moor > 0
					? `${Math.round(data.moor * 100)} % der Zelle sind laut Bodenkarte Moor. Das senkt das Potenzial um bis zu ${Math.round(params.moorPenalty * 100)} %, Marschwege meiden Moore.`
					: "Laut Bodenkarte kein Moor.",
		},
		{
			key: "wet",
			verdict: data.wet > 0.5 ? "schwach" : data.wet > 0.2 ? "mittel" : "gut",
			text: `Feuchteindex ergibt ${Math.round(data.wet * 100)} % Nässe. Hohe Werte zeigen Flächen, auf denen Wasser zusammenläuft und steht, früher oft Moor oder Bruch. Das senkt das Potenzial um bis zu ${Math.round(params.wetPenalty * 100)} %.`,
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
export function explainSimple(data, params) {
	const f = data.factors
	const pro = []
	const contra = []
	const near = nearestSites(data.lon, data.lat, 1)[0]
	if (f.ring >= 0.5 && near) {
		const marches = Math.max(1, Math.round(data.distCamp / params.ringMean))
		pro.push(
			marches === 1
				? `Etwa ein Tagesmarsch (${km(data.distCamp)}) vom bekannten Römerlager ${near.name}. In diesem Abstand bauten die Legionen ihr nächstes Nachtlager.`
				: `Etwa ${marches === 2 ? "zwei" : "drei"} Tagesmärsche (${km(data.distCamp)}) vom bekannten Römerlager ${near.name}. Dazwischen müsste ein noch unbekanntes Lager liegen, und dieser Ort passt in den Abstand.`,
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
	if (f.terrace >= 0.8 && data.valley >= 3) {
		pro.push(
			`Liegt auf einer trockenen Terrasse, ${Math.round(data.valley)} m über der Talaue. Solche sanft ansteigenden Plätze empfahlen die römischen Lagerregeln an erster Stelle.`,
		)
	}
	if (f.slope >= 0.8) {
		pro.push("Fast ebenes Gelände, genug Platz für ein großes Lager.")
	}
	if (f.corridor >= 0.7) {
		pro.push("Nahe an einem größeren Fluss, entlang dem die Heere zogen.")
	}
	for (const hint of nearbyHints(data.lon, data.lat)) pro.push(hint)
	if (f.water < 0.35)
		contra.push("Das nächste Gewässer ist recht weit entfernt.")
	if (data.moor > 0.3)
		contra.push(
			"Lag laut Bodenkarte im Moor. Dort ließ sich kein Lager mit Wall und Graben bauen.",
		)
	if (data.wet > 0.5)
		contra.push(
			"Feuchte Niederung, in der sich Wasser sammelt. Früher vermutlich Bruch oder Moor, für ein Lager ungeeignet.",
		)
	if (data.tpi < -2)
		contra.push("Liegt eher in einer Senke, das mieden die Römer.")
	if (data.slope > 8) contra.push("Das Gelände ist für ein Lager recht steil.")
	return { pro, contra: contra.slice(0, 2) }
}

/** Verdachtsflächen und römische Funde im Umkreis von 6 km. */
function nearbyHints(lon, lat) {
	return SITES.features
		.filter((f) => ["verdacht", "fund"].includes(f.properties.type))
		.map((f) => ({
			p: f.properties,
			d: haversine(
				lon,
				lat,
				f.geometry.coordinates[0],
				f.geometry.coordinates[1],
			),
		}))
		.filter(({ d }) => d < 6000)
		.sort((a, b) => a.d - b.d)
		.slice(0, 2)
		.map(({ p, d }) =>
			p.type === "verdacht"
				? `In ${km(d)} Entfernung liegt ein Ort, an dem auch Fachleute ein Lager vermuten: ${p.name}.`
				: `In ${km(d)} Entfernung wurden römische Funde gemacht: ${p.name} (${p.dating}).`,
		)
}
