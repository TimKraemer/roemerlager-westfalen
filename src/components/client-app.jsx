"use client"

import dynamic from "next/dynamic"
import { BASE_PATH } from "@/config"
import { preloadStartupData } from "@/lib/preload"

if (typeof window !== "undefined") {
	// Daten und Kartenmodul gleich mit dem ersten Skript anfordern, nicht
	// erst nacheinander, wenn App, Karte und Effekte so weit sind
	preloadStartupData()
	import("./map-view")
	// Kachel-Cache (public/sw.js), nicht im Entwicklungsserver
	if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
		navigator.serviceWorker
			.register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` })
			.catch(() => {})
	}
}

// Karte und Bedienung hängen an Fenstergröße und WebGL, deshalb nur im
// Browser rendern (kein statisches Vorrendern, keine Hydration-Abweichung)
const AppShell = dynamic(() => import("./app-shell"), { ssr: false })

export default function ClientApp() {
	return <AppShell />
}
