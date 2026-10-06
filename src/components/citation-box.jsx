"use client"

import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import { Box, Button, Link, Typography } from "@mui/material"
import { useState } from "react"
import { CITATION, citationText } from "@/lib/citation"

export default function CitationBox() {
	const [copied, setCopied] = useState(false)
	const text = citationText()
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(text)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			// Zwischenablage gesperrt, der Text bleibt markierbar
		}
	}
	return (
		<Box sx={{ mt: 1, p: 1.5, bgcolor: "action.hover", borderRadius: 1 }}>
			<Typography variant="body2" sx={{ userSelect: "all" }}>
				{text}
			</Typography>
			<Button
				size="small"
				startIcon={<ContentCopyIcon fontSize="small" />}
				onClick={copy}
				sx={{ mt: 0.5, px: 0, textTransform: "none" }}
			>
				{copied ? "Kopiert" : "Zitat kopieren"}
			</Button>
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
