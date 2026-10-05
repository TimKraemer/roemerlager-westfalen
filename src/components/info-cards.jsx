"use client"

import CloseIcon from "@mui/icons-material/Close"
import {
	Box,
	Chip,
	IconButton,
	LinearProgress,
	Link,
	Paper,
	Stack,
	Typography,
} from "@mui/material"
import { FACTORS } from "@/lib/potential/model"
import { SITE_TYPE_BY_ID, SITES } from "@/lib/sites"
import { useMapStore } from "@/store/use-map-store"

const cardSx = {
	position: "absolute",
	right: 16,
	top: 16,
	width: 340,
	maxWidth: "calc(100vw - 32px)",
	maxHeight: "calc(100vh - 140px)",
	overflow: "auto",
	p: 2,
	zIndex: 2,
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

function InspectCard({ data }) {
	const setInspect = useMapStore((s) => s.setInspect)
	return (
		<Paper elevation={4} sx={cardSx}>
			<CardHeader
				title={`Potenzial ${data.score.toFixed(2)}`}
				onClose={() => setInspect(null)}
			>
				<Typography variant="caption" color="text.secondary">
					{data.lat.toFixed(5)}° N, {data.lon.toFixed(5)}° O
				</Typography>
			</CardHeader>
			{FACTORS.map((f) => (
				<Box key={f.key} sx={{ mb: 1 }}>
					<Stack direction="row" sx={{ justifyContent: "space-between" }}>
						<Typography variant="body2">{f.label}</Typography>
						<Typography variant="body2" color="text.secondary">
							{data.factors[f.key].toFixed(2)}
						</Typography>
					</Stack>
					<LinearProgress
						variant="determinate"
						value={data.factors[f.key] * 100}
					/>
				</Box>
			))}
			<Box
				component="dl"
				sx={{
					display: "grid",
					gridTemplateColumns: "auto 1fr",
					columnGap: 2,
					rowGap: 0.25,
					m: 0,
					mt: 1.5,
					"& dt": { color: "text.secondary", typography: "caption" },
					"& dd": { m: 0, typography: "caption", textAlign: "right" },
				}}
			>
				<dt>Höhe</dt>
				<dd>{Math.round(data.elev)} m ü. NHN</dd>
				<dt>Höher als Umgebung</dt>
				<dd>
					{data.tpi >= 0 ? "+" : ""}
					{data.tpi.toFixed(1)} m
				</dd>
				<dt>Neigung</dt>
				<dd>{data.slope.toFixed(1)}°</dd>
				<dt>Nächster Bach/Fluss</dt>
				<dd>{fmtM(data.distWater)}</dd>
				<dt>Nächster Fluss</dt>
				<dd>{fmtM(data.distRiver)}</dd>
				<dt>Nächstes bekanntes Lager</dt>
				<dd>{fmtM(data.distCamp)}</dd>
			</Box>
			<Typography
				variant="caption"
				color="text.secondary"
				component="p"
				sx={{ mt: 1.5, mb: 0 }}
			>
				Prüfen: Schummerung (DGM1) und historische Karten an dieser Stelle
				einschalten und nach geraden Gräben mit abgerundeten Ecken suchen.
			</Typography>
		</Paper>
	)
}
