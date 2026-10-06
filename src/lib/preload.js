import { assetUrl } from "@/config"
import { DEFAULT_REGION, NETWORK } from "@/lib/regions"

/**
 * Daten unter public/ einmal abrufen und das Versprechen aufheben. So
 * kann der Abruf früh beginnen (im HTML-Kopf, siehe src/app/layout.jsx),
 * und wer die Daten später braucht, bekommt dieselbe Antwort. Liefert
 * null, wenn die Datei fehlt.
 */
const pending = new Map()

export function loadAsset(file, as = "json") {
	if (!pending.has(file)) {
		// Schon im HTML-Kopf gestartet (src/app/layout.jsx)?
		const early = typeof window !== "undefined" && window.__early?.[file]
		pending.set(
			file,
			early ||
				fetch(assetUrl(file))
					.then((r) => (r.ok ? r[as]() : null))
					.catch(() => null),
		)
	}
	return pending.get(file)
}

/** Was die Karte für das erste Bild braucht: Potenzialkarte und Netz. */
export const STARTUP_FILES = [
	[`${DEFAULT_REGION.file}.json`, "json"],
	[`${DEFAULT_REGION.file}.bin`, "arrayBuffer"],
	[`${NETWORK.file}.json`, "json"],
]

export function preloadStartupData() {
	for (const [file, as] of STARTUP_FILES) loadAsset(file, as)
}

/** Laserscan-Fenster und gerade Strukturen, erst bei Bedarf. */
export const loadLineaments = () => loadAsset("precomputed/lineaments.json")
