/**
 * Fließgewässer aus OpenStreetMap über die Overpass API. Kanäle und Gräben
 * bleiben außen vor, sie sind neuzeitlich. Heutige Verläufe weichen von
 * den römerzeitlichen ab (Begradigung, Mäander), für einen Abstand von
 * einigen hundert Metern reicht das als Näherung.
 */

// Öffentliche Overpass-Server, bei Überlast (429/504) der nächste
const OVERPASS_URLS = [
	"https://overpass-api.de/api/interpreter",
	"https://overpass.private.coffee/api/interpreter",
	"https://maps.mail.ru/osm/tools/overpass/api/interpreter",
	"https://overpass.kumi.systems/api/interpreter",
]
const cache = new Map()

export async function fetchWaterways(bbox, signal) {
	const [west, south, east, north] = bbox.map((v) => Number(v.toFixed(3)))
	const key = [west, south, east, north].join(",")
	if (cache.has(key)) return cache.get(key)
	const query = `[out:json][timeout:90];
way["waterway"~"^(river|stream)$"](${south},${west},${north},${east});
out geom qt;`
	const json = await queryOverpass(query, signal)
	const features = json.elements
		.filter((el) => el.type === "way" && el.geometry?.length > 1)
		.map((el) => ({
			type: "Feature",
			properties: {
				id: el.id,
				kind: el.tags.waterway,
				name: el.tags.name ?? "",
			},
			geometry: {
				type: "LineString",
				coordinates: el.geometry.map((p) => [p.lon, p.lat]),
			},
		}))
	const collection = { type: "FeatureCollection", features }
	cache.set(key, collection)
	return collection
}

async function queryOverpass(query, signal) {
	const errors = []
	for (const url of OVERPASS_URLS) {
		try {
			const res = await fetch(url, {
				method: "POST",
				body: new URLSearchParams({ data: query }),
				signal,
			})
			if (res.ok) return await res.json()
			errors.push(`${new URL(url).host}: ${res.status}`)
		} catch (error) {
			if (signal?.aborted) throw error
			errors.push(`${new URL(url).host}: ${error.message}`)
		}
	}
	throw new Error(`Gewässer nicht ladbar (${errors.join(", ")})`)
}
