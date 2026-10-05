import data from "@/data/fundstellen.json"

/**
 * Bekannte römische Fundstellen (augusteisch-tiberisch, ca. 12 v. Chr. –
 * 16 n. Chr.). Koordinaten sind öffentlich zugängliche Näherungen
 * (Wikipedia, LWL, Presse), `precision` sagt, wie genau.
 */
export const SITE_TYPES = [
	{ id: "legionslager", label: "Legionslager / Hauptlager", color: "#b71c1c" },
	{ id: "kastell", label: "Kastell / Versorgungslager", color: "#e65100" },
	{ id: "marschlager", label: "Marschlager", color: "#6a1b9a" },
	{ id: "posten", label: "Wach- oder Signalposten", color: "#ad1457" },
	{ id: "schlachtfeld", label: "Schlachtfeld / Konfliktort", color: "#263238" },
	{ id: "fund", label: "Römische Funde (Münzen, Militaria)", color: "#00897b" },
	{ id: "verdacht", label: "Verdacht, Fundplatz ohne Lager", color: "#78909c" },
]

export const SITE_TYPE_BY_ID = Object.fromEntries(
	SITE_TYPES.map((t) => [t.id, t]),
)

export const SITES = data

// Ausgangspunkte für die Tagesmarsch-Ringe
export const RING_SOURCES = [
	{ id: "marching", label: "Nur Marschlager" },
	{ id: "camps", label: "Alle Lager" },
]

export function campsFor(ringSource) {
	const types =
		ringSource === "marching"
			? ["marschlager"]
			: ["marschlager", "legionslager", "kastell"]
	// Nur augusteische Lager erzeugen Ringe und Routen (inModel)
	return SITES.features
		.filter((f) => f.properties.inModel && types.includes(f.properties.type))
		.map((f) => ({
			id: f.properties.id,
			name: f.properties.name,
			lon: f.geometry.coordinates[0],
			lat: f.geometry.coordinates[1],
		}))
}

// Routen verbinden alle Militärlager, unabhängig von der Ring-Auswahl
export const routeCamps = () => campsFor("camps")
