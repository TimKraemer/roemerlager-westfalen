"use client"

import CloseIcon from "@mui/icons-material/Close"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import MapIcon from "@mui/icons-material/MapOutlined"
import OpenInNewIcon from "@mui/icons-material/OpenInNew"
import {
	Box,
	ButtonBase,
	Chip,
	Collapse,
	Link,
	Typography,
	useMediaQuery,
} from "@mui/material"
import { useState } from "react"
import texts from "@/data/texte.json"
import { hasTextGeo } from "@/lib/text-geo"
import { useMapStore } from "@/store/use-map-store"

const SERIF = "var(--font-serif), Georgia, 'Times New Roman', serif"
const PURPLE = "#6a1b9a"
const TINT = "#f5eef9"

const GROUPS = [
	{
		id: "feldzug",
		title: "Die Feldzüge",
		intro:
			"Berichte über die Kriegszüge an Lippe, Ems und Weser von 12 v. Chr. bis 16 n. Chr., geordnet nach dem Jahr des Geschehens.",
		accent: "#8d2a1e",
	},
	{
		id: "regel",
		title: "Lagerbau und Marsch",
		intro:
			"Regeln aus römischen Militärhandbüchern, geordnet nach ihrer Entstehung. Sie nennen keine Orte, liefern aber die Kriterien des Modells.",
		accent: "#5d6b2f",
	},
	{
		id: "forschung",
		title: "Neuere Thesen",
		intro:
			"Was Archäologie und Lokalpresse seit 2009 über Varus an Weser und Wiehengebirge sagen, sinngemäß zusammengefasst und nach Erscheinen geordnet. Vieles davon ist Vermutung.",
		accent: "#1f5f7a",
	},
]

const citation = (t) => `${t.author}, ${t.work} ${t.passage}`

// „12–9 v. Chr.“ -> ["12–9", "v. Chr."]
function splitYear(year) {
	const m = year.match(/^(.*?)\s*((?:v|n)\. Chr\.)$/)
	return m ? [m[1], m[2]] : [year, ""]
}

/** Antike Texte und neuere Thesen über Lager und Feldzüge als Zeitleiste. */
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
		<Box sx={{ pt: 1.5 }}>
			<Typography variant="body2" color="text.secondary">
				Was römische Autoren über Lager, Wege und Feldzüge schreiben, im
				Original und in eigener Übersetzung (2026). Dazu kommen neuere Thesen
				aus Archäologie und Presse in eigenen Worten. Texte mit{" "}
				<MapIcon sx={{ fontSize: 15, verticalAlign: "-3px", color: PURPLE }} />{" "}
				zeigen beim Anklicken ihre Orte und Richtungen auf der Karte.
				Gestrichelt ist, was der Text offenlässt.
			</Typography>
			{GROUPS.map((g) => (
				<Box key={g.id} component="section" sx={{ mt: 3 }}>
					<Typography
						variant="h6"
						sx={{ fontFamily: SERIF, fontSize: 21, lineHeight: 1.2 }}
					>
						{g.title}
					</Typography>
					<Typography
						variant="caption"
						color="text.secondary"
						component="p"
						sx={{ mt: 0.5, mb: 1.5 }}
					>
						{g.intro}
					</Typography>
					<Timeline
						items={texts.filter((t) => t.group === g.id)}
						accent={g.accent}
						selected={selected}
						onToggle={toggle}
					/>
				</Box>
			))}
		</Box>
	)
}

function Timeline({ items, accent, selected, onToggle }) {
	return (
		<Box sx={{ position: "relative" }}>
			{/* Zeitstrahl */}
			<Box
				sx={{
					position: "absolute",
					left: 23,
					top: 8,
					bottom: 8,
					width: 2,
					bgcolor: `${accent}33`,
					borderRadius: 1,
				}}
			/>
			{items.map((t, i) => {
				const showYear = i === 0 || items[i - 1].year !== t.year
				return (
					<Box key={t.id} sx={{ display: "flex", gap: 1, mb: 1.5 }}>
						<YearMark year={t.year} show={showYear} accent={accent} />
						<TextCard t={t} active={selected === t.id} onToggle={onToggle} />
					</Box>
				)
			})}
		</Box>
	)
}

function YearMark({ year, show, accent }) {
	const [main, era] = splitYear(year)
	return (
		<Box
			sx={{
				width: 48,
				flexShrink: 0,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				pt: 1.25,
				position: "relative",
				zIndex: 1,
			}}
		>
			<Box
				sx={{
					width: show ? 12 : 8,
					height: show ? 12 : 8,
					borderRadius: "50%",
					bgcolor: show ? accent : "background.paper",
					border: 2,
					borderColor: accent,
					boxShadow: "0 0 0 3px #fff",
				}}
			/>
			{show && (
				<Box
					sx={{
						mt: 0.5,
						px: 0.5,
						bgcolor: "background.paper",
						textAlign: "center",
						lineHeight: 1.1,
					}}
				>
					<Typography
						component="div"
						sx={{
							fontFamily: SERIF,
							fontWeight: 600,
							fontSize: main.length > 6 ? 12 : 15,
							color: accent,
							lineHeight: 1.1,
						}}
					>
						{main}
					</Typography>
					{era && (
						<Typography
							component="div"
							sx={{ fontSize: 9.5, color: "text.secondary", lineHeight: 1.2 }}
						>
							{era}
						</Typography>
					)}
				</Box>
			)}
		</Box>
	)
}

function TextCard({ t, active, onToggle }) {
	const geo = hasTextGeo(t.id)
	const [original, setOriginal] = useState(false)
	const greek = t.language === "griechisch"
	const activate = geo ? () => onToggle(t.id) : undefined
	return (
		<Box
			id={`text-${t.id}`}
			onClick={activate}
			onKeyDown={
				geo
					? (e) => {
							if (e.target !== e.currentTarget) return
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault()
								onToggle(t.id)
							}
						}
					: undefined
			}
			role={geo ? "button" : undefined}
			tabIndex={geo ? 0 : undefined}
			aria-pressed={geo ? active : undefined}
			sx={{
				flex: 1,
				minWidth: 0,
				p: 1.5,
				borderRadius: 3,
				bgcolor: active ? TINT : "background.paper",
				border: 1.5,
				borderColor: active ? PURPLE : "divider",
				boxShadow: active
					? "0 6px 20px rgba(106,27,154,0.18)"
					: "0 1px 2px rgba(0,0,0,0.04)",
				cursor: geo ? "pointer" : "default",
				transition:
					"box-shadow 200ms, border-color 200ms, background-color 200ms, transform 200ms",
				"&:hover": geo
					? {
							boxShadow: active
								? "0 6px 20px rgba(106,27,154,0.22)"
								: "0 4px 14px rgba(0,0,0,0.10)",
							transform: "translateY(-1px)",
						}
					: {},
				"&:focus-visible": { outline: `2px solid ${PURPLE}`, outlineOffset: 2 },
			}}
		>
			<Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Typography
						variant="overline"
						color="text.secondary"
						sx={{ display: "block", lineHeight: 1.4, letterSpacing: 0.8 }}
					>
						{citation(t)}
					</Typography>
					<Typography
						component="h3"
						sx={{
							fontFamily: SERIF,
							fontWeight: 600,
							fontSize: 18,
							lineHeight: 1.2,
							mt: 0.25,
						}}
					>
						{t.title}
					</Typography>
				</Box>
				{geo && (
					<Chip
						size="small"
						icon={<MapIcon />}
						label={active ? "gezeigt" : "Karte"}
						variant={active ? "filled" : "outlined"}
						sx={{
							flexShrink: 0,
							height: 24,
							fontSize: 11,
							color: active ? "#fff" : PURPLE,
							bgcolor: active ? PURPLE : "transparent",
							borderColor: `${PURPLE}66`,
							"& .MuiChip-icon": {
								color: active ? "#fff" : PURPLE,
								fontSize: 15,
							},
							pointerEvents: "none",
						}}
					/>
				)}
			</Box>

			<Typography
				sx={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.5, mt: 1 }}
			>
				{t.german}
			</Typography>

			{t.latin && (
				<>
					<ButtonBase
						onClick={(e) => {
							e.stopPropagation()
							setOriginal(!original)
						}}
						aria-expanded={original}
						sx={{
							mt: 1,
							px: 1,
							py: 0.25,
							borderRadius: 1,
							fontSize: 12,
							fontWeight: 600,
							color: "text.secondary",
							"&:hover": { bgcolor: "action.hover" },
						}}
					>
						{greek ? "Griechischer" : "Lateinischer"} Wortlaut
						<ExpandMoreIcon
							sx={{
								fontSize: 18,
								ml: 0.25,
								transition: "transform 200ms",
								transform: original ? "rotate(180deg)" : "none",
							}}
						/>
					</ButtonBase>
					<Collapse in={original}>
						<Box
							sx={{
								position: "relative",
								mt: 0.75,
								pl: 3,
								pr: 1,
								py: 1,
								borderRadius: 2,
								bgcolor: "#faf7f2",
							}}
						>
							<Box
								aria-hidden
								sx={{
									position: "absolute",
									left: 6,
									top: -4,
									fontFamily: SERIF,
									fontSize: 40,
									lineHeight: 1,
									color: "#c9b79c",
								}}
							>
								“
							</Box>
							<Typography
								lang={greek ? "grc" : "la"}
								sx={{
									fontFamily: SERIF,
									fontStyle: "italic",
									fontSize: 15.5,
									lineHeight: 1.5,
									color: "#4a3b2a",
								}}
							>
								{t.latin}
							</Typography>
						</Box>
					</Collapse>
				</>
			)}

			<Box
				sx={{
					mt: 1.25,
					p: 1.25,
					borderRadius: 2,
					bgcolor: active ? "#fff" : TINT,
					borderLeft: 3,
					borderColor: PURPLE,
				}}
			>
				<Typography
					sx={{
						fontSize: 10,
						fontWeight: 700,
						letterSpacing: 0.8,
						textTransform: "uppercase",
						color: PURPLE,
					}}
				>
					Für die Karte
				</Typography>
				<Typography variant="body2" sx={{ mt: 0.25, lineHeight: 1.45 }}>
					{t.map}
				</Typography>
			</Box>

			<Typography
				variant="caption"
				color="text.secondary"
				component="div"
				sx={{ mt: 1, display: "flex", flexWrap: "wrap", gap: 0.5 }}
			>
				{t.dated ??
					(t.written ? `Geschrieben ${t.written}.` : `Entstanden ${t.year}.`)}
				{!geo && " Ohne Ortsangabe."}
				<Link
					href={t.url}
					target="_blank"
					rel="noreferrer"
					onClick={(e) => e.stopPropagation()}
					sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}
				>
					{t.summary ? "Zum Artikel" : "Volltext"}
					<OpenInNewIcon sx={{ fontSize: 12 }} />
				</Link>
			</Typography>
			{t.note && (
				<Typography
					variant="caption"
					color="text.disabled"
					component="div"
					sx={{ mt: 0.25, lineHeight: 1.35 }}
				>
					{t.note}
				</Typography>
			)}
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
		<Box
			key={t.id}
			sx={{
				position: "absolute",
				// Handy: unter der Suchleiste, sonst mittig im Platz rechts davon
				top: { xs: "calc(64px + env(safe-area-inset-top))", md: 16 },
				left: { xs: "50%", md: "calc(50% + 186px)" },
				transform: "translateX(-50%)",
				zIndex: 2,
				maxWidth: { xs: "calc(100% - 24px)", md: "calc(100% - 420px)" },
				display: "flex",
				alignItems: "center",
				gap: 1,
				pl: 1.75,
				pr: 0.5,
				py: 0.5,
				borderRadius: 999,
				color: "#fff",
				bgcolor: "rgba(74, 20, 108, 0.92)",
				backdropFilter: "blur(6px)",
				boxShadow: "0 8px 24px rgba(40,10,60,0.3)",
				animation: "tg-chip 400ms cubic-bezier(0.2,0.9,0.3,1.2) both",
				"@keyframes tg-chip": {
					from: { opacity: 0, transform: "translate(-50%, -12px)" },
					to: { opacity: 1, transform: "translate(-50%, 0)" },
				},
			}}
		>
			<MapIcon sx={{ fontSize: 18, opacity: 0.85 }} />
			<Box sx={{ minWidth: 0 }}>
				<Typography
					noWrap
					sx={{
						fontFamily: SERIF,
						fontSize: 15,
						fontWeight: 600,
						lineHeight: 1.2,
					}}
				>
					{t.title}
				</Typography>
				<Typography
					noWrap
					sx={{ fontSize: 10.5, opacity: 0.8, lineHeight: 1.2 }}
				>
					{citation(t)}, {t.year}
				</Typography>
			</Box>
			<ButtonBase
				onClick={() => select(null)}
				aria-label="Textstelle ausblenden"
				sx={{
					width: 30,
					height: 30,
					borderRadius: "50%",
					flexShrink: 0,
					"&:hover": { bgcolor: "rgba(255,255,255,0.15)" },
				}}
			>
				<CloseIcon sx={{ fontSize: 18 }} />
			</ButtonBase>
		</Box>
	)
}
