import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter"
import { EB_Garamond } from "next/font/google"
import Providers from "./providers"
import "./globals.css"

// Antiqua für die antiken Texte, wird beim Build eingebettet
const serif = EB_Garamond({
	subsets: ["latin", "greek"],
	style: ["normal", "italic"],
	variable: "--font-serif",
})

export const metadata = {
	title: "Römerlager Westfalen",
	description:
		"Bekannte Römerlager in Westfalen auf einer Karte und eine Potenzialkarte für noch unentdeckte Marschlager.",
	authors: [{ name: "Tim Krämer" }],
	creator: "Tim Krämer",
}

export default function RootLayout({ children }) {
	return (
		<html lang="de" className={serif.variable}>
			<body>
				<AppRouterCacheProvider>
					<Providers>{children}</Providers>
				</AppRouterCacheProvider>
			</body>
		</html>
	)
}
