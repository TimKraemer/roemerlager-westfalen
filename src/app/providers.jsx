"use client"

import { CssBaseline, createTheme, ThemeProvider } from "@mui/material"

const theme = createTheme({
	palette: {
		primary: { main: "#8d2a1e" },
		secondary: { main: "#6a1b9a" },
		background: { default: "#f6f3ee" },
	},
	shape: { borderRadius: 8 },
	typography: {
		fontFamily:
			'var(--font-sans), system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
	},
})

export default function Providers({ children }) {
	return (
		<ThemeProvider theme={theme}>
			<CssBaseline />
			{children}
		</ThemeProvider>
	)
}
