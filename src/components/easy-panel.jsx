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
	Tooltip,
	Typography,
} from "@mui/material"
import { useState } from "react"
import { SHORT_CREDIT } from "@/lib/citation"
import { placeLabel } from "@/lib/criteria"
import { rankedCandidates } from "@/lib/potential/candidates"
import { inspectAt } from "@/lib/potential/use-potential"
import { DEFAULT_REGION } from "@/lib/regions"
import { SITE_TYPES } from "@/lib/sites"
import { anyLayerVisible, useMapStore } from "@/store/use-map-store"

const level = (score) =>
	score >= 0.85 ? "sehr hoch" : score >= 0.7 ? "hoch" : "mittel"

// Kurze Namen der Fundstellen-Arten für die zweispaltige Legende
const SHORT_TYPE = {
	legionslager: "Legionslager",
	kastell: "Kastell",
	marschlager: "Marschlager",
	posten: "Wachposten",
	schlachtfeld: "Schlachtfeld",
	fund: "Römische Funde",
	verdacht: "Verdacht",
}

const dot = (bg, border, label = "") => (
	<Box
		sx={{
			width: 14,
			height: 14,
			borderRadius: "50%",
			bgcolor: bg,
			border: `2px solid ${border}`,
			fontSize: 8,
			fontWeight: 700,
			lineHeight: "10px",
			textAlign: "center",
			color: border,
		}}
	>
		{label}
	</Box>
)
const line = (color, outline) => (
	<Box
		sx={{
			width: 20,
			height: 4,
			bgcolor: color,
			borderRadius: 1,
			outline: `1px solid ${outline}`,
		}}
	/>
)
const dashed = (color, width = 3) => (
	<Box sx={{ width: 20, borderTop: `${width}px dashed ${color}` }} />
)

/** Ein Eintrag: Symbol und kurzer Name, die Erläuterung im Tooltip. */
function LegendItem({ symbol, text, hint }) {
	const row = (
		<Stack
			direction="row"
			spacing={1}
			sx={{ alignItems: "center", minWidth: 0 }}
		>
			<Box
				sx={{
					width: 20,
					height: 18,
					flexShrink: 0,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				{symbol}
			</Box>
			<Typography variant="caption" noWrap sx={{ lineHeight: "18px" }}>
				{text}
			</Typography>
		</Stack>
	)
	return hint ? (
		<Tooltip title={hint} placement="top-start">
			{row}
		</Tooltip>
	) : (
		row
	)
}

/** Gruppe der Legende, zweispaltig; leere Gruppen fallen weg. */
function LegendGroup({ title, items }) {
	const shown = items.filter(Boolean)
	if (!shown.length) return null
	return (
		<Box>
			<Typography
				variant="caption"
				color="text.secondary"
				component="div"
				sx={{ fontWeight: 600, mb: 0.25 }}
			>
				{title}
			</Typography>
			<Box
				sx={{
					display: "grid",
					gridTemplateColumns: "1fr 1fr",
					columnGap: 1.5,
					rowGap: 0.25,
				}}
			>
				{shown.map((item) => (
					<LegendItem key={item.text} {...item} />
				))}
			</Box>
		</Box>
	)
}

function Legend() {
	const heatmap = useMapStore((s) => s.heatmap.visible)
	const siteTypes = useMapStore((s) => s.siteTypes)
	const showCandidates = useMapStore((s) => s.showCandidates)
	const showRoutes = useMapStore((s) => s.showRoutes)
	const showStages = useMapStore((s) => s.showStages)
	const showRoads = useMapStore((s) => s.showRoads)
	const showWaterways = useMapStore((s) => s.showWaterways)
	const showRings = useMapStore((s) => s.showRings)
	const showRegion = useMapStore((s) => s.showRegion)
	const anyVisible = useMapStore(anyLayerVisible)

	if (!anyVisible)
		return (
			<Typography variant="caption" color="text.secondary">
				Alle Ebenen sind ausgeblendet, die Karte zeigt nur die Grundkarte.
			</Typography>
		)
	return (
		<Stack spacing={1.25}>
			{heatmap && (
				<Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
					<Typography variant="caption" color="text.secondary">
						möglich
					</Typography>
					<Box
						sx={{
							flex: 1,
							height: 8,
							borderRadius: 1,
							background:
								"linear-gradient(90deg, rgba(255,241,118,0.6), #fb8c00, #b71c1c)",
						}}
					/>
					<Typography variant="caption" color="text.secondary">
						sehr wahrscheinlich
					</Typography>
				</Stack>
			)}
			<LegendGroup
				title="Bekannte Fundstellen"
				items={SITE_TYPES.filter((t) => siteTypes[t.id]).map((t) => ({
					symbol: dot(t.color, "#fff"),
					text: SHORT_TYPE[t.id] ?? t.label,
					hint: t.label,
				}))}
			/>
			<LegendGroup
				title="Modell"
				items={[
					showCandidates && {
						symbol: dot("#fff", "#d84315", "1"),
						text: "Vermutetes Lager",
						hint: "Am besten bewertete Stelle, nummeriert nach Rang",
					},
					showStages && {
						symbol: dot("#ffca28", "#3e2723", "E"),
						text: "Etappenhalt",
						hint: "Möglicher Halt nach einem Tagesmarsch entlang der Marschwege",
					},
					showRoutes && {
						symbol: line("#ffca28", "#3e2723"),
						text: "Marschweg",
						hint: "Möglicher Marschweg zwischen zwei bekannten Lagern",
					},
					showRoutes && {
						symbol: dashed("#ffca28"),
						text: "Marschweg, offen",
						hint: "Marschweg nach Kalkriese oder zum vermuteten Lager Löhne",
					},
					showRings && {
						symbol: dashed("#6a1b9a", 2),
						text: "Tagesmarsch",
						hint: "Ein Tagesmarsch (rund 20 km) um ein Marschlager",
					},
					showWaterways && {
						symbol: line("#1565c0", "#fff"),
						text: "Gewässer, alter Lauf",
						hint: "Bäche und Flüsse vor der Begradigung, mit denen das Modell rechnet",
					},
				]}
			/>
			<LegendGroup
				title="Wege und Grenzen"
				items={[
					showRoads && {
						symbol: line("#5d4037", "#5d4037"),
						text: "Römerstraße",
						hint: "Belegte Römerstraße",
					},
					showRoads && {
						symbol: dashed("#5d4037"),
						text: "Straße, vermutet",
						hint: "Vermutete Römerstraße",
					},
					showRoutes && {
						symbol: dashed("#4fc3f7"),
						text: "Schiff auf der Lippe",
						hint: "Schiffsstrecke auf der Lippe",
					},
					showRegion && {
						symbol: dashed("#4a148c", 2),
						text: "Untersuchungsgebiet",
						hint: DEFAULT_REGION.label,
					},
				]}
			/>
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
								sx={{ borderRadius: 1, px: 1, py: 0.25, minHeight: 32 }}
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
				// Unter der Suchleiste (16 px Rand + 52 px hoch), mit Luft dazwischen
				top: 84,
				width: 340,
				maxWidth: "calc(100vw - 32px)",
				maxHeight: "calc(100dvh - 188px)",
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
					onClick={() => {
						// Die Startkarte selbst steht schon hier, also gleich die Ebenen
						const s = useMapStore.getState()
						if (s.panelTab === "start") s.setPanelTab("layers")
						setPanelOpen(true)
					}}
				>
					Ebenen, Einstellungen und Quellen
				</Button>
			</Box>
		</Paper>
	)
}
