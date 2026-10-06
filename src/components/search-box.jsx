"use client"

import CloseIcon from "@mui/icons-material/Close"
import GpsFixedIcon from "@mui/icons-material/GpsFixed"
import HistoryIcon from "@mui/icons-material/History"
import HistoryEduIcon from "@mui/icons-material/HistoryEdu"
import LayersIcon from "@mui/icons-material/Layers"
import LocationCityIcon from "@mui/icons-material/LocationCity"
import MenuBookIcon from "@mui/icons-material/MenuBook"
import NorthWestIcon from "@mui/icons-material/NorthWest"
import RouteIcon from "@mui/icons-material/Route"
import SearchIcon from "@mui/icons-material/Search"
import SpellcheckIcon from "@mui/icons-material/Spellcheck"
import WavesIcon from "@mui/icons-material/Waves"
import {
	Autocomplete,
	Box,
	Chip,
	CircularProgress,
	IconButton,
	Paper,
	TextField,
	Typography,
} from "@mui/material"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
	correction,
	entryByKey,
	loadPlaces,
	normalize,
	parseCoordinates,
	queryTokens,
	searchLocal,
	searchPlaces,
} from "@/lib/search"
import {
	addToHistory,
	clearHistory,
	loadHistory,
	removeFromHistory,
} from "@/lib/search-history"
import { useMapStore } from "@/store/use-map-store"

const INPUT_ID = "globale-suche"

const GROUPS = {
	coord: "Koordinate",
	fix: "Meinten Sie?",
	site: "Fundorte",
	river: "Flüsse",
	road: "Römerstraßen",
	text: "Antike Texte",
	layer: "Ebenen",
	source: "Quellen",
	place: "Heutige Orte (OpenStreetMap)",
	query: "Beispiele",
	clear: "Zuletzt gesucht",
}

// Arten, deren Namen das Feld beim Tippen ergänzt
const COMPLETES = ["site", "river", "road", "text", "layer", "place"]

// Arten aus dem lokalen Index, ihre Geometrie kommt beim Wählen von dort
const LOCAL_KINDS = ["site", "river", "road", "text", "layer", "source"]

const FILTERS = [
	{ id: "all", label: "Alle" },
	{ id: "site", label: "Fundorte", kinds: ["site"] },
	{ id: "place", label: "Orte", kinds: [] },
	{ id: "text", label: "Texte", kinds: ["text"] },
	{ id: "water", label: "Flüsse, Straßen", kinds: ["river", "road"] },
	{ id: "layer", label: "Ebenen", kinds: ["layer"] },
	{ id: "source", label: "Quellen", kinds: ["source"] },
]

const EXAMPLES = [
	{ label: "Varus", secondary: "Schlachtfeld und antike Texte" },
	{ label: "Aliso", secondary: "das gesuchte Lager an der Lippe" },
	{ label: "Visurgis", secondary: "lateinischer Name der Weser" },
	{ label: "Porta Westfalica", secondary: "Marschlager Barkhausen" },
	{ label: "52.2512, 8.9116", secondary: "Koordinaten, auch UTM 32" },
].map((e) => ({ ...e, kind: "query", key: `query:${e.label}` }))

function KindIcon({ option }) {
	const sx = { fontSize: 20, color: "text.secondary" }
	if (option.history) return <HistoryIcon sx={sx} />
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
		case "coord":
			return <GpsFixedIcon sx={{ ...sx, color: "#e65100" }} />
		case "fix":
			return <SpellcheckIcon sx={sx} />
		case "query":
		case "clear":
			return <SearchIcon sx={sx} />
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

/** Ausklappliste mit Filter-Chips über den Treffern. */
function FilterPaper({ children, filter, onFilter, showFilters, ...props }) {
	const { ownerState, ...rest } = props
	return (
		<Paper {...rest}>
			{showFilters && (
				<Box
					// Fokus bleibt im Suchfeld, sonst schließt die Liste
					onMouseDown={(e) => e.preventDefault()}
					sx={{
						display: "flex",
						flexWrap: "wrap",
						gap: 0.5,
						px: 1,
						py: 0.75,
						borderBottom: 1,
						borderColor: "divider",
					}}
				>
					{FILTERS.map((f) => (
						<Chip
							key={f.id}
							size="small"
							label={f.label}
							color={filter === f.id ? "primary" : "default"}
							variant={filter === f.id ? "filled" : "outlined"}
							onClick={() => onFilter(f.id)}
						/>
					))}
				</Box>
			)}
			{children}
		</Paper>
	)
}

let measureCanvas = null
const textWidth = (text, font) => {
	measureCanvas ??= document.createElement("canvas")
	const ctx = measureCanvas.getContext("2d")
	ctx.font = font
	return ctx.measureText(text).width
}

/** Globale Suche oben links auf der Karte. */
export default function SearchBox({ getMap, desktop }) {
	const [input, setInput] = useState("")
	const [open, setOpen] = useState(false)
	const [filter, setFilter] = useState("all")
	const [history, setHistory] = useState([])
	// Ortsindex, beim ersten Öffnen geladen
	const [placeIndex, setPlaceIndex] = useState(null)
	// Mit den Pfeiltasten durch die Liste: Feld zeigt den Treffer, keine Ergänzung
	const [navigating, setNavigating] = useState(false)
	const [ghost, setGhost] = useState(null)
	const keepOpen = useRef(false)
	const paperRef = useRef(null)

	useEffect(() => {
		setHistory(loadHistory())
	}, [])

	const query = input.trim()
	const scope = FILTERS.find((f) => f.id === filter)
	const local = useMemo(
		() =>
			searchLocal(query, scope.kinds ? { kinds: scope.kinds, limit: 20 } : {}),
		[query, scope],
	)
	const places = useMemo(
		() =>
			placeIndex &&
			query.length >= 2 &&
			(filter === "all" || filter === "place")
				? searchPlaces(
						placeIndex,
						query,
						getMap()?.getCenter(),
						filter === "place" ? 20 : 6,
					)
				: [],
		[placeIndex, query, filter, getMap],
	)
	const coord = useMemo(() => parseCoordinates(query), [query])
	const tokens = useMemo(() => queryTokens(query), [query])
	const loading = query.length >= 2 && !placeIndex
	const loadIndex = () => {
		if (!placeIndex) loadPlaces().then(setPlaceIndex, () => {})
	}

	const options = useMemo(() => {
		// Leeres Feld: Verlauf und Beispiele
		if (!query) {
			const hist = history.map((h) => ({ ...h, history: true }))
			if (hist.length) {
				hist.push({ kind: "clear", key: "clear", label: "Verlauf löschen" })
			}
			return [...hist, ...EXAMPLES]
		}
		const fix = correction(query, [...local, ...places])
		// Gruppen in der Reihenfolge ihres besten Treffers, Orte zuletzt.
		// Heißt ein Ort genau so wie gesucht und trägt kein Fundort, Fluss
		// oder keine Straße den Namen, kommen die Orte zuerst ("Minden",
		// aber "Barkhausen" bleibt beim Lager).
		const kinds = [...new Set(local.map((h) => h.kind))]
		const typed = normalize(query).text
		const onMap = local.some(
			(h) =>
				["site", "river", "road"].includes(h.kind) &&
				normalize(h.label).text.includes(typed),
		)
		const placesFirst =
			!onMap && places.some((o) => normalize(o.label).text === typed)
		const grouped = kinds.flatMap((k) => local.filter((h) => h.kind === k))
		return [
			...(coord ? [coord] : []),
			...(fix
				? [{ kind: "fix", key: "fix", label: fix, secondary: "Meinten Sie" }]
				: []),
			...(placesFirst ? [...places, ...grouped] : [...grouped, ...places]),
		]
	}, [query, history, local, places, coord])

	// Ergänzung des Getippten zum ersten passenden Treffer
	const completion = useMemo(() => {
		if (query.length < 2 || navigating || input !== input.trimStart())
			return null
		// Der kürzeste passende Name ist meist der allgemeinste: "Bielefeld"
		const typed = normalize(input).text
		// Steht schon ein vollständiger Name im Feld, nichts mehr anhängen
		if (options.some((o) => normalize(o.label).text === typed)) return null
		let best = null
		for (const o of options) {
			if (o.fuzzy || !COMPLETES.includes(o.kind)) continue
			const { text, map } = normalize(o.label)
			if (!text.startsWith(typed) || text.length === typed.length) continue
			if (best && best.full.length <= o.label.length) continue
			best = { full: o.label, suffix: o.label.slice(map[typed.length]) }
		}
		return best
	}, [query, input, navigating, options])

	// Ergänzung als grauer Text direkt hinter dem Getippten
	useLayoutEffect(() => {
		const el = document.getElementById(INPUT_ID)
		const paper = paperRef.current
		if (
			!completion ||
			!el ||
			!paper ||
			document.activeElement !== el ||
			el.selectionStart !== el.value.length
		) {
			setGhost(null)
			return
		}
		const cs = getComputedStyle(el)
		const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
		const typed = textWidth(el.value, font)
		const pl = Number.parseFloat(cs.paddingLeft)
		const room = el.clientWidth - pl - Number.parseFloat(cs.paddingRight)
		if (typed + textWidth(completion.suffix, font) > room) {
			setGhost(null)
			return
		}
		const r = el.getBoundingClientRect()
		const pr = paper.getBoundingClientRect()
		setGhost({
			text: completion.suffix,
			left: r.left - pr.left + pl + typed - el.scrollLeft,
			top: r.top - pr.top,
			height: r.height,
			font,
		})
	}, [completion])

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

	const mark = (o, coordinates) =>
		useMapStore.getState().setSearchHit({
			type: "Feature",
			properties: { label: o.label },
			geometry: { type: "Point", coordinates },
		})

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
		} else if (o.kind === "place" || o.kind === "coord") {
			s.setSelectedSite(null)
			mark(o, [o.lon, o.lat])
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

	const onChange = (_, o, reason) => {
		if (!o) {
			if (reason === "clear") {
				useMapStore.getState().setSearchHit(null)
				setFilter("all")
			}
			return
		}
		// Suchvorschläge setzen nur den Text, die Liste bleibt offen
		if (o.kind === "query" || o.kind === "fix") {
			keepOpen.current = true
			setInput(o.label)
			return
		}
		if (o.kind === "clear") {
			keepOpen.current = true
			setInput("")
			setHistory(clearHistory())
			return
		}
		// Aus dem Verlauf: Geometrie und aktuelle Daten aus dem Index
		const full = LOCAL_KINDS.includes(o.kind) ? entryByKey(o.key) : o
		if (!full) return
		setHistory(addToHistory(full))
		select(full)
	}

	const onKeyDown = (e) => {
		const el = e.target
		const atEnd = el.selectionStart === el.value.length
		if (
			ghost &&
			completion &&
			((e.key === "Tab" && !e.shiftKey) || (e.key === "ArrowRight" && atEnd))
		) {
			e.preventDefault()
			e.defaultMuiPrevented = true
			setInput(completion.full)
		}
	}

	const removeHistory = (e, key) => {
		e.preventDefault()
		e.stopPropagation()
		setHistory(removeFromHistory(key))
	}

	return (
		<Paper
			ref={paperRef}
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
				value={null}
				inputValue={input}
				onInputChange={(_, v) => {
					setInput(v)
					setNavigating(false)
				}}
				open={open}
				onOpen={() => {
					setOpen(true)
					loadIndex()
				}}
				onClose={() => {
					if (keepOpen.current) keepOpen.current = false
					else setOpen(false)
				}}
				onChange={onChange}
				onKeyDown={onKeyDown}
				onHighlightChange={(_, __, reason) =>
					setNavigating(reason === "keyboard")
				}
				filterOptions={(x) => x}
				groupBy={(o) => (o.history ? "Zuletzt gesucht" : GROUPS[o.kind])}
				getOptionLabel={(o) => o.label}
				// Gleichnamige Orte gibt es oft, der Name taugt nicht als Schlüssel
				getOptionKey={(o) => (o.history ? `hist:${o.key}` : o.key)}
				isOptionEqualToValue={(a, b) => a.key === b.key}
				autoHighlight
				autoComplete
				clearOnEscape
				// Gewählter Name bleibt im Feld stehen
				clearOnBlur={false}
				blurOnSelect="touch"
				openOnFocus
				forcePopupIcon={false}
				loading={loading && !local.length && !coord}
				loadingText="Lade Ortsverzeichnis …"
				noOptionsText={
					filter === "all"
						? "Nichts gefunden"
						: "Nichts gefunden, andere Filter probieren"
				}
				slots={{ paper: FilterPaper }}
				slotProps={{
					// Am Handy bleibt die Liste über der Bildschirmtastatur
					listbox: {
						sx: { maxHeight: { xs: "45dvh", md: "min(65dvh, 520px)" } },
					},
					paper: {
						elevation: 6,
						filter,
						onFilter: setFilter,
						showFilters: Boolean(query),
					},
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
										{!input && desktop && (
											<Box
												component="kbd"
												title="Mit / oder Strg+K in die Suche"
												sx={{
													mr: 1,
													px: 0.75,
													fontSize: 12,
													lineHeight: "18px",
													fontFamily: "inherit",
													color: "text.secondary",
													border: 1,
													borderColor: "divider",
													borderRadius: 1,
												}}
											>
												/
											</Box>
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
						<Box sx={{ minWidth: 0, flex: 1 }}>
							<Typography
								variant="body2"
								sx={{
									lineHeight: 1.3,
									color: o.kind === "clear" ? "text.secondary" : undefined,
								}}
							>
								{o.history || o.kind === "query" ? (
									o.label
								) : (
									<Highlight text={o.label} tokens={o.tokens ?? tokens} />
								)}
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
						{o.history && (
							<IconButton
								size="small"
								aria-label={`${o.label} aus dem Verlauf entfernen`}
								onMouseDown={(e) => e.preventDefault()}
								onClick={(e) => removeHistory(e, o.key)}
								sx={{ my: -0.5, mr: -0.5 }}
							>
								<CloseIcon sx={{ fontSize: 16 }} />
							</IconButton>
						)}
						{o.kind === "query" && (
							<NorthWestIcon
								sx={{ fontSize: 16, color: "text.disabled", mt: 0.25 }}
							/>
						)}
					</Box>
				)}
			/>
			{ghost && (
				// Antippen übernimmt die Ergänzung, am Handy gibt es kein Tab
				<Box
					aria-hidden
					onMouseDown={(e) => {
						e.preventDefault()
						setInput(completion.full)
					}}
					sx={{
						position: "absolute",
						left: ghost.left,
						top: ghost.top,
						height: ghost.height,
						display: "flex",
						alignItems: "center",
						font: ghost.font,
						color: "text.disabled",
						whiteSpace: "pre",
						cursor: "pointer",
					}}
				>
					{ghost.text}
				</Box>
			)}
		</Paper>
	)
}
