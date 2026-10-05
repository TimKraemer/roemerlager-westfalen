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
