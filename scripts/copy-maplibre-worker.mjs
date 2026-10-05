/**
 * MapLibre-Worker als statische Datei unter public/maplibre, weil Turbopack
 * den per `new URL(…, import.meta.url)` geladenen Worker nicht ausliefert
 * (wie in erleben.app scripts/map-styles/copy-maplibre-worker.mjs).
 * map-view.jsx setzt `setWorkerUrl(…)`. Läuft als postinstall.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const SRC = join(ROOT, "node_modules", "maplibre-gl", "dist")
const OUT = join(ROOT, "public", "maplibre")
mkdirSync(OUT, { recursive: true })
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
	copyFileSync(join(SRC, file), join(OUT, file))
}
const { version } = JSON.parse(
	readFileSync(
		join(ROOT, "node_modules", "maplibre-gl", "package.json"),
		"utf8",
	),
)
writeFileSync(
	join(ROOT, "src", "lib", "maplibre-version.json"),
	`${JSON.stringify({ version })}\n`,
)
