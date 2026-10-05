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
	const setShowWaterways = useMapStore((s) => s.setShowWaterways)

	const groups = [...new Set(OVERLAYS.map((o) => o.group))]

	return (
		<Box>
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

			<SectionTitle>Hilfslinien</SectionTitle>
			<FormControlLabel
				control={
					<Switch
						size="small"
						checked={showRings}
						onChange={(e) => setShowRings(e.target.checked)}
					/>
				}
				label={<Typography variant="body2">Tagesmarsch-Ringe</Typography>}
			/>
			<FormControlLabel
				control={
					<Switch
						size="small"
						checked={showWaterways}
						onChange={(e) => setShowWaterways(e.target.checked)}
					/>
				}
				label={
					<Typography variant="body2">Gewässernetz der Analyse</Typography>
				}
			/>
		</Box>
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
