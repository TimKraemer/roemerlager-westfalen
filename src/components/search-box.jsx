"use client"

import HistoryEduIcon from "@mui/icons-material/HistoryEdu"
import LayersIcon from "@mui/icons-material/Layers"
import LocationCityIcon from "@mui/icons-material/LocationCity"
import MenuBookIcon from "@mui/icons-material/MenuBook"
import RouteIcon from "@mui/icons-material/Route"
import SearchIcon from "@mui/icons-material/Search"
import WavesIcon from "@mui/icons-material/Waves"
import {
	Autocomplete,
	Box,
	CircularProgress,
	Paper,
	TextField,
	Typography,
} from "@mui/material"
import { useEffect, useMemo, useState } from "react"
import {
	loadPlaces,
	normalize,
	queryTokens,
	searchLocal,
	searchPlaces,
} from "@/lib/search"
import { useMapStore } from "@/store/use-map-store"

const INPUT_ID = "globale-suche"

const GROUPS = {
	site: "Fundorte",
	river: "Flüsse",
	road: "Römerstraßen",
	text: "Antike Texte",
	layer: "Ebenen",
	source: "Quellen",
	place: "Heutige Orte (OpenStreetMap)",
}

function KindIcon({ option }) {
	const sx = { fontSize: 20, color: "text.secondary" }
	switch (option.kind) {
		case "site":
			return (
				<Box
					sx={{
						width: 14,
						height: 14,
						m: "3px",
						borderRadius: "50%",
						bgcolor: option.color,
						border: "2px solid #fff",
						boxShadow: "0 0 0 1px rgba(0,0,0,0.25)",
					}}
				/>
			)
		case "river":
			return <WavesIcon sx={{ ...sx, color: "#1565c0" }} />
		case "road":
			return <RouteIcon sx={sx} />
		case "text":
			return <HistoryEduIcon sx={{ ...sx, color: "#6a1b9a" }} />
		case "layer":
			return <LayersIcon sx={sx} />
		case "source":
			return <MenuBookIcon sx={sx} />
		default:
			return <LocationCityIcon sx={sx} />
	}
}

/** Text mit hervorgehobenen Suchwörtern, ohne Rücksicht auf Umlaute. */
function Highlight({ text, tokens }) {
	if (!text || !tokens?.length) return text
	const { text: n, map } = normalize(text)
	const marks = []
	for (const tok of tokens) {
		let at = n.indexOf(tok)
		while (at >= 0) {
			marks.push([map[at], map[at + tok.length]])
			at = n.indexOf(tok, at + tok.length)
		}
	}
	if (!marks.length) return text
	marks.sort((a, b) => a[0] - b[0])
	const parts = []
	let pos = 0
	for (const [a, b] of marks) {
		if (b <= pos) continue
		const from = Math.max(a, pos)
		if (from > pos) parts.push(text.slice(pos, from))
		parts.push(
			<Box
				key={from}
				component="mark"
				sx={{ bgcolor: "rgba(255,214,0,0.45)", color: "inherit", px: 0 }}
			>
				{text.slice(from, b)}
			</Box>,
		)
		pos = b
	}
	parts.push(text.slice(pos))
	return parts
}

// Treffer im Seitenpanel sichtbar machen und kurz aufleuchten lassen
function reveal(anchor) {
	setTimeout(() => {
		const el = document.getElementById(anchor)
		if (!el) return
		el.scrollIntoView({ block: "center", behavior: "smooth" })
		el.animate?.(
			[
				{ boxShadow: "0 0 0 3px rgba(230,81,0,0.7)" },
				{ boxShadow: "0 0 0 3px rgba(230,81,0,0)" },
			],
			{ duration: 1800, easing: "ease-out" },
		)
	}, 300)
}

/** Globale Suche oben links auf der Karte. */
export default function SearchBox({ getMap, desktop }) {
	const [input, setInput] = useState("")
	const [value, setValue] = useState(null)
	// Ortsindex, beim ersten Öffnen geladen
	const [placeIndex, setPlaceIndex] = useState(null)

	const query = input.trim()
	const local = useMemo(() => searchLocal(query), [query])
	const tokens = useMemo(() => queryTokens(query), [query])
	const places = useMemo(
		() =>
			placeIndex && query.length >= 2
				? searchPlaces(placeIndex, query, getMap()?.getCenter())
				: [],
		[placeIndex, query, getMap],
	)
	const loading = query.length >= 2 && !placeIndex
	const loadIndex = () => {
		if (!placeIndex) loadPlaces().then(setPlaceIndex, () => {})
	}

	// Gruppen in der Reihenfolge ihres besten Treffers, Orte zuletzt
	const options = useMemo(() => {
		const kinds = [...new Set(local.map((h) => h.kind))]
		return [
			...kinds.flatMap((k) => local.filter((h) => h.kind === k)),
			...places,
		]
	}, [local, places])

	// "/" oder Strg+K springt in die Suche
	useEffect(() => {
		const onKey = (e) => {
			const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)
			if (
				(e.key === "/" && !typing) ||
				((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")
			) {
				e.preventDefault()
				document.getElementById(INPUT_ID)?.focus()
			}
		}
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [])

	const openPanel = (tab, anchor) => {
		const s = useMapStore.getState()
		s.setPanelTab(tab)
		s.setPanelOpen(true)
		if (anchor) reveal(anchor)
	}

	const fit = (b, maxZoom) => {
		getMap()?.fitBounds(
			[
				[b[0], b[1]],
				[b[2], b[3]],
			],
			{
				padding: desktop
					? { top: 90, bottom: 60, left: 400, right: 60 }
					: { top: 80, bottom: 40, left: 30, right: 30 },
				maxZoom,
				duration: 1400,
			},
		)
	}

	const select = (o) => {
		const s = useMapStore.getState()
		const map = getMap()
		if (!desktop) s.setPanelOpen(false)
		if (o.kind !== "text") s.setSelectedText(null)
		if (o.kind === "site") {
			s.setSearchHit(null)
			s.setInspect(null)
			if (!s.siteTypes[o.type]) s.toggleSiteType(o.type)
			// Gleiche Auswahl löst in der Karte keine neue Kamerafahrt aus
			if (s.selectedSite === o.id) {
				map?.flyTo({ center: o.coordinates, zoom: 13 })
			}
			s.setSelectedSite(o.id)
		} else if (o.kind === "river" || o.kind === "road") {
			s.setSelectedSite(null)
			if (o.kind === "road" && !s.showRoads) s.setShowRoads(true)
			s.setSearchHit({
				type: "Feature",
				properties: { label: o.label },
				geometry: o.geometry,
			})
			fit(o.bounds, 12)
		} else if (o.kind === "place") {
			s.setSelectedSite(null)
			s.setSearchHit({
				type: "Feature",
				properties: { label: o.label },
				geometry: { type: "Point", coordinates: [o.lon, o.lat] },
			})
			map?.flyTo({ center: [o.lon, o.lat], zoom: o.zoom })
		} else if (o.kind === "text") {
			s.setSearchHit(null)
			s.setSelectedSite(null)
			if (o.geo) s.setSelectedText(o.id)
			// Auf dem Handy reicht die Karte, ohne Ortsbezug die Textkarte
			if (desktop || !o.geo) openPanel("texts", `text-${o.id}`)
		} else if (o.kind === "layer") {
			if (o.base) s.setBaseLayer(o.id)
			else s.setOverlay(o.id, { visible: true })
			if (desktop) openPanel("layers", `ebene-${o.id}`)
		} else if (o.kind === "source") {
			openPanel("sources", o.anchor)
		}
	}

	return (
		<Paper
			elevation={4}
			sx={{
				position: "absolute",
				top: { xs: 12, md: 16 },
				left: { xs: 12, md: 16 },
				right: { xs: 12, md: "auto" },
				width: { md: 340 },
				zIndex: 4,
				borderRadius: 2,
			}}
		>
			<Autocomplete
				id={INPUT_ID}
				options={options}
				value={value}
				inputValue={input}
				onInputChange={(_, v) => setInput(v)}
				onOpen={loadIndex}
				onChange={(_, o, reason) => {
					setValue(o)
					if (reason === "clear" || !o) {
						useMapStore.getState().setSearchHit(null)
						return
					}
					select(o)
				}}
				filterOptions={(x) => x}
				groupBy={(o) => GROUPS[o.kind]}
				getOptionLabel={(o) => o.label}
				isOptionEqualToValue={(a, b) => a.key === b.key}
				autoHighlight
				openOnFocus
				forcePopupIcon={false}
				loading={loading && !local.length}
				loadingText="Lade Ortsverzeichnis …"
				noOptionsText={
					query
						? "Nichts gefunden"
						: "Fundorte, heutige und lateinische Ortsnamen, Flüsse, Römerstraßen, Texte (z. B. Varus), Ebenen und Quellen"
				}
				slotProps={{
					listbox: { sx: { maxHeight: "min(70dvh, 560px)" } },
					paper: { elevation: 6 },
				}}
				renderInput={(params) => (
					<TextField
						{...params}
						placeholder="Suchen: Ort, Fundort, Fluss, Text …"
						sx={{ "& fieldset": { border: "none" } }}
						slotProps={{
							...params.slotProps,
							input: {
								...params.slotProps.input,
								startAdornment: (
									<SearchIcon sx={{ color: "text.secondary", ml: 0.5 }} />
								),
								endAdornment: (
									<>
										{loading && local.length > 0 && (
											<CircularProgress size={16} sx={{ mr: 1 }} />
										)}
										{params.slotProps.input.endAdornment}
									</>
								),
							},
							htmlInput: {
								...params.slotProps.htmlInput,
								"aria-label": "Karte und Texte durchsuchen",
								enterKeyHint: "search",
							},
						}}
					/>
				)}
				renderOption={({ key, ...props }, o) => (
					<Box
						component="li"
						key={key}
						{...props}
						sx={{ gap: 1.25, alignItems: "flex-start !important" }}
					>
						<Box sx={{ width: 20, pt: 0.25, flexShrink: 0 }}>
							<KindIcon option={o} />
						</Box>
						<Box sx={{ minWidth: 0 }}>
							<Typography variant="body2" sx={{ lineHeight: 1.3 }}>
								<Highlight text={o.label} tokens={tokens} />
							</Typography>
							{o.secondary && (
								<Typography
									variant="caption"
									color="text.secondary"
									component="div"
									sx={{ lineHeight: 1.3 }}
								>
									{o.secondary}
								</Typography>
							)}
							{o.snippet && (
								<Typography
									variant="caption"
									component="div"
									sx={{ lineHeight: 1.35, mt: 0.25, color: "text.secondary" }}
								>
									<Highlight text={o.snippet} tokens={o.tokens} />
								</Typography>
							)}
						</Box>
					</Box>
				)}
			/>
		</Paper>
	)
}
