import * as maplibregl from "maplibre-gl"
import { metersPerPixel } from "@/lib/geo"
import { prefetchBounds } from "@/lib/prefetch"
import { isMobile, mapInsets } from "@/lib/sheet"
import { useMapStore } from "@/store/use-map-store"

/**
 * Kartenbezug der antiken Texte: Ebenen, Kamerafahrt und Animation.
 * Flüsse und Räume blenden gestaffelt ein, Pfeile wachsen vom Start zum
 * Ziel, danach zeigt ein wandernder Lichtpunkt die Richtung. Beschriftungen
 * von Orten und Bewegungen sind HTML-Sprechblasen, Stammesgebiete klassisch
 * gesperrt gesetzt. Bei „Bewegung reduzieren“ entfällt die Animation.
 */

export const TEXT_COLOR = "#6a1b9a"
export const ARROW_COLOR = "#c62828"
const RIVER_COLOR = "#0277bd"
const EMPTY = { type: "FeatureCollection", features: [] }
const HALO = {
	"text-halo-color": "rgba(255,255,255,0.95)",
	"text-halo-width": 1.8,
}
const kindIs = (...kinds) => ["in", ["get", "kind"], ["literal", kinds]]
const sure = ["!", ["get", "uncertain"]]

const GROW_DELAY = 700
const GROW = 1700
const COMET_PERIOD = 2600
const PULSE_PERIOD = 1800

// Gestaffeltes Einblenden: Layer, Eigenschaft, Zielwert, Verzögerung in ms
const FADES = [
	["text-veil", "background-opacity", 0.55, 0],
	["text-river-glow", "line-opacity", 0.5, 150],
	["text-river-casing", "line-opacity", 0.9, 150],
	["text-river", "line-opacity", 1, 150],
	["text-river-label", "text-opacity", 1, 450],
	["text-band", "line-opacity", 0.22, 350],
	["text-area-fill", "fill-opacity", 0.13, 350],
	["text-outline", "line-opacity", 0.9, 350],
	["text-outline-uncertain", "line-opacity", 0.9, 350],
	["text-point", "circle-opacity", 1, 550],
	["text-point", "circle-stroke-opacity", 1, 550],
	["text-label", "text-opacity", 0.9, 650],
]

function headImage() {
	const size = 48
	const canvas = document.createElement("canvas")
	canvas.width = size
	canvas.height = size
	const c = canvas.getContext("2d")
	c.fillStyle = ARROW_COLOR
	c.strokeStyle = "#fff"
	c.lineWidth = 4
	c.lineJoin = "round"
	c.beginPath()
	c.moveTo(size / 2, 4)
	c.lineTo(size - 6, size - 6)
	c.lineTo(size / 2, size - 16)
	c.lineTo(6, size - 6)
	c.closePath()
	c.stroke()
	c.fill()
	return c.getImageData(0, 0, size, size)
}

/** Quellen und Layer anlegen, alle zunächst unsichtbar. */
export function addTextLayers(map) {
	map.addImage("text-head", headImage(), { pixelRatio: 2 })
	map.addSource("text-geo", { type: "geojson", data: EMPTY })
	map.addSource("text-anim", { type: "geojson", data: EMPTY })
	map.addSource("text-comet", {
		type: "geojson",
		data: EMPTY,
		lineMetrics: true,
	})
	// Breite in Metern, unabhängig von der Zoomstufe (MapLibre zählt Zoom
	// in 512er-Kacheln, metersPerPixel in 256er)
	const meters = (zoom) => [
		"/",
		["get", "width"],
		metersPerPixel(51.8, zoom + 1),
	]
	const layers = [
		// Heller Schleier über allem anderen, damit die Textstelle hervortritt
		{
			id: "text-veil",
			type: "background",
			paint: { "background-color": "#fff", "background-opacity": 0 },
		},
		{
			id: "text-band",
			type: "line",
			source: "text-geo",
			filter: kindIs("band"),
			// Gehrungen statt runder Gelenke, sonst überlappt die Fläche
			layout: { "line-cap": "round", "line-join": "miter" },
			paint: {
				"line-color": TEXT_COLOR,
				"line-opacity": 0,
				"line-width": [
					"interpolate",
					["exponential", 2],
					["zoom"],
					4,
					meters(4),
					14,
					meters(14),
				],
			},
		},
		{
			id: "text-area-fill",
			type: "fill",
			source: "text-geo",
			filter: kindIs("area"),
			paint: { "fill-color": TEXT_COLOR, "fill-opacity": 0 },
		},
		{
			id: "text-outline",
			type: "line",
			source: "text-geo",
			filter: ["all", kindIs("area", "ring", "line"), sure],
			layout: { "line-cap": "round", "line-join": "round" },
			paint: { "line-color": TEXT_COLOR, "line-width": 2, "line-opacity": 0 },
		},
		{
			id: "text-outline-uncertain",
			type: "line",
			source: "text-geo",
			filter: ["all", kindIs("area", "ring", "line"), ["get", "uncertain"]],
			paint: {
				"line-color": TEXT_COLOR,
				"line-width": 2,
				"line-dasharray": [3, 2],
				"line-opacity": 0,
			},
		},
		{
			id: "text-river-glow",
			type: "line",
			source: "text-geo",
			filter: kindIs("river"),
			layout: { "line-cap": "round", "line-join": "round" },
			paint: {
				"line-color": "#4fc3f7",
				"line-width": 16,
				"line-blur": 10,
				"line-opacity": 0,
			},
		},
		{
			id: "text-river-casing",
			type: "line",
			source: "text-geo",
			filter: kindIs("river"),
			layout: { "line-cap": "round", "line-join": "round" },
			paint: { "line-color": "#fff", "line-width": 7.5, "line-opacity": 0 },
		},
		{
			id: "text-river",
			type: "line",
			source: "text-geo",
			filter: kindIs("river"),
			layout: { "line-cap": "round", "line-join": "round" },
			paint: {
				"line-color": RIVER_COLOR,
				"line-width": 4,
				"line-opacity": 0,
			},
		},
		{
			id: "text-river-label",
			type: "symbol",
			source: "text-geo",
			filter: kindIs("river"),
			layout: {
				"symbol-placement": "line",
				"symbol-spacing": 420,
				"text-field": ["get", "label"],
				"text-font": ["Montserrat SemiBold Italic"],
				"text-size": 14,
				"text-letter-spacing": 0.08,
			},
			paint: { "text-color": "#01579b", "text-opacity": 0, ...HALO },
		},
		{
			id: "text-arrow-casing",
			type: "line",
			source: "text-anim",
			filter: kindIs("arrow"),
			layout: { "line-cap": "round", "line-join": "round" },
			paint: { "line-color": "#fff", "line-width": 7, "line-opacity": 0.9 },
		},
		{
			id: "text-arrow",
			type: "line",
			source: "text-anim",
			filter: ["all", kindIs("arrow"), sure],
			layout: { "line-cap": "round", "line-join": "round" },
			paint: { "line-color": ARROW_COLOR, "line-width": 4 },
		},
		{
			id: "text-arrow-uncertain",
			type: "line",
			source: "text-anim",
			filter: ["all", kindIs("arrow"), ["get", "uncertain"]],
			layout: { "line-cap": "round", "line-join": "round" },
			paint: {
				"line-color": ARROW_COLOR,
				"line-width": 4,
				"line-dasharray": [0.1, 2],
			},
		},
		{
			id: "text-comet-trail",
			type: "line",
			source: "text-comet",
			filter: ["==", ["geometry-type"], "LineString"],
			layout: { "line-cap": "round", "line-join": "round" },
			paint: {
				"line-width": 4,
				"line-gradient": [
					"interpolate",
					["linear"],
					["line-progress"],
					0,
					"rgba(255,255,255,0)",
					1,
					"rgba(255,255,255,0.95)",
				],
			},
		},
		{
			id: "text-comet-dot",
			type: "circle",
			source: "text-comet",
			filter: ["==", ["geometry-type"], "Point"],
			paint: {
				"circle-radius": 4.5,
				"circle-color": "#fff",
				"circle-stroke-color": ARROW_COLOR,
				"circle-stroke-width": 2,
			},
		},
		{
			id: "text-head",
			type: "symbol",
			source: "text-anim",
			filter: kindIs("head"),
			layout: {
				"icon-image": "text-head",
				"icon-rotate": ["get", "bearing"],
				"icon-rotation-alignment": "map",
				"icon-allow-overlap": true,
				"icon-ignore-placement": true,
			},
		},
		{
			id: "text-pulse",
			type: "circle",
			source: "text-geo",
			filter: kindIs("point"),
			paint: {
				"circle-radius": 7,
				"circle-color": "rgba(0,0,0,0)",
				"circle-stroke-color": TEXT_COLOR,
				"circle-stroke-width": 2,
				"circle-stroke-opacity": 0,
			},
		},
		{
			id: "text-point",
			type: "circle",
			source: "text-geo",
			filter: kindIs("point"),
			paint: {
				"circle-radius": 6.5,
				"circle-color": ["case", ["get", "uncertain"], "#fff", TEXT_COLOR],
				"circle-stroke-color": [
					"case",
					["get", "uncertain"],
					TEXT_COLOR,
					"#fff",
				],
				"circle-stroke-width": 2.5,
				"circle-opacity": 0,
				"circle-stroke-opacity": 0,
			},
		},
		// Räume klassisch: Versalien, gesperrt
		{
			id: "text-label",
			type: "symbol",
			source: "text-geo",
			filter: ["all", kindIs("label"), ["==", ["get", "of"], "area"]],
			layout: {
				"text-field": ["upcase", ["get", "label"]],
				"text-font": ["Montserrat Bold"],
				"text-size": 12,
				"text-letter-spacing": 0.2,
				"text-max-width": 12,
				"text-allow-overlap": true,
			},
			paint: { "text-color": TEXT_COLOR, "text-opacity": 0, ...HALO },
		},
	]
	for (const layer of layers) map.addLayer(layer)
}

function setFades(map, duration, visible) {
	for (const [id, prop, target, delay] of FADES) {
		map.setPaintProperty(id, `${prop}-transition`, {
			duration,
			delay: visible ? delay : 0,
		})
		map.setPaintProperty(id, prop, visible ? target : 0)
	}
}

// Abstände in Metern, flach gerechnet (genügt für die Animation)
function measure(path) {
	const cum = [0]
	for (let i = 1; i < path.length; i++) {
		const [x0, y0] = path[i - 1]
		const [x1, y1] = path[i]
		const k = Math.cos((((y0 + y1) / 2) * Math.PI) / 180)
		cum.push(
			cum[i - 1] + Math.hypot((x1 - x0) * k * 111320, (y1 - y0) * 110540),
		)
	}
	return cum
}

/** Teilstück des Pfads von a bis b Metern. */
function slice(path, cum, a, b) {
	const at = (d) => {
		let i = 1
		while (i < cum.length - 1 && cum[i] < d) i++
		const span = cum[i] - cum[i - 1] || 1
		const t = Math.min(1, Math.max(0, (d - cum[i - 1]) / span))
		const [x0, y0] = path[i - 1]
		const [x1, y1] = path[i]
		return { i, p: [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t] }
	}
	const start = at(a)
	const end = at(b)
	return [start.p, ...path.slice(start.i, end.i), end.p]
}

const bearing = ([x0, y0], [x1, y1]) =>
	(Math.atan2((x1 - x0) * Math.cos((y1 * Math.PI) / 180), y1 - y0) * 180) /
	Math.PI

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

const KICKER = {
	arrow: (u) => (u ? "Weg erschlossen" : "Bewegung laut Text"),
	band: () => "Raum",
	line: () => "Höhenzug",
	point: () => "",
	ring: () => "",
}

function bubble(f, delay) {
	const { of, label, uncertain } = f.properties
	const callout = of === "arrow" || of === "band" || of === "line"
	const wrap = document.createElement("div")
	wrap.className = "tg-marker"
	const el = document.createElement("div")
	el.className = [
		"tg-bubble",
		callout ? "tg-callout" : "tg-pill",
		`tg-${of}`,
		uncertain ? "tg-uncertain" : "",
	].join(" ")
	el.style.animationDelay = `${delay}ms`
	const kicker = KICKER[of]?.(uncertain)
	if (kicker) {
		const k = document.createElement("span")
		k.className = "tg-kicker"
		k.textContent = kicker
		el.append(k)
	}
	// „Name, Erläuterung“: Erläuterung leiser, in Kästen auf eigener Zeile
	const cut = label.indexOf(", ")
	const main = document.createElement("span")
	main.className = "tg-main"
	main.textContent = cut > 0 ? label.slice(0, cut) : label
	el.append(main)
	if (cut > 0) {
		const sub = document.createElement("span")
		sub.className = "tg-sub"
		sub.textContent = label.slice(cut + 2)
		el.append(sub)
	}
	wrap.append(el)
	return {
		element: wrap,
		// Räume unterhalb ihres Bezugspunkts, damit sie nicht mit der
		// Bewegung an derselben Stelle kollidieren
		anchor:
			of === "band" ? "top" : callout || of === "ring" ? "bottom" : "left",
		offset:
			of === "band"
				? [0, 10]
				: callout
					? [0, -10]
					: of === "ring"
						? [0, -4]
						: [15, 0],
	}
}

// Wichtigere Sprechblasen zuerst platzieren
const PRIORITY = { arrow: 0, band: 1, line: 1, point: 2, ring: 3 }

/**
 * Einfache Kollisionsprüfung: Sprechblasen der Reihe nach setzen, Orts-
 * blasen weichen nach rechts, links, oben oder unten aus. Was nirgends
 * Platz hat, wird ausgeblendet, bis man weiter hineinzoomt.
 */
function placeBubbles(map, items) {
	const placed = []
	const hits = (r) =>
		placed.some(
			(q) =>
				r.x < q.x + q.w + 4 &&
				q.x < r.x + r.w + 4 &&
				r.y < q.y + q.h + 4 &&
				q.y < r.y + r.h + 4,
		)
	for (const it of items) {
		const el = it.marker.getElement()
		const w = el.offsetWidth
		const h = el.offsetHeight
		const p = map.project(it.marker.getLngLat())
		const options =
			it.of === "point"
				? [
						[15, 0],
						[-(w + 15), 0],
						[-w / 2, -(h / 2 + 16)],
						[-w / 2, h / 2 + 16],
					]
				: [it.offset]
		// Seite der Ortsblase, an der ihre Spitze zum Punkt zeigt
		const sides = ["left", "right", "bottom", "top"]
		let chosen = null
		for (const off of options) {
			// Rechteck je nach Anker: links mittig, oben oder unten mittig
			const x = p.x + off[0]
			const y = p.y + off[1]
			const r =
				it.anchor === "left"
					? { x, y: y - h / 2, w, h }
					: it.anchor === "top"
						? { x: x - w / 2, y, w, h }
						: { x: x - w / 2, y: y - h, w, h }
			if (!hits(r)) {
				chosen = { off, r, side: sides[options.indexOf(off)] }
				break
			}
		}
		el.classList.toggle("tg-hidden", !chosen)
		if (chosen) {
			if (it.of === "point") el.firstChild.dataset.side = chosen.side
			it.marker.setOffset(chosen.off)
			placed.push(chosen.r)
		}
	}
}

/** Am Desktop liegen links die Lesekarte und unten die Zeitleiste. */
function desktopPadding() {
	const { bottom, left } = useMapStore.getState().timelineInset
	return { top: 90, bottom: bottom + 40, left: left + 50, right: 150 }
}

/**
 * Textstelle zeigen (geo) oder ausblenden (null). Gibt eine Aufräum-
 * funktion zurück, die Animation und Sprechblasen beendet.
 */
export function showText(map, geo) {
	const reduced =
		window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
	const timers = []
	const markers = []
	let raf = 0
	let fit = () => {}
	const place = () => placeBubbles(map, markers)
	const cleanup = () => {
		cancelAnimationFrame(raf)
		for (const t of timers) clearTimeout(t)
		for (const m of markers) m.marker.remove()
		map.off("resize", fit)
		map.off("moveend", place)
	}

	map.getSource("text-anim").setData(EMPTY)
	map.getSource("text-comet").setData(EMPTY)

	if (!geo) {
		setFades(map, reduced ? 0 : 250, false)
		timers.push(
			setTimeout(() => map.getSource("text-geo")?.setData(EMPTY), 300),
		)
		return cleanup
	}

	const features = geo.data.features
	const isBubble = (f) =>
		f.properties.kind === "label" && f.properties.of !== "area"
	const isAnim = (f) =>
		f.properties.kind === "arrow" || f.properties.kind === "head"

	// Erst alles auf null, dann gestaffelt aufziehen
	setFades(map, 0, false)
	map.getSource("text-geo").setData({
		type: "FeatureCollection",
		features: features.filter((f) => !isBubble(f) && !isAnim(f)),
	})
	timers.push(setTimeout(() => setFades(map, reduced ? 0 : 700, true), 30))

	const [w, s, e, n] = geo.bounds
	fit = () =>
		map.fitBounds(
			[
				[w, s],
				[e, n],
			],
			{
				padding: isMobile()
					? {
							top: mapInsets().top + 56,
							bottom: mapInsets().bottom + 24,
							left: 40,
							right: 90,
						}
					: desktopPadding(),
				maxZoom: 11,
				duration: reduced ? 0 : 1400,
			},
		)
	prefetchBounds(
		[
			[w, s],
			[e, n],
		],
		{ maxZoom: 11 },
	)
	fit()
	// Öffnet sich gleichzeitig die Seitenleiste, ändert sich die Kartenbreite
	// und die Kamerafahrt bricht ab. Dann noch einmal einpassen.
	map.on("resize", fit)
	timers.push(setTimeout(() => map.off("resize", fit), 1000))

	// Sprechblasen, Bewegungen erst wenn ihr Pfeil halb gezeichnet ist
	let ringIndex = 0
	for (const f of features.filter(isBubble)) {
		const of = f.properties.of
		const delay =
			of === "arrow"
				? GROW_DELAY + GROW * 0.6
				: of === "ring"
					? 500 + 180 * ringIndex++
					: of === "point"
						? 700
						: 600
		const opts = bubble(f, reduced ? 0 : delay)
		markers.push({
			of,
			anchor: opts.anchor,
			offset: opts.offset,
			marker: new maplibregl.Marker(opts)
				.setLngLat(f.geometry.coordinates)
				.addTo(map),
		})
	}
	markers.sort((a, b) => PRIORITY[a.of] - PRIORITY[b.of])
	place()
	// Breiten stimmen erst mit geladener Schrift
	document.fonts?.ready.then(place)
	map.on("moveend", place)

	const arrows = features
		.filter((f) => f.properties.kind === "arrow")
		.map((f) => {
			const path = f.geometry.coordinates
			const cum = measure(path)
			return { path, cum, len: cum.at(-1), uncertain: f.properties.uncertain }
		})
	const hasPoints = features.some((f) => f.properties.kind === "point")

	const drawArrows = (k) => {
		const out = []
		for (const a of arrows) {
			const part = k >= 1 ? a.path : slice(a.path, a.cum, 0, a.len * k)
			if (part.length < 2 || k <= 0) continue
			out.push({
				type: "Feature",
				properties: { kind: "arrow", uncertain: a.uncertain },
				geometry: { type: "LineString", coordinates: part },
			})
			out.push({
				type: "Feature",
				properties: {
					kind: "head",
					bearing: bearing(part.at(-2), part.at(-1)),
				},
				geometry: { type: "Point", coordinates: part.at(-1) },
			})
		}
		map
			.getSource("text-anim")
			.setData({ type: "FeatureCollection", features: out })
	}

	if (reduced) {
		drawArrows(1)
		map.setPaintProperty("text-pulse", "circle-stroke-opacity", 0)
		return cleanup
	}
	if (!arrows.length && !hasPoints) return cleanup

	const start = performance.now() + GROW_DELAY
	let grown = false
	const frame = (now) => {
		const t = (now - start) / GROW
		if (!grown) {
			drawArrows(ease(Math.min(1, Math.max(0, t))))
			grown = t >= 1
		} else if (arrows.length) {
			// Lichtpunkt mit Schweif wandert vom Start zum Ziel
			const phase = ((now - start - GROW) / COMET_PERIOD) % 1
			const out = []
			for (const a of arrows) {
				const head = a.len * phase
				const tail = Math.max(0, head - a.len * 0.18)
				const trail = slice(a.path, a.cum, tail, head)
				if (head > 0 && trail.length >= 2) {
					out.push({
						type: "Feature",
						properties: {},
						geometry: { type: "LineString", coordinates: trail },
					})
				}
				out.push({
					type: "Feature",
					properties: {},
					geometry: { type: "Point", coordinates: trail.at(-1) },
				})
			}
			map.getSource("text-comet").setData({
				type: "FeatureCollection",
				features: out,
			})
		}
		if (hasPoints) {
			const k = (now / PULSE_PERIOD) % 1
			map.setPaintProperty("text-pulse", "circle-radius", 7 + 16 * k)
			map.setPaintProperty(
				"text-pulse",
				"circle-stroke-opacity",
				0.55 * (1 - k),
			)
		}
		raf = requestAnimationFrame(frame)
	}
	raf = requestAnimationFrame(frame)
	return cleanup
}
