import { useMapStore } from "@/store/use-map-store"

// Auf dem Handy liegt die Bedienung als Sheet am unteren Rand über der Karte.
// Hier stehen seine Maße und welche Kartenfläche es gerade verdeckt.

export const DESKTOP_QUERY = "(min-width: 900px)"
export const isMobile = () => window.innerWidth < 900

/** Eingeklappt: Griff und Reiterleiste. */
export const SHEET_PEEK = 82
/** Oben bleibt die Suchleiste frei. */
export const SHEET_TOP = 72
/** Höhe von Suchleiste samt Rand, verdeckt die Karte oben. */
export const SEARCH_INSET = 64
/** Ab hier blendet die Karte ihre Bedienelemente aus. */
export const SHEET_TALL = 0.6

const safe = {}
if (typeof window !== "undefined") {
	// Beim Drehen ändern sich die Abstände
	window.addEventListener("resize", () => {
		for (const k of Object.keys(safe)) delete safe[k]
	})
}

/** Sicherheitsabstand für Notch oder Home-Leiste in Pixeln. */
export function safeInset(side) {
	if (safe[side] !== undefined) return safe[side]
	const probe = document.createElement("div")
	probe.style.cssText = `position:fixed;visibility:hidden;padding-${side}:env(safe-area-inset-${side})`
	document.body.appendChild(probe)
	safe[side] =
		Number.parseFloat(
			getComputedStyle(probe).getPropertyValue(`padding-${side}`),
		) || 0
	probe.remove()
	return safe[side]
}

export function sheetBounds(vh = window.innerHeight) {
	const min = SHEET_PEEK + safeInset("bottom")
	return { min, max: Math.max(min, vh - SHEET_TOP - safeInset("top")) }
}

/** Sichtbare Höhe in Pixeln, `frac` ist der Anteil an der Fensterhöhe. */
export function sheetHeight(open, frac, vh = window.innerHeight) {
	const { min, max } = sheetBounds(vh)
	if (!open) return min
	return Math.min(max, Math.max(min, Math.round(frac * vh)))
}

/**
 * Von Suchleiste, Sheet und Zeitleiste der Texte verdeckte Ränder der
 * Karte, am Desktop null.
 */
export function mapInsets() {
	if (!isMobile()) return { top: 0, bottom: 0 }
	const s = useMapStore.getState()
	return {
		top: SEARCH_INSET + safeInset("top"),
		bottom: sheetHeight(s.panelOpen, s.sheetFrac) + s.timelineInset.bottom,
	}
}

/** Versatz für flyTo/easeTo, damit das Ziel mittig im freien Teil liegt. */
export function centerOffset() {
	const { top, bottom } = mapInsets()
	return [0, (top - bottom) / 2]
}
