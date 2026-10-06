import ALTKARTEN from "@/data/altkarten.json"
import ALTKARTEN_QUELLEN from "@/data/altkarten-quellen.json"
import { componentCsl } from "./citation"
import { getRef } from "./literature"

/**
 * Quellen je Kartenebene für den Zitierdialog. `own` ist der Titel einer
 * in dieser Anwendung erzeugten Ebene, die als Teil des Gesamtwerks zitiert
 * wird. `refs` verweisen auf Daten und Methoden in src/data/literatur.json.
 * Ebenen fremder Dienste haben nur `refs`.
 */
const MODEL_REFS = [
	"lwl2023paderborn",
	"juengerich2022",
	"kaye2013",
	"jones2011",
	"tobler1993",
	"lewis2021",
	"barnes2014",
	"beven1979",
	"mapzen-terrain",
	"osm",
	"geobasis-uraufnahme",
	"gd-bk50",
	"lbeg-gum50",
]

const SOURCES = {
	// Analyse
	heatmap: {
		own: "Potenzialkarte für unentdeckte Marschlager",
		refs: MODEL_REFS,
	},
	candidates: { own: "Vermutete Lagerplätze", refs: MODEL_REFS },
	rings: {
		own: "Ein Tagesmarsch um bekannte Marschlager",
		refs: ["lwl2023paderborn", "juengerich2022"],
	},
	routes: {
		own: "Mögliche Marschwege",
		refs: ["tobler1993", "lewis2021", "mapzen-terrain", "osm"],
	},
	stops: {
		own: "Mögliche Etappenhalte",
		refs: [...new Set(["tobler1993", "lewis2021", ...MODEL_REFS])],
	},
	boundary: { refs: ["osm"] },
	roads: { own: "Römerstraßen", refs: ["itinere2025", "osm"] },
	waterways: {
		own: "Natürliches Gewässernetz",
		refs: [
			"barnes2014",
			"mapzen-terrain",
			"geobasis-uraufnahme",
			"gerlach2022",
			"osm",
		],
	},
	model3d: {
		own: "3D-Modell Römerlager Oberaden, am Grabungsplan eingepasst",
		refs: ["bergkamen-oberaden", "kuehlborn2011"],
	},
	// Gelände
	relief: { refs: ["mapzen-terrain"] },
	"schummerung-nrw": { refs: ["geobasis-schummerung"] },
	"schummerung-nrw-col": { refs: ["geobasis-schummerung"] },
	lrm: {
		own: "Laserscan-Ansicht (Local Relief Model) an Kandidaten und Lagern",
		refs: ["hesse2010", "geobasis-dgm1-wcs"],
	},
	lines: {
		own: "Erkannte gerade Strukturen",
		refs: ["duda1972", "hesse2010", "geobasis-dgm1-wcs"],
	},
	"schummerung-de": { refs: ["bkg-schummerung"] },
	// Gewässer und Böden
	"osm-gewaesser": { refs: ["osm"] },
	"alte-flusslaeufe": {
		own: "Alte Flussläufe",
		refs: ["geobasis-uraufnahme", "gerlach2022", "lwl2023lippe", "osm"],
	},
	uraufnahme: { refs: ["geobasis-uraufnahme"] },
	"aue-preussisch": { refs: ["nrw-uesg"] },
	"bk50-grundwasser": { refs: ["gd-bk50"] },
	"bk50-bodentyp": { refs: ["gd-bk50"] },
	"moore-ni": { refs: ["lbeg-gum50"] },
	"bk50-ni": { refs: ["lbeg-gum50"] },
	"gk100-nrw": { refs: ["gd-gk100"] },
	"gewaesser-nrw": { refs: ["nrw-gewstat"] },
	// Historische Karten und Denkmäler
	tranchot: { refs: ["geobasis-tranchot"] },
	neuaufnahme: { refs: ["geobasis-neuaufnahme"] },
	"tk25-1936": { refs: ["geobasis-tk25-1936"] },
	"hist-dop": { refs: ["geobasis-hist-dop"] },
	"bodendenkmal-nrw": { refs: ["nrw-bodendenkmal"] },
}

/** Gescannte Altkarte als Kartenwerk mit Bestandsnachweis. */
function altkarteCsl(m) {
	const scans = ALTKARTEN_QUELLEN[m.id] ?? []
	const scan = scans[0]
	// „SLUB Dresden, Deutsche Fotothek, Geogr.A.230-2 (…)“: Archiv, Signatur
	const [archive, ...rest] = scan?.label.split(", ") ?? []
	const circa = /\bum \d{4}|Jahr nicht/.test(m.title)
	return {
		id: `altkarte-${m.id}`,
		type: "map",
		...(m.author ? { author: [{ literal: m.author }] } : {}),
		issued: { "date-parts": [[m.year]], ...(circa ? { circa: true } : {}) },
		title: m.title,
		...(archive ? { archive } : {}),
		...(rest.length ? { archive_location: rest.join(", ") } : {}),
		...(scan?.url ? { URL: scan.url } : {}),
		...(scan?.license ? { license: scan.license } : {}),
	}
}

for (const m of ALTKARTEN) {
	SOURCES[`alt-${m.id}`] = {
		own: `Entzerrte Altkarte: ${m.short}`,
		extra: () => [altkarteCsl(m)],
	}
}

export function hasLayerSources(id) {
	return id in SOURCES
}

/**
 * CSL-Einträge einer Ebene: zuerst die Ebene selbst (falls hier erzeugt),
 * dann Vorlagen, Daten und Methoden.
 */
export function layerCsl(id, date = new Date()) {
	const s = SOURCES[id]
	if (!s) return []
	return [
		...(s.own ? [componentCsl(id, s.own, date)] : []),
		...(s.extra?.() ?? []),
		...(s.refs ?? []).map(getRef),
	]
}

export const LAYER_SOURCE_IDS = Object.keys(SOURCES)
