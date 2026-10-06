"use client"

import CloseIcon from "@mui/icons-material/Close"
import {
	Box,
	Chip,
	IconButton,
	Paper,
	Slider,
	Stack,
	Typography,
} from "@mui/material"
import { useEffect, useState } from "react"
import { altkartenAvailable, OVERLAYS } from "@/lib/layers"
import { prefetchLayer } from "@/lib/prefetch"
import { STANDS, standById } from "@/lib/zeitstrahl"
import { useMapStore } from "@/store/use-map-store"

const LAYERS = Object.fromEntries(OVERLAYS.map((l) => [l.id, l]))

// Themen über der Karte, je ein Schalter (Feld im timeline-State)
const THEMES = [
	["water", "Gewässer"],
	["moor", "Moore"],
	["wald", "Wald"],
	["wege", "Wege"],
]

/** Kurzer Name einer Karte für die Auswahl im Stand. */
function mapLabel(id) {
	const layer = LAYERS[id]
	if (!layer) return id
	return layer.label.replace(/\s*\((NRW|Nur NRW)\)$/, "")
}

/** Stände mit den Karten, die es auf dem Server gibt. */
function useStands() {
	const [hasAltkarten, setHasAltkarten] = useState(false)
	useEffect(() => {
		altkartenAvailable().then(setHasAltkarten)
	}, [])
	return STANDS.map((s) => ({
		...s,
		maps: s.maps.filter(
			(id) => LAYERS[id] && (hasAltkarten || !LAYERS[id].altkarte),
		),
	})).filter((s) => s.maps.length || s.water)
}

/** Status der gezeigten Karte: lädt, zu weit weg, außerhalb. */
function MapStatus({ id }) {
	const status = useMapStore((s) => s.overlayStatus[id])
	const layer = LAYERS[id]
	if (!status || !layer) return null
	const text = {
		loading: "Karte lädt …",
		zoom: `Karte erst ab Zoom ${Math.ceil(layer.minzoom)} sichtbar`,
		outside: "Karte liegt außerhalb des Ausschnitts",
	}[status]
	return (
		<Typography variant="caption" color="text.secondary">
			{text}
		</Typography>
	)
}

/**
 * Hinweis zum Stand. Auf dem Handy zwei Zeilen, Tippen zeigt alles, damit
 * die Leiste nicht die halbe Karte verdeckt.
 */
function StandNote({ text }) {
	const [open, setOpen] = useState(false)
	return (
		<Typography
			variant="caption"
			color="text.secondary"
			component="div"
			onClick={() => setOpen(!open)}
			sx={{
				lineHeight: 1.4,
				cursor: { xs: "pointer", md: "auto" },
				...(!open && {
					display: { xs: "-webkit-box", md: "block" },
					WebkitLineClamp: { xs: 2, md: "none" },
					WebkitBoxOrient: "vertical",
					overflow: { xs: "hidden", md: "visible" },
				}),
			}}
		>
			{text}
		</Typography>
	)
}

export default function Zeitstrahl() {
	const timeline = useMapStore((s) => s.timeline)
	const setTimeline = useMapStore((s) => s.setTimeline)
	const stands = useStands()
	const index = Math.max(
		0,
		stands.findIndex((s) => s.id === timeline.stand),
	)

	// Leitkarten der Nachbarstände im Ausschnitt vorladen, dann ist der
	// nächste Schritt auf dem Zeitstrahl sofort zu sehen
	const neighbours = [stands[index - 1], stands[index + 1]]
		.map((s) => s?.maps[0])
		.filter(Boolean)
		.join(",")
	useEffect(() => {
		if (!timeline.open || !neighbours) return
		const id = setTimeout(() => prefetchLayer(neighbours.split(",")), 800)
		return () => clearTimeout(id)
	}, [timeline.open, neighbours])

	if (!timeline.open) return null

	const stand = stands[index] ?? standById(timeline.stand)
	const shown =
		timeline.map && stand.maps.includes(timeline.map)
			? timeline.map
			: stand.maps[0]

	return (
		<Paper
			elevation={4}
			role="region"
			aria-label="Zeitstrahl der historischen Karten"
			sx={{
				position: "absolute",
				zIndex: 2,
				left: "50%",
				transform: "translateX(-50%)",
				top: { xs: "calc(64px + env(safe-area-inset-top))", md: "auto" },
				bottom: { md: 40 },
				width: { xs: "calc(100% - 32px)", md: 620 },
				maxWidth: "calc(100% - 32px)",
				px: 2,
				pt: 1,
				pb: 1.25,
				borderRadius: 3,
			}}
		>
			<Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
				<Typography variant="subtitle2" sx={{ flex: 1 }}>
					Zeitstrahl
				</Typography>
				<Stack
					direction="row"
					role="group"
					aria-label="Themen über der Karte"
					sx={{ gap: 0.5, flexWrap: "wrap", justifyContent: "flex-end" }}
				>
					{THEMES.map(([key, label]) => (
						<Chip
							key={key}
							size="small"
							label={label}
							aria-pressed={timeline[key]}
							color={timeline[key] ? "primary" : "default"}
							variant={timeline[key] ? "filled" : "outlined"}
							onClick={() => setTimeline({ [key]: !timeline[key] })}
						/>
					))}
				</Stack>
				<IconButton
					size="small"
					onClick={() => setTimeline({ open: false })}
					aria-label="Zeitstrahl schließen"
				>
					<CloseIcon fontSize="small" />
				</IconButton>
			</Stack>
			<Box sx={{ px: 2 }}>
				<Slider
					size="small"
					value={index}
					min={0}
					max={stands.length - 1}
					step={null}
					marks={stands.map((s, i) => ({ value: i, label: s.label }))}
					onChange={(_, v) =>
						setTimeline({ stand: stands[v].id, map: stands[v].maps[0] ?? null })
					}
					getAriaValueText={(v) => stands[v]?.label ?? ""}
					aria-label="Stand"
					sx={{
						"& .MuiSlider-markLabel": { fontSize: 12 },
						"& .MuiSlider-markLabelActive": { fontWeight: 600 },
						mb: 2,
					}}
				/>
			</Box>
			{stand.maps.length > 1 && (
				<Stack
					direction="row"
					sx={{
						gap: 0.75,
						mb: 0.5,
						// Handy: eine Zeile zum Wischen statt fünf übereinander
						flexWrap: { xs: "nowrap", md: "wrap" },
						overflowX: { xs: "auto", md: "visible" },
						scrollbarWidth: "none",
					}}
					role="radiogroup"
					aria-label="Karte dieses Stands"
				>
					{stand.maps.map((id) => (
						<Chip
							key={id}
							size="small"
							role="radio"
							aria-checked={id === shown}
							label={mapLabel(id)}
							color={id === shown ? "primary" : "default"}
							variant={id === shown ? "filled" : "outlined"}
							onClick={() => setTimeline({ map: id })}
							onMouseEnter={() => id !== shown && prefetchLayer(id)}
							sx={{ flexShrink: 0 }}
						/>
					))}
				</Stack>
			)}
			{stand.maps.length === 1 && (
				<Typography variant="body2" sx={{ mb: 0.25 }}>
					{mapLabel(shown)}
				</Typography>
			)}
			<StandNote key={stand.id} text={stand.note} />
			{shown && <MapStatus id={shown} />}
		</Paper>
	)
}
