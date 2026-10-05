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
	{ id: "schlachtfeld", label: "Schlachtfeld / Konfliktort", color: "#263238" },
	{ id: "verdacht", label: "Fundplatz, kein Lager belegt", color: "#78909c" },
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
	return SITES.features
		.filter((f) => types.includes(f.properties.type))
		.map((f) => ({
			id: f.properties.id,
			lon: f.geometry.coordinates[0],
			lat: f.geometry.coordinates[1],
		}))
}
