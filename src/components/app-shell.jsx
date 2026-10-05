"use client"

import ChevronLeftIcon from "@mui/icons-material/ChevronLeft"
import LayersIcon from "@mui/icons-material/Layers"
import MenuBookIcon from "@mui/icons-material/MenuBook"
import PlaceIcon from "@mui/icons-material/Place"
import TravelExploreIcon from "@mui/icons-material/TravelExplore"
import {
	Box,
	Drawer,
	IconButton,
	Tab,
	Tabs,
	Typography,
	useMediaQuery,
} from "@mui/material"
import dynamic from "next/dynamic"
import { useCallback, useRef, useState } from "react"
import { usePotential } from "@/lib/potential/use-potential"
import { useMapStore } from "@/store/use-map-store"
import AnalysisPanel from "./analysis-panel"
import EasyPanel from "./easy-panel"
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
	const open = useMapStore((s) => s.panelOpen)
	const setOpen = useMapStore((s) => s.setPanelOpen)

	const onMapReady = useCallback((map) => {
		mapRef.current = map
	}, [])
	const getMap = useCallback(() => mapRef.current, [])
	const { analyze } = usePotential(getMap)

	const flyTo = useCallback(
		(lon, lat, zoom = 14) => {
			mapRef.current?.flyTo({ center: [lon, lat], zoom })
			if (!desktop) setOpen(false)
		},
		[desktop, setOpen],
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
			<Box
				sx={{ px: 2, pt: 2, pb: 1, display: "flex", alignItems: "flex-start" }}
			>
				<Box sx={{ flex: 1 }}>
					<Typography variant="h6" sx={{ lineHeight: 1.2 }}>
						Römerlager in Westfalen
					</Typography>
					<Typography variant="caption" color="text.secondary">
						Ebenen, Modell-Einstellungen und Quellen
					</Typography>
				</Box>
				<IconButton
					size="small"
					onClick={() => setOpen(false)}
					aria-label="Seitenleiste einklappen"
				>
					<ChevronLeftIcon />
				</IconButton>
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
			<Drawer
				variant={desktop ? "persistent" : "temporary"}
				open={open}
				onClose={() => setOpen(false)}
				ModalProps={desktop ? undefined : { keepMounted: true }}
				sx={{
					width: desktop && open ? WIDTH : 0,
					flexShrink: 0,
					transition: "width 200ms ease-out",
					"& .MuiDrawer-paper": { width: desktop ? WIDTH : "auto" },
				}}
			>
				{panel}
			</Drawer>
			<Box component="main" sx={{ position: "relative", flex: 1, minWidth: 0 }}>
				<MapView onMapReady={onMapReady} />
				{!open && <EasyPanel onFlyTo={flyTo} />}
				<InfoCards />
			</Box>
		</Box>
	)
}
