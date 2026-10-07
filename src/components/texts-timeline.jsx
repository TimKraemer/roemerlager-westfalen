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
import {
	Box,
	Button,
	ButtonBase,
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
				if (!desktop) select(FIRST)
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
function Bar({ selected, onSelect, onCollapse, mobile }) {
	const [info, setInfo] = useState(null)
	const { index, prev, next } = selected
		? neighbours(selected)
		: { index: -1, prev: null, next: null }
	const current = selected ? chapterOf(selected) : null
	const accent = current?.accent ?? CHAPTERS[0].accent
	const atEnd = selected && !next

	const forward = () => onSelect(selected ? (next?.id ?? FIRST) : FIRST)

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
				<Box sx={{ display: "flex", gap: mobile ? 0.75 : 1 }}>
					{CHAPTERS.map((c) => (
						<Chapter
							key={c.id}
							c={c}
							index={index}
							selected={selected}
							active={c === current}
							onSelect={onSelect}
							mobile={mobile}
						/>
					))}
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
				{!selected ? "Starten" : atEnd ? "Von vorn" : "Weiter"}
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

function Chapter({ c, index, selected, active, onSelect, mobile }) {
	const start = ORDERED.indexOf(c.texts[0])
	return (
		<Box
			sx={{
				// Kurze Kapitel brauchen Platz für den Titel
				flex: `${c.texts.length + (mobile ? 0 : 3)} 1 0`,
				minWidth: 0,
				borderRadius: 2,
				px: mobile ? 0.25 : 0.75,
				pt: mobile ? 0 : 0.5,
				pb: mobile ? 0.25 : 0.5,
				bgcolor: active && !mobile ? `${c.accent}12` : "transparent",
				transition: "background-color 200ms",
			}}
		>
			{!mobile && (
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
			)}
			{/* Spur mit einem Punkt je Text */}
			<Box
				sx={{
					position: "relative",
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					height: mobile ? 16 : 20,
					mt: mobile ? 0 : 0.5,
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
						mobile={mobile}
					/>
				))}
			</Box>
		</Box>
	)
}

function Pip({ t, accent, state, onSelect, mobile }) {
	const size = state === "current" ? (mobile ? 12 : 14) : mobile ? 8 : 10
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
					width: mobile ? 12 : 18,
					height: mobile ? 16 : 20,
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
				Kapiteltexte ebenfalls mit KI geschrieben.
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
