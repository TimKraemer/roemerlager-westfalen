import { lonLatToPixel, metersPerPixel, pixelToLonLat } from "../geo"
import { moorCover } from "../moor"
import { loadElevationSampler } from "../terrain"
import { fetchOldWaterways, fetchWaterways, forestCover } from "../water"
import { flowAccumulation, streamLines } from "./drainage"
import { linesFactor } from "./lineaments"
import {
	cellCenter,
	combine,
	computeSlope,
	computeTpi,
	computeValleyHeight,
	createGrid,
	distanceToCamps,
	distanceToLines,
	distanceToMask,
	findCandidates,
	ringFactor,
	sampleElevation,
} from "./model"
import {
	burnOldRivers,
	OLD_RIVER_NAMES,
	oldRiverCourses,
	oldRiverLines,
	rasterizeLines,
} from "./old-rivers"
import { riverGraph } from "./river-path"
import {
	computeRoutes,
	costSurface,
	edgeHours,
	laneCrossings,
	ROUTE_PARAMS,
	routeStages,
	routesGeoJSON,
	terrainLanes,
} from "./routes"

/**
 * Rechenkette der Potenzialanalyse, gemeinsam für den Web Worker und das
 * Vorberechnungs-Skript (scripts/precompute.mjs).
 * prepare(): Höhenmodell laden, Gelände und Gewässernetz vorbereiten.
 * evaluate(): Ring, TPI, Gewässer, Routen und Gewichtung nach Bedarf neu.
 */

// Netz der alten Flussläufe für Schiffswege, einmal je Worker
let riverNet = null

// Rand um den Ausschnitt, damit Einzugsgebiete nicht an der Kante enden
const DRAINAGE_BUFFER_M = 6000
// Obergrenze für das Abflussraster, darüber wird gröber gerechnet
const DRAINAGE_MAX_PIXELS = 2_500_000

function demZoomFor(bbox) {
	const widthKm =
		(bbox[2] - bbox[0]) * 111 * Math.cos((bbox[1] * Math.PI) / 180)
	return widthKm > 40 ? 11 : 12
}

function linesOf(collection, kinds) {
	return collection.features
		.filter((f) => kinds.includes(f.properties.kind))
		.map((f) => f.geometry.coordinates)
}

function gridBbox(grid) {
	const [nw, , se] = grid.corners
	return [nw[0], se[1], se[0], nw[1]]
}

/** Höhenraster mit Rand für die Abflussberechnung. */
function buildDrainageRaster(grid, sampler) {
	const midLat = pixelToLonLat(
		grid.x0,
		grid.y0 + (grid.rows * grid.cellPx) / 2,
		grid.zoom,
	)[1]
	const demMeters = metersPerPixel(midLat, grid.zoom)
	const buffer = DRAINAGE_BUFFER_M / demMeters
	const spanX = grid.cols * grid.cellPx + 2 * buffer
	const spanY = grid.rows * grid.cellPx + 2 * buffer
	const step = Math.max(1, Math.sqrt((spanX * spanY) / DRAINAGE_MAX_PIXELS))
	const width = Math.ceil(spanX / step)
	const height = Math.ceil(spanY / step)
	const x0 = grid.x0 - buffer
	const y0 = grid.y0 - buffer
	const dem = new Float32Array(width * height)
	for (let r = 0; r < height; r++) {
		for (let c = 0; c < width; c++) {
			const v = sampler(x0 + (c + 0.5) * step, y0 + (r + 0.5) * step)
			dem[r * width + c] = Number.isFinite(v) ? v : 0
		}
	}
	const meters = demMeters * step
	return {
		x0,
		y0,
		step,
		width,
		height,
		meters,
		flow: flowAccumulation(dem, width, height, meters),
	}
}

/**
 * Topographischer Feuchteindex je Zelle (Beven & Kirkby 1979):
 * TWI = ln(a / tan β), a = Einzugsfläche je Meter Konturlänge. Hohe Werte
 * zeigen Flächen, auf denen Wasser zusammenläuft und steht: Brüche,
 * Niedermoore, nasse Auen. Daraus ein Nässe-Anteil 0–1.
 */
function wetness(grid, raster, slope) {
	const { flow, width, height, meters } = raster
	const n = grid.cols * grid.rows
	const wet = new Float32Array(n)
	const twi = new Float32Array(n)
	for (let r = 0; r < grid.rows; r++) {
		for (let c = 0; c < grid.cols; c++) {
			const x = grid.x0 + (c + 0.5) * grid.cellPx
			const y = grid.y0 + (r + 0.5) * grid.cellPx
			const rc = Math.min(width - 1, Math.floor((x - raster.x0) / raster.step))
			const rr = Math.min(height - 1, Math.floor((y - raster.y0) / raster.step))
			const a = (flow.acc[rr * width + rc] * 1e6) / meters
			const tanb = Math.max(
				0.002,
				Math.tan((slope[r * grid.cols + c] * Math.PI) / 180),
			)
			const i = r * grid.cols + c
			twi[i] = Math.log(a / tanb)
			wet[i] = 1 / (1 + Math.exp(-(twi[i] - 13) / 1.2))
		}
	}
	return { wet, twi }
}

/** Pixelmitte des Abflussrasters als [lon, lat], auf etwa 1 m gerundet. */
function rasterLonLat(raster, zoom) {
	return (i) => {
		const c = i % raster.width
		const r = (i - c) / raster.width
		const [lon, lat] = pixelToLonLat(
			raster.x0 + (c + 0.5) * raster.step,
			raster.y0 + (r + 0.5) * raster.step,
			zoom,
		)
		return [Number(lon.toFixed(5)), Number(lat.toFixed(5))]
	}
}

/** Gewässerabstände je Zelle aus dem Abflussraster. */
function demWater(state, params) {
	const { grid, raster } = state
	const { flow, width } = raster
	const { acc } = flow
	const streams = new Uint8Array(acc.length)
	const rivers = new Uint8Array(acc.length)
	for (let i = 0; i < acc.length; i++) {
		if (acc[i] >= params.streamKm2) streams[i] = 1
		if (acc[i] >= params.riverKm2) rivers[i] = 1
	}
	if (params.oldRivers)
		burnOldRivers(streams, rivers, raster, grid.zoom, gridBbox(grid))
	const lines = streamLines(
		flow,
		params.streamKm2,
		params.riverKm2,
		rasterLonLat(raster, grid.zoom),
		width,
	)
	return waterFromMasks(state, streams, rivers, lines)
}

// Heutiger Bach so nah an einem Lauf der Uraufnahme ist derselbe Bach,
// nur begradigt oder verlegt
const SAME_BROOK_M = 400
// Abgeleitete Flüsse zählen als Wasser nur fern aller kartierten Gewässer
const DERIVED_RIVER_M = 1000

/**
 * Gewässerabstände aus Karten: Bäche der Uraufnahme um 1840, wo es sie gibt,
 * sonst heutige Bäche und Flüsse aus OSM (ohne Kanäle und Gräben). Das aus
 * dem Höhenmodell abgeleitete Netz liegt im Flachland oft Hunderte Meter
 * neben den echten Bächen und dient hier nur noch für die großen Flüsse.
 */
function mappedWater(state, params) {
	const { grid, raster, mapped } = state
	const { flow, width, height, meters } = raster
	const { acc } = flow
	const n = acc.length
	const rivers = new Uint8Array(n)
	const derived = new Uint8Array(n)
	for (let i = 0; i < n; i++) {
		if (acc[i] >= params.riverKm2) rivers[i] = derived[i] = 1
	}
	const bbox = gridBbox(grid)
	if (params.oldRivers)
		burnOldRivers(new Uint8Array(n), rivers, raster, grid.zoom, bbox)
	const oldLines = [
		...mapped.old.map((l) => l.coords),
		...(params.oldRivers ? oldRiverLines(bbox, 0.2) : []),
	]
	const old = rasterizeLines(oldLines, raster, grid.zoom).mask
	const osm = rasterizeLines(
		mapped.osm.features.map((f) => f.geometry.coordinates),
		raster,
		grid.zoom,
	).mask
	const dOld = distanceToMask(old, width, height, meters)
	const streams = new Uint8Array(n)
	for (let i = 0; i < n; i++) {
		if (old[i] || (osm[i] && dOld[i] > SAME_BROOK_M)) streams[i] = 1
	}
	const dMapped = distanceToMask(streams, width, height, meters)
	for (let i = 0; i < n; i++) {
		if (derived[i] && dMapped[i] > DERIVED_RIVER_M) streams[i] = 1
	}
	// Linien für die Karte: alte Läufe, heutige Bäche ohne alten Lauf, Flüsse
	const toPixel = ([lon, lat]) => {
		const [px, py] = lonLatToPixel(lon, lat, grid.zoom)
		const c = Math.floor((px - raster.x0) / raster.step)
		const r = Math.floor((py - raster.y0) / raster.step)
		return c >= 0 && r >= 0 && c < width && r < height ? r * width + c : -1
	}
	const nearOld = (f) => {
		const pts = f.geometry.coordinates
		let near = 0
		for (const p of pts) {
			const i = toPixel(p)
			if (i >= 0 && dOld[i] <= SAME_BROOK_M) near++
		}
		return near > pts.length / 2
	}
	const derivedRivers = streamLines(
		flow,
		params.riverKm2,
		params.riverKm2,
		rasterLonLat(raster, grid.zoom),
		width,
	)
	const lines = {
		type: "FeatureCollection",
		features: [
			...mapped.old.map((l) => ({
				type: "Feature",
				properties: { kind: l.kind, name: l.name, source: "1840" },
				geometry: { type: "LineString", coordinates: l.coords },
			})),
			...mapped.osm.features
				.filter((f) => !nearOld(f))
				.map((f) => ({
					...f,
					geometry: {
						type: "LineString",
						// auf etwa 1 m runden, die Linien gehen in die Vorberechnung
						coordinates: f.geometry.coordinates.map(([lon, lat]) => [
							Number(lon.toFixed(5)),
							Number(lat.toFixed(5)),
						]),
					},
				})),
			...derivedRivers.features,
		],
	}
	return waterFromMasks(state, streams, rivers, lines)
}

/** Abstände je Zelle, Querungen und Linien aus Bach- und Flussmaske. */
function waterFromMasks(state, streams, rivers, lines) {
	const { grid, raster } = state
	const { width, height, meters } = raster
	const dW = distanceToMask(streams, width, height, meters)
	const dR = distanceToMask(rivers, width, height, meters)
	const n = grid.cols * grid.rows
	const distWater = new Float32Array(n)
	const distRiver = new Float32Array(n)
	for (let r = 0; r < grid.rows; r++) {
		for (let c = 0; c < grid.cols; c++) {
			const x = grid.x0 + (c + 0.5) * grid.cellPx
			const y = grid.y0 + (r + 0.5) * grid.cellPx
			const rc = Math.min(width - 1, Math.floor((x - raster.x0) / raster.step))
			const rr = Math.min(height - 1, Math.floor((y - raster.y0) / raster.step))
			distWater[r * grid.cols + c] = dW[rr * width + rc]
			distRiver[r * grid.cols + c] = dR[rr * width + rc]
		}
	}
	return {
		distWater,
		distRiver,
		// Für Routen: welche Schritte ein Gewässer queren
		crossings: laneCrossings(grid, {
			distWater: dW,
			distRiver: dR,
			x0: raster.x0,
			y0: raster.y0,
			step: raster.step,
			width,
			height,
			meters,
		}),
		streams: lines,
	}
}

async function waterFor(state, params, isStale) {
	if (params.waterSource === "karten") {
		if (!state.mapped) {
			const bbox = gridBbox(state.grid)
			state.onProgress("Bäche aus Karten laden", 0)
			const [osm, old] = await Promise.all([
				state.osm ??
					fetchWaterways(bbox, (v) =>
						state.onProgress("Bäche aus Karten laden", v),
					),
				// Uraufnahme nur im Kreis Minden-Lübbecke, sonst bleibt es bei OSM
				fetchOldWaterways(bbox).catch(() => []),
			])
			if (isStale()) return null
			state.osm = osm
			state.mapped = { osm, old }
		}
		return mappedWater(state, params)
	}
	if (params.waterSource === "osm") {
		if (!state.osm) {
			state.onProgress("Gewässer aus OSM-Kacheln laden", 0)
			state.osm = await fetchWaterways(gridBbox(state.grid), (v) =>
				state.onProgress("Gewässer aus OSM-Kacheln laden", v),
			)
			if (isStale()) return null
		}
		const { grid, osm } = state
		// Alte Läufe ersetzen die heutigen Linien derselben Flüsse
		const old = params.oldRivers ? oldRiverLines(gridBbox(grid)) : []
		const kept = params.oldRivers
			? {
					...osm,
					features: osm.features.filter(
						(f) => !OLD_RIVER_NAMES.includes(f.properties.name),
					),
				}
			: osm
		return {
			distWater: distanceToLines(grid, [
				...linesOf(kept, ["river", "stream"]),
				...old,
			]),
			distRiver: distanceToLines(grid, [...linesOf(kept, ["river"]), ...old]),
			// Die Karte zeigt OSM direkt aus den Vektorkacheln
			streams: null,
			crossings: null,
		}
	}
	return demWater(state, params)
}

/** Höhenmodell laden und Gelände sowie Abflussnetz vorbereiten. */
export async function prepare(
	bbox,
	params,
	{ onProgress = () => {}, isStale = () => false, includeNiMoor = false } = {},
) {
	const zoom = demZoomFor(bbox)
	const grid = createGrid(bbox, params.cellMeters, zoom)
	const pad = DRAINAGE_BUFFER_M / metersPerPixel(bbox[1], zoom) + 2
	onProgress("Höhenmodell laden", 0)
	const sampler = await loadElevationSampler(
		zoom,
		grid.x0 - pad,
		grid.y0 - pad,
		grid.x0 + grid.cols * grid.cellPx + pad,
		grid.y0 + grid.rows * grid.cellPx + pad,
		(value) => onProgress("Höhenmodell laden", value),
	)
	if (isStale()) return null
	onProgress("Gelände auswerten", 0)
	const elev = sampleElevation(grid, sampler)
	onProgress("Gewässernetz ableiten", 0)
	const state = {
		onProgress,
		grid,
		elev,
		slope: computeSlope(grid, elev),
		// Für Routen: Gehzeit je Schritt und Spur aus dem feinen Höhenprofil
		lanes: terrainLanes(grid, sampler),
		raster: buildDrainageRaster(grid, sampler),
		osm: null,
		mapped: null,
		waterKey: null,
		routeKey: null,
		tpi: null,
		tpiRadius: null,
		moor: null,
		includeNiMoor,
	}
	Object.assign(state, wetness(grid, state.raster, state.slope))
	state.valley = computeValleyHeight(grid, elev)
	return state
}

/**
 * Bewertet das vorbereitete Raster. Liefert null, wenn isStale() während
 * des Ladens wahr wird. Routen und Gewässerlinien sind nur dabei, wenn sie
 * neu berechnet wurden oder full gesetzt ist.
 */
export async function evaluate(
	state,
	{
		params,
		camps,
		routeCamps,
		routeLines,
		routeParams,
		waypoints,
		lineaments,
		candidateThreshold,
	},
	{ isStale = () => false, full = false } = {},
) {
	const { grid, elev, slope } = state
	const t0 = performance.now()
	if (state.tpiRadius !== params.tpiRadius) {
		state.tpi = computeTpi(grid, elev, params.tpiRadius)
		state.tpiRadius = params.tpiRadius
	}
	const waterKey = [
		params.waterSource,
		params.streamKm2,
		params.riverKm2,
		params.oldRivers,
	].join()
	const waterChanged = state.waterKey !== waterKey
	if (waterChanged) {
		const water = await waterFor(state, params, isStale)
		if (!water) return
		Object.assign(state, water, { waterKey })
	}
	const { distWater, distRiver } = state

	// Moore aus den Bodenkarten: für Routen und Potenzial
	if (!state.moor) {
		state.onProgress("Moore aus den Bodenkarten laden", 0)
		state.moor = await moorCover(grid, {
			includeNi: state.includeNiMoor,
		}).catch(() => new Float32Array(grid.cols * grid.rows))
		if (isStale()) return null
	}

	// Routen hängen am Gelände, an den Gewässern und an den Lagern. Liegen
	// Linien aus dem überregionalen Netz vor (routeLines), zählen nur diese.
	const routeKey = routeLines
		? `netz|${routeLines.length}`
		: [
				waterKey,
				params.tpiRadius,
				params.ringMean,
				routeCamps.map((c) => c.id).join(),
			].join("|")
	const routesChanged = state.routeKey !== routeKey
	if (routesChanged && routeLines) {
		state.routes = []
		state.distRoute = distanceToLines(grid, routeLines)
		state.routeKey = routeKey
	} else if (routesChanged) {
		state.onProgress("Marschrouten berechnen", 1)
		const p = { ...ROUTE_PARAMS, ...routeParams }
		const cost = costSurface(
			grid,
			{
				moor: state.moor,
				slope,
				tpi: state.tpi,
				distWater,
				distRiver,
				valley: state.valley,
				crossings: state.crossings,
			},
			p,
		)
		const edges = edgeHours(grid, state.lanes, state.crossings, p)
		// Schiffswege folgen den alten Flussläufen, auch ohne params.oldRivers
		riverNet ??= riverGraph(oldRiverCourses())
		const routes = computeRoutes(grid, cost, routeCamps, params.ringMean, p, {
			distRiver,
			edges,
			waypoints,
			rivers: riverNet,
		})
		const mask = new Uint8Array(grid.cols * grid.rows)
		for (const route of routes) for (const c of route.cells) mask[c] = 1
		state.routes = routes
		state.distRoute = distanceToMask(
			mask,
			grid.cols,
			grid.rows,
			grid.cellMeters,
		)
		state.routeKey = routeKey
	}

	const ring = ringFactor(
		grid,
		camps,
		params.ringMean,
		params.ringSigma,
		params.ringMultiples ?? 1,
	)
	const distCamp = distanceToCamps(grid, camps)
	// Umkreis ohne Vorschläge um alle bekannten Lager, nicht nur die Ring-Lager
	const distKnown = distanceToCamps(
		grid,
		(routeCamps ?? camps).filter((c) => !c.target),
	)
	const { factors, score } = combine(
		{
			ring,
			distWater,
			distRiver,
			distRoute: state.distRoute,
			tpi: state.tpi,
			slope,
			distCamp,
			distKnown,
			valley: state.valley,
		},
		params,
	)
	// Abzüge: nasse Niederungen und frühere Moore (TWI), auf Wunsch heutiger Wald
	if (params.forestPenalty > 0 && !state.forest) {
		state.onProgress("Wald aus OSM-Kacheln laden", 0)
		state.forest = await forestCover(grid)
		if (isStale()) return null
	}
	for (let i = 0; i < score.length; i++) {
		score[i] *= 1 - params.moorPenalty * state.moor[i]
		score[i] *= 1 - params.wetPenalty * state.wet[i]
		if (params.forestPenalty > 0)
			score[i] *= 1 - params.forestPenalty * state.forest[i]
	}

	// Bonus für gerade Strukturen im Laserscan, nur in untersuchten Fenstern
	const lines = linesFactor(grid, lineaments, cellCenter)
	if (params.linesBonus > 0) {
		for (let i = 0; i < score.length; i++) {
			if (lines[i] > 0)
				score[i] = Math.min(1, score[i] * (1 + params.linesBonus * lines[i]))
		}
	}
	const candidates = findCandidates(grid, score, {
		threshold: candidateThreshold,
	})
	return {
		grid,
		score,
		factors,
		raw: {
			elev,
			slope,
			tpi: state.tpi,
			distWater,
			distRiver,
			distCamp,
			distRoute: state.distRoute,
			lines,
			valley: state.valley,
			distKnown,
			wet: state.wet,
			moor: state.moor,
			forest: state.forest ?? new Float32Array(score.length),
		},
		// Große Linien nur nach Neuberechnung mitschicken
		streams: waterChanged || full ? state.streams : undefined,
		routes:
			routesChanged || full ? routesGeoJSON(grid, state.routes) : undefined,
		stages: routeStages(grid, state.routes, score, params.ringMean, {
			...ROUTE_PARAMS,
			...routeParams,
		}),
		waterSource: params.waterSource,
		candidates,
		ms: Math.round(performance.now() - t0),
	}
}

/** Gewässerlinien mit eigener Schwelle, z. B. nur große Flüsse fürs Netz. */
export function waterLines(state, minKm2, riverKm2) {
	const { raster } = state
	const { flow, width } = raster
	const toLonLat = (i) => {
		const c = i % width
		const r = (i - c) / width
		const [lon, lat] = pixelToLonLat(
			raster.x0 + (c + 0.5) * raster.step,
			raster.y0 + (r + 0.5) * raster.step,
			state.grid.zoom,
		)
		return [Number(lon.toFixed(4)), Number(lat.toFixed(4))]
	}
	return streamLines(flow, minKm2, riverKm2, toLonLat, width, 1.5)
}
