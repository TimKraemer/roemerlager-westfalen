"use client"

import { Box, Link, Typography } from "@mui/material"
import texts from "@/data/texte.json"
import { SectionTitle } from "./layer-panel"

/** Antike Texte über Lager und Feldzüge: Original, Übersetzung, Bezug. */
export default function TextsPanel() {
	return (
		<Box>
			<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
				Was römische Autoren über Lager, Wege und die Feldzüge an Lippe und
				Weser schreiben. Lateinischer Wortlaut nach den gemeinfreien Ausgaben
				der Latin Library. Die deutschen Übersetzungen sind für diese Karte neu
				erstellt (2026).
			</Typography>
			{texts.map((t) => (
				<Box key={t.id} sx={{ mt: 2.5 }}>
					<SectionTitle>
						{t.author}, {t.work} {t.passage}
					</SectionTitle>
					<Typography variant="caption" color="text.secondary" component="div">
						Ereignis {t.year}
						{t.language ? `, Original ${t.language}` : ""}
					</Typography>
					{t.latin && (
						<Typography
							variant="body2"
							lang="la"
							sx={{
								fontStyle: "italic",
								mt: 0.75,
								pl: 1.25,
								borderLeft: 3,
								borderColor: "primary.light",
							}}
						>
							{t.latin}
						</Typography>
					)}
					<Typography variant="body2" sx={{ mt: 0.75 }}>
						{t.german}
					</Typography>
					<Typography
						variant="body2"
						color="text.secondary"
						sx={{ mt: 0.75, p: 1, bgcolor: "action.hover", borderRadius: 1 }}
					>
						{t.map}
					</Typography>
					<Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
						<Link href={t.url} target="_blank" rel="noreferrer">
							Volltext
						</Link>
						{t.note && <span>, {t.note}</span>}
					</Typography>
				</Box>
			))}
		</Box>
	)
}
