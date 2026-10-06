"use client"

import { Box, Link, Typography } from "@mui/material"
import { useMemo } from "react"
import { CITATION, projectCsl } from "@/lib/citation"
import { CitationView } from "./cite-dialog"

export default function CitationBox() {
	const items = useMemo(() => [projectCsl()], [])
	return (
		<Box sx={{ mt: 1 }}>
			<CitationView items={items} base="roemerlager-westfalen" dense />
			<Typography variant="caption" color="text.secondary" component="p">
				Code, Modell und Texte sind unter Anleitung von {CITATION.author} mit KI
				(Claude, Anthropic) entstanden und nicht durchgehend fachlich geprüft.
				Quelltext, Daten und Hinweise zur Entstehung:{" "}
				<Link href={CITATION.repository} target="_blank" rel="noopener">
					GitHub
				</Link>
				. Fehler bitte dort melden.
			</Typography>
		</Box>
	)
}
