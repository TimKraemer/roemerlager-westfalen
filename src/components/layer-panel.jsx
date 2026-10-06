"use client"

import {
	Box,
	Checkbox,
	CircularProgress,
	FormControlLabel,
	Link,
	Radio,
	RadioGroup,
	Slider,
	Stack,
	Switch,
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

export default function LayerPanel({ onFlyTo }) {
	const baseLayer = useMapStore((s) => s.baseLayer)
	const setBaseLayer = useMapStore((s) => s.setBaseLayer)
	const overlays = useMapStore((s) => s.overlays)
	const setOverlay = useMapStore((s) => s.setOverlay)
	const siteTypes = useMapStore((s) => s.siteTypes)
	const toggleSiteType = useMapStore((s) => s.toggleSiteType)
	const showRings = useMapStore((s) => s.showRings)
	const setShowRings = useMapStore((s) => s.setShowRings)
	const showWaterways = useMapStore((s) => s.showWaterways)
	const showRoutes = useMapStore((s) => s.showRoutes)
	const setShowRoutes = useMapStore((s) => s.setShowRoutes)
	const showCandidates = useMapStore((s) => s.showCandidates)
	const setShowCandidates = useMapStore((s) => s.setShowCandidates)
	const showStages = useMapStore((s) => s.showStages)
	const setShowStages = useMapStore((s) => s.setShowStages)
	const showRoads = useMapStore((s) => s.showRoads)
	const showModel = useMapStore((s) => s.showModel)
	const modelOpacity = useMapStore((s) => s.modelOpacity)
	const setModelOpacity = useMapStore((s) => s.setModelOpacity)
	const setShowModel = useMapStore((s) => s.setShowModel)
	const setShowRoads = useMapStore((s) => s.setShowRoads)
	const setShowWaterways = useMapStore((s) => s.setShowWaterways)
	const showRegion = useMapStore((s) => s.showRegion)
	const setShowRegion = useMapStore((s) => s.setShowRegion)
	const heatmap = useMapStore((s) => s.heatmap)
	const setHeatmap = useMapStore((s) => s.setHeatmap)
	const anyVisible = useMapStore(anyLayerVisible)
	const setAllLayers = useMapStore((s) => s.setAllLayers)

	const [hasAltkarten, setHasAltkarten] = useState(false)
	useEffect(() => {
		altkartenAvailable().then(setHasAltkarten)
	}, [])

	const timeline = useMapStore((s) => s.timeline)
	const setTimeline = useMapStore((s) => s.setTimeline)

	// Altkarten-Kacheln liegen nicht im Repo, ohne sie fehlen die Einträge.
	// Historische Karten nach Jahr, die Gewässer daraus am Ende.
	const shown = OVERLAYS.filter((o) => !o.altkarte || hasAltkarten)
	const groups = [...new Set(shown.map((o) => o.group))]
	const inGroup = (group) => {
		const list = shown.filter((o) => o.group === group)
		return group === HISTORIC_GROUP
			? list.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999))
			: list
	}

	return (
		<Box>
			<HelperSwitch
				checked={anyVisible}
				onChange={setAllLayers}
				label="Alle Ebenen"
				note={
					anyVisible
						? "Ausschalten zeigt nur noch die Grundkarte"
						: "Einschalten stellt die vorige Auswahl wieder her"
				}
			/>
			<CustomLayers />

			<SectionTitle>Grundkarte</SectionTitle>
			<RadioGroup
				value={baseLayer}
				onChange={(e) => setBaseLayer(e.target.value)}
			>
				{BASE_LAYERS.map((layer) => (
					<FormControlLabel
						key={layer.id}
						id={`ebene-${layer.id}`}
						value={layer.id}
						control={<Radio size="small" />}
						label={<LayerLabel layer={layer} />}
						// Kacheln schon holen, bevor der Klick kommt
						onMouseEnter={() =>
							layer.id !== baseLayer && prefetchLayer(layer.id)
						}
						onFocus={() => layer.id !== baseLayer && prefetchLayer(layer.id)}
						sx={{
							alignItems: "flex-start",
							mb: 0.5,
							"& .MuiRadio-root": { pt: 0.5 },
						}}
					/>
				))}
			</RadioGroup>

			{groups.map((group) => (
				<Box key={group}>
					<SectionTitle>{group}</SectionTitle>
					{group === HISTORIC_GROUP && (
						<HelperSwitch
							checked={timeline.open}
							onChange={(open) => setTimeline({ open })}
							label="Zeitstrahl"
							note="Leiste über der Karte: Stände um 1840, um 1900 und heute, je mit Leitkarte und den Gewässern dieser Zeit"
						/>
					)}
					{inGroup(group).map((layer) => {
						const state = overlays[layer.id]
						return (
							<Box key={layer.id} id={`ebene-${layer.id}`} sx={{ mb: 1 }}>
								<FormControlLabel
									onMouseEnter={() => !state.visible && prefetchLayer(layer.id)}
									onFocus={() => !state.visible && prefetchLayer(layer.id)}
									control={
										<Switch
											size="small"
											checked={state.visible}
											onChange={(e) =>
												setOverlay(layer.id, { visible: e.target.checked })
											}
										/>
									}
									label={
										<LayerLabel
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
									}
									sx={{
										alignItems: "flex-start",
										"& .MuiSwitch-root": { mt: 0.25 },
									}}
								/>
								{state.visible && (
									<Slider
										size="small"
										min={0.1}
										max={1}
										step={0.05}
										value={state.opacity}
										onChange={(_, v) => setOverlay(layer.id, { opacity: v })}
										sx={{ ml: 5, width: "calc(100% - 56px)" }}
										aria-label={`Deckkraft ${layer.label}`}
									/>
								)}
								{state.visible && <OverlayStatus layer={layer} />}
							</Box>
						)
					})}
				</Box>
			))}

			<SectionTitle>Fundstellen</SectionTitle>
			<Stack>
				{SITE_TYPES.map((t) => (
					<FormControlLabel
						key={t.id}
						control={
							<Checkbox
								size="small"
								checked={siteTypes[t.id]}
								onChange={() => toggleSiteType(t.id)}
								sx={{ color: t.color, "&.Mui-checked": { color: t.color } }}
							/>
						}
						label={<Typography variant="body2">{t.label}</Typography>}
					/>
				))}
			</Stack>

			<SectionTitle>Analyse und Wege</SectionTitle>
			<HelperSwitch
				checked={heatmap.visible}
				onChange={(visible) => setHeatmap({ visible })}
				id="heatmap"
				label="Potenzialkarte"
				note="Farbfläche der Analyse, Schwelle und Deckkraft im Reiter Analyse"
			/>
			<HelperSwitch
				checked={showCandidates}
				onChange={setShowCandidates}
				id="candidates"
				label="Vermutete Lagerplätze"
				note="Am besten bewertete Stellen der Analyse, nummeriert nach Rang"
			/>
			<HelperSwitch
				checked={showRegion}
				onChange={setShowRegion}
				id="boundary"
				label="Grenze des Untersuchungsgebiets"
				note={`${DEFAULT_REGION.label}, für den die Analyse rechnet`}
			/>
			<HelperSwitch
				checked={showRings}
				onChange={setShowRings}
				id="rings"
				label="1 Tagesmarsch um jedes Marschlager"
			/>
			<HelperSwitch
				checked={showRoutes}
				onChange={setShowRoutes}
				id="routes"
				label="Mögliche Marschwege"
				note="Weg geringster Gehzeit zwischen bekannten Lagern (Modell), gestrichelt zu Kalkriese und zum vermuteten Lager Löhne"
			/>
			<HelperSwitch
				checked={showStages}
				onChange={setShowStages}
				id="stops"
				label="Mögliche Etappenhalte"
				note="Nach je einem Tagesmarsch entlang der Marschwege, die beste Stelle im Umkreis von 3 km"
			/>
			<HelperSwitch
				checked={showRoads}
				onChange={setShowRoads}
				id="roads"
				label="Römerstraßen"
				note="Belegt durchgezogen, vermutet gestrichelt"
			/>
			<HelperSwitch
				checked={showWaterways}
				onChange={setShowWaterways}
				id="waterways"
				label="Natürliches Gewässernetz der Analyse"
				note="Aus den Talzügen des Höhenmodells, ohne Kanäle. Große Flüsse im alten Lauf (Uraufnahme um 1840, bei Haltern und Xanten römerzeitlich)"
			/>
			<HelperSwitch
				checked={showModel}
				onChange={setShowModel}
				id="model3d"
				label="3D-Modell Römerlager Oberaden"
				note="Ab Zoomstufe 15, mit Beschriftungen und Link. Modell aus der Bergkamen-App, Maßstab nach dem LWL-Grabungsplan, Lage am erhaltenen Graben der Nordfront"
			/>
			{showModel && (
				<Slider
					size="small"
					min={0.1}
					max={1}
					step={0.05}
					value={modelOpacity}
					onChange={(_, v) => setModelOpacity(v)}
					sx={{ ml: 5, width: "calc(100% - 56px)" }}
					aria-label="Deckkraft 3D-Modell Römerlager Oberaden"
				/>
			)}
		</Box>
	)
}

function HelperSwitch({ checked, onChange, id, label, note }) {
	return (
		<FormControlLabel
			control={
				<Switch
					size="small"
					checked={checked}
					onChange={(e) => onChange(e.target.checked)}
				/>
			}
			label={<LayerLabel layer={{ id, label, note }} />}
			sx={{
				alignItems: "flex-start",
				mb: 0.5,
				"& .MuiSwitch-root": { mt: 0.25 },
			}}
		/>
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
				// sonst schaltet der Klick im Label auch den Schalter
				e.preventDefault()
				openLayerSources(id, label)
			}}
		>
			Quellen und zitieren
		</Link>
	)
}

function LayerLabel({ layer, onJump }) {
	const jump = layer.jump && onJump
	const sources = layer.id && hasLayerSources(layer.id)
	return (
		<Box sx={{ py: 0.25 }}>
			<Typography variant="body2">{layer.label}</Typography>
			{(layer.note || jump || layer.info || sources) && (
				<Typography variant="caption" color="text.secondary" component="div">
					{layer.note}
					{jump && (
						<>
							{layer.note && " "}
							<Link
								component="button"
								variant="caption"
								sx={{ verticalAlign: "baseline" }}
								onClick={(e) => {
									// sonst schaltet der Klick im Label auch den Schalter
									e.preventDefault()
									onJump()
								}}
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
			)}
		</Box>
	)
}
