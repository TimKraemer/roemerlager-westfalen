/**
 * Kacheln vorab laden, bevor die Karte sie braucht: für eine Ebene, über
 * deren Schalter der Mauszeiger steht, und für das Ziel einer Kamerafahrt,
 * während die Fahrt noch läuft. Die Antworten landen im Cache des Service
 * Workers (public/sw.js) bzw. im HTTP-Cache, MapLibre findet sie dort unter
 * derselben URL wieder (tileUrl in layers.js).
 */

import { useMapStore } from "@/store/use-map-store"
import { BASE_LAYERS, OVERLAYS, partsOf, styleFor, tileUrl } from "./layers"

const LAYERS = Object.fromEntries(
	[...BASE_LAYERS, ...OVERLAYS].map((l) => [l.id, l]),
)
// Höchstens so viele Kacheln je Anlass, gleichzeitig höchstens PARALLEL
const MAX_TILES = 48
const PARALLEL = 4
// Die Nutzungsregeln von tile.openstreetmap.org verbieten Vorabladen
const NO_PREFETCH = /(^|\.)openstreetmap\.org$/

let map = null
/** Die Karte meldet sich hier an (map-view.jsx). */
export function setPrefetchMap(m) {
	map = m
}

const done = new Set()
let current = null

/** Neuer Anlass: ältere Wünsche abbrechen, die neuen laden. */
function request(urls) {
	current?.controller.abort()
	const job = {
		controller: new AbortController(),
		queue: urls.filter((u) => !done.has(u)).slice(0, MAX_TILES),
		running: 0,
	}
	current = job
	const pump = () => {
		while (job.running < PARALLEL && job.queue.length) {
			const url = job.queue.shift()
			if (done.has(url)) continue
			done.add(url)
			job.running++
			fetch(url, { signal: job.controller.signal, priority: "low" })
				.then((r) => r.blob())
				.catch(() => done.delete(url))
				.finally(() => {
					job.running--
					if (!job.controller.signal.aborted) pump()
				})
		}
	}
	pump()
}

// Anteil 0–1 der Weltbreite bzw. -höhe in Web-Mercator
const mercX = (lon) => (lon + 180) / 360
const mercY = (lat) => {
	const r = (lat * Math.PI) / 180
	return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2
}

/** Kachel-URLs einer Quelle für einen Ausschnitt um center bei zoom. */
function sourceUrls(source, center, zoom, width, height) {
	if (!source.tiles?.length || source.type === "geojson") return []
	const template = source.tiles[0]
	if (!template.startsWith("nw-dop:")) {
		try {
			if (NO_PREFETCH.test(new URL(template, location.href).hostname)) return []
		} catch {
			return []
		}
	}
	const size = source.tileSize ?? 512
	const maxzoom = source.maxzoom ?? 22
	// Wie MapLibre: Kartenzoom bezieht sich auf 512er-Kacheln, Raster runden
	const z = Math.min(
		maxzoom,
		Math.max(0, Math.round(zoom + Math.log2(512 / size))),
	)
	if (z < (source.minzoom ?? 0)) return []
	const n = 2 ** z
	// Bildschirmpixel je Kachel: die Welt ist bei Kartenzoom zoom
	// 512 · 2^zoom Pixel breit
	const px = 512 * 2 ** (zoom - z)
	const cx = mercX(center[0]) * n
	const cy = mercY(center[1]) * n
	const hx = width / 2 / px
	const hy = height / 2 / px
	let [x0, x1] = [Math.floor(cx - hx), Math.floor(cx + hx)]
	let [y0, y1] = [Math.floor(cy - hy), Math.floor(cy + hy)]
	if (source.bounds) {
		const [w, s, e, nn] = source.bounds
		x0 = Math.max(x0, Math.floor(mercX(w) * n))
		x1 = Math.min(x1, Math.floor(mercX(e) * n))
		y0 = Math.max(y0, Math.floor(mercY(nn) * n))
		y1 = Math.min(y1, Math.floor(mercY(s) * n))
	}
	x0 = Math.max(0, x0)
	y0 = Math.max(0, y0)
	x1 = Math.min(n - 1, x1)
	y1 = Math.min(n - 1, y1)
	// Von der Mitte nach außen, die wichtigsten zuerst
	const tiles = []
	for (let y = y0; y <= y1; y++)
		for (let x = x0; x <= x1; x++)
			tiles.push([Math.hypot(x + 0.5 - cx, y + 0.5 - cy), x, y])
	tiles.sort((a, b) => a[0] - b[0])
	return tiles.map(([, x, y]) => tileUrl(template, z, x, y))
}

/** Alle Kachel-URLs der Ebenen ids für einen Ausschnitt. */
function urlsFor(ids, center, zoom) {
	if (!map) return []
	const { clientWidth: width, clientHeight: height } = map.getContainer()
	const lists = []
	for (const id of ids) {
		const layer = LAYERS[id]
		if (!layer) continue
		// Teile mit eigener Mindestzoomstufe (Luftbilder ab 8)
		const parts = partsOf(layer)
		const { sources } = styleFor(layer)
		Object.values(sources).forEach((source, i) => {
			const minzoom = parts[i]?.minzoom ?? layer.minzoom ?? 0
			if (zoom < minzoom) return
			lists.push(sourceUrls(source, center, zoom, width, height))
		})
	}
	// Abwechselnd aus allen Quellen, damit jede ihre Mitte zuerst bekommt
	const urls = []
	for (let i = 0; lists.some((l) => i < l.length); i++)
		for (const l of lists) if (i < l.length) urls.push(l[i])
	return urls
}

/** Ebene(n) im aktuellen Ausschnitt vorladen, z. B. beim Überfahren. */
export function prefetchLayer(ids) {
	if (!map) return
	const { lng, lat } = map.getCenter()
	request(urlsFor([ids].flat(), [lng, lat], map.getZoom()))
}

/** Eingeschaltete Ebenen am Ziel einer Kamerafahrt vorladen. */
export function prefetchView(center, zoom) {
	if (!map || !center || !Number.isFinite(zoom)) return
	const s = useMapStore.getState()
	const ids = [
		s.baseLayer,
		...Object.keys(s.overlays).filter((id) => s.overlays[id].visible),
	]
	request(urlsFor(ids, center, zoom))
}

/** Wie prefetchView, mit dem Ausschnitt, den fitBounds anfahren würde. */
export function prefetchBounds(bounds, options) {
	if (!map) return
	const camera = map.cameraForBounds(bounds, options)
	if (!camera) return
	const { lng, lat } = camera.center
	prefetchView([lng, lat], camera.zoom)
}
