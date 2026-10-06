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
	ListItemText,
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
	const item = (symbol, text) => (
		<Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
			<Box sx={{ width: 22, display: "flex", justifyContent: "center" }}>
				{symbol}
			</Box>
			<Typography variant="caption">{text}</Typography>
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
		<Stack spacing={0.5} sx={{ mt: 1.5 }}>
			<Box>
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
				"Flusslauf vor der Begradigung (Lippe, Weser und Ems wie um 1840, sonst aus dem Gelände)",
			)}
			{item(
				<Box sx={{ width: 22, borderTop: "2px dashed #6a1b9a" }} />,
				"Ein Tagesmarsch (rund 20 km) um ein Marschlager",
			)}
		</Stack>
	)
}

/** Erklärung, Legende und die wahrscheinlichsten Orte. */
export function EasyContent({ onFlyTo, heading = false }) {
	const result = useMapStore((s) => s.result)
	const setInspect = useMapStore((s) => s.setInspect)
	const setSelectedSite = useMapStore((s) => s.setSelectedSite)

	const top = rankedCandidates(result)
		.filter((c) => c.rank)
		.slice(0, 5)

	const open = (c, rank) => {
		onFlyTo(c.lon, c.lat, 12.5)
		setSelectedSite(null)
		setInspect(inspectAt(c.lon, c.lat, { kind: "candidate", rank }))
	}

	return (
		<>
			{heading && (
				<Box sx={{ pt: 1.5 }}>
					<Typography variant="h6" sx={{ lineHeight: 1.2 }}>
						Mögliche Marschlager-Positionen
					</Typography>
					<Typography variant="caption" color="text.secondary">
						Errechnete Werte für den {DEFAULT_REGION.label}
					</Typography>
				</Box>
			)}
			<Typography variant="body2" sx={{ mt: 1 }}>
				Auf ihren Feldzügen bauten die römischen Legionen nach jedem Tagesmarsch
				ein befestigtes Nachtlager, etwa alle 20 km, meist etwas erhöht und nahe
				am Wasser. Im Kreis ist bisher nur eines bekannt, in Porta
				Westfalica-Barkhausen. Die Karte zeigt, wo weitere gelegen haben
				könnten.
			</Typography>

			<Legend />

			<Typography
				variant="overline"
				color="text.secondary"
				component="div"
				sx={{ mt: 1.5 }}
			>
				Die wahrscheinlichsten Orte
			</Typography>
			{!result ? (
				<Stack spacing={0.5}>
					{[0, 1, 2].map((i) => (
						<Skeleton key={i} height={36} />
					))}
				</Stack>
			) : (
				<List dense disablePadding>
					{top.map((c) => (
						<ListItemButton
							key={c.index}
							onClick={() => open(c, c.rank)}
							sx={{ borderRadius: 1, px: 1 }}
						>
							<Box
								sx={{
									width: 22,
									height: 22,
									mr: 1.5,
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
							<ListItemText
								primary={
									placeLabel(result.places, c.lon, c.lat) ?? `Ort ${c.rank}`
								}
								secondary={`Wahrscheinlichkeit ${level(c.score)}`}
							/>
						</ListItemButton>
					))}
				</List>
			)}

			<Typography
				variant="caption"
				color="text.secondary"
				component="p"
				sx={{ mt: 1 }}
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
				overflow: "auto",
				p: 2,
				zIndex: 2,
			}}
		>
			<Stack direction="row" sx={{ alignItems: "flex-start" }}>
				<Box sx={{ flex: 1 }}>
					<Typography variant="h6" sx={{ lineHeight: 1.2 }}>
						Mögliche Marschlager-Positionen
					</Typography>
					<Typography variant="caption" color="text.secondary">
						Errechnete Werte für den {DEFAULT_REGION.label}
					</Typography>
				</Box>
				<IconButton
					size="small"
					onClick={() => setCollapsed(!collapsed)}
					aria-label={collapsed ? "Ausklappen" : "Einklappen"}
				>
					{collapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}
				</IconButton>
			</Stack>

			{!collapsed && <EasyContent onFlyTo={onFlyTo} />}

			<Button
				fullWidth
				variant="outlined"
				startIcon={<TuneIcon />}
				onClick={() => setPanelOpen(true)}
				sx={{ mt: 1.5 }}
			>
				Ebenen, Einstellungen und Quellen
			</Button>
		</Paper>
	)
}
