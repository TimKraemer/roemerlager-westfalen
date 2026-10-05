"use client"

import { useCallback, useEffect, useRef } from "react"
import { campsFor } from "@/lib/sites"
import { fetchWaterways } from "@/lib/water"
import { useMapStore } from "@/store/use-map-store"
import { cellAt, FACTORS } from "./model"

// Größere Ausschnitte würden zu viele DEM-Kacheln und Overpass-Daten laden
export const MAX_AREA_KM = 90

/**
 * Steuert den Analyse-Worker: "analyze" für den aktuellen Kartenausschnitt,
 * danach "update", sobald sich Gewichte oder Parameter ändern.
 */
export function usePotential(getMap) {
	const workerRef = useRef(null)
	const params = useMapStore((s) => s.params)
	const ringSource = useMapStore((s) => s.ringSource)
	const threshold = useMapStore((s) => s.heatmap.threshold)
	const hasResult = useMapStore((s) => !!s.result)

	useEffect(() => {
		const worker = new Worker(new URL("./worker.js", import.meta.url), {
			type: "module",
		})
		worker.onmessage = ({ data }) => {
			const { setAnalysis, setResult } = useMapStore.getState()
			if (data.type === "progress") {
				setAnalysis({
					status: "running",
					stage: data.stage,
					progress: data.value,
				})
			} else if (data.type === "result") {
				if (data.streams !== undefined) {
					useMapStore.getState().setDerivedWaterways(data.streams)
				}
				setResult(data)
				setAnalysis({ status: "done", stage: "", progress: 1, error: null })
			} else if (data.type === "error") {
				setAnalysis({ status: "error", error: data.message })
			}
		}
		workerRef.current = worker
		return () => worker.terminate()
	}, [])

	const analyze = useCallback(async () => {
		const map = getMap()
		if (!map) return
		const { setAnalysis, setWaterways, params, ringSource, heatmap } =
			useMapStore.getState()
		const b = map.getBounds()
		const bbox = clampBbox([
			b.getWest(),
			b.getSouth(),
			b.getEast(),
			b.getNorth(),
		])
		setAnalysis({
			status: "running",
			stage: "",
			progress: 0,
			error: null,
			notice: null,
		})
		const waterways = params.waterSource === "osm" ? await loadOsm(bbox) : null
		setWaterways(waterways)
		workerRef.current.postMessage({
			type: "analyze",
			bbox,
			params,
			camps: campsFor(ringSource),
			candidateThreshold: heatmap.threshold,
			waterways,
		})
	}, [getMap])

	// Wechsel auf OSM nach einer Berechnung: Gewässer für den Ausschnitt nachladen
	const waterSource = params.waterSource
	useEffect(() => {
		const { result, waterways } = useMapStore.getState()
		if (waterSource !== "osm" || !result || waterways) return
		const [nw, , se] = result.grid.corners
		loadOsm([nw[0], se[1], se[0], nw[1]]).then((loaded) => {
			if (!loaded) return
			const { setWaterways, params, ringSource, heatmap } =
				useMapStore.getState()
			setWaterways(loaded)
			workerRef.current?.postMessage({ type: "waterways", waterways: loaded })
			workerRef.current?.postMessage({
				type: "update",
				params,
				camps: campsFor(ringSource),
				candidateThreshold: heatmap.threshold,
			})
		})
	}, [waterSource])

	// Schieberegler: nur neu gewichten, Gelände bleibt im Worker
	useEffect(() => {
		if (!hasResult) return
		const id = setTimeout(() => {
			workerRef.current?.postMessage({
				type: "update",
				params,
				camps: campsFor(ringSource),
				candidateThreshold: threshold,
			})
		}, 150)
		return () => clearTimeout(id)
	}, [params, ringSource, threshold, hasResult])

	return { analyze }
}

// OSM-Gewässer laden, bei Ausfall mit Hinweis auf das Höhenmodell ausweichen
async function loadOsm(bbox) {
	const { setAnalysis } = useMapStore.getState()
	setAnalysis({
		status: "running",
		stage: "Gewässer aus OSM laden",
		progress: 0,
	})
	try {
		return await fetchWaterways(bbox)
	} catch (error) {
		setAnalysis({
			notice: `${error.message}. Gerechnet wird mit dem Gewässernetz aus dem Höhenmodell.`,
		})
		return null
	}
}

// Auf MAX_AREA_KM um die Mitte begrenzen
function clampBbox([w, s, e, n]) {
	const midLat = (s + n) / 2
	const kmLon = 111.32 * Math.cos((midLat * Math.PI) / 180)
	const halfLon = Math.min((e - w) / 2, MAX_AREA_KM / 2 / kmLon)
	const halfLat = Math.min((n - s) / 2, MAX_AREA_KM / 2 / 110.57)
	const cx = (w + e) / 2
	const cy = (s + n) / 2
	return [cx - halfLon, cy - halfLat, cx + halfLon, cy + halfLat]
}

/** Werte einer Zelle für die Info-Karte nach einem Klick. */
export function inspectAt(lon, lat) {
	const { result } = useMapStore.getState()
	if (!result) return null
	const i = cellAt(result.grid, lon, lat)
	if (i < 0) return null
	return {
		lon,
		lat,
		score: result.score[i],
		factors: Object.fromEntries(
			FACTORS.map((f) => [f.key, result.factors[f.key][i]]),
		),
		elev: result.raw.elev[i],
		slope: result.raw.slope[i],
		tpi: result.raw.tpi[i],
		distWater: result.raw.distWater[i],
		distRiver: result.raw.distRiver[i],
		distCamp: result.raw.distCamp[i],
	}
}
