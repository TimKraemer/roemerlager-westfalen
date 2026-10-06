"use client"

import {
	Box,
	Checkbox,
	FormControlLabel,
	Link,
	Radio,
	RadioGroup,
	Slider,
	Stack,
	Switch,
	Typography,
} from "@mui/material"
import { BASE_LAYERS, OVERLAYS } from "@/lib/layers"
import { SITE_TYPES } from "@/lib/sites"
import { useMapStore } from "@/store/use-map-store"
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

export default function LayerPanel() {
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
	const showRoads = useMapStore((s) => s.showRoads)
	const showModel = useMapStore((s) => s.showModel)
	const setShowModel = useMapStore((s) => s.setShowModel)
	const setShowRoads = useMapStore((s) => s.setShowRoads)
	const setShowWaterways = useMapStore((s) => s.setShowWaterways)

	const groups = [...new Set(OVERLAYS.map((o) => o.group))]

	return (
		<Box>
			<CustomLayers />

			<SectionTitle>Grundkarte</SectionTitle>
			<RadioGroup
				value={baseLayer}
				onChange={(e) => setBaseLayer(e.target.value)}
			>
				{BASE_LAYERS.map((layer) => (
					<FormControlLabel
						key={layer.id}
						value={layer.id}
						control={<Radio size="small" />}
						label={<LayerLabel layer={layer} />}
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
					{OVERLAYS.filter((o) => o.group === group).map((layer) => {
						const state = overlays[layer.id]
						return (
							<Box key={layer.id} sx={{ mb: 1 }}>
								<FormControlLabel
									control={
										<Switch
											size="small"
											checked={state.visible}
											onChange={(e) =>
												setOverlay(layer.id, { visible: e.target.checked })
											}
										/>
									}
									label={<LayerLabel layer={layer} />}
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
				checked={showRings}
				onChange={setShowRings}
				label="1 Tagesmarsch um jedes Marschlager"
			/>
			<HelperSwitch
				checked={showRoutes}
				onChange={setShowRoutes}
				label="Mögliche Marschwege und Etappenhalte"
				note="Weg geringster Gehzeit zwischen bekannten Lagern (Modell)"
			/>
			<HelperSwitch
				checked={showRoads}
				onChange={setShowRoads}
				label="Römerstraßen"
				note="Belegt durchgezogen, vermutet gestrichelt"
			/>
			<HelperSwitch
				checked={showWaterways}
				onChange={setShowWaterways}
				label="Natürliches Gewässernetz der Analyse"
				note="Aus den Talzügen des Höhenmodells, ohne Kanäle"
			/>
			<HelperSwitch
				checked={showModel}
				onChange={setShowModel}
				label="3D-Modell Römerlager Oberaden"
				note="Ab Zoomstufe 15, Modell aus der Bergkamen-App, an den vier Toren eingepasst"
			/>
		</Box>
	)
}

function HelperSwitch({ checked, onChange, label, note }) {
	return (
		<FormControlLabel
			control={
				<Switch
					size="small"
					checked={checked}
					onChange={(e) => onChange(e.target.checked)}
				/>
			}
			label={<LayerLabel layer={{ label, note }} />}
			sx={{
				alignItems: "flex-start",
				mb: 0.5,
				"& .MuiSwitch-root": { mt: 0.25 },
			}}
		/>
	)
}

function LayerLabel({ layer }) {
	return (
		<Box sx={{ py: 0.25 }}>
			<Typography variant="body2">{layer.label}</Typography>
			{layer.note && (
				<Typography variant="caption" color="text.secondary" component="div">
					{layer.note}
					{layer.info && (
						<>
							{" "}
							<Link href={layer.info} target="_blank" rel="noreferrer">
								Info
							</Link>
						</>
					)}
				</Typography>
			)}
		</Box>
	)
}
