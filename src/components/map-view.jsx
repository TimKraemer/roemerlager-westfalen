"use client"

import "maplibre-gl/dist/maplibre-gl.css"
import * as maplibregl from "maplibre-gl"
import { useEffect, useRef, useState } from "react"
import { circlePolygon } from "@/lib/geo"
import { BASE_LAYERS, OVERLAYS, rasterSource } from "@/lib/layers"
import maplibreVersion from "@/lib/maplibre-version.json"
import { renderHeatmap } from "@/lib/potential/render"
import { inspectAt } from "@/lib/potential/use-potential"
import { campsFor, SITE_TYPES, SITES } from "@/lib/sites"
import { useMapStore } from "@/store/use-map-store"

const START = { center: [8.4, 51.85], zoom: 7.6 }

// Startansicht aus dem URL-Hash (#zoom/lat/lon), sonst ganz Westfalen
function initialView() {
	const [zoom, lat, lon] = window.location.hash.slice(1).split("/").map(Number)
	if ([zoom, lat, lon].every(Number.isFinite)) {
		return { center: [lon, lat], zoom }
	}
	return START
}
const EMPTY = { type: "FeatureCollection", features: [] }
const EMPTY_IMAGE =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

function buildStyle() {
	const sources = {}
	const layers = []
	for (const layer of [...BASE_LAYERS, ...OVERLAYS]) {
		sources[layer.id] = rasterSource(layer)
		layers.push({
			id: layer.id,
			type: "raster",
			source: layer.id,
			layout: { visibility: "none" },
			paint: { "raster-opacity": layer.opacity ?? 1 },
		})
	}
	return {
		version: 8,
		glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
		sources,
		layers,
	}
}

const typeColor = [
	"match",
	["get", "type"],
	...SITE_TYPES.flatMap((t) => [t.id, t.color]),
	"#444",
]

function addAnalysisLayers(map) {
	map.addSource("heatmap", {
		type: "image",
		url: EMPTY_IMAGE,
		coordinates: [
			[0, 1],
			[1, 1],
			[1, 0],
			[0, 0],
		],
	})
	map.addLayer({
		id: "heatmap",
		type: "raster",
		source: "heatmap",
		paint: { "raster-resampling": "nearest", "raster-fade-duration": 0 },
	})

	map.addSource("waterways", { type: "geojson", data: EMPTY })
	map.addLayer({
		id: "waterways",
		type: "line",
		source: "waterways",
		layout: { visibility: "none" },
		paint: {
			"line-color": "#0277bd",
			"line-width": [
				"interpolate",
				["linear"],
				["zoom"],
				8,
				["match", ["get", "kind"], "river", 1.5, 0.5],
				13,
				["match", ["get", "kind"], "river", 4, 1.8],
			],
		},
	})

	map.addSource("rings", { type: "geojson", data: EMPTY })
	map.addLayer({
		id: "rings",
		type: "line",
		source: "rings",
		paint: {
			"line-color": "#6a1b9a",
			"line-width": ["match", ["get", "kind"], "mean", 1.6, 1],
			"line-dasharray": [3, 2],
			"line-opacity": ["match", ["get", "kind"], "mean", 0.85, 0.45],
		},
	})

	map.addSource("candidates", { type: "geojson", data: EMPTY })
	map.addLayer({
		id: "candidates",
		type: "circle",
		source: "candidates",
		paint: {
			"circle-radius": 11,
			"circle-color": "#fff",
			"circle-stroke-color": "#d84315",
			"circle-stroke-width": 2.5,
		},
	})
	map.addLayer({
		id: "candidates-label",
		type: "symbol",
		source: "candidates",
		layout: {
			"text-field": ["to-string", ["get", "rank"]],
			"text-font": ["Open Sans Semibold"],
			"text-size": 11,
			"text-allow-overlap": true,
		},
		paint: { "text-color": "#d84315" },
	})

	map.addSource("sites", { type: "geojson", data: SITES })
	map.addLayer({
		id: "sites",
		type: "circle",
		source: "sites",
		paint: {
			"circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 5, 12, 9],
			"circle-color": typeColor,
			"circle-stroke-color": "#fff",
			"circle-stroke-width": 2,
		},
	})
	map.addLayer({
		id: "sites-label",
		type: "symbol",
		source: "sites",
		minzoom: 8,
		layout: {
			"text-field": ["get", "name"],
			"text-font": ["Open Sans Semibold"],
			"text-size": 12,
			"text-offset": [0, 1.1],
			"text-anchor": "top",
			"text-optional": true,
		},
		paint: {
			"text-color": "#212121",
			"text-halo-color": "rgba(255,255,255,0.9)",
			"text-halo-width": 1.6,
		},
	})
}

// React StrictMode entfernt die erste Karte, bevor der State nachzieht
const alive = (map) => map && !map._removed

function ringFeatures(ringSource, mean, sigma) {
	const features = []
	for (const camp of campsFor(ringSource)) {
		for (const [kind, radius] of [
			["inner", mean - sigma],
			["mean", mean],
			["outer", mean + sigma],
		]) {
			features.push({
				type: "Feature",
				properties: { kind, camp: camp.id },
				geometry: {
					type: "LineString",
					coordinates: circlePolygon(camp.lon, camp.lat, radius),
				},
			})
		}
	}
	return { type: "FeatureCollection", features }
}

export default function MapView({ onMapReady }) {
	const container = useRef(null)
	// Erst nach "load" gesetzt, alle Effekte hängen daran
	const [map, setMap] = useState(null)
	// Einmal beim ersten Rendern lesen: map.remove() löscht den Hash wieder
	const [view] = useState(initialView)

	const baseLayer = useMapStore((s) => s.baseLayer)
	const overlays = useMapStore((s) => s.overlays)
	const siteTypes = useMapStore((s) => s.siteTypes)
	const showRings = useMapStore((s) => s.showRings)
	const showWaterways = useMapStore((s) => s.showWaterways)
	const ringSource = useMapStore((s) => s.ringSource)
	const ringMean = useMapStore((s) => s.params.ringMean)
	const ringSigma = useMapStore((s) => s.params.ringSigma)
	const heatmap = useMapStore((s) => s.heatmap)
	const result = useMapStore((s) => s.result)
	const waterways = useMapStore((s) => s.waterways)
	const derivedWaterways = useMapStore((s) => s.derivedWaterways)
	const selectedSite = useMapStore((s) => s.selectedSite)

	useEffect(() => {
		maplibregl.setWorkerUrl(
			new URL(
				`${process.env.NEXT_PUBLIC_BASE_PATH}/maplibre/maplibre-gl-worker.mjs?v=${maplibreVersion.version}`,
				window.location.origin,
			).href,
		)
		const map = new maplibregl.Map({
			container: container.current,
			style: buildStyle(),
			...view,
			maxZoom: 19,
			// Ausschnitt in der URL, damit er sich teilen lässt
			hash: true,
			attributionControl: { compact: true },
		})
		map.addControl(new maplibregl.NavigationControl(), "bottom-right")
		map.addControl(
			new maplibregl.ScaleControl({ unit: "metric" }),
			"bottom-left",
		)

		map.on("load", () => {
			addAnalysisLayers(map)
			setMap(map)
			onMapReady?.(map)
		})

		map.on("click", (e) => {
			const hit = map.queryRenderedFeatures(e.point, {
				layers: ["sites", "candidates"],
			})
			const site = hit.find((f) => f.layer.id === "sites")
			if (site) {
				useMapStore.getState().setSelectedSite(site.properties.id)
				return
			}
			const { lng, lat } = e.lngLat
			useMapStore.getState().setInspect(inspectAt(lng, lat))
		})
		for (const id of ["sites", "candidates"]) {
			map.on("mouseenter", id, () => {
				map.getCanvas().style.cursor = "pointer"
			})
			map.on("mouseleave", id, () => {
				map.getCanvas().style.cursor = ""
			})
		}
		return () => {
			setMap(null)
			map.remove()
		}
	}, [onMapReady, view])

	useEffect(() => {
		if (!alive(map)) return
		for (const layer of BASE_LAYERS) {
			map.setLayoutProperty(
				layer.id,
				"visibility",
				layer.id === baseLayer ? "visible" : "none",
			)
		}
	}, [baseLayer, map])

	useEffect(() => {
		if (!alive(map)) return
		for (const layer of OVERLAYS) {
			const o = overlays[layer.id]
			map.setLayoutProperty(
				layer.id,
				"visibility",
				o.visible ? "visible" : "none",
			)
			map.setPaintProperty(layer.id, "raster-opacity", o.opacity)
		}
	}, [overlays, map])

	useEffect(() => {
		if (!alive(map)) return
		const visible = Object.keys(siteTypes).filter((k) => siteTypes[k])
		const filter = ["in", ["get", "type"], ["literal", visible]]
		map.setFilter("sites", filter)
		map.setFilter("sites-label", filter)
	}, [siteTypes, map])

	useEffect(() => {
		if (!alive(map)) return
		map
			.getSource("rings")
			.setData(
				showRings ? ringFeatures(ringSource, ringMean, ringSigma) : EMPTY,
			)
	}, [showRings, ringSource, ringMean, ringSigma, map])

	// Gewässer der Analyse: OSM-Linien oder das Netz aus dem Höhenmodell
	const waterSource = result?.waterSource
	useEffect(() => {
		if (!alive(map)) return
		const data = waterSource === "osm" ? waterways : derivedWaterways
		map.getSource("waterways").setData(data ?? EMPTY)
		map.setLayoutProperty(
			"waterways",
			"visibility",
			showWaterways ? "visible" : "none",
		)
	}, [waterways, derivedWaterways, showWaterways, waterSource, map])

	useEffect(() => {
		if (!alive(map)) return
		const source = map.getSource("heatmap")
		const cands = map.getSource("candidates")
		if (!result) {
			cands.setData(EMPTY)
			map.setLayoutProperty("heatmap", "visibility", "none")
			return
		}
		source.updateImage({
			url: renderHeatmap(result, heatmap.threshold),
			coordinates: result.grid.corners,
		})
		map.setLayoutProperty(
			"heatmap",
			"visibility",
			heatmap.visible ? "visible" : "none",
		)
		map.setPaintProperty("heatmap", "raster-opacity", heatmap.opacity)
		cands.setData({
			type: "FeatureCollection",
			features: result.candidates.map((c, i) => ({
				type: "Feature",
				properties: { rank: i + 1, score: c.score },
				geometry: { type: "Point", coordinates: [c.lon, c.lat] },
			})),
		})
	}, [result, heatmap, map])

	useEffect(() => {
		if (!alive(map) || !selectedSite) return
		const f = SITES.features.find((s) => s.properties.id === selectedSite)
		if (f) {
			map.flyTo({
				center: f.geometry.coordinates,
				zoom: Math.max(map.getZoom(), 13),
			})
		}
	}, [selectedSite, map])

	return <div ref={container} style={{ position: "absolute", inset: 0 }} />
}
