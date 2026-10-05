/**
 * Baut src/data/roemerstrassen.json:
 *
 * 1. Römerstraßen aus Itiner-e (Zenodo 10.5281/zenodo.17122148, CC BY 4.0),
 *    zugeschnitten auf Nordwestdeutschland und die Niederlande. Die Daten
 *    liegen in EPSG:3395 (World Mercator) und werden hier nach WGS84
 *    zurückgerechnet. Rechts des Rheins enthält Itiner-e keine Straßen.
 * 2. Hellweg vor dem Santforde (Minden – Bad Nenndorf – Gehrden), als
 *    mittelalterlicher Fernweg die naheliegende Achse zwischen den Lagern
 *    Barkhausen und Wilkenburg. Der Verlauf folgt näherungsweise der
 *    heutigen B 65 (aus den OSM-Kacheln von tiles.erleben.app).
 *
 *   bun scripts/build-roads.mjs
 */
import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { VectorTile } from "@mapbox/vector-tile"
import { PbfReader } from "pbf"
import { lonLatToPixel, pixelToLonLat } from "../src/lib/geo.js"
import { VECTOR_TILES } from "../src/lib/water.js"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const ITINERE =
	"https://zenodo.org/api/records/17122148/files/itinere_roads.geojson/content"
const CLIP = [5.0, 50.3, 11.0, 53.8]
const CERTAINTY = {
	Certain: "belegt",
	Conjectured: "vermutet",
	Hypothetical: "hypothetisch",
}

// EPSG:3395 -> WGS84 (ellipsoidischer Mercator, iterativ)
const A = 6378137
const E = 0.0818191908426
function fromWorldMercator(x, y) {
	const lon = (x / A) * (180 / Math.PI)
	const t = Math.exp(-y / A)
	let phi = Math.PI / 2 - 2 * Math.atan(t)
	for (let i = 0; i < 10; i++) {
		const es = E * Math.sin(phi)
		phi = Math.PI / 2 - 2 * Math.atan(t * ((1 - es) / (1 + es)) ** (E / 2))
	}
	return [Number(lon.toFixed(5)), Number(((phi * 180) / Math.PI).toFixed(5))]
}

async function itinere() {
	console.log("Itiner-e laden (78 MB) …")
	const data = await (await fetch(ITINERE)).json()
	const [w, s, e, n] = CLIP
	const features = []
	for (const f of data.features) {
		const g = f.geometry
		if (!g) continue
		const lines = g.type === "MultiLineString" ? g.coordinates : [g.coordinates]
		for (const line of lines) {
			const coords = line.map(([x, y]) => fromWorldMercator(x, y))
			if (
				!coords.some(
					([lon, lat]) => lon >= w && lon <= e && lat >= s && lat <= n,
				)
			)
				continue
			features.push({
				type: "Feature",
				properties: {
					name: f.properties.Name ?? "Römerstraße",
					certainty: CERTAINTY[f.properties.Segment_s] ?? "vermutet",
					source: "Itiner-e (CC BY 4.0)",
					url: "https://doi.org/10.5281/zenodo.17122148",
				},
				geometry: { type: "LineString", coordinates: coords },
			})
		}
	}
	return features
}

async function hellweg() {
	console.log("B 65 aus den Vektorkacheln …")
	const z = 11
	const [w, s, e, n] = [8.88, 52.24, 9.78, 52.4]
	const [x0, y0] = lonLatToPixel(w, n, z).map((v) => Math.floor(v / 256))
	const [x1, y1] = lonLatToPixel(e, s, z).map((v) => Math.floor(v / 256))
	const features = []
	for (let y = y0; y <= y1; y++) {
		for (let x = x0; x <= x1; x++) {
			const url = VECTOR_TILES.replace("{z}", z)
				.replace("{x}", x)
				.replace("{y}", y)
			const res = await fetch(url)
			if (!res.ok || res.status === 204) continue
			const tile = new VectorTile(
				new PbfReader(new Uint8Array(await res.arrayBuffer())),
			)
			const layer = tile.layers.transportation_name
			if (!layer) continue
			for (let i = 0; i < layer.length; i++) {
				const f = layer.feature(i)
				if (f.properties.ref !== "B 65") continue
				for (const ring of f.loadGeometry()) {
					const coords = ring
						.map((p) =>
							pixelToLonLat(
								x * 256 + (p.x * 256) / layer.extent,
								y * 256 + (p.y * 256) / layer.extent,
								z,
							),
						)
						.filter(
							([lon, lat]) => lon >= w && lon <= e && lat >= s && lat <= n,
						)
						.map(([lon, lat]) => [
							Number(lon.toFixed(5)),
							Number(lat.toFixed(5)),
						])
					if (coords.length < 2) continue
					features.push({
						type: "Feature",
						properties: {
							name: "Hellweg vor dem Santforde (ungefähr entlang der B 65)",
							certainty: "hypothetisch",
							source:
								"Mittelalterlicher Fernweg Minden – Gehrden, als römische Marschroute vermutet",
							url: "https://de.wikipedia.org/wiki/Schatzfund_von_Gehrden",
						},
						geometry: { type: "LineString", coordinates: coords },
					})
				}
			}
		}
	}
	return features
}

const features = [...(await itinere()), ...(await hellweg())]
writeFileSync(
	join(ROOT, "src", "data", "roemerstrassen.json"),
	JSON.stringify({ type: "FeatureCollection", features }),
)
const count = (c) => features.filter((f) => f.properties.certainty === c).length
console.log(
	`${features.length} Abschnitte: ${count("belegt")} belegt, ${count("vermutet")} vermutet, ${count("hypothetisch")} hypothetisch`,
)
