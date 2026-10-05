"use client"

import dynamic from "next/dynamic"

// Karte und Bedienung hängen an Fenstergröße und WebGL, deshalb nur im
// Browser rendern (kein statisches Vorrendern, keine Hydration-Abweichung)
const AppShell = dynamic(() => import("./app-shell"), { ssr: false })

export default function ClientApp() {
	return <AppShell />
}
