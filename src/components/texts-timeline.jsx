"use client"

import ChevronLeftIcon from "@mui/icons-material/ChevronLeft"
import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import CloseIcon from "@mui/icons-material/Close"
import ExpandLessIcon from "@mui/icons-material/ExpandLess"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import HistoryEduIcon from "@mui/icons-material/HistoryEdu"
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined"
import MapIcon from "@mui/icons-material/MapOutlined"
import OpenInNewIcon from "@mui/icons-material/OpenInNew"
import PlayArrowIcon from "@mui/icons-material/PlayArrow"
import ReplayIcon from "@mui/icons-material/Replay"
import VolumeOffIcon from "@mui/icons-material/VolumeOff"
import VolumeUpIcon from "@mui/icons-material/VolumeUp"
import {
	Box,
	Button,
	ButtonBase,
	CircularProgress,
	Collapse,
	IconButton,
	Link,
	Paper,
	Popover,
	Tooltip,
	Typography,
	useMediaQuery,
} from "@mui/material"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { assetUrl } from "@/config"
import { DESKTOP_QUERY } from "@/lib/sheet"
import { hasTextGeo } from "@/lib/text-geo"
import {
	CHAPTERS,
	chapterOf,
	laterBy,
	neighbours,
	ORDERED,
	splitWritten,
} from "@/lib/text-timeline"
import { useMapStore } from "@/store/use-map-store"
import audioIndex from "../../public/audio/erzaehlung/index.json"

const SERIF = "var(--font-serif), Georgia, 'Times New Roman', serif"
// Farbe der Textorte auf der Karte (text-overlay.js)
const PURPLE = "#6a1b9a"
const TINT = "#f5eef9"
const INK = "#8a7a63"
const TRACK = "#d9ccb6"
const PAPER = "rgba(253, 250, 244, 0.97)"
const CARD_W = 380
const FIRST = ORDERED[0].id

const citation = (t) =>
	t.group === "forschung" ? t.author : `${t.author}, ${t.work} ${t.passage}`
const fade = {
	"@keyframes tt-in": {
		from: { opacity: 0, transform: "translateY(6px)" },
		to: { opacity: 1, transform: "none" },
	},
	animation: "tt-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
	"@media (prefers-reduced-motion: reduce)": { animation: "none" },
}

const MUTE_KEY = "roemer-erzaehlung-stumm"
const PLACE_KEY = "roemer-erzaehlung-stelle"
let player = null

// Wo man in der Erzählung war, Text und Sekunde im Vorlesen. Bleibt beim
// Einklappen und Wegklicken stehen, im Browser auch über das Neuladen hinaus.
let place
function getPlace() {
	if (place === undefined) {
		try {
			place = JSON.parse(localStorage.getItem(PLACE_KEY))
		} catch {
			place = null
		}
		if (!place?.id || !chapterOf(place.id)) place = null
	}
	return place
}
function setPlace(id, time = 0) {
	const sec = Math.floor(time)
	const same = place?.id === id && Math.floor(place.time) === sec
	place = { id, time }
	if (same) return
	try {
		localStorage.setItem(PLACE_KEY, JSON.stringify({ id, time: sec }))
	} catch {
		// nur für diese Sitzung
	}
}

/**
 * Liest jeden Schritt der Erzählung vor (scripts/build-audio.mjs), sobald
 * er aufgeschlagen wird. progress ist 0 bis 1, solange vorgelesen wird.
 */
function useNarration(id) {
	const [muted, setMutedState] = useState(false)
	const [progress, setProgress] = useState(null)

	useEffect(() => {
		try {
			setMutedState(localStorage.getItem(MUTE_KEY) === "1")
		} catch {
			// ohne Speicher bleibt der Ton an
		}
	}, [])

	useEffect(() => {
		const entry = id && !muted ? audioIndex[id] : null
		if (!entry) {
			player?.pause()
			// Pausiert bleibt der Ring stehen, stumm verschwindet er
			if (muted || id) setProgress(null)
			return
		}
		player ??= new Audio()
		const a = player
		a.src = assetUrl(`audio/erzaehlung/${id}.mp3`)
		// War man in diesem Text schon, geht es an der Stelle weiter
		const from = getPlace()?.id === id ? getPlace().time : 0
		const seek = () => {
			if (from) a.currentTime = from
		}
		const tick = () => {
			setProgress(a.duration ? a.currentTime / a.duration : 0)
			setPlace(id, a.currentTime)
		}
		const end = () => {
			setProgress(null)
			setPlace(id, 0)
		}
		a.addEventListener("loadedmetadata", seek, { once: true })
		a.addEventListener("timeupdate", tick)
		a.addEventListener("ended", end)
		// Ohne vorherigen Klick blockiert der Browser das Abspielen, dann
		// bleibt es still, bis man weiterblättert
		a.play()
			.then(() => setProgress((p) => (from ? p : 0)))
			.catch(() => setProgress(null))
		return () => {
			a.pause()
			a.removeEventListener("loadedmetadata", seek)
			a.removeEventListener("timeupdate", tick)
			a.removeEventListener("ended", end)
		}
	}, [id, muted])

	const setMuted = (next) => {
		setMutedState(next)
		try {
			localStorage.setItem(MUTE_KEY, next ? "1" : "0")
		} catch {
			// nur für diese Sitzung
		}
	}
	return { muted, setMuted, progress }
}

/**
 * Die Texte als Erzählung in Kapiteln. Unten die Leiste mit dem Fortschritt,
 * zurück und weiter immer an derselben Stelle, darüber die Lesekarte. Die
 * Karte zeigt zu jedem Text seine Orte.
 */
export default function TextsTimeline() {
	const desktop = useMediaQuery(DESKTOP_QUERY, { noSsr: true })
	const selected = useMapStore((s) => s.selectedText)
	const select = useMapStore((s) => s.setSelectedText)
	const open = useMapStore((s) => s.timelineOpen)
	const setOpen = useMapStore((s) => s.setTimelineOpen)
	const setInset = useMapStore((s) => s.setTimelineInset)
	// Auf dem Handy hat das hochgezogene Sheet Vorrang
	const sheetUp = useMapStore(
		(s) => s.panelOpen || Boolean(s.selectedSite || s.inspect),
	)
	const bottomRef = useRef(null)
	const rootRef = useRef(null)
	const hidden = !desktop && sheetUp
	const reading = Boolean(selected && chapterOf(selected))
	const shown = open || reading
	const narration = useNarration(reading ? selected : null)

	// Neuer Text: von hier an merken. Ein Wiedersehen behält die Stelle.
	useEffect(() => {
		if (reading && getPlace()?.id !== selected) setPlace(selected)
	}, [reading, selected])

	// Was unten liegt, verdeckt Karte. Die Karte rechnet damit beim
	// Einpassen der Textorte, auf dem Handy auch beim Zentrieren, und
	// schiebt dort Zoom und Maßstab darüber.
	useLayoutEffect(() => {
		const el = bottomRef.current
		const main = rootRef.current?.closest("main")
		const left = desktop && reading ? 16 + CARD_W : 0
		if (!el) {
			setInset({ bottom: 0, left })
			main?.style.setProperty("--timeline-h", "0px")
			return
		}
		const measure = () => {
			const bottom = Math.round(
				el.offsetHeight + (Number.parseFloat(el.dataset.offset) || 0),
			)
			setInset({ bottom, left })
			main?.style.setProperty("--timeline-h", `${desktop ? 0 : bottom}px`)
		}
		measure()
		const ro = new ResizeObserver(measure)
		ro.observe(el)
		return () => ro.disconnect()
	})
	useEffect(() => () => setInset({ bottom: 0, left: 0 }), [setInset])

	// Pfeiltasten blättern, Escape schließt. Nicht, wenn die Karte den Fokus
	// hat, dort verschieben die Pfeile den Ausschnitt.
	useEffect(() => {
		if (!selected) return
		const onKey = (e) => {
			if (e.altKey || e.ctrlKey || e.metaKey) return
			const t = e.target
			if (!rootRef.current?.contains(t) && t !== document.body) return
			if (t.closest?.("input, textarea, [contenteditable=true]")) return
			const { prev, next } = neighbours(selected)
			if (e.key === "ArrowLeft" && prev) select(prev.id)
			else if (e.key === "ArrowRight" && next) select(next.id)
			else if (e.key === "Escape") select(null)
			else return
			e.preventDefault()
		}
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [selected, select])

	if (hidden) return <Box ref={rootRef} />

	const bar = (
		<Bar
			selected={reading ? selected : null}
			onSelect={select}
			narration={narration}
			resume={getPlace()?.id}
			onCollapse={() => {
				select(null)
				setOpen(false)
			}}
			mobile={!desktop}
		/>
	)
	const pill = (
		<Pill
			onClick={() => {
				setOpen(true)
				// Weiter, wo man war, sonst auf dem Handy gleich der erste Text
				const at = getPlace()?.id
				if (at || !desktop) select(at ?? FIRST)
			}}
		/>
	)

	if (desktop) {
		return (
			<Box ref={rootRef}>
				{reading && <Reader id={selected} onClose={() => select(null)} />}
				<Box
					ref={bottomRef}
					data-offset={30}
					sx={{
						position: "absolute",
						// über der Quellenangabe der Karte
						bottom: 30,
						left: "50%",
						transform: "translateX(-50%)",
						width: shown ? "calc(100% - 260px)" : "auto",
						maxWidth: 1000,
						minWidth: shown ? 600 : 0,
						zIndex: 2,
					}}
				>
					{shown ? bar : pill}
				</Box>
			</Box>
		)
	}

	// Handy: Lesekarte und Leiste stapeln sich über dem eingeklappten
	// Sheet, die Leiste bleibt unten an ihrem Platz
	return (
		<Box ref={rootRef}>
			<Box
				ref={bottomRef}
				data-offset={10}
				sx={{
					position: "absolute",
					left: shown ? 10 : 12,
					right: shown ? 10 : "auto",
					bottom: "calc(var(--sheet-h, 82px) + 10px)",
					zIndex: 3,
					display: "flex",
					flexDirection: "column",
					gap: 1,
				}}
			>
				{reading && (
					<Reader id={selected} onClose={() => select(null)} mobile />
				)}
				{shown ? bar : pill}
			</Box>
		</Box>
	)
}

function Pill({ onClick }) {
	return (
		<Paper
			component={ButtonBase}
			onClick={onClick}
			elevation={3}
			sx={{
				display: "flex",
				alignItems: "center",
				gap: 0.75,
				pl: 1.25,
				pr: 1.5,
				py: 0.75,
				borderRadius: 999,
				bgcolor: PAPER,
				fontFamily: SERIF,
				fontSize: 14.5,
				fontWeight: 600,
				color: "#3d3122",
				"&:hover": { bgcolor: "#fff" },
			}}
		>
			<HistoryEduIcon sx={{ fontSize: 19, color: CHAPTERS[0].accent }} />
			Die Geschichte in {ORDERED.length} Texten
			<ExpandLessIcon sx={{ fontSize: 18, color: INK, ml: -0.25 }} />
		</Paper>
	)
}

/**
 * Leiste mit den Kapiteln von links nach rechts in zeitlicher Folge. Jeder
 * Punkt ist ein Text, gefüllt ist, was schon gelesen ist.
 */
function Bar({ selected, onSelect, onCollapse, narration, resume, mobile }) {
	const [info, setInfo] = useState(null)
	// Eingeklappt oder weggeklickt zeigt die Leiste weiter, wo man war
	const at = selected ?? resume
	const { index, prev, next } = at
		? neighbours(at)
		: { index: -1, prev: null, next: null }
	const current = at ? chapterOf(at) : null
	const accent = current?.accent ?? CHAPTERS[0].accent
	const atEnd = selected && !next

	const forward = () =>
		onSelect(selected ? (next?.id ?? FIRST) : (resume ?? FIRST))

	return (
		<Paper
			elevation={4}
			role="navigation"
			aria-label="Erzählung in Texten"
			sx={{
				display: "flex",
				alignItems: "center",
				gap: mobile ? 0.5 : 1,
				borderRadius: 4,
				bgcolor: PAPER,
				backdropFilter: "blur(6px)",
				px: mobile ? 0.5 : 1,
				py: mobile ? 0.75 : 1,
			}}
		>
			<Box sx={{ display: "flex", flexDirection: "column" }}>
				<IconButton
					size="small"
					onClick={onCollapse}
					aria-label="Erzählung schließen"
				>
					<ExpandMoreIcon fontSize="small" />
				</IconButton>
				{!mobile && (
					<IconButton
						size="small"
						onClick={(e) => setInfo(e.currentTarget)}
						aria-label="Wie die Erzählung funktioniert"
					>
						<InfoOutlinedIcon fontSize="small" />
					</IconButton>
				)}
			</Box>

			<Mute narration={narration} accent={accent} />

			<IconButton
				onClick={() => prev && onSelect(prev.id)}
				disabled={!prev}
				aria-label={prev ? `Zurück: ${prev.title}` : "Zurück"}
				sx={{ border: 1, borderColor: "divider", flexShrink: 0 }}
			>
				<ChevronLeftIcon />
			</IconButton>

			<Box sx={{ flex: 1, minWidth: 0 }}>
				{mobile ? (
					<Typography
						noWrap
						sx={{
							fontFamily: SERIF,
							fontSize: 13.5,
							fontWeight: 600,
							color: current?.accent ?? "text.primary",
							mb: 0.5,
							px: 0.5,
						}}
					>
						{current
							? `${current.number}. ${current.title}`
							: `${CHAPTERS.length} Kapitel, ${ORDERED.length} Texte`}
					</Typography>
				) : null}
				<Box sx={{ display: "flex", gap: mobile ? 0.5 : 1 }}>
					{CHAPTERS.map((c) =>
						mobile ? (
							<ChapterProgress
								key={c.id}
								c={c}
								index={index}
								active={c === current}
								onSelect={onSelect}
							/>
						) : (
							<Chapter
								key={c.id}
								c={c}
								index={index}
								selected={at}
								active={c === current}
								onSelect={onSelect}
							/>
						),
					)}
				</Box>
			</Box>

			<Button
				variant="contained"
				disableElevation
				onClick={forward}
				aria-label={selected && next ? `Weiter: ${next.title}` : undefined}
				startIcon={
					!selected ? <PlayArrowIcon /> : atEnd ? <ReplayIcon /> : undefined
				}
				endIcon={selected && !atEnd ? <ChevronRightIcon /> : undefined}
				sx={{
					flexShrink: 0,
					// feste Breite, damit der Knopf nie springt
					width: mobile ? 92 : 132,
					height: 44,
					borderRadius: 999,
					bgcolor: accent,
					fontWeight: 700,
					textTransform: "none",
					fontSize: mobile ? 14 : 15,
					"&:hover": { bgcolor: accent, filter: "brightness(1.1)" },
				}}
			>
				{!selected
					? resume
						? "Weiter"
						: "Starten"
					: atEnd
						? "Von vorn"
						: "Weiter"}
			</Button>

			<Popover
				open={Boolean(info)}
				anchorEl={info}
				onClose={() => setInfo(null)}
				anchorOrigin={{ vertical: "top", horizontal: "left" }}
				transformOrigin={{ vertical: "bottom", horizontal: "left" }}
				slotProps={{ paper: { sx: { p: 2, maxWidth: 380 } } }}
			>
				<About />
			</Popover>
		</Paper>
	)
}

/** Stumm-Knopf, ein Ring zeigt, wie weit der Schritt vorgelesen ist. */
function Mute({ narration, accent }) {
	const { muted, setMuted, progress } = narration
	return (
		<Tooltip
			title={muted ? "Vorlesen an" : "Vorlesen aus"}
			disableTouchListener
		>
			<Box sx={{ position: "relative", flexShrink: 0, display: "flex" }}>
				<IconButton
					onClick={() => setMuted(!muted)}
					aria-label={muted ? "Vorlesen an" : "Vorlesen aus"}
					aria-pressed={muted}
					sx={{ color: muted ? "text.disabled" : accent }}
				>
					{muted ? <VolumeOffIcon /> : <VolumeUpIcon />}
				</IconButton>
				{progress !== null && (
					<CircularProgress
						variant="determinate"
						value={progress * 100}
						size={40}
						thickness={2.5}
						aria-hidden
						sx={{
							position: "absolute",
							inset: 0,
							color: accent,
							pointerEvents: "none",
							"& circle": { transition: "stroke-dashoffset 250ms linear" },
						}}
					/>
				)}
			</Box>
		</Tooltip>
	)
}

/** Handy: je Kapitel ein schmaler Balken, gefüllt bis zum aktuellen Text. */
function ChapterProgress({ c, index, active, onSelect }) {
	const start = ORDERED.indexOf(c.texts[0])
	const done = Math.min(c.texts.length, Math.max(0, index - start + 1))
	return (
		<ButtonBase
			onClick={() => onSelect(c.texts[0].id)}
			aria-label={`Kapitel ${c.number}: ${c.title}`}
			sx={{ flex: `${c.texts.length + 1} 1 0`, minWidth: 0, py: 0.75 }}
		>
			<Box
				sx={{
					width: "100%",
					height: active ? 6 : 4,
					borderRadius: 3,
					bgcolor: TRACK,
					overflow: "hidden",
					transition: "height 200ms",
				}}
			>
				<Box
					sx={{
						height: "100%",
						width: `${(done / c.texts.length) * 100}%`,
						bgcolor: c.accent,
						transition: "width 300ms",
					}}
				/>
			</Box>
		</ButtonBase>
	)
}

function Chapter({ c, index, selected, active, onSelect }) {
	const start = ORDERED.indexOf(c.texts[0])
	return (
		<Box
			sx={{
				// Kurze Kapitel brauchen Platz für den Titel
				flex: `${Math.max(c.texts.length, 3) + 1} 1 0`,
				minWidth: 0,
				borderRadius: 2,
				px: 0.75,
				pt: 0.5,
				pb: 0.5,
				bgcolor: active ? `${c.accent}12` : "transparent",
				transition: "background-color 200ms",
			}}
		>
			<ButtonBase
				onClick={() => onSelect(c.texts[0].id)}
				sx={{
					display: "block",
					width: "100%",
					textAlign: "left",
					borderRadius: 1,
				}}
			>
				<Typography
					noWrap
					sx={{
						fontSize: 10,
						fontWeight: 700,
						letterSpacing: "0.06em",
						color: c.accent,
					}}
				>
					{c.years}
				</Typography>
				<Typography
					title={c.title}
					sx={{
						fontFamily: SERIF,
						fontSize: 13.5,
						fontWeight: 600,
						lineHeight: 1.15,
						// immer zwei Zeilen hoch, damit die Spuren auf einer Linie liegen
						height: "2.3em",
						display: "-webkit-box",
						WebkitLineClamp: 2,
						WebkitBoxOrient: "vertical",
						overflow: "hidden",
						hyphens: "auto",
						color: active ? c.accent : "text.primary",
					}}
				>
					{c.title}
				</Typography>
			</ButtonBase>
			{/* Spur mit einem Punkt je Text */}
			<Box
				sx={{
					position: "relative",
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					height: 20,
					mt: 0.5,
				}}
			>
				<Box
					sx={{
						position: "absolute",
						left: 4,
						right: 4,
						top: "50%",
						height: 2,
						mt: "-1px",
						borderRadius: 1,
						bgcolor: TRACK,
					}}
				/>
				{c.texts.map((t, i) => (
					<Pip
						key={t.id}
						t={t}
						accent={c.accent}
						state={
							t.id === selected
								? "current"
								: start + i < index
									? "done"
									: "todo"
						}
						onSelect={onSelect}
					/>
				))}
			</Box>
		</Box>
	)
}

function Pip({ t, accent, state, onSelect }) {
	const size = state === "current" ? 14 : 10
	return (
		<Tooltip
			arrow
			placement="top"
			disableInteractive
			disableTouchListener
			title={
				<Box sx={{ py: 0.25 }}>
					<Box sx={{ fontFamily: SERIF, fontSize: 14, fontWeight: 600 }}>
						{t.title}
					</Box>
					<Box sx={{ fontSize: 11, opacity: 0.85 }}>
						{citation(t)}, {t.year}
					</Box>
				</Box>
			}
		>
			<ButtonBase
				onClick={() => onSelect(t.id)}
				aria-label={`${t.title}, ${t.year}`}
				aria-current={state === "current" ? "step" : undefined}
				sx={{
					position: "relative",
					width: 18,
					height: 20,
					borderRadius: "50%",
					"&:hover .dot, &:focus-visible .dot": { transform: "scale(1.3)" },
				}}
			>
				<Box
					className="dot"
					sx={{
						width: size,
						height: size,
						borderRadius: "50%",
						boxSizing: "border-box",
						bgcolor: state === "todo" ? "#fff" : accent,
						border: `2px solid ${state === "todo" ? TRACK : accent}`,
						boxShadow:
							state === "current"
								? `0 0 0 2px #fff, 0 0 0 4px ${accent}66`
								: "none",
						transition:
							"transform 150ms, width 150ms, height 150ms, background-color 200ms",
					}}
				/>
			</ButtonBase>
		</Tooltip>
	)
}

function About() {
	return (
		<>
			<Typography sx={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600 }}>
				Die Geschichte in Texten
			</Typography>
			<Typography variant="body2" sx={{ mt: 0.75 }}>
				Sechs Kapitel erzählen, was an Lippe und Weser geschah, von den ersten
				Feldzügen bis zur Forschung heute. Jeder Punkt ist ein Text, links
				beginnt die Geschichte. Mit Weiter oder den Pfeiltasten blättert man,
				die Karte zeigt jeweils die Orte des Textes. Gestrichelt ist, was der
				Text offenlässt.
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
				Die antiken Texte stehen im Original und in eigener, mit KI erstellter
				und nicht philologisch geprüfter Übersetzung (2026). Neuere Thesen aus
				Archäologie und Presse sind in eigenen Worten zusammengefasst, die
				Kapiteltexte ebenfalls mit KI geschrieben. Vorgelesen wird jeder Schritt
				von einer KI-Stimme (ElevenLabs v3), der Lautsprecher in der Leiste
				schaltet das ab.
			</Typography>
		</>
	)
}

/** Lesekarte: Kapitelvorspann beim ersten Text eines Kapitels, dann der Text. */
function Reader({ id, onClose, mobile }) {
	const t = ORDERED.find((x) => x.id === id)
	const c = chapterOf(id)
	const inset = useMapStore((s) => s.timelineInset.bottom)
	const [more, setMore] = useState(false)
	const opening = c.texts[0].id === id
	const compact = mobile && !more
	const scroller = useRef(null)

	// Neuer Text beginnt oben
	useEffect(() => {
		if (id) scroller.current?.scrollTo({ top: 0 })
	}, [id])

	return (
		<Paper
			elevation={6}
			role="region"
			aria-label={t.title}
			sx={{
				...(mobile
					? { maxHeight: more ? "58dvh" : "38dvh" }
					: {
							position: "absolute",
							left: 16,
							top: 84,
							width: CARD_W,
							maxHeight: `calc(100% - ${84 + inset + 12}px)`,
							zIndex: 3,
						}),
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
				borderRadius: 3,
				borderTop: `4px solid ${c.accent}`,
				"@keyframes tt-card": {
					from: {
						opacity: 0,
						transform: mobile ? "translateY(16px)" : "translateX(-16px)",
					},
					to: { opacity: 1, transform: "none" },
				},
				animation: "tt-card 280ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
				"@media (prefers-reduced-motion: reduce)": { animation: "none" },
			}}
		>
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					gap: 1,
					pl: 2,
					pr: 1,
					pt: 0.75,
				}}
			>
				<Typography
					noWrap
					sx={{
						flex: 1,
						fontSize: 10.5,
						fontWeight: 700,
						letterSpacing: "0.08em",
						textTransform: "uppercase",
						color: c.accent,
					}}
				>
					Kapitel {c.number} · {c.title}
				</Typography>
				<IconButton size="small" onClick={onClose} aria-label="Text schließen">
					<CloseIcon fontSize="small" />
				</IconButton>
			</Box>

			<Box
				ref={scroller}
				sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2, pb: 1.75 }}
			>
				<Box key={id} sx={fade}>
					{opening && (
						<Box
							sx={{
								mt: 0.25,
								mb: 1.5,
								pb: 1.5,
								borderBottom: 1,
								borderColor: "divider",
							}}
						>
							<Typography
								component="h2"
								sx={{
									fontFamily: SERIF,
									fontSize: mobile ? 22 : 26,
									fontWeight: 600,
									lineHeight: 1.1,
									color: c.accent,
								}}
							>
								{c.title}
							</Typography>
							<Typography
								sx={{ fontSize: 12, fontWeight: 600, color: INK, mt: 0.25 }}
							>
								{c.years}
							</Typography>
							<Typography
								sx={{
									fontFamily: SERIF,
									fontStyle: "italic",
									fontSize: 15.5,
									lineHeight: 1.45,
									mt: 0.75,
									color: "#4a3b2a",
								}}
							>
								{c.intro}
							</Typography>
						</Box>
					)}
					<Typography
						variant="overline"
						color="text.secondary"
						sx={{ display: "block", lineHeight: 1.4, letterSpacing: 0.8 }}
					>
						{citation(t)}
					</Typography>
					<Typography
						component={opening ? "h3" : "h2"}
						sx={{
							fontFamily: SERIF,
							fontWeight: 600,
							fontSize: mobile ? 19 : 21,
							lineHeight: 1.15,
							mt: 0.25,
						}}
					>
						{t.title}
					</Typography>
					<When t={t} accent={c.accent} />
					<Typography
						sx={{
							fontFamily: SERIF,
							fontSize: 16.5,
							lineHeight: 1.5,
							mt: 1.25,
							...(compact && {
								display: "-webkit-box",
								WebkitLineClamp: opening ? 2 : 3,
								WebkitBoxOrient: "vertical",
								overflow: "hidden",
							}),
						}}
					>
						{t.german}
					</Typography>
					{compact ? (
						<ButtonBase
							onClick={() => setMore(true)}
							sx={{ mt: 0.5, fontSize: 13, fontWeight: 600, color: PURPLE }}
						>
							Weiterlesen
						</ButtonBase>
					) : (
						<Details t={t} />
					)}
				</Box>
			</Box>
		</Paper>
	)
}

/** Wann geschehen, wann geschrieben und wie weit das auseinanderliegt. */
function When({ t, accent }) {
	if (t.group !== "feldzug") {
		return (
			<Typography
				variant="caption"
				color="text.secondary"
				component="div"
				sx={{ mt: 0.5 }}
			>
				{t.dated ?? `Entstanden ${t.year}.`}
			</Typography>
		)
	}
	const [date, remark] = splitWritten(t.written)
	const later = laterBy(t.year, t.written)
	const symbol = (filled) => (
		<Box
			sx={{
				width: 8,
				height: 8,
				borderRadius: "50%",
				border: `1.5px solid ${accent}`,
				bgcolor: filled ? accent : "#fff",
				flexShrink: 0,
			}}
		/>
	)
	return (
		<Box
			sx={{
				mt: 0.75,
				display: "grid",
				gridTemplateColumns: "auto auto 1fr",
				columnGap: 0.75,
				rowGap: 0.25,
				alignItems: "center",
				fontSize: 12.5,
				color: "text.secondary",
			}}
		>
			{symbol(true)}
			<span>Geschehen</span>
			<Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>
				{t.year}
			</Box>
			{symbol(false)}
			<span>Geschrieben</span>
			<span>
				<Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>
					{date}
				</Box>
				{later && `, ${later}`}
			</span>
			{remark && (
				<Box
					component="span"
					sx={{ gridColumn: "2 / 4", fontStyle: "italic", lineHeight: 1.35 }}
				>
					{remark}.
				</Box>
			)}
		</Box>
	)
}

function Details({ t }) {
	const geo = hasTextGeo(t.id)
	const [original, setOriginal] = useState(false)
	const greek = t.language === "griechisch"
	return (
		<>
			{t.latin && (
				<>
					<ButtonBase
						onClick={() => setOriginal(!original)}
						aria-expanded={original}
						sx={{
							mt: 1,
							px: 1,
							ml: -1,
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
						<Typography
							lang={greek ? "grc" : "la"}
							sx={{
								mt: 0.75,
								px: 1.5,
								py: 1,
								borderRadius: 2,
								bgcolor: "#faf7f2",
								borderLeft: "3px solid #c9b79c",
								fontFamily: SERIF,
								fontStyle: "italic",
								fontSize: 15.5,
								lineHeight: 1.5,
								color: "#4a3b2a",
							}}
						>
							{t.latin}
						</Typography>
					</Collapse>
				</>
			)}

			<Box
				sx={{
					mt: 1.25,
					p: 1.25,
					borderRadius: 2,
					bgcolor: TINT,
					borderLeft: 3,
					borderColor: geo ? PURPLE : "divider",
				}}
			>
				<Typography
					sx={{
						display: "flex",
						alignItems: "center",
						gap: 0.5,
						fontSize: 10,
						fontWeight: 700,
						letterSpacing: 0.8,
						textTransform: "uppercase",
						color: geo ? PURPLE : "text.secondary",
					}}
				>
					{geo && <MapIcon sx={{ fontSize: 14 }} />}
					{geo ? "Auf der Karte" : "Für die Karte, ohne Ortsangabe"}
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
				{t.latin && "Übersetzung mit KI erstellt, nicht philologisch geprüft."}
				<Link
					href={t.url}
					target="_blank"
					rel="noreferrer"
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
		</>
	)
}
