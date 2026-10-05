import { metersPerPixel, pixelToLonLat } from "../geo"
import { loadElevationSampler } from "../terrain"
import { flowAccumulation, streamLines } from "./drainage"
import {
	combine,
	computeSlope,
	computeTpi,
	createGrid,
	distanceToCamps,
	distanceToLines,
	distanceToMask,
	findCandidates,
	ringFactor,
	sampleElevation,
} from "./model"

/**
 * Rechnet das Potenzialraster abseits des UI-Threads.
 * "analyze": Höhenmodell laden, Gelände und Gewässernetz vorbereiten.
 * "update": nur Ring, TPI, Gewässerschwellen und Gewichtung neu.
 */

// Rand um den Ausschnitt, damit Einzugsgebiete nicht an der Kante enden
const DRAINAGE_BUFFER_M = 6000
// Obergrenze für das Abflussraster, darüber wird gröber gerechnet
const DRAINAGE_MAX_PIXELS = 2_500_000

let state = null

function post(type, payload, transfer) {
	self.postMessage({ type, ...payload }, transfer)
}

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

/** Gewässerabstände je Zelle, aus dem Abflussraster oder aus OSM. */
function waterDistances(params) {
	const { grid, raster, waterways } = state
	if (params.waterSource === "osm" && waterways) {
		return {
			distWater: distanceToLines(grid, linesOf(waterways, ["river", "stream"])),
			distRiver: distanceToLines(grid, linesOf(waterways, ["river"])),
			streams: null,
		}
	}
	const { flow, width, height, meters } = raster
	const { acc } = flow
	const streams = new Uint8Array(acc.length)
	const rivers = new Uint8Array(acc.length)
	for (let i = 0; i < acc.length; i++) {
		if (acc[i] >= params.streamKm2) streams[i] = 1
		if (acc[i] >= params.riverKm2) rivers[i] = 1
	}
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
	const toLonLat = (i) => {
		const c = i % width
		const r = (i - c) / width
		const [lon, lat] = pixelToLonLat(
			raster.x0 + (c + 0.5) * raster.step,
			raster.y0 + (r + 0.5) * raster.step,
			grid.zoom,
		)
		return [Number(lon.toFixed(5)), Number(lat.toFixed(5))]
	}
	return {
		distWater,
		distRiver,
		streams: streamLines(flow, params.streamKm2, params.riverKm2, toLonLat),
	}
}

function evaluate({ params, camps, candidateThreshold }) {
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
	].join()
	const waterChanged = state.waterKey !== waterKey
	if (waterChanged) {
		Object.assign(state, waterDistances(params), { waterKey })
	}
	const { distWater, distRiver, streams } = state
	const ring = ringFactor(grid, camps, params.ringMean, params.ringSigma)
	const distCamp = distanceToCamps(grid, camps)
	const { factors, score } = combine(
		{ ring, distWater, distRiver, tpi: state.tpi, slope, distCamp },
		params,
	)
	const candidates = findCandidates(grid, score, {
		threshold: candidateThreshold,
	})
	post("result", {
		grid,
		score,
		factors,
		raw: { elev, slope, tpi: state.tpi, distWater, distRiver, distCamp },
		// Linien nur nach Neuberechnung mitschicken, sie sind groß
		streams: waterChanged ? streams : undefined,
		waterSource:
			params.waterSource === "osm" && state.waterways ? "osm" : "dem",
		candidates,
		ms: Math.round(performance.now() - t0),
	})
}

self.onmessage = async (event) => {
	const msg = event.data
	try {
		if (msg.type === "analyze") {
			const { bbox, params, waterways } = msg
			const zoom = demZoomFor(bbox)
			const grid = createGrid(bbox, params.cellMeters, zoom)
			const pad = DRAINAGE_BUFFER_M / metersPerPixel(bbox[1], zoom) + 2
			post("progress", { stage: "Höhenmodell laden", value: 0 })
			const sampler = await loadElevationSampler(
				zoom,
				grid.x0 - pad,
				grid.y0 - pad,
				grid.x0 + grid.cols * grid.cellPx + pad,
				grid.y0 + grid.rows * grid.cellPx + pad,
				(value) => post("progress", { stage: "Höhenmodell laden", value }),
			)
			post("progress", { stage: "Gelände auswerten", value: 0 })
			const elev = sampleElevation(grid, sampler)
			post("progress", { stage: "Gewässernetz ableiten", value: 0 })
			state = {
				grid,
				elev,
				slope: computeSlope(grid, elev),
				raster: buildDrainageRaster(grid, sampler),
				waterways,
				waterKey: null,
				tpi: null,
				tpiRadius: null,
			}
			evaluate(msg)
		} else if (msg.type === "update") {
			if (state) evaluate(msg)
		} else if (msg.type === "waterways") {
			if (state) {
				state.waterways = msg.waterways
				state.waterKey = null
			}
		}
	} catch (error) {
		post("error", { message: error.message ?? String(error) })
	}
}
