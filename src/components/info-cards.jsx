"use client"

import CheckCircleIcon from "@mui/icons-material/CheckCircle"
import CloseIcon from "@mui/icons-material/Close"
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined"
import {
	Box,
	Button,
	Chip,
	IconButton,
	Link,
	Paper,
	Stack,
	Typography,
} from "@mui/material"
import { useState } from "react"
import {
	CRITERIA_SOURCES,
	explain,
	explainSimple,
	nearestSites,
	placeLabel,
} from "@/lib/criteria"
import { FACTORS } from "@/lib/potential/model"
import { SITE_TYPE_BY_ID, SITES } from "@/lib/sites"
import { useMapStore } from "@/store/use-map-store"

// Desktop rechts oben, auf dem Handy als Panel am unteren Rand
const cardSx = {
	position: "absolute",
	right: 16,
	top: { xs: "auto", md: 16 },
	bottom: { xs: 16, md: "auto" },
	left: { xs: 16, md: "auto" },
	width: { xs: "auto", md: 360 },
	maxHeight: { xs: "55dvh", md: "calc(100dvh - 140px)" },
	overflow: "auto",
	p: 2,
	zIndex: 3,
}

const fmtM = (m) =>
	!Number.isFinite(m)
		? "–"
		: m >= 1000
			? `${(m / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} km`
			: `${Math.round(m)} m`

export function InfoCards() {
	const selectedSite = useMapStore((s) => s.selectedSite)
	const inspect = useMapStore((s) => s.inspect)
	if (selectedSite) return <SiteCard id={selectedSite} />
	if (inspect) return <InspectCard data={inspect} />
	return null
}

function CardHeader({ title, onClose, children }) {
	return (
		<Stack direction="row" sx={{ alignItems: "flex-start", mb: 1 }}>
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Typography
					variant="subtitle1"
					sx={{ fontWeight: 600, lineHeight: 1.3 }}
				>
					{title}
				</Typography>
				{children}
			</Box>
			<IconButton size="small" onClick={onClose} aria-label="Schließen">
				<CloseIcon fontSize="small" />
			</IconButton>
		</Stack>
	)
}

function SiteCard({ id }) {
	const setSelectedSite = useMapStore((s) => s.setSelectedSite)
	const feature = SITES.features.find((f) => f.properties.id === id)
	if (!feature) return null
	const p = feature.properties
	const type = SITE_TYPE_BY_ID[p.type]
	const [lon, lat] = feature.geometry.coordinates
	return (
		<Paper elevation={4} sx={cardSx}>
			<CardHeader title={p.name} onClose={() => setSelectedSite(null)}>
				<Stack
					direction="row"
					spacing={0.5}
					sx={{ mt: 0.5, flexWrap: "wrap", gap: 0.5 }}
				>
					<Chip
						size="small"
						label={type?.label ?? p.type}
						sx={{ bgcolor: type?.color, color: "#fff" }}
					/>
					{p.dating && (
						<Chip size="small" variant="outlined" label={p.dating} />
					)}
					{p.status && p.status !== "bestätigt" && (
						<Chip
							size="small"
							color="warning"
							variant="outlined"
							label={p.status}
						/>
					)}
					{p.size_ha && (
						<Chip size="small" variant="outlined" label={`${p.size_ha} ha`} />
					)}
				</Stack>
			</CardHeader>
			{p.place && (
				<Typography variant="body2" color="text.secondary">
					{p.place}
				</Typography>
			)}
			{p.description && (
				<Typography variant="body2" sx={{ mt: 1 }}>
					{p.description}
				</Typography>
			)}
			{!p.inModel &&
				["marschlager", "legionslager", "kastell"].includes(p.type) && (
					<Typography
						variant="caption"
						color="text.secondary"
						component="p"
						sx={{ mt: 1 }}
					>
						Nicht augusteisch gesichert, deshalb nicht im Potenzialmodell.
					</Typography>
				)}
			<Typography
				variant="caption"
				color="text.secondary"
				component="div"
				sx={{ mt: 1.5 }}
			>
				{lat.toFixed(4)}° N, {lon.toFixed(4)}° O · Genauigkeit: {p.precision}
			</Typography>
			{p.sources?.length > 0 && (
				<Stack sx={{ mt: 1 }} spacing={0.25}>
					{p.sources.map((s) => (
						<Link
							key={s.url}
							href={s.url}
							target="_blank"
							rel="noreferrer"
							variant="caption"
						>
							{s.label}
						</Link>
					))}
				</Stack>
			)}
		</Paper>
	)
}

const VERDICT_COLOR = { gut: "success", mittel: "warning", schwach: "default" }

function inspectTitle(data, place) {
	const where = place ? ` ${place}` : ""
	if (data.kind === "candidate")
		return `Vermuteter Lagerplatz${data.rank ? ` ${data.rank}` : ""}${where}`
	if (data.kind === "stage") return `Möglicher Etappenhalt${where}`
	if (data.kind === "route") return "Möglicher Marschweg"
	return `Stelle${where}`
}

const levelText = (score) =>
	score >= 0.85
		? "sehr hoch"
		: score >= 0.7
			? "hoch"
			: score >= 0.5
				? "mittel"
				: "gering"

function SimpleReasons({ data }) {
	const { pro, contra } = explainSimple(data)
	return (
		<Box>
			<Typography variant="body2" sx={{ mb: 1 }}>
				Wahrscheinlichkeit für ein Lager: <b>{levelText(data.score)}</b>
			</Typography>
			{pro.length > 0 && (
				<Stack spacing={0.75}>
					{pro.map((t) => (
						<Stack key={t} direction="row" spacing={1}>
							<CheckCircleIcon
								fontSize="small"
								color="success"
								sx={{ mt: 0.25 }}
							/>
							<Typography variant="body2">{t}</Typography>
						</Stack>
					))}
				</Stack>
			)}
			{contra.map((t) => (
				<Stack key={t} direction="row" spacing={1} sx={{ mt: 0.75 }}>
					<InfoOutlinedIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
					<Typography variant="body2" color="text.secondary">
						{t}
					</Typography>
				</Stack>
			))}
		</Box>
	)
}

function InspectCard({ data }) {
	const setInspect = useMapStore((s) => s.setInspect)
	const setOverlay = useMapStore((s) => s.setOverlay)
	const params = useMapStore((s) => s.params)
	const places = useMapStore((s) => s.result?.places)
	const [openSources, setOpenSources] = useState(null)
	const [details, setDetails] = useState(false)
	const place = placeLabel(places, data.lon, data.lat)
	const items = explain(data, params)
	const near = nearestSites(data.lon, data.lat, 3)
	const label = (key) => FACTORS.find((f) => f.key === key)?.label
	return (
		<Paper elevation={4} sx={cardSx}>
			<CardHeader
				title={inspectTitle(data, place)}
				onClose={() => setInspect(null)}
			>
				<Typography variant="caption" color="text.secondary" component="div">
					Potenzial {data.score.toFixed(2)} · {data.lat.toFixed(5)}° N,{" "}
					{data.lon.toFixed(5)}° O · {Math.round(data.elev)} m ü. NHN
				</Typography>
			</CardHeader>

			{data.kind === "route" && (
				<Typography variant="body2" sx={{ mb: 1 }}>
					Ein möglicher Weg von {data.route.from} nach {data.route.to}:{" "}
					{data.route.km} km, etwa {data.route.days} Tagesmärsche. Berechnet als
					der Weg, der zu Fuß am wenigsten Zeit kostet, mit Umwegen um steile
					Hänge, nasse Niederungen und Flussquerungen.
					{data.route.partial &&
						" Das Ziel liegt außerhalb des Kartenausschnitts."}{" "}
					Belegt ist der Weg nicht.
				</Typography>
			)}
			{data.kind !== "route" && <SimpleReasons data={data} />}
			<Button
				size="small"
				onClick={() => setDetails(!details)}
				sx={{ mt: 1, px: 0, textTransform: "none" }}
			>
				{details ? "Weniger anzeigen" : "Messwerte, Begründung und Quellen"}
			</Button>
			{details && (
				<Box sx={{ mt: 1 }}>
					{data.kind === "stage" && (
						<Typography variant="body2" sx={{ mb: 1.5 }}>
							Etappe {data.stage.stage} von {data.stage.of} auf der berechneten
							Route {data.stage.from} – {data.stage.to}, nach {data.stage.km}{" "}
							km. Gesucht wurde die Stelle mit dem höchsten Potenzial im Umkreis
							von 3 km um den Etappenpunkt, sie liegt {data.stage.offset} m
							davon entfernt.
						</Typography>
					)}

					<Typography variant="overline" color="text.secondary">
						Warum hier?
					</Typography>
					{items.map((item) => (
						<Box key={item.key} sx={{ mb: 1.25 }}>
							<Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
								<Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
									{label(item.key)}
								</Typography>
								<Chip
									size="small"
									label={`${item.verdict} · ${data.factors[item.key].toFixed(2)}`}
									color={VERDICT_COLOR[item.verdict]}
									variant="outlined"
								/>
							</Stack>
							<Typography variant="body2" color="text.secondary">
								{item.text}{" "}
								<Link
									component="button"
									variant="caption"
									onClick={() =>
										setOpenSources(openSources === item.key ? null : item.key)
									}
								>
									Quellen
								</Link>
							</Typography>
							{openSources === item.key && (
								<Stack
									sx={{ mt: 0.5, pl: 1, borderLeft: 2, borderColor: "divider" }}
								>
									{CRITERIA_SOURCES[item.key].map((src) => (
										<Link
											key={src.url + src.label}
											href={src.url}
											target="_blank"
											rel="noreferrer"
											variant="caption"
										>
											{src.label}
										</Link>
									))}
								</Stack>
							)}
						</Box>
					))}

					<Typography
						variant="overline"
						color="text.secondary"
						component="div"
						sx={{ mt: 1 }}
					>
						Nächste bekannte Lager
					</Typography>
					{near.map((n) => (
						<Stack
							key={n.name}
							direction="row"
							sx={{ justifyContent: "space-between" }}
						>
							<Typography variant="body2">{n.name}</Typography>
							<Typography variant="body2" color="text.secondary">
								{fmtM(n.d)}
							</Typography>
						</Stack>
					))}

					<Typography
						variant="overline"
						color="text.secondary"
						component="div"
						sx={{ mt: 1.5 }}
					>
						Vor Ort prüfen
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Marschlager zeigen sich als gerade Gräben mit abgerundeten Ecken
						(„Spielkartenform“), oft nur im Laserscan oder als Bewuchsmerkmal.
					</Typography>
					<Stack
						direction="row"
						spacing={1}
						sx={{ mt: 1, flexWrap: "wrap", gap: 1 }}
					>
						<Button
							size="small"
							variant="outlined"
							onClick={() => setOverlay("schummerung-nrw", { visible: true })}
						>
							Schummerung DGM1
						</Button>
						<Button
							size="small"
							variant="outlined"
							onClick={() => setOverlay("uraufnahme", { visible: true })}
						>
							Uraufnahme 1840
						</Button>
						<Button
							size="small"
							variant="outlined"
							onClick={() => setOverlay("hist-dop", { visible: true })}
						>
							Luftbild 1950er
						</Button>
					</Stack>
				</Box>
			)}
		</Paper>
	)
}
