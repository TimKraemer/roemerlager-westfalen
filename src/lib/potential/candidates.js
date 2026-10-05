import { pointInGeometry } from "../geo"
import { DEFAULT_REGION } from "../regions"

/**
 * Kandidaten mit Rang. Beim vorberechneten Kreis zählen nur Orte im
 * Kreisgebiet für die Nummerierung, die übrigen bleiben ohne Nummer
 * sichtbar. Bei einem frei berechneten Ausschnitt zählen alle.
 */
export function rankedCandidates(result) {
	if (!result) return []
	const geometry =
		result.region === DEFAULT_REGION.id
			? DEFAULT_REGION.outline.features[0].geometry
			: null
	let rank = 0
	return result.candidates.map((c) => {
		const inRegion = geometry ? pointInGeometry(c.lon, c.lat, geometry) : true
		return { ...c, inRegion, rank: inRegion ? ++rank : null }
	})
}
