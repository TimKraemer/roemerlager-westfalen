/**
 * Zeitstrahl über die historischen Karten. Ein Stand ist ein Zeitpunkt mit
 * einer Leitkarte und weiteren Karten derselben Zeit. Wo sich Gewässer aus
 * einer Karte auslesen ließen (scripts/altkarten/gewaesser.py), zeigt der
 * Stand sie als Linien über der Karte.
 *
 * Enthalten sind nur Karten, aus denen das Modell Gewässer oder Moore
 * liest. Die älteren Karten und die Stände um 1680, 1800 und 1940 stecken
 * im Tag vor-trennung.
 */

export const TIME_WATER_LAYER = "gewaesser-zeit"
export const TODAY_WATER_LAYER = "osm-gewaesser"
export const MOOR_LAYER = "moor-zeit"
export const WALD_LAYER = "wald-zeit"
export const WEGE_LAYER = "wege-zeit"

export const STANDS = [
	{
		id: "1840",
		label: "um 1840",
		maps: ["uraufnahme", "alt-1844-kreis-luebbecke"],
		water: "ura",
		moor: ["ura", "1844"],
		wald: ["ura"],
		wege: ["ura"],
		note: "Preußische Uraufnahme, vor Moorkultivierung, Mittellandkanal und Begradigungen. Gewässer entlang der heutigen Bäche aus der Uraufnahme gelesen. Blau die Überschwemmungsgebiete der preußischen Aufnahme, dunkelbraun gestrichelt Moore der Kreiskarte 1844, die heute kein Moorboden mehr sind. Dunkelgrün der Wald der Uraufnahme, braun die heutigen Hauptstraßen, die es 1840 schon als Weg gab.",
	},
	{
		id: "1900",
		label: "um 1900",
		maps: ["alt-1904-kdr-luebbecke", "neuaufnahme"],
		water: "kdr1904",
		// Für 1900 gibt es keine Walddaten, die Flächen von 1840 stehen ein
		wald: ["ura"],
		note: "Gewässer und Gräben aus der Karte des Deutschen Reiches 1904, nur Blatt Lübbecke (westlicher Kreis). Der Wald ist unverändert aus der Uraufnahme um 1840 übernommen, weil es für die Zeit um 1900 keine Walddaten gibt. Wo damals wirklich Wald stand, ist unklar.",
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

export const standById = (id) =>
	STANDS.find((s) => s.id === id) ?? STANDS.find((s) => s.id === "1840")

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
