"use client"

import { useCallback, useEffect, useRef } from "react"
import { DEFAULT_REGION } from "@/lib/regions"
import { campsFor, routeCamps } from "@/lib/sites"
import { useMapStore } from "@/store/use-map-store"
import { cellAt, FACTORS } from "./model"
import { unpack } from "./packed"

// Größere Ausschnitte würden zu viele Höhen- und Gewässerkacheln laden
export const MAX_AREA_KM = 90

function message(type, extra = {}) {
	const { params, ringSource, heatmap } = useMapStore.getState()
	return {
		type,
		params,
		camps: campsFor(ringSource),
		routeCamps: routeCamps(),
		candidateThreshold: heatmap.threshold,
		...extra,
	}
}

async function loadPrecomputed(region) {
	const base = `${process.env.NEXT_PUBLIC_BASE_PATH}/${region.file}`
	try {
		const [meta, bin] = await Promise.all([
			fetch(`${base}.json`).then((r) => (r.ok ? r.json() : null)),
			fetch(`${base}.bin`).then((r) => (r.ok ? r.arrayBuffer() : null)),
		])
		if (!meta || !bin) return null
		return { ...unpack(meta, bin), precomputed: true }
	} catch {
		return null
	}
}

/**
 * Steuert den Analyse-Worker. Beim Start wird das vorberechnete Ergebnis
 * der Standardregion geladen. "analyze" rechnet den Kartenausschnitt neu,
 * "update" nur die Gewichtung, sobald sich Parameter ändern.
 */
export function usePotential(getMap) {
	const workerRef = useRef(null)
	// Hat der Worker Gelände geladen? Bei vorberechneten Ergebnissen nicht.
	const workerReady = useRef(false)
	const params = useMapStore((s) => s.params)
	const ringSource = useMapStore((s) => s.ringSource)
	const threshold = useMapStore((s) => s.heatmap.threshold)
	const hasResult = useMapStore((s) => !!s.result)

	useEffect(() => {
		const worker = new Worker(new URL("./worker.js", import.meta.url), {
			type: "module",
		})
		worker.onmessage = ({ data }) => {
			const store = useMapStore.getState()
			if (data.type === "progress") {
				store.setAnalysis({
					status: "running",
					stage: data.stage,
					progress: data.value,
				})
			} else if (data.type === "result") {
				if (data.streams !== undefined) store.setDerivedWaterways(data.streams)
				if (data.routes !== undefined) store.setRoutes(data.routes)
				store.setResult({ places: store.result?.places, ...data })
				store.setAnalysis({
					status: "done",
					stage: "",
					progress: 1,
					error: null,
				})
			} else if (data.type === "error") {
				store.setAnalysis({ status: "error", error: data.message })
			}
		}
		workerRef.current = worker
		return () => worker.terminate()
	}, [])

	// Vorberechnetes Ergebnis der Standardregion sofort anzeigen
	useEffect(() => {
		let cancelled = false
		loadPrecomputed(DEFAULT_REGION).then((result) => {
			const store = useMapStore.getState()
			if (cancelled || !result || store.result) return
			store.setDerivedWaterways(result.streams)
			store.setRoutes(result.routes)
			store.setResult(result)
		})
		return () => {
			cancelled = true
		}
	}, [])

	const analyzeBbox = useCallback((bbox) => {
		useMapStore.getState().setAnalysis({
			status: "running",
			stage: "",
			progress: 0,
			error: null,
		})
		workerReady.current = true
		workerRef.current.postMessage(message("analyze", { bbox }))
	}, [])

	const analyze = useCallback(() => {
		const map = getMap()
		if (!map) return
		const b = map.getBounds()
		analyzeBbox(
			clampBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]),
		)
	}, [getMap, analyzeBbox])

	// Schieberegler: nur neu gewichten, Gelände bleibt im Worker. Beim
	// vorberechneten Ergebnis muss das Gelände dafür erst geladen werden.
	const lastSettings = useRef(null)
	useEffect(() => {
		if (!hasResult) return
		// Nur auf geänderte Regler reagieren, nicht auf das erste Ergebnis
		const key = JSON.stringify([params, ringSource, threshold])
		if (lastSettings.current === null || lastSettings.current === key) {
			lastSettings.current = key
			return
		}
		lastSettings.current = key
		const id = setTimeout(() => {
			if (workerReady.current) {
				workerRef.current?.postMessage(message("update"))
				return
			}
			if (useMapStore.getState().result?.precomputed) {
				analyzeBbox(DEFAULT_REGION.bbox)
			}
		}, 150)
		return () => clearTimeout(id)
	}, [params, ringSource, threshold, hasResult, analyzeBbox])

	return { analyze }
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
export function inspectAt(lon, lat, extra = {}) {
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
		distRoute: result.raw.distRoute?.[i] ?? Number.POSITIVE_INFINITY,
		waterSource: result.waterSource,
		...extra,
	}
}
