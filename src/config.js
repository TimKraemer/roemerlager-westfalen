/**
 * Zentrale Einstellungen für Betrieb und Zitierweise. Jeder Wert hat einen
 * Standard, der zur Referenzinstanz unter experiments.erleben.app passt,
 * und lässt sich beim Build per Umgebungsvariable überschreiben (Vorlage:
 * .env.example). Next.js setzt NEXT_PUBLIC_*-Werte zur Build-Zeit fest ein,
 * Bun liest sie für die Skripte aus .env bzw. .env.local.
 *
 * Inhaltliche Einstellungen (Regionen, Fundstellen, Ebenen, Modellgewichte)
 * stehen nicht hier, sondern in src/lib/regions.js, src/data/*.json,
 * src/lib/layers.js und src/lib/potential/model.js.
 */

const pick = (value, fallback) => (value ? value : fallback)

/** Unterpfad der App, z. B. "/roemer". Leer, wenn sie im Wurzelpfad liegt. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

/** Kacheldienste. Alle drei müssen CORS für die eigene Domain erlauben. */
export const TILES = {
	// Höhenmodell im Terrarium-Format (Mapzen). Fällt bei Fehlern auf die
	// Originalkacheln auf AWS zurück, siehe src/lib/terrain.js.
	dem: pick(
		process.env.NEXT_PUBLIC_DEM_TILES,
		"https://tiles.erleben.app/dem/{z}/{x}/{y}",
	),
	// Vektorkacheln im OpenMapTiles-Schema (Gewässer, Wald, Orte, Wege).
	// Öffentliche Alternative: https://tiles.openfreemap.org/planet
	vector: pick(
		process.env.NEXT_PUBLIC_VECTOR_TILES,
		"https://tiles.erleben.app/germany/{z}/{x}/{y}",
	),
	// Schriften für Kartenbeschriftungen (MapLibre-Glyphen)
	glyphs: pick(
		process.env.NEXT_PUBLIC_GLYPHS,
		"https://tiles.erleben.app/font/{fontstack}/{range}",
	),
}

/**
 * Zitiervorschlag für Karte und Quellen-Reiter. Bei Änderungen auch
 * CITATION.cff anpassen. Ein Fork mit eigener Instanz setzt
 * NEXT_PUBLIC_SITE_URL und trägt sich hier als Autor ein.
 */
export const CITATION = {
	author: "Tim Krämer",
	authorInverted: "Krämer, Tim",
	year: 2026,
	title: "Römerlager in Westfalen. Potenzialkarte für unentdeckte Marschlager",
	url: pick(
		process.env.NEXT_PUBLIC_SITE_URL,
		"https://experiments.erleben.app/roemer/",
	),
	repository: "https://github.com/TimKraemer/roemerlager-westfalen",
}
