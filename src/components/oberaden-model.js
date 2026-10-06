import * as maplibregl from "maplibre-gl"
import { FONT } from "@/lib/layers"

/**
 * 3D-Rekonstruktion des Mehrlegionenlagers Oberaden aus der Bergkamen-App
 * (erleben.app, Modell „Römerlager Grundriss“), als three.js-Layer auf der
 * Karte. three.js lädt erst, wenn das Modell zum ersten Mal sichtbar wird.
 *
 * Lage, Maßstab und Drehung sind am Gesamtplan der LWL-Archäologie
 * eingepasst (Römerlager in Westfalen, Heft 3, Abb. 20, Stand 2006). Dessen
 * Luftbild wurde per Kreuzkorrelation auf das DOP NRW registriert, die
 * Mauerlinie umschließt danach 55,9 ha (Literatur 56 ha). Modell-Mauer und
 * vier Tore per Ähnlichkeitstransformation (ICP) darauf: mittlere
 * Abweichung der Mauer 8,5 m, 90 % unter 14 m, Tore 10–25 m.
 * Im Modell zeigt +x nach Westen, +z nach Norden, +y nach oben.
 */

export const MODEL_LAYER = "oberaden-3d"
// Erst nah heran, damit die Übersichtskarte frei bleibt
export const MODEL_MIN_ZOOM = 15

const URL_GLB = `${process.env.NEXT_PUBLIC_BASE_PATH}/models/oberaden.glb`
const URL_DRACO = `${process.env.NEXT_PUBLIC_BASE_PATH}/draco/`

// Modellursprung, Meter je Modelleinheit, Drehung gegen den Uhrzeigersinn
const ORIGIN = [7.581621, 51.610942]
const METERS_PER_UNIT = 377.3
const ROTATION = (-3.91 * Math.PI) / 180
// Oberkante der Bodenplatte im Modell, kommt auf Kartenniveau
const GROUND_Y = 0.05
// Das Modell ist stark überhöht (Mauertürme sonst 17 m, Dächer 24 m)
const HEIGHT_SCALE = 0.4

/** Matrix vom Modell (Y oben) in Mercator-Koordinaten der Karte. */
function modelToMercator(THREE) {
	const o = maplibregl.MercatorCoordinate.fromLngLat(ORIGIN, 0)
	const m = METERS_PER_UNIT * o.meterInMercatorCoordinateUnits()
	const c = Math.cos(ROTATION) * m
	const s = Math.sin(ROTATION) * m
	const h = HEIGHT_SCALE * m
	// Ost = -x, Nord = z, gedreht; Mercator-y zeigt nach Süden
	// biome-ignore format: Matrix zeilenweise
	return new THREE.Matrix4().set(
		-c, 0, -s, o.x,
		s, 0, -c, o.y,
		0, h, 0, -GROUND_Y * h,
		0, 0, 0, 1,
	)
}

async function loadModel() {
	const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
		import("three/examples/jsm/loaders/GLTFLoader.js"),
		import("three/examples/jsm/loaders/DRACOLoader.js"),
	])
	const draco = new DRACOLoader().setDecoderPath(URL_DRACO)
	const loader = new GLTFLoader().setDRACOLoader(draco)
	const gltf = await loader.loadAsync(URL_GLB)
	draco.dispose()
	// Der Blender-Export setzt den Glanz der Dächer auf 2,4, das überstrahlt
	gltf.scene.traverse((o) => {
		const c = o.material?.specularColor
		if (c) c.setScalar(Math.min(c.r, 1))
	})
	return gltf.scene
}

// Deckkraft aus dem Regler im Ebenen-Panel, gilt für die eine Instanz
let opacity = 1

export function setModelOpacity(map, value) {
	opacity = value
	map?.triggerRepaint()
}

const materialsOf = (scene) => {
	const out = []
	scene.traverse((o) => {
		if (Array.isArray(o.material)) out.push(...o.material)
		else if (o.material) out.push(o.material)
	})
	return out
}

/**
 * Deckkraft auf die Materialien legen. Ein Wechsel zwischen deckend und
 * transparent braucht ein neues Shader-Programm, darum nur bei Änderung.
 */
function applyOpacity(materials, value) {
	for (const m of materials) {
		m.userData.base ??= { opacity: m.opacity, transparent: m.transparent }
		const transparent = m.userData.base.transparent || value < 1
		if (m.transparent !== transparent) {
			m.transparent = transparent
			m.needsUpdate = true
		}
		m.opacity = m.userData.base.opacity * value
	}
}

/** Custom Layer für maplibre, rendert in den GL-Kontext der Karte. */
export function oberadenModelLayer() {
	let THREE
	let map
	let renderer
	let scene
	let camera
	let matrix
	let materials
	let applied
	let removed = false
	return {
		id: MODEL_LAYER,
		type: "custom",
		renderingMode: "3d",
		async onAdd(m) {
			map = m
			THREE = await import("three")
			const model = await loadModel()
			// Während des Ladens wieder ausgeschaltet
			if (removed) return
			camera = new THREE.Camera()
			scene = new THREE.Scene()
			scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a60, 2.2))
			const sun = new THREE.DirectionalLight(0xffffff, 2.4)
			// Sonne aus Südwest, im Modell also +x (West) und -z (Süd)
			sun.position.set(0.8, 1.2, -0.6)
			scene.add(sun)
			matrix = modelToMercator(THREE)
			scene.add(model)
			materials = materialsOf(model)
			map.triggerRepaint()
		},
		// Renderer erst hier anlegen: three.js verstellt dabei den GL-Zustand,
		// und nur nach prerender/render setzt maplibre ihn wieder zurück
		prerender(gl) {
			if (renderer || !scene || removed) return
			renderer = new THREE.WebGLRenderer({
				canvas: map.getCanvas(),
				context: gl,
				antialias: true,
			})
			renderer.autoClear = false
		},
		render(_gl, args) {
			if (!renderer || map.getZoom() < MODEL_MIN_ZOOM) return
			const mvp = new THREE.Matrix4()
				.fromArray(args.defaultProjectionData.mainMatrix)
				.multiply(matrix)
			// Kameraposition im Modell, sonst rechnet three.js Glanzlichter so,
			// als stünde die Kamera in der Lagermitte
			const eye = new THREE.Vector4(0, 0, 1, 0).applyMatrix4(
				mvp.clone().invert(),
			)
			camera.position.set(eye.x / eye.w, eye.y / eye.w, eye.z / eye.w)
			camera.updateMatrixWorld()
			camera.projectionMatrix = mvp.multiply(camera.matrixWorld)
			camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
			if (applied !== opacity) {
				applyOpacity(materials, opacity)
				applied = opacity
			}
			renderer.resetState()
			if (opacity < 1) {
				// Erst nur die Tiefe, dann die Farbe: so scheint nur die vorderste
				// Fläche durch, nicht Wände und Dächer dahinter
				for (const m of materials) m.colorWrite = false
				renderer.render(scene, camera)
				for (const m of materials) m.colorWrite = true
			}
			renderer.render(scene, camera)
		},
		onRemove() {
			removed = true
			renderer?.dispose()
			renderer = null
		},
	}
}

// Hotspots des Modells in der Bergkamen-App (model3d „Römerlager Grundriss“),
// Position im Modell als [x, z]
const HOTSPOTS = [
	["Torhaus Nord", -0.0369, 0.9094],
	["Torhaus West", 1.0879, -0.1541],
	["Torhaus Süd", -0.0037, -0.9225],
	["Osttor (Entwässerungstor)", -1.0802, -0.3327],
	["Kasernen", 0.8139, 0.2383],
	["Praetorium (Kommandantur)", -0.0737, -0.0724],
	["Thermae (Lagerbad)", -0.5927, -0.1045],
	["Principia / Forum (Verwaltungsgebäude, Markt)", -0.195, -0.5758],
	["Atriumsvillen (hohe Beamte und Stabsoffiziere)", -0.3202, 0.7245],
	["Valetudinarium (Lazarett)", -0.5807, 0.4069],
]
const APP_URL =
	"https://bergkamen.app/roemerlager/uebersicht-roemerlager-oberaden#das-mehrlegionenlager"
const ANNOTATION_LAYERS = ["oberaden-hotspots", "oberaden-hotspots-label"]
const POI_LAYERS = ["oberaden-poi", "oberaden-poi-label"]

/** Punkt im Modell [x, z] als Länge/Breite, wie modelToMercator. */
function modelToLngLat(x, z) {
	const east = -x * METERS_PER_UNIT
	const north = z * METERS_PER_UNIT
	const c = Math.cos(ROTATION)
	const s = Math.sin(ROTATION)
	const o = maplibregl.MercatorCoordinate.fromLngLat(ORIGIN, 0)
	const m = o.meterInMercatorCoordinateUnits()
	return new maplibregl.MercatorCoordinate(
		o.x + (c * east - s * north) * m,
		o.y - (s * east + c * north) * m,
	).toLngLat()
}

const point = (properties, lngLat) => ({
	type: "Feature",
	properties,
	geometry: { type: "Point", coordinates: [lngLat.lng, lngLat.lat] },
})

/** Hotspots als Beschriftungen und ein POI mit Link zur Bergkamen-App. */
export function addModelAnnotations(map) {
	map.addSource("oberaden-hotspots", {
		type: "geojson",
		data: {
			type: "FeatureCollection",
			features: HOTSPOTS.map(([label, x, z]) =>
				point({ label }, modelToLngLat(x, z)),
			),
		},
	})
	map.addSource("oberaden-poi", {
		type: "geojson",
		data: point({}, modelToLngLat(0, 0)),
	})
	map.addLayer({
		id: "oberaden-hotspots",
		type: "circle",
		source: "oberaden-hotspots",
		minzoom: MODEL_MIN_ZOOM,
		paint: {
			"circle-radius": 5,
			"circle-color": "#fff",
			"circle-stroke-color": "#5d4037",
			"circle-stroke-width": 2,
		},
	})
	map.addLayer({
		id: "oberaden-hotspots-label",
		type: "symbol",
		source: "oberaden-hotspots",
		minzoom: MODEL_MIN_ZOOM,
		layout: {
			"text-field": ["get", "label"],
			"text-font": FONT,
			"text-size": 12,
			"text-offset": [0, 0.9],
			"text-anchor": "top",
			"text-max-width": 12,
		},
		paint: {
			"text-color": "#3e2723",
			"text-halo-color": "rgba(255,255,255,0.92)",
			"text-halo-width": 1.6,
		},
	})
	map.addLayer({
		id: "oberaden-poi",
		type: "circle",
		source: "oberaden-poi",
		minzoom: MODEL_MIN_ZOOM,
		paint: {
			"circle-radius": 11,
			"circle-color": "#b71c1c",
			"circle-stroke-color": "#fff",
			"circle-stroke-width": 2.5,
		},
	})
	map.addLayer({
		id: "oberaden-poi-label",
		type: "symbol",
		source: "oberaden-poi",
		minzoom: MODEL_MIN_ZOOM,
		layout: {
			"text-field": "3D",
			"text-font": FONT,
			"text-size": 11,
			"text-allow-overlap": true,
		},
		paint: { "text-color": "#fff" },
	})
	map.on("click", "oberaden-poi", (e) => {
		const box = document.createElement("div")
		box.style.font = "14px / 1.4 var(--font-sans), system-ui, sans-serif"
		const title = document.createElement("b")
		title.textContent = "Römerlager Oberaden"
		const meta = document.createElement("div")
		meta.textContent = "Mehrlegionenlager, 56 ha, 11–8/7 v. Chr."
		const link = document.createElement("a")
		link.href = APP_URL
		link.target = "_blank"
		link.rel = "noreferrer"
		link.textContent = "3D-Modell in der Bergkamen-App"
		box.append(title, meta, link)
		new maplibregl.Popup({ maxWidth: "280px" })
			.setLngLat(e.lngLat)
			.setDOMContent(box)
			.addTo(map)
	})
	map.on("mouseenter", "oberaden-poi", () => {
		map.getCanvas().style.cursor = "pointer"
	})
	map.on("mouseleave", "oberaden-poi", () => {
		map.getCanvas().style.cursor = ""
	})
}

export function showModelAnnotations(map, visible) {
	for (const id of [...ANNOTATION_LAYERS, ...POI_LAYERS]) {
		map.setLayoutProperty(id, "visibility", visible ? "visible" : "none")
	}
}
