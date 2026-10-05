"use client"

import LayersIcon from "@mui/icons-material/Layers"
import MenuIcon from "@mui/icons-material/Menu"
import MenuBookIcon from "@mui/icons-material/MenuBook"
import PlaceIcon from "@mui/icons-material/Place"
import TravelExploreIcon from "@mui/icons-material/TravelExplore"
import {
	Box,
	Drawer,
	Fab,
	Tab,
	Tabs,
	Typography,
	useMediaQuery,
} from "@mui/material"
import dynamic from "next/dynamic"
import { useCallback, useRef, useState } from "react"
import { usePotential } from "@/lib/potential/use-potential"
import AnalysisPanel from "./analysis-panel"
import { InfoCards } from "./info-cards"
import LayerPanel from "./layer-panel"
import { SitesPanel, SourcesPanel } from "./sites-panel"

const MapView = dynamic(() => import("./map-view"), { ssr: false })

const WIDTH = 360

const TABS = [
	{ id: "layers", label: "Ebenen", icon: <LayersIcon fontSize="small" /> },
	{ id: "sites", label: "Fundorte", icon: <PlaceIcon fontSize="small" /> },
	{
		id: "analysis",
		label: "Analyse",
		icon: <TravelExploreIcon fontSize="small" />,
	},
	{ id: "sources", label: "Quellen", icon: <MenuBookIcon fontSize="small" /> },
]

export default function AppShell() {
	const mapRef = useRef(null)
	const [tab, setTab] = useState("layers")
	const desktop = useMediaQuery("(min-width: 900px)")
	const [open, setOpen] = useState(false)

	const onMapReady = useCallback((map) => {
		mapRef.current = map
	}, [])
	const getMap = useCallback(() => mapRef.current, [])
	const { analyze } = usePotential(getMap)

	const flyTo = useCallback(
		(lon, lat) => {
			mapRef.current?.flyTo({ center: [lon, lat], zoom: 14 })
			if (!desktop) setOpen(false)
		},
		[desktop],
	)

	const panel = (
		<Box
			sx={{
				width: desktop ? WIDTH : "min(92vw, 380px)",
				display: "flex",
				flexDirection: "column",
				height: "100%",
			}}
		>
			<Box sx={{ px: 2, pt: 2, pb: 1 }}>
				<Typography variant="h6" sx={{ lineHeight: 1.2 }}>
					Römerlager in Westfalen
				</Typography>
				<Typography variant="caption" color="text.secondary">
					Bekannte Lager und Suchraum für unentdeckte Marschlager
				</Typography>
			</Box>
			<Tabs
				value={tab}
				onChange={(_, v) => setTab(v)}
				variant="fullWidth"
				sx={{ borderBottom: 1, borderColor: "divider", minHeight: 56 }}
			>
				{TABS.map((t) => (
					<Tab
						key={t.id}
						value={t.id}
						icon={t.icon}
						label={t.label}
						sx={{
							minHeight: 56,
							minWidth: 0,
							fontSize: 12,
							textTransform: "none",
							py: 0.5,
						}}
					/>
				))}
			</Tabs>
			<Box sx={{ flex: 1, overflow: "auto", px: 2, pb: 3 }}>
				{tab === "layers" && <LayerPanel />}
				{tab === "sites" && <SitesPanel />}
				{tab === "analysis" && (
					<AnalysisPanel onAnalyze={analyze} onFlyTo={flyTo} />
				)}
				{tab === "sources" && <SourcesPanel />}
			</Box>
		</Box>
	)

	return (
		<Box sx={{ display: "flex", height: "100dvh" }}>
			{desktop ? (
				<Drawer
					variant="permanent"
					sx={{
						width: WIDTH,
						flexShrink: 0,
						"& .MuiDrawer-paper": { width: WIDTH },
					}}
				>
					{panel}
				</Drawer>
			) : (
				<Drawer open={open} onClose={() => setOpen(false)} keepMounted>
					{panel}
				</Drawer>
			)}
			<Box component="main" sx={{ position: "relative", flex: 1 }}>
				<MapView onMapReady={onMapReady} />
				<InfoCards />
				{!desktop && (
					<Fab
						color="primary"
						size="medium"
						onClick={() => setOpen(true)}
						aria-label="Menü öffnen"
						sx={{ position: "absolute", left: 16, top: 16, zIndex: 2 }}
					>
						<MenuIcon />
					</Fab>
				)}
			</Box>
		</Box>
	)
}
