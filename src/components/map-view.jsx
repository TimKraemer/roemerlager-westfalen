"use client"

import "maplibre-gl/dist/maplibre-gl.css"
import * as maplibregl from "maplibre-gl"
import { useEffect, useRef, useState } from "react"
import roads from "@/data/roemerstrassen.json"
import { throughGates } from "@/lib/camp-gates"
import { SHORT_CREDIT } from "@/lib/citation"
import { circlePolygon } from "@/lib/geo"
import {
	BASE_LAYERS,
	FONT,
	GLYPHS,
	OVERLAYS,
	styleFor,
	styleLayersOf,
} from "@/lib/layers"
import maplibreVersion from "@/lib/maplibre-version.json"
import { rankedCandidates } from "@/lib/potential/candidates"
import { oldRiverFeatures, withoutOldRivers } from "@/lib/potential/old-rivers"
import { renderHeatmap } from "@/lib/potential/render"
import { inspectAt } from "@/lib/potential/use-potential"
import { DEFAULT_REGION } from "@/lib/regions"
import { centerOffset, isMobile, mapInsets } from "@/lib/sheet"
import { campsFor, SITE_TYPES, SITES } from "@/lib/sites"
import { textGeo } from "@/lib/text-geo"
import { useMapStore } from "@/store/use-map-store"
import {
	addModelAnnotations,
	MODEL_LAYER,
	MODEL_MIN_ZOOM,
	oberadenModelLayer,
	showModelAnnotations,
} from "./oberaden-model"
import { addTextLayers, showText } from "./text-overlay"

// Startansicht aus dem URL-Hash (#zoom/lat/lon), sonst der Kreis
function initialView() {
	const [zoom, lat, lon] = window.location.hash.slice(1).split("/").map(Number)
	if ([zoom, lat, lon].every(Number.isFinite)) {
		return { center: [lon, lat], zoom }
	}
	return {
		bounds: DEFAULT_REGION.view.bounds,
		// Links Platz für die Startkarte lassen, auf dem Handy oben für die
		// Suchleiste und unten für das eingeklappte Sheet
		fitBoundsOptions: {
			padding: isMobile()
				? { ...mapInsets(), left: 16, right: 16 }
				: { top: 40, bottom: 40, left: 380, right: 40 },
		},
	}
}
const EMPTY = { type: "FeatureCollection", features: [] }
const EMPTY_IMAGE =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
const HALO = {
	"text-halo-color": "rgba(255,255,255,0.92)",
	"text-halo-width": 1.6,
}

function buildStyle() {
	const style = { version: 8, glyphs: GLYPHS, sources: {}, layers: [] }
	for (const layer of [...BASE_LAYERS, ...OVERLAYS]) {
		const part = styleFor(layer)
		Object.assign(style.sources, part.sources)
		style.layers.push(...part.layers)
	}
	return style
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

	// Natürliche Flussläufe mit heller Kontur, gut sichtbar auf dem Luftbild
	const riverWidth = (river, stream) => [
		"interpolate",
		["linear"],
		["zoom"],
		7,
		["match", ["get", "kind"], "river", river[0], stream[0]],
		13,
		["match", ["get", "kind"], "river", river[1], stream[1]],
	]
	map.addSource("waterways", { type: "geojson", data: EMPTY })
	map.addLayer({
		id: "waterways-casing",
		type: "line",
		source: "waterways",
		layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
		paint: {
			"line-color": "#fff",
			"line-opacity": 0.8,
			"line-width": riverWidth([4, 8], [1.5, 3.5]),
		},
	})
	map.addLayer({
		id: "waterways",
		type: "line",
		source: "waterways",
		layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
		paint: {
			"line-color": "#1565c0",
			"line-width": riverWidth([2.5, 5.5], [0.8, 2]),
		},
	})

	map.addSource("region", { type: "geojson", data: DEFAULT_REGION.outline })
	map.addLayer({
		id: "region-casing",
		type: "line",
		source: "region",
		paint: { "line-color": "#fff", "line-width": 4, "line-opacity": 0.7 },
	})
	map.addLayer({
		id: "region",
		type: "line",
		source: "region",
		paint: {
			"line-color": "#4a148c",
			"line-width": 1.6,
			"line-dasharray": [4, 2],
		},
	})

	// Belegte und vermutete Römerstraßen
	map.addSource("roads", { type: "geojson", data: roads })
	map.addLayer({
		id: "roads",
		type: "line",
		source: "roads",
		layout: { "line-cap": "round" },
		paint: {
			"line-color": "#5d4037",
			"line-width": 3,
			"line-dasharray": [
				"match",
				["get", "certainty"],
				"belegt",
				["literal", [1, 0]],
				"vermutet",
				["literal", [2, 1.5]],
				["literal", [0.6, 1.6]],
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
			"line-width": ["match", ["get", "kind"], "mean", 2, 1],
			"line-dasharray": [3, 2],
			"line-opacity": ["match", ["get", "kind"], "mean", 0.9, 0.35],
		},
	})
	map.addLayer({
		id: "rings-label",
		type: "symbol",
		source: "rings",
		filter: ["==", ["get", "kind"], "mean"],
		layout: {
			"symbol-placement": "line",
			"symbol-spacing": 400,
			"text-field": ["get", "label"],
			"text-font": FONT,
			"text-size": 11,
		},
		paint: { "text-color": "#4a148c", ...HALO },
	})

	// Mögliche Marschrouten (Least-Cost-Path)
	map.addSource("routes", { type: "geojson", data: EMPTY })
	map.addLayer({
		id: "routes-casing",
		type: "line",
		source: "routes",
		layout: { "line-cap": "round", "line-join": "round" },
		paint: { "line-color": "#3e2723", "line-width": 6, "line-opacity": 0.55 },
	})
	map.addLayer({
		id: "routes",
		type: "line",
		source: "routes",
		layout: { "line-cap": "round", "line-join": "round" },
		paint: {
			// Fußwege gelb, Schiffsstrecken auf der Lippe hellblau gestrichelt,
			// Wege zu Zielen ohne gesichertes Lager gelb gestrichelt
			"line-color": ["match", ["get", "mode"], "Schiff", "#4fc3f7", "#ffca28"],
			"line-width": 3,
			"line-dasharray": [
				"case",
				["==", ["get", "mode"], "Schiff"],
				["literal", [2, 1.2]],
				["to-boolean", ["get", "target"]],
				["literal", [2.5, 1.5]],
				["literal", [1, 0]],
			],
		},
	})
	map.addLayer({
		id: "routes-label",
		type: "symbol",
		source: "routes",
		layout: {
			"symbol-placement": "line",
			"symbol-spacing": 500,
			"text-field": [
				"case",
				["==", ["get", "mode"], "Schiff"],
				["concat", "Schiff · ", ["to-string", ["get", "km"]], " km"],
				[
					"concat",
					["to-string", ["get", "km"]],
					" km · ",
					["to-string", ["get", "days"]],
					" Tagesmärsche",
				],
			],
			"text-font": FONT,
			"text-size": 11,
		},
		paint: { "text-color": "#3e2723", ...HALO },
	})

	// Etappenpunkte auf den Routen, verbunden mit dem besten Potenzial
	map.addSource("stages", { type: "geojson", data: EMPTY })
	map.addLayer({
		id: "stages",
		type: "circle",
		source: "stages",
		paint: {
			"circle-radius": 10,
			"circle-color": "#ffca28",
			"circle-stroke-color": "#3e2723",
			"circle-stroke-width": 2,
		},
	})
	map.addLayer({
		id: "stages-label",
		type: "symbol",
		source: "stages",
		layout: {
			"text-field": "E",
			"text-font": FONT,
			"text-size": 11,
			"text-allow-overlap": true,
		},
		paint: { "text-color": "#3e2723" },
	})

	// Erkannte gerade Strukturen im Laserscan (experimentell)
	map.addSource("lines", { type: "geojson", data: EMPTY })
	map.addLayer({
		id: "lines",
		type: "line",
		source: "lines",
		layout: { visibility: "none", "line-cap": "round" },
		paint: {
			"line-color": ["case", ["get", "corner"], "#ff1744", "#ffea00"],
			"line-width": ["case", ["get", "corner"], 3, 2],
		},
	})

	map.addSource("candidates", { type: "geojson", data: EMPTY })
	map.addLayer({
		id: "candidates",
		type: "circle",
		source: "candidates",
		paint: {
			"circle-radius": ["case", ["get", "inRegion"], 11, 5],
			"circle-color": "#fff",
			"circle-stroke-color": "#d84315",
			"circle-stroke-width": ["case", ["get", "inRegion"], 2.5, 2],
		},
	})
	map.addLayer({
		id: "candidates-label",
		type: "symbol",
		source: "candidates",
		layout: {
			"text-field": ["to-string", ["get", "rank"]],
			"text-font": FONT,
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
			"text-font": FONT,
			"text-size": 12,
			"text-offset": [0, 1.1],
			"text-anchor": "top",
			"text-optional": true,
		},
		paint: { "text-color": "#212121", ...HALO },
	})
}

/** Markierung für den gewählten Suchtreffer, über allem anderen. */
function addSearchLayers(map) {
	map.addSource("search-hit", { type: "geojson", data: EMPTY })
	const lines = ["!=", ["geometry-type"], "Point"]
	const points = ["==", ["geometry-type"], "Point"]
	map.addLayer({
		id: "search-hit-glow",
		type: "line",
		source: "search-hit",
		filter: lines,
		layout: { "line-cap": "round", "line-join": "round" },
		paint: {
			"line-color": "#ffd600",
			"line-opacity": 0.55,
			"line-width": ["interpolate", ["linear"], ["zoom"], 6, 8, 14, 16],
		},
	})
	map.addLayer({
		id: "search-hit-line",
		type: "line",
		source: "search-hit",
		filter: lines,
		layout: { "line-cap": "round", "line-join": "round" },
		paint: { "line-color": "#e65100", "line-width": 2.5 },
	})
	map.addLayer({
		id: "search-hit-point",
		type: "circle",
		source: "search-hit",
		filter: points,
		paint: {
			"circle-radius": 11,
			"circle-color": "rgba(255,214,0,0.35)",
			"circle-stroke-color": "#e65100",
			"circle-stroke-width": 3,
		},
	})
	map.addLayer({
		id: "search-hit-label",
		type: "symbol",
		source: "search-hit",
		filter: points,
		layout: {
			"text-field": ["get", "label"],
			"text-font": FONT,
			"text-size": 13,
			"text-offset": [0, 1.4],
			"text-anchor": "top",
		},
		paint: { "text-color": "#bf360c", ...HALO },
	})
}

/** Eigene Karte als Quelle und Layer, unter der Potenzialkarte. */
function addCustomLayer(map, id, l) {
	if (l.kind === "raster") {
		map.addSource(id, {
			type: "raster",
			tiles: l.tiles,
			tileSize: l.tileSize ?? 256,
			maxzoom: l.maxzoom ?? 19,
			attribution: l.attribution ?? l.name,
		})
		map.addLayer({ id, type: "raster", source: id }, "heatmap")
	} else if (l.kind === "image") {
		map.addSource(id, { type: "image", url: l.url, coordinates: l.corners })
		map.addLayer(
			{ id, type: "raster", source: id, paint: { "raster-fade-duration": 0 } },
			"heatmap",
		)
	} else if (l.kind === "vector") {
		map.addSource(id, { type: "geojson", data: l.data })
		const color = l.color ?? "#00e5ff"
		map.addLayer({
			id: `${id}-fill`,
			type: "fill",
			source: id,
			filter: ["==", ["geometry-type"], "Polygon"],
			paint: { "fill-color": color, "fill-opacity": 0.3 },
		})
		map.addLayer({
			id: `${id}-line`,
			type: "line",
			source: id,
			filter: ["in", ["geometry-type"], ["literal", ["LineString", "Polygon"]]],
			paint: { "line-color": color, "line-width": 2.5 },
		})
		map.addLayer({
			id: `${id}-point`,
			type: "circle",
			source: id,
			filter: ["==", ["geometry-type"], "Point"],
			paint: {
				"circle-color": color,
				"circle-radius": 6,
				"circle-stroke-color": "#000",
				"circle-stroke-width": 1,
			},
		})
	}
}

// React StrictMode entfernt die erste Karte, bevor der State nachzieht
const alive = (map) => map && !map._removed

function ringFeatures(ringSource, mean, sigma) {
	const label = `1 Tagesmarsch (${Math.round(mean / 1000)} km)`
	const features = []
	for (const camp of campsFor(ringSource)) {
		for (const [kind, radius] of [
			["inner", mean - sigma],
			["mean", mean],
			["outer", mean + sigma],
		]) {
			features.push({
				type: "Feature",
				properties: { kind, camp: camp.id, label },
				geometry: {
					type: "LineString",
					coordinates: circlePolygon(camp.lon, camp.lat, radius),
				},
			})
		}
	}
	return { type: "FeatureCollection", features }
}

// Auf der Karte nur die besten Kandidaten, die Liste zeigt alle
const MAP_CANDIDATES = 12

const CLICKABLE = ["sites", "candidates", "stages", "routes", "roads"]

function handleClick(map, e) {
	pickAt(map, e)
	// Auf dem Handy geht für die Infokarte das Sheet auf. Liegt der getippte
	// Punkt dann darunter, rückt die Karte ihn in den freien Teil.
	if (!isMobile() || !useMapStore.getState().inspect) return
	const { top, bottom } = mapInsets()
	const h = map.getContainer().clientHeight
	if (e.point.y > h - bottom - 24 || e.point.y < top) {
		map.easeTo({ center: e.lngLat, offset: centerOffset() })
	}
}

function pickAt(map, e) {
	const store = useMapStore.getState()
	const hits = map.queryRenderedFeatures(e.point, { layers: CLICKABLE })
	const pick = (id) => hits.find((f) => f.layer.id === id)
	const site = pick("sites")
	if (site) {
		store.setSelectedSite(site.properties.id)
		return
	}
	store.setSelectedSite(null)
	const candidate = pick("candidates")
	if (candidate) {
		const [lon, lat] = candidate.geometry.coordinates
		store.setInspect(
			inspectAt(lon, lat, {
				kind: "candidate",
				rank: candidate.properties.rank,
			}),
		)
		return
	}
	const stage = pick("stages")
	if (stage) {
		const [lon, lat] = stage.geometry.coordinates
		const extra = { kind: "stage", stage: { ...stage.properties } }
		store.setInspect(
			inspectAt(lon, lat, extra) ?? { ...extra, lon, lat, outside: true },
		)
		return
	}
	const road = pick("roads")
	if (road && !pick("routes")) {
		const p = road.properties
		const label = {
			belegt: "belegt",
			vermutet: "vermutet",
			hypothetisch: "Hypothese",
		}
		const box = document.createElement("div")
		box.style.font = "14px / 1.4 var(--font-sans), system-ui, sans-serif"
		const title = document.createElement("b")
		title.textContent = p.name
		const meta = document.createElement("div")
		meta.textContent = `Verlauf ${label[p.certainty] ?? p.certainty}`
		const link = document.createElement("a")
		link.href = p.url
		link.target = "_blank"
		link.rel = "noreferrer"
		link.textContent = p.source
		box.append(title, meta, link)
		new maplibregl.Popup({ maxWidth: "280px" })
			.setLngLat(e.lngLat)
			.setDOMContent(box)
			.addTo(map)
		return
	}
	const route = pick("routes")
	if (route) {
		const { lng, lat } = e.lngLat
		const extra = { kind: "route", route: { ...route.properties } }
		store.setInspect(
			inspectAt(lng, lat, extra) ?? { ...extra, lon: lng, lat, outside: true },
		)
		return
	}
	const { lng, lat } = e.lngLat
	store.setInspect(inspectAt(lng, lat, { kind: "cell" }))
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
	const showRoutes = useMapStore((s) => s.showRoutes)
	const showRoads = useMapStore((s) => s.showRoads)
	const ringSource = useMapStore((s) => s.ringSource)
	const ringMean = useMapStore((s) => s.params.ringMean)
	const ringSigma = useMapStore((s) => s.params.ringSigma)
	const heatmap = useMapStore((s) => s.heatmap)
	const result = useMapStore((s) => s.result)
	const derivedWaterways = useMapStore((s) => s.derivedWaterways)
	const network = useMapStore((s) => s.network)
	const localRoutes = useMapStore((s) => s.routes)
	// Das Netz hat Vorrang, eigene Routen gibt es nur ohne Netz
	const routes = network?.routes ?? localRoutes
	const selectedSite = useMapStore((s) => s.selectedSite)
	const selectedText = useMapStore((s) => s.selectedText)
	const searchHit = useMapStore((s) => s.searchHit)

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
			attributionControl: { compact: true, customAttribution: SHORT_CREDIT },
		})
		map.addControl(new maplibregl.NavigationControl(), "bottom-right")
		map.addControl(
			new maplibregl.ScaleControl({ unit: "metric" }),
			"bottom-left",
		)

		map.on("load", () => {
			// Auf dem Handy die Quellenangabe zugeklappt starten, ausgeklappt
			// verdeckt sie über dem Sheet zu viel Karte. Das (i) öffnet sie.
			if (isMobile()) {
				map
					.getContainer()
					.querySelector(".maplibregl-compact-show")
					?.classList.remove("maplibregl-compact-show")
			}
			addAnalysisLayers(map)
			addTextLayers(map)
			addSearchLayers(map)
			setMap(map)
			onMapReady?.(map)
		})
		map.on("click", (e) => handleClick(map, e))
		for (const id of CLICKABLE) {
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
			for (const { id } of styleLayersOf(layer)) {
				map.setLayoutProperty(
					id,
					"visibility",
					layer.id === baseLayer ? "visible" : "none",
				)
			}
		}
	}, [baseLayer, map])

	useEffect(() => {
		if (!alive(map)) return
		for (const layer of OVERLAYS) {
			const o = overlays[layer.id]
			for (const { id, opacity } of styleLayersOf(layer)) {
				map.setLayoutProperty(id, "visibility", o.visible ? "visible" : "none")
				if (opacity) map.setPaintProperty(id, opacity, o.opacity)
				else
					map.setPaintProperty(
						id,
						"hillshade-exaggeration",
						Math.min(1, o.opacity),
					)
			}
		}
	}, [overlays, map])

	// Eigene Karten: Quellen und Layer anlegen, entfernen, schalten
	const customLayers = useMapStore((s) => s.customLayers)
	useEffect(() => {
		if (!alive(map)) return
		const wanted = new Set(customLayers.map((l) => `custom-${l.id}`))
		for (const layer of map.getStyle().layers) {
			const base = layer.id.replace(/-(fill|line|point)$/, "")
			if (base.startsWith("custom-") && !wanted.has(base))
				map.removeLayer(layer.id)
		}
		for (const id of Object.keys(map.getStyle().sources)) {
			if (id.startsWith("custom-") && !wanted.has(id)) map.removeSource(id)
		}
		for (const l of customLayers) {
			const id = `custom-${l.id}`
			if (!map.getSource(id)) addCustomLayer(map, id, l)
			const visibility = l.visible ? "visible" : "none"
			for (const suffix of ["", "-fill", "-line", "-point"]) {
				const lid = id + suffix
				if (!map.getLayer(lid)) continue
				map.setLayoutProperty(lid, "visibility", visibility)
				const type = map.getLayer(lid).type
				const prop = {
					raster: "raster-opacity",
					fill: "fill-opacity",
					line: "line-opacity",
					circle: "circle-opacity",
				}[type]
				map.setPaintProperty(
					lid,
					prop,
					type === "fill" ? l.opacity * 0.35 : l.opacity,
				)
			}
		}
	}, [customLayers, map])

	// Laserscan-Fenster erst beim Einschalten laden (je Bild rund 400 KB)
	const lineaments = useMapStore((s) => s.lineaments)
	const lrm = overlays.lrm
	const lines = overlays.lines
	useEffect(() => {
		if (!alive(map) || !lineaments) return
		const windows = lineaments.windows.filter((w) => w.imageCorners)
		if (lrm.visible) {
			for (const w of windows) {
				const id = `lrm-${w.id}`
				if (!map.getSource(id)) {
					map.addSource(id, {
						type: "image",
						url: `${process.env.NEXT_PUBLIC_BASE_PATH}/precomputed/lrm/${w.id}.jpg`,
						coordinates: w.imageCorners,
					})
					map.addLayer(
						{
							id,
							type: "raster",
							source: id,
							paint: { "raster-fade-duration": 0 },
						},
						"heatmap",
					)
				}
			}
		}
		for (const w of windows) {
			const id = `lrm-${w.id}`
			if (!map.getLayer(id)) continue
			map.setLayoutProperty(id, "visibility", lrm.visible ? "visible" : "none")
			map.setPaintProperty(id, "raster-opacity", lrm.opacity)
		}
		map.getSource("lines").setData(lineaments.segments)
		map.setLayoutProperty(
			"lines",
			"visibility",
			lines.visible ? "visible" : "none",
		)
		map.setPaintProperty("lines", "line-opacity", lines.opacity)
	}, [lineaments, lrm, lines, map])

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

	useEffect(() => {
		if (!alive(map)) return
		map.setLayoutProperty("roads", "visibility", showRoads ? "visible" : "none")
	}, [showRoads, map])

	// 3D-Lager Oberaden: three.js und Modell erst beim ersten Heranzoomen laden
	const showModel = useMapStore((s) => s.showModel)
	useEffect(() => {
		if (!alive(map)) return
		if (!map.getSource("oberaden-poi")) addModelAnnotations(map)
		showModelAnnotations(map, showModel)
		if (!showModel) {
			if (map.getLayer(MODEL_LAYER)) map.removeLayer(MODEL_LAYER)
			return
		}
		const add = () => {
			if (map.getZoom() < MODEL_MIN_ZOOM || map.getLayer(MODEL_LAYER)) return
			map.addLayer(oberadenModelLayer(), "sites")
		}
		add()
		map.on("zoomend", add)
		return () => map.off("zoomend", add)
	}, [showModel, map])

	// Gewässer der Analyse: abgeleitetes Netz als Linien, OSM direkt aus den
	// Vektorkacheln (Ebene "osm-gewaesser")
	const waterSource = result?.waterSource
	const oldRivers = useMapStore((s) => s.params.oldRivers)
	useEffect(() => {
		if (!alive(map)) return
		const dem = waterSource !== "osm"
		// Natürliche Flussläufe: große Flüsse aus dem Netz, Bäche im Kreis.
		// Lippe, Weser usw. im alten Lauf statt grob aus dem Höhenmodell.
		const derived = [
			...(network?.rivers.features ?? []),
			...(dem && derivedWaterways ? derivedWaterways.features : []),
		]
		const features = oldRivers
			? [...withoutOldRivers(derived), ...oldRiverFeatures()]
			: derived
		map.getSource("waterways").setData({ type: "FeatureCollection", features })
		for (const id of ["waterways", "waterways-casing"]) {
			map.setLayoutProperty(
				id,
				"visibility",
				showWaterways ? "visible" : "none",
			)
		}
		if (showWaterways && !dem) {
			useMapStore.getState().setOverlay("osm-gewaesser", { visible: true })
		}
	}, [derivedWaterways, network, showWaterways, waterSource, oldRivers, map])

	useEffect(() => {
		if (!alive(map)) return
		map.getSource("routes").setData(routes ? throughGates(routes) : EMPTY)
		for (const id of [
			"routes",
			"routes-casing",
			"routes-label",
			"stages",
			"stages-label",
		]) {
			map.setLayoutProperty(id, "visibility", showRoutes ? "visible" : "none")
		}
	}, [routes, showRoutes, map])

	useEffect(() => {
		if (!alive(map)) return
		const source = map.getSource("heatmap")
		const cands = map.getSource("candidates")
		const stages = map.getSource("stages")
		if (!result) {
			cands.setData(EMPTY)
			stages.setData(EMPTY)
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
			features: rankedCandidates(result)
				.filter((c) => !c.rank || c.rank <= MAP_CANDIDATES)
				.map((c) => ({
					type: "Feature",
					properties: {
						rank: c.rank ?? "",
						score: c.score,
						inRegion: c.inRegion,
					},
					geometry: { type: "Point", coordinates: [c.lon, c.lat] },
				})),
		})
		stages.setData({
			type: "FeatureCollection",
			features: (network?.stages ?? result.stages ?? []).map((s) => ({
				type: "Feature",
				properties: {
					from: s.from,
					to: s.to,
					stage: s.stage,
					of: s.of,
					km: Math.round(s.km * 10) / 10,
					score: s.score,
					offset: Math.round(s.offset),
				},
				geometry: { type: "Point", coordinates: [s.lon, s.lat] },
			})),
		})
	}, [result, heatmap, network, map])

	// Angeklickte Textstelle zeigen, mit Kamerafahrt und Animation
	useEffect(() => {
		if (!alive(map)) return
		return showText(map, selectedText ? textGeo(selectedText) : null)
	}, [selectedText, map])

	useEffect(() => {
		if (!alive(map)) return
		const data = searchHit
			? { type: "FeatureCollection", features: [searchHit] }
			: EMPTY
		map.getSource("search-hit").setData(data)
	}, [searchHit, map])

	useEffect(() => {
		if (!alive(map) || !selectedSite) return
		const f = SITES.features.find((s) => s.properties.id === selectedSite)
		if (f) {
			map.flyTo({
				center: f.geometry.coordinates,
				zoom: Math.max(map.getZoom(), 13),
				offset: centerOffset(),
			})
		}
	}, [selectedSite, map])

	return <div ref={container} style={{ position: "absolute", inset: 0 }} />
}
