/**
 * Prüfung der Linienerkennung: Fenster an allen bestätigten Lagern in NRW
 * und an zufälligen Kontrollorten. Ergebnis als Tabelle und Vorschaubilder
 * (public/precomputed/lineaments-validation.json, /tmp/lin-*.png).
 *
 *   bun scripts/validate-lineaments.mjs
 */
import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { SITES } from "../src/lib/sites.js"
import { analyzeWindows } from "./lineaments.mjs"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const PREVIEW_DIR = process.env.PREVIEW_DIR ?? "/tmp"

const camps = SITES.features
	.filter(
		(f) =>
			["marschlager", "legionslager", "kastell"].includes(f.properties.type) &&
			f.properties.status === "bestätigt",
	)
	.map((f) => ({
		id: f.properties.id,
		kind: "bestätigt",
		label: f.properties.name,
		lon: f.geometry.coordinates[0],
		lat: f.geometry.coordinates[1],
	}))

// Kontrollorte: feste Zufallsfolge im westfälischen Flachland und Hügelland
let seed = 42
const rand = () => {
	seed = (seed * 16807) % 2147483647
	return seed / 2147483647
}
const controls = Array.from({ length: 10 }, (_, i) => ({
	id: `kontrolle-${i + 1}`,
	kind: "Kontrolle",
	label: `Kontrollort ${i + 1}`,
	lon: Number((7.2 + rand() * 1.8).toFixed(4)),
	lat: Number((51.6 + rand() * 0.8).toFixed(4)),
}))

const { windows, segments } = await analyzeWindows(
	[...camps, ...controls],
	(id, png) => writeFileSync(`${PREVIEW_DIR}/lin-${id}.png`, png),
)
const done = windows.filter((w) => w.status === "untersucht")
const stat = (kind) => {
	const ws = done.filter((w) => w.kind === kind)
	const avg = (k) =>
		(ws.reduce((a, w) => a + w[k], 0) / (ws.length || 1)).toFixed(1)
	return `${kind}: ${ws.length} Fenster, Ø ${avg("segments")} Abschnitte, Ø ${avg("corners")} Ecken, Ø ${avg("length")} m`
}
for (const w of windows) {
	console.log(
		`${w.kind.padEnd(10)} ${w.label.padEnd(45)} ${w.status === "untersucht" ? `${String(w.segments).padStart(3)} Abschn. ${String(w.corners).padStart(2)} Ecken ${String(w.length).padStart(6)} m  Schwelle ${w.threshold}` : w.status}`,
	)
}
console.log(`\n${stat("bestätigt")}\n${stat("Kontrolle")}`)
writeFileSync(
	join(ROOT, "public", "precomputed", "lineaments-validation.json"),
	JSON.stringify({ windows, segments, generatedAt: new Date().toISOString() }),
)
