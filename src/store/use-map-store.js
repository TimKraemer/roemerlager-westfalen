import { create } from "zustand"

// Eigene Kartendienste bleiben im Browser gespeichert (nicht die Dateien)
const STORAGE_KEY = "roemerlager:eigene-dienste"
function loadServices() {
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
	} catch {
		return []
	}
}
function saveServices(layers) {
	try {
		const services = layers.filter((l) => l.kind === "raster" && !l.session)
		localStorage.setItem(STORAGE_KEY, JSON.stringify(services))
	} catch {
		// privates Fenster o. ä.
	}
}

import { BASE_LAYERS, OVERLAYS } from "@/lib/layers"
import { DEFAULT_PARAMS } from "@/lib/potential/model"
import { SITE_TYPES } from "@/lib/sites"

// Auf dem Handy erscheinen Infokarten im Sheet, das dafür weit genug aufgeht.
// Schon hier, damit Kamerafahrten die neue Sheethöhe kennen.
const showCard = (s) =>
	typeof window !== "undefined" && window.innerWidth < 900
		? { panelOpen: true, sheetFrac: Math.max(s.sheetFrac, 0.42) }
		: null

export const useMapStore = create((set) => ({
	baseLayer: BASE_LAYERS[0].id,
	overlays: Object.fromEntries(
		OVERLAYS.map((o) => [
			o.id,
			{ visible: o.visible ?? false, opacity: o.opacity ?? 0.8 },
		]),
	),
	siteTypes: Object.fromEntries(SITE_TYPES.map((t) => [t.id, true])),
	showRings: true,
	showWaterways: true,
	showRoutes: true,
	// Nummerierte Punkte der Analyse (vermutete Lagerplätze)
	showCandidates: true,
	showStages: true,
	// Seitenleiste mit Einstellungen und Quellen, anfangs eingeklappt.
	// Auf dem Handy ist es das Sheet am unteren Rand.
	panelOpen: false,
	// Offener Reiter, auf dem Handy zuerst die Übersicht
	panelTab:
		typeof window !== "undefined" && window.innerWidth < 900
			? "start"
			: "layers",
	// Höhe des aufgeklappten Sheets als Anteil der Fensterhöhe (Handy)
	sheetFrac: 0.5,
	showRoads: true,
	// 3D-Rekonstruktion des Lagers Oberaden, sichtbar ab Zoom 15
	showModel: true,
	modelOpacity: 1,

	// Potenzialanalyse
	params: DEFAULT_PARAMS,
	// Welche Fundstellen als Ausgangspunkt der Tagesmarsch-Ringe dienen
	ringSource: "marching",
	heatmap: { visible: true, opacity: 0.7, threshold: 0.5 },
	analysis: {
		status: "idle",
		stage: "",
		progress: 0,
		error: null,
		notice: null,
	},
	result: null,
	waterways: null,
	// Aus dem Höhenmodell abgeleitetes Gewässernetz (GeoJSON-Linien)
	derivedWaterways: null,
	// Mögliche Marschrouten zwischen bekannten Lagern (GeoJSON)
	routes: null,
	// Überregionales Netz: Routen, Etappenhalte, große Flüsse (vorberechnet)
	network: null,
	// Laserscan-Fenster und erkannte gerade Strukturen (vorberechnet)
	lineaments: null,
	// Eigene Karten: Dienste, GeoTIFF, Bild mit World-File, GeoJSON/KML/GPX
	customLayers: typeof window === "undefined" ? [] : loadServices(),
	selectedSite: null,
	inspect: null,
	// Angeklickte antike Textstelle, deren Orte die Karte zeigt
	selectedText: null,
	// Hervorgehobener Suchtreffer (GeoJSON-Feature) auf der Karte
	searchHit: null,

	setBaseLayer: (baseLayer) => set({ baseLayer }),
	// Zustand eingeschalteter Ebenen aus der Karte: "loading", "zoom"
	// (unter der Mindestzoomstufe) oder "outside" (außerhalb der Fläche)
	overlayStatus: {},
	setOverlayStatus: (overlayStatus) => set({ overlayStatus }),
	setOverlay: (id, patch) =>
		set((s) => ({
			overlays: { ...s.overlays, [id]: { ...s.overlays[id], ...patch } },
		})),
	toggleSiteType: (id) =>
		set((s) => ({ siteTypes: { ...s.siteTypes, [id]: !s.siteTypes[id] } })),
	setShowRings: (showRings) => set({ showRings }),
	setShowWaterways: (showWaterways) => set({ showWaterways }),
	setShowRoutes: (showRoutes) => set({ showRoutes }),
	setShowCandidates: (showCandidates) => set({ showCandidates }),
	setShowStages: (showStages) => set({ showStages }),
	setPanelOpen: (panelOpen) => set({ panelOpen }),
	setPanelTab: (panelTab) => set({ panelTab }),
	setSheetFrac: (sheetFrac) => set({ sheetFrac }),
	setShowRoads: (showRoads) => set({ showRoads }),
	setShowModel: (showModel) => set({ showModel }),
	setModelOpacity: (modelOpacity) => set({ modelOpacity }),
	setParams: (patch) => set((s) => ({ params: { ...s.params, ...patch } })),
	setWeight: (key, value) =>
		set((s) => ({
			params: { ...s.params, weights: { ...s.params.weights, [key]: value } },
		})),
	setRingSource: (ringSource) => set({ ringSource }),
	setHeatmap: (patch) => set((s) => ({ heatmap: { ...s.heatmap, ...patch } })),
	setAnalysis: (patch) =>
		set((s) => ({ analysis: { ...s.analysis, ...patch } })),
	setResult: (result) => set({ result }),
	setWaterways: (waterways) => set({ waterways }),
	setDerivedWaterways: (derivedWaterways) => set({ derivedWaterways }),
	setRoutes: (routes) => set({ routes }),
	setNetwork: (network) => set({ network }),
	setLineaments: (lineaments) => set({ lineaments }),
	addCustomLayer: (layer) =>
		set((s) => {
			const customLayers = [
				...s.customLayers,
				{ visible: true, opacity: 0.9, ...layer, id: `${Date.now()}` },
			]
			saveServices(customLayers)
			return { customLayers }
		}),
	updateCustomLayer: (id, patch) =>
		set((s) => {
			const customLayers = s.customLayers.map((l) =>
				l.id === id ? { ...l, ...patch } : l,
			)
			saveServices(customLayers)
			return { customLayers }
		}),
	removeCustomLayer: (id) =>
		set((s) => {
			// Eigene Bilder liegen als blob:-URL im Speicher
			const url = s.customLayers.find((l) => l.id === id)?.url
			if (url?.startsWith("blob:")) URL.revokeObjectURL(url)
			const customLayers = s.customLayers.filter((l) => l.id !== id)
			saveServices(customLayers)
			return { customLayers }
		}),
	setSelectedSite: (selectedSite) =>
		set((s) => ({ selectedSite, ...(selectedSite && showCard(s)) })),
	setInspect: (inspect) =>
		set((s) => ({ inspect, ...(inspect && showCard(s)) })),
	setSelectedText: (selectedText) => set({ selectedText }),
	setSearchHit: (searchHit) => set({ searchHit }),
}))
