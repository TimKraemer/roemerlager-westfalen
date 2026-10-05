import { create } from "zustand"
import { BASE_LAYERS, OVERLAYS } from "@/lib/layers"
import { DEFAULT_PARAMS } from "@/lib/potential/model"
import { SITE_TYPES } from "@/lib/sites"

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
	// Seitenleiste mit Einstellungen und Quellen, anfangs eingeklappt
	panelOpen: false,
	showRoads: true,

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
	selectedSite: null,
	inspect: null,

	setBaseLayer: (baseLayer) => set({ baseLayer }),
	setOverlay: (id, patch) =>
		set((s) => ({
			overlays: { ...s.overlays, [id]: { ...s.overlays[id], ...patch } },
		})),
	toggleSiteType: (id) =>
		set((s) => ({ siteTypes: { ...s.siteTypes, [id]: !s.siteTypes[id] } })),
	setShowRings: (showRings) => set({ showRings }),
	setShowWaterways: (showWaterways) => set({ showWaterways }),
	setShowRoutes: (showRoutes) => set({ showRoutes }),
	setPanelOpen: (panelOpen) => set({ panelOpen }),
	setShowRoads: (showRoads) => set({ showRoads }),
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
	setSelectedSite: (selectedSite) => set({ selectedSite }),
	setInspect: (inspect) => set({ inspect }),
}))
