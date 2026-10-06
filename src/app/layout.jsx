import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter"
import { EB_Garamond, Source_Sans_3 } from "next/font/google"
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

export default function RootLayout({ children }) {
	return (
		<html lang="de" className={`${serif.variable} ${sans.variable}`}>
			<body>
				<AppRouterCacheProvider>
					<Providers>{children}</Providers>
				</AppRouterCacheProvider>
			</body>
		</html>
	)
}
