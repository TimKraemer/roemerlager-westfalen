import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter"
import Providers from "./providers"
import "./globals.css"

export const metadata = {
	title: "Römerlager Westfalen",
	description:
		"Bekannte Römerlager in Westfalen auf einer Karte und eine Potenzialkarte für noch unentdeckte Marschlager.",
}

export default function RootLayout({ children }) {
	return (
		<html lang="de">
			<body>
				<AppRouterCacheProvider>
					<Providers>{children}</Providers>
				</AppRouterCacheProvider>
			</body>
		</html>
	)
}
