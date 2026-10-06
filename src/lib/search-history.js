/**
 * Suchverlauf: die zuletzt gewählten Treffer, nur in diesem Browser.
 * Gespeichert wird, was zum erneuten Anspringen nötig ist. Flüsse und
 * Straßen holen ihre Geometrie beim Wählen wieder aus dem Suchindex.
 */

const KEY = "roemerlager:suchverlauf"
const MAX = 8

// Große oder abgeleitete Felder bleiben draußen
const SKIP = new Set([
	"fields",
	"geometry",
	"bounds",
	"score",
	"tokens",
	"snippet",
	"fuzzy",
	"fix",
])

export function loadHistory() {
	try {
		const list = JSON.parse(localStorage.getItem(KEY) ?? "[]")
		return Array.isArray(list) ? list.filter((h) => h?.key && h.label) : []
	} catch {
		return []
	}
}

function save(list) {
	try {
		localStorage.setItem(KEY, JSON.stringify(list))
	} catch {
		// privates Fenster o. ä.
	}
	return list
}

/** Treffer vorn einreihen, ältere Einträge desselben Treffers entfallen. */
export function addToHistory(option) {
	const item = Object.fromEntries(
		Object.entries(option).filter(([k]) => !SKIP.has(k)),
	)
	return save(
		[item, ...loadHistory().filter((h) => h.key !== item.key)].slice(0, MAX),
	)
}

export function removeFromHistory(key) {
	return save(loadHistory().filter((h) => h.key !== key))
}

export function clearHistory() {
	return save([])
}
