"use client"

import ExpandLessIcon from "@mui/icons-material/ExpandLess"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import TuneIcon from "@mui/icons-material/Tune"
import {
	Box,
	Button,
	IconButton,
	List,
	ListItemButton,
	Paper,
	Skeleton,
	Stack,
	Typography,
} from "@mui/material"
import { useState } from "react"
import { SHORT_CREDIT } from "@/lib/citation"
import { placeLabel } from "@/lib/criteria"
import { rankedCandidates } from "@/lib/potential/candidates"
import { inspectAt } from "@/lib/potential/use-potential"
import { DEFAULT_REGION } from "@/lib/regions"
import { useMapStore } from "@/store/use-map-store"

const level = (score) =>
	score >= 0.85 ? "sehr hoch" : score >= 0.7 ? "hoch" : "mittel"

function Legend() {
	const item = (symbol, text, detail) => (
		<Stack direction="row" spacing={1.25} sx={{ alignItems: "flex-start" }}>
			<Box
				sx={{
					width: 22,
					height: 20,
					flexShrink: 0,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				{symbol}
			</Box>
			<Typography variant="caption" sx={{ lineHeight: "20px" }}>
				{text}
				{detail && (
					<Box
						component="span"
						sx={{ display: "block", lineHeight: 1.35, color: "text.secondary" }}
					>
						{detail}
					</Box>
				)}
			</Typography>
		</Stack>
	)
	const dot = (bg, border, label = "") => (
		<Box
			sx={{
				width: 16,
				height: 16,
				borderRadius: "50%",
				bgcolor: bg,
				border: `2px solid ${border}`,
				fontSize: 9,
				fontWeight: 700,
				lineHeight: "12px",
				textAlign: "center",
				color: border,
			}}
		>
			{label}
		</Box>
	)
	return (
		<Stack spacing={0.75}>
			<Box sx={{ mb: 0.5 }}>
				<Box
					sx={{
						height: 8,
						borderRadius: 1,
						background:
							"linear-gradient(90deg, rgba(255,241,118,0.6), #fb8c00, #b71c1c)",
					}}
				/>
				<Stack direction="row" sx={{ justifyContent: "space-between" }}>
					<Typography variant="caption" color="text.secondary">
						möglich
					</Typography>
					<Typography variant="caption" color="text.secondary">
						sehr wahrscheinlich
					</Typography>
				</Stack>
			</Box>
			{item(dot("#6a1b9a", "#fff"), "Bekanntes Römerlager")}
			{item(dot("#fff", "#d84315", "1"), "Vermuteter Lagerplatz")}
			{item(
				<Box
					sx={{
						width: 22,
						height: 4,
						bgcolor: "#ffca28",
						borderRadius: 1,
						outline: "1px solid #3e2723",
					}}
				/>,
				"Möglicher Marschweg zwischen zwei Lagern",
			)}
			{item(
				<Box sx={{ width: 22, borderTop: "3px dashed #ffca28" }} />,
				"Marschweg nach Kalkriese oder zum vermuteten Lager Löhne",
			)}
			{item(
				<Box sx={{ width: 22, borderTop: "3px dashed #4fc3f7" }} />,
				"Schiffsstrecke auf der Lippe",
			)}
			{item(
				<Box
					sx={{
						width: 22,
						height: 4,
						bgcolor: "#1565c0",
						borderRadius: 1,
						outline: "1px solid #fff",
					}}
				/>,
				"Flusslauf vor der Begradigung",
				"Lippe, Weser und Ems wie um 1840, sonst aus dem Gelände",
			)}
			{item(
				<Box sx={{ width: 22, borderTop: "2px dashed #6a1b9a" }} />,
				"Ein Tagesmarsch (rund 20 km) um ein Marschlager",
			)}
		</Stack>
	)
}

const LEVEL_COLOR = {
	"sehr hoch": "#b71c1c",
	hoch: "#e65100",
	mittel: "#f9a825",
}

function SectionTitle({ children }) {
	return (
		<Typography
			variant="overline"
			color="text.secondary"
			component="div"
			sx={{ mt: 2, mb: 0.5, lineHeight: 1.6 }}
		>
			{children}
		</Typography>
	)
}

function Title() {
	return (
		<Box>
			<Typography variant="h6" component="h2" sx={{ lineHeight: 1.25 }}>
				Mögliche Marschlager
			</Typography>
			<Typography variant="caption" color="text.secondary">
				Errechnete Werte für den {DEFAULT_REGION.label}
			</Typography>
		</Box>
	)
}

/** Erklärung, die wahrscheinlichsten Orte und Legende. */
export function EasyContent({ onFlyTo, heading = false }) {
	const result = useMapStore((s) => s.result)
	const setInspect = useMapStore((s) => s.setInspect)
	const setSelectedSite = useMapStore((s) => s.setSelectedSite)
	const setShowCandidates = useMapStore((s) => s.setShowCandidates)

	const top = rankedCandidates(result)
		.filter((c) => c.rank)
		.slice(0, 5)

	const open = (c, rank) => {
		onFlyTo(c.lon, c.lat, 12.5)
		// Punkt auf der Karte zeigen, auch wenn die Ebene aus ist
		setShowCandidates(true)
		setSelectedSite(null)
		setInspect(inspectAt(c.lon, c.lat, { kind: "candidate", rank }))
	}

	return (
		<>
			{heading && (
				<Box sx={{ pt: 1.5 }}>
					<Title />
				</Box>
			)}
			<Typography variant="body2" sx={{ mt: 1.25 }}>
				Auf ihren Feldzügen bauten die römischen Legionen nach jedem Tagesmarsch
				ein befestigtes Nachtlager, etwa alle 20 km, meist etwas erhöht und nahe
				am Wasser. Im Kreis ist bisher nur eines bekannt, in Porta
				Westfalica-Barkhausen. Die Karte zeigt, wo weitere gelegen haben
				könnten.
			</Typography>

			<SectionTitle>Die wahrscheinlichsten Orte</SectionTitle>
			{!result ? (
				<Stack>
					{[0, 1, 2, 3, 4].map((i) => (
						<Skeleton key={i} height={36} />
					))}
				</Stack>
			) : (
				<List dense disablePadding sx={{ mx: -1 }}>
					{top.map((c) => {
						const lvl = level(c.score)
						return (
							<ListItemButton
								key={c.index}
								onClick={() => open(c, c.rank)}
								sx={{ borderRadius: 1, px: 1, py: 0.5, minHeight: 36 }}
							>
								<Box
									sx={{
										width: 22,
										height: 22,
										mr: 1.25,
										flexShrink: 0,
										borderRadius: "50%",
										border: "2px solid #d84315",
										color: "#d84315",
										fontSize: 12,
										fontWeight: 700,
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
									}}
								>
									{c.rank}
								</Box>
								<Typography
									variant="body2"
									noWrap
									sx={{ flex: 1, minWidth: 0 }}
								>
									{placeLabel(result.places, c.lon, c.lat) ?? `Ort ${c.rank}`}
								</Typography>
								<Typography
									variant="caption"
									sx={{
										ml: 1,
										flexShrink: 0,
										fontWeight: 600,
										color: LEVEL_COLOR[lvl],
									}}
								>
									{lvl}
								</Typography>
							</ListItemButton>
						)
					})}
				</List>
			)}

			<SectionTitle>Legende</SectionTitle>
			<Legend />

			<Typography
				variant="caption"
				color="text.secondary"
				component="p"
				sx={{ mt: 2 }}
			>
				{SHORT_CREDIT}
			</Typography>
		</>
	)
}

/** Schwebende Startkarte am Desktop. */
export default function EasyPanel({ onFlyTo }) {
	const setPanelOpen = useMapStore((s) => s.setPanelOpen)
	const [collapsed, setCollapsed] = useState(false)

	return (
		<Paper
			elevation={4}
			sx={{
				position: "absolute",
				left: 16,
				// Unter der Suchleiste
				top: 72,
				width: 340,
				maxWidth: "calc(100vw - 32px)",
				maxHeight: "calc(100dvh - 176px)",
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
				zIndex: 2,
			}}
		>
			<Stack
				direction="row"
				sx={{ alignItems: "flex-start", px: 2, pt: 2, pb: collapsed ? 0 : 0.5 }}
			>
				<Box sx={{ flex: 1 }}>
					<Title />
				</Box>
				<IconButton
					size="small"
					onClick={() => setCollapsed(!collapsed)}
					aria-label={collapsed ? "Ausklappen" : "Einklappen"}
					sx={{ mr: -0.5 }}
				>
					{collapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}
				</IconButton>
			</Stack>

			{!collapsed && (
				<Box sx={{ flex: 1, minHeight: 0, overflow: "auto", px: 2, pb: 1 }}>
					<EasyContent onFlyTo={onFlyTo} />
				</Box>
			)}

			<Box
				sx={{
					p: 2,
					pt: 1.5,
					borderTop: collapsed ? 0 : 1,
					borderColor: "divider",
				}}
			>
				<Button
					fullWidth
					variant="outlined"
					startIcon={<TuneIcon />}
					onClick={() => setPanelOpen(true)}
				>
					Ebenen, Einstellungen und Quellen
				</Button>
			</Box>
		</Paper>
	)
}
