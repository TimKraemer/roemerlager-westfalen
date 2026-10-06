import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter"
import { EB_Garamond, Source_Sans_3 } from "next/font/google"
import { preconnect } from "react-dom"
import { assetUrl, TILES } from "@/config"
import { STARTUP_FILES } from "@/lib/preload"
import Providers from "./providers"
import "./globals.css"

// Antiqua für die antiken Texte, wird beim Build eingebettet
const serif = EB_Garamond({
	subsets: ["latin", "greek"],
	style: ["normal", "italic"],
	variable: "--font-serif",
})

// Serifenlose für Oberfläche und Sprechblasen. system-ui löst nicht überall
// auf eine Proportionalschrift auf (in manchen Linux-Browsern Monospace).
const sans = Source_Sans_3({
	subsets: ["latin"],
	variable: "--font-sans",
})

export const metadata = {
	title: "Römerlager Westfalen",
	description:
		"Bekannte Römerlager in Westfalen auf einer Karte und eine Potenzialkarte für noch unentdeckte Marschlager.",
	authors: [{ name: "Tim Krämer" }],
	creator: "Tim Krämer",
}

// viewportFit: Inhalt bis unter Notch und Home-Leiste, die Abstände
// kommen aus env(safe-area-inset-*)
export const viewport = {
	width: "device-width",
	initialScale: 1,
	viewportFit: "cover",
	themeColor: "#8d2a1e",
}

// Dienste, von denen die Startansicht Kacheln holt (Höhenmodell und
// Schriften, Sentinel-2, Luftbilder NRW und Niedersachsen, Schummerung NRW).
// Verbindungen schon beim Lesen des HTML aufbauen spart je Dienst DNS und
// TLS, bevor MapLibre überhaupt startet.
const TILE_ORIGINS = [
	...new Set(
		[
			TILES.dem,
			TILES.glyphs,
			"https://tiles.maps.eox.at",
			"https://www.wmts.nrw.de",
			"https://www.wms.nrw.de",
			"https://opendata.lgln.niedersachsen.de",
		].map((u) => new URL(u.replace(/[{}]/g, "")).origin),
	),
]

// Potenzialkarte und Netz abrufen, sobald der Browser den Kopf liest, nicht
// erst wenn die Skripte da sind. loadAsset (src/lib/preload.js) übernimmt
// die Antworten. <link rel=preload> taugt dafür nicht: Steuert der Service
// Worker die Seite, verwirft Chrome die Vorab-Antwort und lädt doppelt.
const EARLY_FETCH = `window.__early={};${JSON.stringify(
	STARTUP_FILES.map(([file, as]) => [file, assetUrl(file), as]),
)}.forEach(function(e){window.__early[e[0]]=fetch(e[1],{priority:"low"}).then(function(r){return r.ok?r[e[2]]():null}).catch(function(){return null})})`

export default function RootLayout({ children }) {
	for (const origin of TILE_ORIGINS)
		preconnect(origin, { crossOrigin: "anonymous" })
	return (
		<html lang="de" className={`${serif.variable} ${sans.variable}`}>
			<head>
				<script dangerouslySetInnerHTML={{ __html: EARLY_FETCH }} />
			</head>
			<body>
				<AppRouterCacheProvider>
					<Providers>{children}</Providers>
				</AppRouterCacheProvider>
			</body>
		</html>
	)
}
