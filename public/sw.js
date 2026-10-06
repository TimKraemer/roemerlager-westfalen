/**
 * Service Worker für schnelleres Laden bei wiederholten Besuchen.
 *
 * Kacheln fremder Dienste: Viele amtliche WMS (NRW, LGLN) schicken keine
 * oder "no-cache"-Header, der Browser lädt sie sonst bei jedem Besuch neu.
 * Hier bleiben sie TILE_DAYS Tage im Cache und werden ohne Anfrage
 * ausgeliefert. Danach geht es ans Netz, bei Fehlern gilt die alte Kachel.
 *
 * Eigene Dateien mit Prüfsumme (?v=, siehe assetUrl in src/config.js)
 * und die gehashten Next-Chunks ändern sich nie, sie kommen direkt aus dem
 * Cache. HTML und alles andere geht unverändert ans Netz.
 *
 * Abschalten: diese Datei durch eine ersetzen, die nur
 * self.registration.unregister() aufruft, und neu ausliefern.
 */

const VERSION = 2
const TILES = `tiles-v${VERSION}`
const ASSETS = `assets-v${VERSION}`
const TILE_DAYS = 14
const MAX_TILES = 3000
const MAX_ASSETS = 400
const STAMP = "x-sw-cached-at"

self.addEventListener("install", () => self.skipWaiting())

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			for (const name of await caches.keys()) {
				if (name !== TILES && name !== ASSETS) await caches.delete(name)
			}
			await self.clients.claim()
		})(),
	)
})

// XYZ- und WMTS-Kacheln (…/z/x/y[.ext]), WMS-GetMap, Glyphen (…/0-255)
const TILE_PATH = /\/\d+\/\d+\/\d+(\.\w+)?$/
const GLYPH_PATH = /\/\d+-\d+(\.pbf)?$/

function kindOf(url) {
	if (url.origin === self.location.origin) {
		// Altkarten zuerst, sie tragen auch ein ?v=, gehören aber zu den
		// vielen Kacheln und nicht zu den wenigen Dateien der App
		if (url.pathname.includes("/altkarten/") && TILE_PATH.test(url.pathname))
			return "tile"
		if (url.pathname.includes("/_next/static/")) return "asset"
		if (url.searchParams.has("v")) return "asset"
		return null
	}
	if (/request=getmap/i.test(url.search)) return "tile"
	if (TILE_PATH.test(url.pathname) || GLYPH_PATH.test(url.pathname))
		return "tile"
	return null
}

self.addEventListener("fetch", (event) => {
	const { request } = event
	if (request.method !== "GET" || request.mode === "navigate") return
	if (request.headers.has("range")) return
	let url
	try {
		url = new URL(request.url)
	} catch {
		return
	}
	const kind = kindOf(url)
	if (kind === "asset") event.respondWith(cacheFirst(event, ASSETS))
	else if (kind === "tile") event.respondWith(tile(event))
})

// Speichern läuft nach der Antwort weiter, waitUntil hält den Worker so lange wach
async function cacheFirst(event, name) {
	const { request } = event
	const cache = await caches.open(name)
	const hit = await cache.match(request)
	if (hit) return hit
	const res = await fetch(request)
	if (res.ok) event.waitUntil(store(name, cache, request, res.clone()))
	return res
}

async function tile(event) {
	const { request } = event
	const cache = await caches.open(TILES)
	const hit = await cache.match(request)
	const age = hit ? Date.now() - Number(hit.headers.get(STAMP) ?? 0) : 0
	// Eigene Kacheln mit Prüfsumme veralten nie
	const versioned = new URL(request.url).searchParams.has("v")
	if (hit && (versioned || age < TILE_DAYS * 864e5)) return hit
	try {
		const res = await fetch(request)
		// Leere Antworten (204) und Fehler nicht aufheben
		if (res.ok && res.status === 200)
			event.waitUntil(store(TILES, cache, request, res.clone()))
		else if (hit && res.status >= 500) return hit
		return res
	} catch (error) {
		if (hit) return hit
		throw error
	}
}

// Einträge je Cache, geprüft wird alle 100 Schreibvorgänge
const MAX = { [TILES]: MAX_TILES, [ASSETS]: MAX_ASSETS }
const writes = {}

async function store(name, cache, request, res) {
	try {
		const headers = new Headers(res.headers)
		headers.set(STAMP, String(Date.now()))
		const body = await res.blob()
		await cache.put(
			request,
			new Response(body, {
				status: res.status,
				statusText: res.statusText,
				headers,
			}),
		)
		// Ältere Fassungen derselben App-Datei (anderes ?v=) entfernen
		if (name === ASSETS) {
			const url = new URL(request.url)
			if (url.searchParams.has("v")) {
				for (const key of await cache.keys()) {
					const k = new URL(key.url)
					if (k.pathname === url.pathname && k.search !== url.search)
						await cache.delete(key)
				}
			}
		}
		writes[name] = (writes[name] ?? 0) + 1
		if (writes[name] % 100 === 0) await trim(cache, MAX[name])
	} catch {
		// Speicher voll o. ä.: dann eben ohne Cache
	}
}

/** Älteste Einträge löschen, bis höchstens max übrig sind. */
async function trim(cache, max) {
	const keys = await cache.keys()
	for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i])
}
