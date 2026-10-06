/**
 * Zeitstrahl über die historischen Karten. Ein Stand ist ein Zeitpunkt mit
 * einer Leitkarte und weiteren Karten derselben Zeit. Wo sich Gewässer aus
 * einer Karte auslesen ließen (scripts/altkarten/gewaesser.py), zeigt der
 * Stand sie als Linien über der Karte.
 *
 * Für Linien taugen nur die vermessenen Karten ab etwa 1840. Die Karten
 * des 17. und 18. Jahrhunderts liegen örtlich 0,5–1 km neben der heutigen
 * Lage, sie zeigen, was es gab, aber nicht genau, wo.
 */

export const TIME_WATER_LAYER = "gewaesser-zeit"
export const TODAY_WATER_LAYER = "osm-gewaesser"
export const MOOR_LAYER = "moor-zeit"
export const WALD_LAYER = "wald-zeit"
export const WEGE_LAYER = "wege-zeit"

export const STANDS = [
	{
		id: "1680",
		label: "um 1680",
		maps: ["alt-1682-vogelschau-minden", "alt-1650-theatrum-minden"],
		note: "Vogelschau der Stadt Minden, außerhalb der Wälle nur grob.",
	},
	{
		id: "1800",
		label: "um 1800",
		maps: [
			"alt-1797-fuerstentum-minden",
			"alt-1805-lecoq-osnabrueck",
			"alt-1766-belagerung-minden",
			"alt-1759-schlacht-minden",
			"alt-1750-minden-ravensberg",
		],
		note: "Handgezeichnete und gestochene Karten, örtlich 0,3–1 km neben der heutigen Lage. Gewässer sind daraus nicht ausgelesen.",
	},
	{
		id: "1840",
		label: "um 1840",
		maps: [
			"uraufnahme",
			"alt-1844-kreis-luebbecke",
			"alt-1838-rb-minden",
			"alt-1825-reymann-minden",
			"alt-1818-atlas-sect3",
		],
		water: "ura",
		moor: ["ura", "1844"],
		wald: ["ura"],
		wege: ["ura"],
		note: "Preußische Uraufnahme, vor Moorkultivierung, Mittellandkanal und Begradigungen. Gewässer entlang der heutigen Bäche aus der Uraufnahme gelesen. Blau die Überschwemmungsgebiete der preußischen Aufnahme, dunkelbraun gestrichelt Moore der Kreiskarte 1844, die heute kein Moorboden mehr sind. Dunkelgrün der Wald der Uraufnahme, braun die heutigen Hauptstraßen, die es 1840 schon als Weg gab.",
	},
	{
		id: "1900",
		label: "um 1900",
		maps: [
			"alt-1904-kdr-luebbecke",
			"neuaufnahme",
			"alt-1898-levern-luebbecke",
			"alt-1891-wegekarte-luebbecke",
			"alt-1890-dechen-luebbecke",
		],
		water: "kdr1904",
		note: "Gewässer und Gräben aus der Karte des Deutschen Reiches 1904, nur Blatt Lübbecke (westlicher Kreis).",
	},
	{
		id: "1940",
		label: "um 1940",
		maps: ["tk25-1936", "hist-dop"],
		note: "TK25 der 1930er Jahre und Luftbilder der 1950er, nur NRW.",
	},
	{
		id: "heute",
		label: "heute",
		maps: [],
		water: "osm",
		moor: ["heute"],
		wald: ["heute"],
		wege: ["heute", "ura"],
		note: "Heutige Bäche und Flüsse aus OpenStreetMap, ohne Kanäle und Gräben. Türkis die heutigen Feuchtgebiete, grün der heutige Wald aus OpenStreetMap mit den Waldumrissen um 1840. Grau die heutigen Hauptstraßen, braun darüber die Wege von 1840.",
	},
]

/** Alle Karten, die der Zeitstrahl schaltet. */
export const STAND_MAPS = STANDS.flatMap((s) => s.maps)

export const standById = (id) => STANDS.find((s) => s.id === id) ?? STANDS[2]

/**
 * Sichtbarkeit der Ebenen für einen Stand: die gewählte Karte an, alle
 * anderen Karten des Zeitstrahls aus, Gewässer und Moore nach Wunsch.
 */
export function standOverlays(stand, mapId, water, moor, wald, wege) {
	const shown = mapId && stand.maps.includes(mapId) ? mapId : stand.maps[0]
	const patch = Object.fromEntries(STAND_MAPS.map((id) => [id, id === shown]))
	patch[TIME_WATER_LAYER] = Boolean(
		water && stand.water && stand.water !== "osm",
	)
	patch[TODAY_WATER_LAYER] = Boolean(water && stand.water === "osm")
	patch[MOOR_LAYER] = Boolean(moor)
	patch[WALD_LAYER] = Boolean(wald)
	patch[WEGE_LAYER] = Boolean(wege)
	return patch
}
