"use client"

import {
	Alert,
	Box,
	Button,
	LinearProgress,
	List,
	ListItemButton,
	ListItemText,
	Slider,
	Stack,
	Switch,
	ToggleButton,
	ToggleButtonGroup,
	Tooltip,
	Typography,
} from "@mui/material"
import { rankedCandidates } from "@/lib/potential/candidates"
import { FACTORS } from "@/lib/potential/model"
import { MAX_AREA_KM } from "@/lib/potential/use-potential"
import { RING_SOURCES } from "@/lib/sites"
import { useMapStore } from "@/store/use-map-store"
import { SectionTitle, SourcesLink } from "./layer-panel"

const km = (m) =>
	`${(m / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} km`

export default function AnalysisPanel({ onAnalyze, onFlyTo }) {
	const params = useMapStore((s) => s.params)
	const setParams = useMapStore((s) => s.setParams)
	const setWeight = useMapStore((s) => s.setWeight)
	const ringSource = useMapStore((s) => s.ringSource)
	const setRingSource = useMapStore((s) => s.setRingSource)
	const heatmap = useMapStore((s) => s.heatmap)
	const setHeatmap = useMapStore((s) => s.setHeatmap)
	const analysis = useMapStore((s) => s.analysis)
	const result = useMapStore((s) => s.result)

	const running = analysis.status === "running"

	return (
		<Box>
			<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
				Bewertet den sichtbaren Kartenausschnitt (höchstens {MAX_AREA_KM} ×{" "}
				{MAX_AREA_KM} km) nach den Lagekriterien für Marschlager. Am besten auf
				eine Region um 40–80 km zoomen und dann starten.
			</Typography>

			<Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: "center" }}>
				<Button variant="contained" onClick={onAnalyze} disabled={running}>
					{result ? "Ausschnitt neu berechnen" : "Ausschnitt berechnen"}
				</Button>
				{result && (
					<Typography variant="caption" color="text.secondary">
						{result.grid.cols} × {result.grid.rows} Zellen
					</Typography>
				)}
			</Stack>
			{running && (
				<Box sx={{ mt: 1.5 }}>
					<Typography variant="caption">{analysis.stage}</Typography>
					<LinearProgress
						variant={analysis.progress > 0 ? "determinate" : "indeterminate"}
						value={analysis.progress * 100}
					/>
				</Box>
			)}
			{analysis.status === "error" && (
				<Alert severity="error" sx={{ mt: 1.5 }}>
					{analysis.error}
				</Alert>
			)}
			{analysis.notice && (
				<Alert severity="warning" sx={{ mt: 1.5 }}>
					{analysis.notice}
				</Alert>
			)}

			<SectionTitle>Darstellung</SectionTitle>
			<Stack direction="row" sx={{ alignItems: "center" }}>
				<Switch
					size="small"
					checked={heatmap.visible}
					onChange={(e) => setHeatmap({ visible: e.target.checked })}
				/>
				<Typography variant="body2">Potenzialkarte anzeigen</Typography>
			</Stack>
			<Typography variant="caption" color="text.secondary" component="div">
				<SourcesLink id="heatmap" label="Potenzialkarte" />
			</Typography>
			<LabeledSlider
				label="Schwelle"
				value={heatmap.threshold}
				min={0.2}
				max={0.9}
				step={0.01}
				format={(v) => v.toFixed(2)}
				onChange={(threshold) => setHeatmap({ threshold })}
			/>
			<LabeledSlider
				label="Deckkraft"
				value={heatmap.opacity}
				min={0.1}
				max={1}
				step={0.05}
				format={(v) => `${Math.round(v * 100)} %`}
				onChange={(opacity) => setHeatmap({ opacity })}
			/>

			<SectionTitle>Tagesmarsch</SectionTitle>
			<ToggleButtonGroup
				size="small"
				exclusive
				value={ringSource}
				onChange={(_, v) => v && setRingSource(v)}
				sx={{ mb: 1 }}
			>
				{RING_SOURCES.map((r) => (
					<ToggleButton key={r.id} value={r.id} sx={{ textTransform: "none" }}>
						{r.label}
					</ToggleButton>
				))}
			</ToggleButtonGroup>
			<LabeledSlider
				label="Abstand"
				value={params.ringMean}
				min={12000}
				max={28000}
				step={500}
				format={km}
				onChange={(ringMean) => setParams({ ringMean })}
			/>
			<LabeledSlider
				label="Auch mehrere Tagesmärsche zählen"
				hint="Fehlt ein Zwischenlager, liegt das nächste bekannte Lager zwei oder drei Märsche entfernt. 1 = nur ein Tagesmarsch."
				value={params.ringMultiples}
				min={1}
				max={3}
				step={1}
				format={(v) => (v === 1 ? "nur einer" : `bis ${v}`)}
				onChange={(ringMultiples) => setParams({ ringMultiples })}
			/>
			<LabeledSlider
				label="Streuung ±"
				value={params.ringSigma}
				min={1000}
				max={6000}
				step={250}
				format={km}
				onChange={(ringSigma) => setParams({ ringSigma })}
			/>
			<LabeledSlider
				label="Keine Vorschläge näher als … an bekannten Lagern"
				hint="Rund um ein schon gefundenes Lager wird nichts Neues vorgeschlagen. Das Potenzial wird zum Lager hin immer schwächer, sonst erschiene das bekannte Lager selbst als Kandidat."
				value={params.hideKnownRadius}
				min={0}
				max={10000}
				step={250}
				format={km}
				onChange={(hideKnownRadius) => setParams({ hideKnownRadius })}
			/>

			<SectionTitle>Gewichtung der Kriterien</SectionTitle>
			{FACTORS.map((f) => (
				<LabeledSlider
					key={f.key}
					label={f.label}
					hint={f.hint}
					value={params.weights[f.key]}
					min={0}
					max={5}
					step={0.5}
					format={(v) => v.toLocaleString("de-DE")}
					onChange={(v) => setWeight(f.key, v)}
				/>
			))}

			<LabeledSlider
				label="Bonus gerade Strukturen im Laserscan"
				hint="Experimentell. Nur in den Laserscan-Fenstern. An bestätigten Lagern fand das Verfahren nicht mehr Ecken als an Zufallsorten, deshalb standardmäßig aus."
				value={params.linesBonus}
				min={0}
				max={0.4}
				step={0.05}
				format={(v) => `+${Math.round(v * 100)} %`}
				onChange={(linesBonus) => setParams({ linesBonus })}
			/>

			<SectionTitle>Abzüge</SectionTitle>
			<LabeledSlider
				label="Moore laut Boden- und Altkarte"
				hint="Hoch- und Niedermoore aus der BK50 NRW und der GUM50 Niedersachsen (ursprüngliche Moorverbreitung), dazu abgetorfte Moore und Brüche der Kreiskarte Lübbecke 1844. Auf Moor ließ sich kein Lager mit Graben bauen."
				value={params.moorPenalty}
				min={0}
				max={1}
				step={0.05}
				format={(v) => `−${Math.round(v * 100)} %`}
				onChange={(moorPenalty) => setParams({ moorPenalty })}
			/>
			<LabeledSlider
				label="Nasse Niederungen (Feuchteindex)"
				hint="Topographischer Feuchteindex aus dem Gelände: Flächen, auf denen Wasser zusammenläuft und steht."
				value={params.wetPenalty}
				min={0}
				max={1}
				step={0.05}
				format={(v) => `−${Math.round(v * 100)} %`}
				onChange={(wetPenalty) => setParams({ wetPenalty })}
			/>
			<LabeledSlider
				label="Heutiger Wald (OSM)"
				hint="Wie dicht der Wald um Christi Geburt war, ist unbekannt. Heutiger Wald ist meist jünger, schützt aber Bodendenkmäler. Deshalb standardmäßig aus."
				value={params.forestPenalty}
				min={0}
				max={1}
				step={0.05}
				format={(v) => `−${Math.round(v * 100)} %`}
				onChange={(forestPenalty) => setParams({ forestPenalty })}
			/>

			<SectionTitle>Gelände und Wasser</SectionTitle>
			<ToggleButtonGroup
				size="small"
				exclusive
				value={params.waterSource}
				onChange={(_, v) => v && setParams({ waterSource: v })}
				sx={{ mb: 1 }}
			>
				<ToggleButton value="karten" sx={{ textTransform: "none" }}>
					Aus Karten
				</ToggleButton>
				<ToggleButton value="dem" sx={{ textTransform: "none" }}>
					Aus Höhenmodell
				</ToggleButton>
				<ToggleButton value="osm" sx={{ textTransform: "none" }}>
					OpenStreetMap
				</ToggleButton>
			</ToggleButtonGroup>
			<Typography
				variant="caption"
				color="text.secondary"
				component="p"
				sx={{ mt: 0, mb: 1 }}
			>
				{
					{
						karten:
							"Bäche im Kreis Minden-Lübbecke im Lauf der Uraufnahme um 1840, sonst heutige Bäche aus OpenStreetMap, ohne Kanäle und Gräben. Große Flüsse aus dem Höhenmodell.",
						dem: "Gewässernetz aus den Talzügen berechnet, ohne Kanäle und Begradigungen. Liegt im Flachland oft einige hundert Meter neben den echten Bächen.",
						osm: "Heutige Bäche und Flüsse aus den OpenStreetMap-Vektorkacheln, ohne Kanäle und Gräben.",
					}[params.waterSource]
				}
			</Typography>
			<Stack direction="row" sx={{ alignItems: "center" }}>
				<Switch
					size="small"
					checked={params.oldRivers}
					onChange={(e) => setParams({ oldRivers: e.target.checked })}
				/>
				<Typography variant="body2">Alte Flussläufe</Typography>
			</Stack>
			<Typography
				variant="caption"
				color="text.secondary"
				component="p"
				sx={{ mt: 0, mb: 1 }}
			>
				Rhein, Lippe, Ems und Weser in NRW im Lauf der Uraufnahme um 1840, bei
				Haltern und Xanten im römerzeitlichen Lauf. Ersetzt den aus dem Gelände
				abgeleiteten Lauf dieser Flüsse.
			</Typography>
			{params.waterSource === "dem" && (
				<>
					<LabeledSlider
						label="Bach ab Einzugsgebiet"
						hint="Kleinere Werte ergeben ein dichteres Netz"
						value={params.streamKm2}
						min={0.5}
						max={10}
						step={0.5}
						format={(v) => `${v.toLocaleString("de-DE")} km²`}
						onChange={(streamKm2) => setParams({ streamKm2 })}
					/>
					<LabeledSlider
						label="Fluss ab Einzugsgebiet"
						hint="Für den Flusskorridor"
						value={params.riverKm2}
						min={25}
						max={500}
						step={25}
						format={(v) => `${v} km²`}
						onChange={(riverKm2) => setParams({ riverKm2 })}
					/>
				</>
			)}
			<LabeledSlider
				label="Wasser ideal bis"
				value={params.waterNear}
				min={100}
				max={1500}
				step={50}
				format={(v) => `${v} m`}
				onChange={(waterNear) => setParams({ waterNear })}
			/>
			<LabeledSlider
				label="Umgebung für Anhöhe"
				hint="Radius, gegen den die Höhe einer Zelle verglichen wird"
				value={params.tpiRadius}
				min={500}
				max={4000}
				step={250}
				format={km}
				onChange={(tpiRadius) => setParams({ tpiRadius })}
			/>
			<LabeledSlider
				label="Rastergröße (bei Neuberechnung)"
				value={params.cellMeters}
				min={100}
				max={500}
				step={50}
				format={(v) => `${v} m`}
				onChange={(cellMeters) => setParams({ cellMeters })}
			/>

			{result?.candidates.length > 0 && (
				<>
					<SectionTitle>Kandidaten ({result.candidates.length})</SectionTitle>
					<List dense disablePadding>
						{rankedCandidates(result).map((c) => (
							<ListItemButton
								key={c.index}
								onClick={() => onFlyTo(c.lon, c.lat)}
								sx={{ borderRadius: 1 }}
							>
								<ListItemText
									primary={`${c.rank ? `${c.rank}. ` : "außerhalb · "}Wert ${c.score.toFixed(2)}`}
									secondary={`${c.lat.toFixed(4)}° N, ${c.lon.toFixed(4)}° O`}
								/>
							</ListItemButton>
						))}
					</List>
				</>
			)}
		</Box>
	)
}

function LabeledSlider({ label, hint, value, format, onChange, ...props }) {
	const text = (
		<Stack direction="row" sx={{ justifyContent: "space-between" }}>
			<Typography variant="body2">{label}</Typography>
			<Typography variant="body2" color="text.secondary">
				{format(value)}
			</Typography>
		</Stack>
	)
	return (
		<Box sx={{ mb: 0.5 }}>
			{hint ? (
				<Tooltip title={hint} placement="top-start">
					{text}
				</Tooltip>
			) : (
				text
			)}
			<Slider
				size="small"
				value={value}
				onChange={(_, v) => onChange(v)}
				aria-label={label}
				{...props}
			/>
		</Box>
	)
}
