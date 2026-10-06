"use client"

import CloseIcon from "@mui/icons-material/Close"
import MapIcon from "@mui/icons-material/MapOutlined"
import { Box, Chip, Link, Typography, useMediaQuery } from "@mui/material"
import texts from "@/data/texte.json"
import { hasTextGeo } from "@/lib/text-geo"
import { useMapStore } from "@/store/use-map-store"
import { SectionTitle } from "./layer-panel"

const title = (t) => `${t.author}, ${t.work} ${t.passage}`

/** Antike Texte über Lager und Feldzüge: Original, Übersetzung, Bezug. */
export default function TextsPanel() {
	const selected = useMapStore((s) => s.selectedText)
	const select = useMapStore((s) => s.setSelectedText)
	const setOpen = useMapStore((s) => s.setPanelOpen)
	const desktop = useMediaQuery("(min-width: 900px)", { noSsr: true })

	const toggle = (id) => {
		const next = selected === id ? null : id
		select(next)
		// Auf dem Handy verdeckt die Seitenleiste die Karte
		if (next && !desktop) setOpen(false)
	}

	return (
		<Box>
			<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
				Was römische Autoren über Lager, Wege und die Feldzüge an Lippe und
				Weser schreiben. Lateinischer Wortlaut nach den gemeinfreien Ausgaben
				der Latin Library. Die deutschen Übersetzungen sind für diese Karte neu
				erstellt (2026).
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
				Ein Klick auf eine Textstelle zeigt die genannten Flüsse, Orte und
				Richtungen auf der Karte. Gestrichelt ist, was der Text offenlässt und
				die Forschung erschließt. Flüsse sind im heutigen Verlauf gezeichnet.
			</Typography>
			{texts.map((t) => {
				const geo = hasTextGeo(t.id)
				const active = selected === t.id
				return (
					<Box
						key={t.id}
						onClick={geo ? () => toggle(t.id) : undefined}
						onKeyDown={
							geo
								? (e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault()
											toggle(t.id)
										}
									}
								: undefined
						}
						role={geo ? "button" : undefined}
						tabIndex={geo ? 0 : undefined}
						aria-pressed={geo ? active : undefined}
						sx={{
							mt: 2,
							mx: -1,
							p: 1,
							borderRadius: 1,
							border: 2,
							borderColor: active ? "#6a1b9a" : "transparent",
							cursor: geo ? "pointer" : "default",
							"&:hover": geo && !active ? { bgcolor: "action.hover" } : {},
						}}
					>
						<Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
							<Box sx={{ flex: 1 }}>
								<SectionTitle>{title(t)}</SectionTitle>
							</Box>
							{geo && (
								<MapIcon
									fontSize="small"
									sx={{ color: active ? "#6a1b9a" : "text.disabled" }}
									aria-label="mit Kartenbezug"
								/>
							)}
						</Box>
						<Typography
							variant="caption"
							color="text.secondary"
							component="div"
						>
							Ereignis {t.year}
							{t.language ? `, Original ${t.language}` : ""}
							{geo ? "" : ", ohne Ortsangabe"}
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
							<Link
								href={t.url}
								target="_blank"
								rel="noreferrer"
								onClick={(e) => e.stopPropagation()}
							>
								Volltext
							</Link>
							{t.note && <span>, {t.note}</span>}
						</Typography>
					</Box>
				)
			})}
		</Box>
	)
}

/** Hinweis auf der Karte, welche Textstelle gerade gezeigt wird. */
export function TextChip() {
	const selected = useMapStore((s) => s.selectedText)
	const select = useMapStore((s) => s.setSelectedText)
	const t = texts.find((x) => x.id === selected)
	if (!t) return null
	return (
		<Chip
			icon={<MapIcon />}
			label={title(t)}
			onDelete={() => select(null)}
			deleteIcon={<CloseIcon aria-label="Textstelle ausblenden" />}
			sx={{
				position: "absolute",
				top: 12,
				left: "50%",
				transform: "translateX(-50%)",
				zIndex: 2,
				maxWidth: "calc(100% - 120px)",
				bgcolor: "#6a1b9a",
				color: "#fff",
				boxShadow: 2,
				"& .MuiChip-icon, & .MuiChip-deleteIcon": { color: "#fff" },
				"& .MuiChip-deleteIcon:hover": { color: "#e1bee7" },
			}}
		/>
	)
}
