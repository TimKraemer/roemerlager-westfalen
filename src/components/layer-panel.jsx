"use client"

import InfoIcon from "@mui/icons-material/InfoOutlined"
import {
	Box,
	Button,
	Checkbox,
	CircularProgress,
	Collapse,
	FormControlLabel,
	IconButton,
	Link,
	Slider,
	Stack,
	Switch,
	ToggleButton,
	ToggleButtonGroup,
	Tooltip,
	Typography,
} from "@mui/material"
import { useEffect, useState } from "react"
import { hasLayerSources, layerCsl } from "@/lib/layer-sources"
import {
	altkartenAvailable,
	BASE_LAYERS,
	HISTORIC_GROUP,
	OVERLAYS,
} from "@/lib/layers"
import { prefetchLayer } from "@/lib/prefetch"
import { DEFAULT_REGION } from "@/lib/regions"
import { SITE_TYPES } from "@/lib/sites"
import { anyLayerVisible, useMapStore } from "@/store/use-map-store"
import { openCite } from "./cite-dialog"
import CustomLayers from "./custom-layers"
import Fold from "./fold"

export function SectionTitle({ children }) {
	return (
		<Typography
			variant="overline"
			color="text.secondary"
			sx={{ display: "block", mt: 2, mb: 0.5, lineHeight: 1.6 }}
		>
			{children}
		</Typography>
	)
}

// Kurze Namen für die Kacheln der Grundkarte, der volle Name im Tooltip
const BASE_SHORT = {
	luftbild: "Luftbild",
	"topplus-grau": "Topo grau",
	topplus: "Topo farbig",
	osm: "OpenStreetMap",
}

export default function LayerPanel({ onFlyTo }) {
	const anyVisible = useMapStore(anyLayerVisible)
	const setAllLayers = useMapStore((s) => s.setAllLayers)
	const overlays = useMapStore((s) => s.overlays)
	const folds = useMapStore((s) => s.folds)
	const setFold = useMapStore((s) => s.setFold)
	const customLayers = useMapStore((s) => s.customLayers)
	// Zahl, kein Array, sonst rendert der Selektor endlos neu
	const helpers = useMapStore(
		(s) => [s.showStages, s.showRegion].filter(Boolean).length,
	)

	const [hasAltkarten, setHasAltkarten] = useState(false)
	useEffect(() => {
		altkartenAvailable().then(setHasAltkarten)
	}, [])

	// Altkarten-Kacheln liegen nicht im Repo, ohne sie fehlen die Einträge
	const shown = OVERLAYS.filter((o) => !o.altkarte || hasAltkarten)
	const main = shown.filter((o) => o.main)
	const historic = shown.filter((o) => o.group === HISTORIC_GROUP)
	const more = shown.filter((o) => !o.main && o.group !== HISTORIC_GROUP)
	const moreGroups = [...new Set(more.map((o) => o.group))]
	const moreOn = more.filter((o) => overlays[o.id].visible).length + helpers
	const customOn = customLayers.filter((l) => l.visible).length

	return (
		<Box>
			<Stack
				direction="row"
				sx={{ alignItems: "center", justifyContent: "space-between" }}
			>
				<SectionTitle>Grundkarte</SectionTitle>
				<Tooltip
					title={
						anyVisible
							? "Blendet alles über der Grundkarte aus"
							: "Stellt die vorige Auswahl wieder her"
					}
				>
					<Button
						size="small"
						onClick={() => setAllLayers(!anyVisible)}
						sx={{ mt: 1.5, textTransform: "none" }}
					>
						{anyVisible ? "Nur Grundkarte" : "Ebenen wieder an"}
					</Button>
				</Tooltip>
			</Stack>
			<BasePicker />

			<SectionTitle>Auf der Karte</SectionTitle>
			<SitesRow />
			<StoreSwitch
				field="heatmap"
				id="heatmap"
				label="Potenzialkarte"
				note="Farbfläche der Analyse. Schwelle und Deckkraft im Reiter Analyse."
			/>
			<StoreSwitch
				field="showCandidates"
				id="candidates"
				label="Vermutete Lagerplätze"
				note="Am besten bewertete Stellen der Analyse, nummeriert nach Rang"
			/>
			<StoreSwitch
				field="showRoutes"
				id="routes"
				label="Mögliche Marschwege"
				note="Weg geringster Gehzeit zwischen bekannten Lagern (Modell), gestrichelt zu Kalkriese und zum vermuteten Lager Löhne"
			/>
			<StoreSwitch
				field="showRoads"
				id="roads"
				label="Römerstraßen"
				note="Belegt durchgezogen, vermutet gestrichelt"
			/>
			<StoreSwitch
				field="showRings"
				id="rings"
				label="1 Tagesmarsch um jedes Marschlager"
				note="Ring von rund 20 km, Abstand und Streuung im Reiter Analyse unter Experteneinstellungen"
			/>
			<StoreSwitch
				field="showWaterways"
				id="waterways"
				label="Bäche und Flüsse vor der Begradigung"
				note="Die Gewässer, mit denen das Modell rechnet, ohne Kanäle. Große Flüsse im Lauf der Uraufnahme um 1840, bei Haltern und Xanten im römerzeitlichen Lauf. Woher die Bäche stammen, steht im Reiter Analyse unter Experteneinstellungen."
			/>
			{main.map((layer) => (
				<OverlayItem key={layer.id} layer={layer} onFlyTo={onFlyTo} />
			))}
			<ModelSwitch />

			<SectionTitle>{HISTORIC_GROUP}</SectionTitle>
			<HistoricLayers layers={historic} onFlyTo={onFlyTo} />

			<Fold
				title="Weitere Ebenen"
				badge={moreOn ? `${moreOn} an` : null}
				open={folds.more}
				onToggle={(open) => setFold("more", open)}
			>
				<SectionTitle>Hilfslinien des Modells</SectionTitle>
				<StoreSwitch
					field="showStages"
					id="stops"
					label="Mögliche Etappenhalte"
					note="Nach je einem Tagesmarsch entlang der Marschwege, die beste Stelle im Umkreis von 3 km"
				/>
				<StoreSwitch
					field="showRegion"
					id="boundary"
					label="Grenze des Untersuchungsgebiets"
					note={`${DEFAULT_REGION.label}, für den die Analyse rechnet`}
				/>
				{moreGroups.map((group) => (
					<Box key={group}>
						<SectionTitle>{group}</SectionTitle>
						{more
							.filter((o) => o.group === group)
							.map((layer) => (
								<OverlayItem key={layer.id} layer={layer} onFlyTo={onFlyTo} />
							))}
					</Box>
				))}
			</Fold>

			<Fold
				title="Eigene Karten"
				badge={
					customLayers.length ? `${customOn} von ${customLayers.length}` : null
				}
				open={folds.custom}
				onToggle={(open) => setFold("custom", open)}
			>
				<CustomLayers />
			</Fold>
		</Box>
	)
}

/** Grundkarte als vier Kacheln statt einer Liste mit Erläuterungen. */
function BasePicker() {
	const baseLayer = useMapStore((s) => s.baseLayer)
	const setBaseLayer = useMapStore((s) => s.setBaseLayer)
	return (
		<ToggleButtonGroup
			exclusive
			size="small"
			value={baseLayer}
			onChange={(_, v) => v && setBaseLayer(v)}
			aria-label="Grundkarte"
			sx={{
				display: "grid",
				gridTemplateColumns: "1fr 1fr",
				gap: 0.75,
				"& .MuiToggleButtonGroup-grouped": {
					// Kacheln statt verbundener Knöpfe
					m: 0,
					border: 1,
					borderColor: "divider",
					borderRadius: 1,
				},
			}}
		>
			{BASE_LAYERS.map((layer) => (
				<Tooltip
					key={layer.id}
					title={[layer.label, layer.note].filter(Boolean).join(": ")}
					placement="top"
				>
					<ToggleButton
						id={`ebene-${layer.id}`}
						value={layer.id}
						// Kacheln schon holen, bevor der Klick kommt
						onMouseEnter={() =>
							layer.id !== baseLayer && prefetchLayer(layer.id)
						}
						onFocus={() => layer.id !== baseLayer && prefetchLayer(layer.id)}
						sx={{ textTransform: "none", py: 0.5 }}
					>
						{BASE_SHORT[layer.id] ?? layer.label}
					</ToggleButton>
				</Tooltip>
			))}
		</ToggleButtonGroup>
	)
}

/**
 * Eine Zeile mit Schalter. Erläuterung, Links und Deckkraft stecken hinter
 * dem Info-Knopf, damit die Liste kurz bleibt.
 */
function LayerRow({
	id,
	checked,
	onChange,
	label,
	marker,
	details,
	onPrefetch,
	children,
}) {
	const [open, setOpen] = useState(false)
	return (
		<Box id={id && `ebene-${id}`} sx={{ borderRadius: 1 }}>
			<Stack direction="row" sx={{ alignItems: "center", minHeight: 34 }}>
				<FormControlLabel
					onMouseEnter={onPrefetch}
					onFocus={onPrefetch}
					control={
						<Switch
							size="small"
							checked={checked}
							onChange={(e) => onChange(e.target.checked)}
						/>
					}
					label={
						<Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
							<Typography variant="body2">{label}</Typography>
							{marker}
						</Stack>
					}
					sx={{ flex: 1, minWidth: 0, mr: 0 }}
				/>
				{details && (
					<IconButton
						size="small"
						onClick={() => setOpen(!open)}
						aria-label={`Mehr zu ${label}`}
						aria-expanded={open}
						sx={{ color: open ? "primary.main" : "text.disabled" }}
					>
						<InfoIcon sx={{ fontSize: 18 }} />
					</IconButton>
				)}
			</Stack>
			{children}
			{details && (
				<Collapse in={open} unmountOnExit>
					<Box sx={{ ml: 5, mr: 1, pb: 1 }}>{details}</Box>
				</Collapse>
			)}
		</Box>
	)
}

/** Schalter für ein Feld im Store (showRoutes usw. oder heatmap). */
function StoreSwitch({ field, id, label, note }) {
	const checked = useMapStore((s) =>
		field === "heatmap" ? s.heatmap.visible : s[field],
	)
	const set = (on) => {
		const s = useMapStore.getState()
		if (field === "heatmap") s.setHeatmap({ visible: on })
		else useMapStore.setState({ [field]: on })
	}
	return (
		<LayerRow
			id={id}
			checked={checked}
			onChange={set}
			label={label}
			details={<Details layer={{ id, label, note }} />}
		/>
	)
}

/** Alle Fundstellen mit einem Schalter, die Arten einzeln im Info-Bereich. */
function SitesRow() {
	const siteTypes = useMapStore((s) => s.siteTypes)
	const toggleSiteType = useMapStore((s) => s.toggleSiteType)
	const setAllSiteTypes = useMapStore((s) => s.setAllSiteTypes)
	const on = SITE_TYPES.filter((t) => siteTypes[t.id])
	return (
		<LayerRow
			id="fundstellen"
			checked={on.length > 0}
			onChange={setAllSiteTypes}
			label="Fundstellen"
			marker={
				on.length > 0 &&
				on.length < SITE_TYPES.length && (
					<Typography variant="caption" color="text.secondary">
						{on.length} von {SITE_TYPES.length}
					</Typography>
				)
			}
			details={
				<Stack>
					{SITE_TYPES.map((t) => (
						<FormControlLabel
							key={t.id}
							control={
								<Checkbox
									size="small"
									checked={siteTypes[t.id]}
									onChange={() => toggleSiteType(t.id)}
									sx={{
										py: 0.25,
										color: t.color,
										"&.Mui-checked": { color: t.color },
									}}
								/>
							}
							label={<Typography variant="body2">{t.label}</Typography>}
						/>
					))}
				</Stack>
			}
		/>
	)
}

function ModelSwitch() {
	const showModel = useMapStore((s) => s.showModel)
	const setShowModel = useMapStore((s) => s.setShowModel)
	const modelOpacity = useMapStore((s) => s.modelOpacity)
	const setModelOpacity = useMapStore((s) => s.setModelOpacity)
	const label = "3D-Modell Römerlager Oberaden"
	return (
		<LayerRow
			id="model3d"
			checked={showModel}
			onChange={setShowModel}
			label={label}
			details={
				<>
					<Details
						layer={{
							id: "model3d",
							label,
							note: "Ab Zoomstufe 15, mit Beschriftungen und Link. Modell aus der Bergkamen-App, Maßstab nach dem LWL-Grabungsplan, Lage am erhaltenen Graben der Nordfront",
						}}
					/>
					<Opacity
						value={modelOpacity}
						onChange={setModelOpacity}
						label={label}
					/>
				</>
			}
		/>
	)
}

/**
 * Historische Karten als senkrechter Zeitstrahl: Jahr, Punkt auf der Linie,
 * Schalter. Darunter Gewässer, Moore, Wald und Wege um 1840.
 */
function HistoricLayers({ layers, onFlyTo }) {
	const overlays = useMapStore((s) => s.overlays)
	const dated = layers.filter((l) => l.year).sort((a, b) => a.year - b.year)
	const themes = layers.filter((l) => !l.year)
	return (
		<>
			<Box role="list" aria-label="Historische Karten nach Jahr">
				{dated.map((layer, i) => (
					<TimelineRow
						key={layer.id}
						year={layer.year}
						active={overlays[layer.id].visible}
						first={i === 0}
						last={i === dated.length - 1}
					>
						<OverlayItem
							layer={{
								...layer,
								// Jahr steht schon am Zeitstrahl
								label: layer.label.replace(/^\d{4}\s+/, ""),
							}}
							onFlyTo={onFlyTo}
						/>
					</TimelineRow>
				))}
			</Box>
			{themes.length > 0 && (
				<Box sx={{ mt: 1 }}>
					{themes.map((layer) => (
						<OverlayItem key={layer.id} layer={layer} onFlyTo={onFlyTo} />
					))}
				</Box>
			)}
		</>
	)
}

function TimelineRow({ year, active, first, last, children }) {
	return (
		<Box role="listitem" sx={{ display: "flex" }}>
			<Typography
				variant="caption"
				sx={{
					width: 32,
					flexShrink: 0,
					pt: "8px",
					textAlign: "right",
					fontVariantNumeric: "tabular-nums",
					color: active ? "text.primary" : "text.secondary",
					fontWeight: active ? 600 : 400,
				}}
			>
				{year}
			</Typography>
			<Box aria-hidden sx={{ position: "relative", width: 22, flexShrink: 0 }}>
				{!(first && last) && (
					<Box
						sx={{
							position: "absolute",
							left: 10,
							width: 2,
							bgcolor: "divider",
							top: first ? 17 : 0,
							...(last ? { height: 17 } : { bottom: 0 }),
						}}
					/>
				)}
				<Box
					sx={{
						position: "absolute",
						left: 6,
						top: 12,
						width: 10,
						height: 10,
						borderRadius: "50%",
						border: 2,
						borderColor: active ? "primary.main" : "text.disabled",
						bgcolor: active ? "primary.main" : "background.paper",
					}}
				/>
			</Box>
			<Box sx={{ flex: 1, minWidth: 0, pl: 0.75 }}>{children}</Box>
		</Box>
	)
}

function OverlayItem({ layer, onFlyTo }) {
	const state = useMapStore((s) => s.overlays[layer.id])
	const setOverlay = useMapStore((s) => s.setOverlay)
	return (
		<LayerRow
			id={layer.id}
			checked={state.visible}
			onChange={(visible) => setOverlay(layer.id, { visible })}
			label={layer.label}
			onPrefetch={() => !state.visible && prefetchLayer(layer.id)}
			details={
				<>
					<Details
						layer={layer}
						onJump={
							onFlyTo &&
							(() => {
								// Springen schaltet die Ebene gleich mit ein
								setOverlay(layer.id, { visible: true })
								onFlyTo(...layer.jump)
							})
						}
					/>
					<Opacity
						value={state.opacity}
						onChange={(opacity) => setOverlay(layer.id, { opacity })}
						label={layer.label}
					/>
				</>
			}
		>
			{state.visible && <OverlayStatus layer={layer} />}
		</LayerRow>
	)
}

function Opacity({ value, onChange, label }) {
	return (
		<Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mt: 0.5 }}>
			<Typography variant="caption" color="text.secondary">
				Deckkraft
			</Typography>
			<Slider
				size="small"
				min={0.1}
				max={1}
				step={0.05}
				value={value}
				onChange={(_, v) => onChange(v)}
				aria-label={`Deckkraft ${label}`}
			/>
		</Stack>
	)
}

/** Hinweis unter einer eingeschalteten Ebene: lädt, zu weit weg, außerhalb. */
function OverlayStatus({ layer }) {
	const status = useMapStore((s) => s.overlayStatus[layer.id])
	if (!status) return null
	const text = {
		loading: "Lädt …",
		zoom: `Erst ab Zoom ${Math.ceil(layer.minzoom)} sichtbar, näher heranzoomen`,
		outside: "Liegt außerhalb des Ausschnitts",
	}[status]
	return (
		<Stack
			direction="row"
			spacing={1}
			sx={{ alignItems: "center", ml: 5, mt: -0.5, color: "text.secondary" }}
		>
			{status === "loading" && <CircularProgress size={12} />}
			<Typography variant="caption">{text}</Typography>
		</Stack>
	)
}

/** Öffnet den Zitierdialog mit der Ebene und ihren Daten und Methoden. */
export function openLayerSources(id, label) {
	const items = layerCsl(id)
	const own = items[0]?.id.endsWith(`-${id}`)
	openCite({
		title: `Quellen: ${label}`,
		intro: own
			? "Die Ebene als Teil dieser Anwendung und die Daten und Methoden, aus denen sie entsteht."
			: "Die Ebene zeigt einen fremden Kartendienst, zitiert wird dessen Anbieter.",
		items,
		base: `quellen-${id}`,
	})
}

export function SourcesLink({ id, label }) {
	return (
		<Link
			component="button"
			variant="caption"
			sx={{ verticalAlign: "baseline" }}
			onClick={(e) => {
				e.preventDefault()
				openLayerSources(id, label)
			}}
		>
			Quellen und zitieren
		</Link>
	)
}

/** Erläuterung und Links einer Ebene im aufgeklappten Info-Bereich. */
function Details({ layer, onJump }) {
	const jump = layer.jump && onJump
	const sources = layer.id && hasLayerSources(layer.id)
	if (!(layer.note || jump || layer.info || sources)) return null
	return (
		<Typography variant="caption" color="text.secondary" component="div">
			{layer.note}
			{jump && (
				<>
					{layer.note && " "}
					<Link
						component="button"
						variant="caption"
						sx={{ verticalAlign: "baseline" }}
						onClick={onJump}
					>
						Dorthin springen
					</Link>
				</>
			)}
			{layer.info && (
				<>
					{" "}
					<Link href={layer.info} target="_blank" rel="noreferrer">
						Info
					</Link>
				</>
			)}
			{sources && (
				<>
					{(layer.note || jump || layer.info) && " "}
					<SourcesLink id={layer.id} label={layer.label} />
				</>
			)}
		</Typography>
	)
}
