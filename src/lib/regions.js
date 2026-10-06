import kreis from "@/data/kreis-minden-luebbecke.json"

/**
 * Vorberechnete Regionen. Das Analysegebiet reicht über den Kreis hinaus,
 * damit Routen zu den Nachbarlagern (Bielefeld-Sennestadt) darin liegen.
 * Neu rechnen: bun run precompute
 */
export const REGIONS = [
	{
		id: "minden-luebbecke",
		label: "Kreis Minden-Lübbecke",
		bbox: [8.3, 51.93, 9.25, 52.56],
		view: { bounds: [8.297, 52.162, 9.138, 52.531] },
		outline: kreis,
		file: "precomputed/minden-luebbecke",
	},
]

export const DEFAULT_REGION = REGIONS[0]

/**
 * Weiter lässt sich die Karte nicht verschieben oder herauszoomen:
 * Nordwestdeutschland vom Niederrhein (Xanten) bis Hachelbich und von der
 * Nordseeküste bis Oberbrechen an der Lahn, mit Rand rundherum. Breit
 * genug, dass auf Breitbildschirmen das ganze Gebiet auf einmal sichtbar
 * ist, und im Westen extra Platz, weil dort auf dem Desktop die
 * Seitenleiste über der Karte liegt. Die Ortssuche bleibt ebenfalls drinnen.
 */
export const MAP_BOUNDS = [3.0, 49.3, 14.0, 54.6]

export function inMapBounds(lon, lat) {
	const [w, s, e, n] = MAP_BOUNDS
	return lon >= w && lon <= e && lat >= s && lat <= n
}

/**
 * Überregionales Marschwege-Netz: von Vetera am Rhein über die Lippelager
 * bis Wilkenburg und Hedemünden, gröber gerechnet (500 m). Liefert Routen,
 * Etappenhalte und die großen natürlichen Flussläufe.
 */
export const NETWORK = {
	id: "westfalen-netz",
	label: "Westfalen und Nachbarregionen",
	bbox: [6.3, 51.25, 10.0, 52.75],
	cellMeters: 500,
	riverKm2: 300,
	file: "precomputed/westfalen-netz",
	// Feinere Zellen, wo schmale Pässe den Weg entscheiden (Sattel bei Bad
	// Holzhausen im Wiehengebirge). Routen mit beiden Enden im Ausschnitt
	// werden dort neu gerechnet.
	refine: [
		{ label: "Wiehengebirge", bbox: [7.9, 51.8, 9.3, 52.6], cellMeters: 250 },
	],
	routeParams: {
		connect: true,
		neighbors: 3,
		maxPair: 75000,
		// Oberaden 2,6 km neben Beckinghausen bleibt ein eigener Knoten
		mergeRadius: 2000,
		// Lippe: von Vetera per Schiff bis Beckinghausen, Anreppen vermutet
		shipChain: [
			"vetera",
			"holsterhausen",
			"haltern-hauptlager",
			"olfen",
			"beckinghausen",
			"anreppen",
		],
		shipNotes: {
			anreppen:
				"Die Weiterfahrt auf der oberen Lippe bis Anreppen ist vermutet, das Lager gilt als Versorgungsplatz am Fluss.",
		},
	},
}
