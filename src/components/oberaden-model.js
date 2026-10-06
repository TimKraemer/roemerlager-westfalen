import * as maplibregl from "maplibre-gl"

/**
 * 3D-Rekonstruktion des Mehrlegionenlagers Oberaden aus der Bergkamen-App
 * (erleben.app, Modell „Römerlager Grundriss“), als three.js-Layer auf der
 * Karte. three.js lädt erst, wenn das Modell zum ersten Mal sichtbar wird.
 *
 * Lage und Ausrichtung sind an den vier Toren eingepasst: Nordtor aus OSM,
 * Infotafeln des Lehrpfads an West- und Osttor, Südtor an der Straße
 * „Südwall“. Ähnlichkeitstransformation, Restabweichung 14–27 m je Tor.
 * Im Modell zeigt +x nach Westen, +z nach Norden, +y nach oben.
 */

export const MODEL_LAYER = "oberaden-3d"
// Erst nah heran, damit die Übersichtskarte frei bleibt
export const MODEL_MIN_ZOOM = 15

const URL_GLB = `${process.env.NEXT_PUBLIC_BASE_PATH}/models/oberaden.glb`
const URL_DRACO = `${process.env.NEXT_PUBLIC_BASE_PATH}/draco/`

// Modellursprung, Meter je Modelleinheit, Drehung gegen den Uhrzeigersinn
const ORIGIN = [7.581915, 51.611213]
const METERS_PER_UNIT = 389.9
const ROTATION = (-2.24 * Math.PI) / 180
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
	const [{ GLTFLoader }, { DRACOLoader }, { RoomEnvironment }] =
		await Promise.all([
			import("three/examples/jsm/loaders/GLTFLoader.js"),
			import("three/examples/jsm/loaders/DRACOLoader.js"),
			import("three/examples/jsm/environments/RoomEnvironment.js"),
		])
	const draco = new DRACOLoader().setDecoderPath(URL_DRACO)
	const loader = new GLTFLoader().setDRACOLoader(draco)
	const gltf = await loader.loadAsync(URL_GLB)
	draco.dispose()
	return { model: gltf.scene, room: new RoomEnvironment() }
}

/** Custom Layer für maplibre, rendert in den GL-Kontext der Karte. */
export function oberadenModelLayer() {
	let THREE
	let map
	let renderer
	let scene
	let camera
	let matrix
	let room
	let removed = false
	return {
		id: MODEL_LAYER,
		type: "custom",
		renderingMode: "3d",
		async onAdd(m) {
			map = m
			THREE = await import("three")
			const loaded = await loadModel()
			// Während des Ladens wieder ausgeschaltet
			if (removed) return
			room = loaded.room
			camera = new THREE.Camera()
			scene = new THREE.Scene()
			const sun = new THREE.DirectionalLight(0xffffff, 1)
			// Sonne aus Südwest, im Modell also +x (West) und -z (Süd)
			sun.position.set(0.8, 1.2, -0.6)
			scene.add(sun)
			matrix = modelToMercator(THREE)
			scene.add(loaded.model)
			map.triggerRepaint()
		},
		// Renderer und Umgebungslicht (wie im model-viewer der App) erst hier
		// anlegen: three.js verstellt dabei den GL-Zustand, und nur nach
		// prerender/render setzt maplibre ihn wieder zurück
		prerender(gl) {
			if (!room || removed) return
			renderer = new THREE.WebGLRenderer({
				canvas: map.getCanvas(),
				context: gl,
				antialias: true,
			})
			renderer.autoClear = false
			renderer.toneMapping = THREE.NeutralToneMapping
			const pmrem = new THREE.PMREMGenerator(renderer)
			scene.environment = pmrem.fromScene(room, 0.04).texture
			pmrem.dispose()
			room = null
		},
		render(_gl, args) {
			if (!renderer || map.getZoom() < MODEL_MIN_ZOOM) return
			const view = new THREE.Matrix4().fromArray(
				args.defaultProjectionData.mainMatrix,
			)
			camera.projectionMatrix = view.multiply(matrix)
			renderer.resetState()
			renderer.render(scene, camera)
		},
		onRemove() {
			removed = true
			renderer?.dispose()
			renderer = null
		},
	}
}
