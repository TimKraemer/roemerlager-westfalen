"use client"

import AddIcon from "@mui/icons-material/Add"
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined"
import {
	Alert,
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	IconButton,
	MenuItem,
	Slider,
	Stack,
	Switch,
	Tab,
	Tabs,
	TextField,
	Typography,
} from "@mui/material"
import { useState } from "react"
import {
	CRS,
	googleSatellite,
	readGeoTiff,
	readVector,
	readWorldFile,
	serviceLayer,
} from "@/lib/imports"
import { useMapStore } from "@/store/use-map-store"

/** Liste der eigenen Karten in der Seitenleiste. */
export default function CustomLayers() {
	const layers = useMapStore((s) => s.customLayers)
	const update = useMapStore((s) => s.updateCustomLayer)
	const remove = useMapStore((s) => s.removeCustomLayer)
	const [open, setOpen] = useState(false)
	return (
		<Box>
			{layers.length === 0 && (
				<Typography variant="caption" color="text.secondary" component="p">
					Luftbilder, gescannte Pläne oder GIS-Daten hinzufügen. Dateien bleiben
					auf diesem Gerät.
				</Typography>
			)}
			{layers.map((l) => (
				<Box key={l.id} sx={{ mb: 1 }}>
					<Stack direction="row" sx={{ alignItems: "center" }}>
						<Switch
							size="small"
							checked={l.visible}
							onChange={(e) => update(l.id, { visible: e.target.checked })}
						/>
						<Box sx={{ flex: 1, minWidth: 0 }}>
							<Typography variant="body2" noWrap>
								{l.name}
							</Typography>
							<Typography
								variant="caption"
								color="text.secondary"
								noWrap
								component="div"
							>
								{l.info}
							</Typography>
						</Box>
						<IconButton
							size="small"
							onClick={() => remove(l.id)}
							aria-label="Entfernen"
						>
							<DeleteOutlineIcon fontSize="small" />
						</IconButton>
					</Stack>
					{l.visible && (
						<Slider
							size="small"
							min={0.1}
							max={1}
							step={0.05}
							value={l.opacity}
							onChange={(_, v) => update(l.id, { opacity: v })}
							sx={{ ml: 5, width: "calc(100% - 56px)" }}
							aria-label={`Deckkraft ${l.name}`}
						/>
					)}
				</Box>
			))}
			<Button
				size="small"
				startIcon={<AddIcon />}
				onClick={() => setOpen(true)}
			>
				Karte hinzufügen
			</Button>
			{open && <ImportDialog onClose={() => setOpen(false)} />}
		</Box>
	)
}

function ImportDialog({ onClose }) {
	const add = useMapStore((s) => s.addCustomLayer)
	const [tab, setTab] = useState("file")
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState(null)
	const [name, setName] = useState("")
	// Dienst
	const [type, setType] = useState("xyz")
	const [url, setUrl] = useState("")
	const [layersParam, setLayersParam] = useState("")
	// Google
	const [key, setKey] = useState("")
	// Dateien
	const [files, setFiles] = useState([])
	const [epsg, setEpsg] = useState("25832")

	const run = async (fn) => {
		setBusy(true)
		setError(null)
		try {
			const layer = await fn()
			add({ ...layer, name: name.trim() || layer.name || layer.info })
			onClose()
		} catch (e) {
			setError(e.message ?? String(e))
		} finally {
			setBusy(false)
		}
	}

	const submit = () => {
		if (tab === "service") {
			return run(async () => ({
				...serviceLayer({ type, url: url.trim(), layers: layersParam.trim() }),
				service: { type, url, layers: layersParam },
			}))
		}
		if (tab === "google") {
			// Sitzung läuft ab, deshalb nicht dauerhaft speichern (session: true)
			return run(async () => ({
				...(await googleSatellite(key.trim())),
				name: "Google Satellit",
				session: true,
			}))
		}
		return run(async () => {
			const list = [...files]
			const lower = (f) => f.name.toLowerCase()
			const tif = list.find((f) => /\.tiff?$/.test(lower(f)))
			if (tif) return { ...(await readGeoTiff(tif)), name: tif.name }
			const world = list.find((f) => /\.(jgw|pgw|tfw|wld|j2w)$/.test(lower(f)))
			const img = list.find((f) => /\.(jpe?g|png)$/.test(lower(f)))
			if (world && img)
				return {
					...(await readWorldFile(img, world, Number(epsg))),
					name: img.name,
				}
			const vec = list.find((f) => /\.(geojson|json|kml|gpx)$/.test(lower(f)))
			if (vec) return { ...(await readVector(vec)), name: vec.name }
			throw new Error(
				"Bitte ein GeoTIFF, ein Bild zusammen mit seinem World-File oder eine GeoJSON-, KML- oder GPX-Datei wählen.",
			)
		})
	}

	const needsEpsg = [...files].some((f) =>
		/\.(jgw|pgw|tfw|wld|j2w)$/i.test(f.name),
	)

	return (
		<Dialog open onClose={onClose} fullWidth maxWidth="sm">
			<DialogTitle>Karte hinzufügen</DialogTitle>
			<DialogContent>
				<Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
					<Tab value="file" label="Datei" sx={{ textTransform: "none" }} />
					<Tab
						value="service"
						label="Kartendienst"
						sx={{ textTransform: "none" }}
					/>
					<Tab
						value="google"
						label="Google Satellit"
						sx={{ textTransform: "none" }}
					/>
				</Tabs>

				{tab === "file" && (
					<Stack spacing={2}>
						<Typography variant="body2" color="text.secondary">
							GeoTIFF (z. B. Luftbild oder georeferenzierter Plan aus QGIS),
							Bild (JPG/PNG) zusammen mit seinem World-File (.jgw, .pgw) oder
							Vektordaten als GeoJSON, KML oder GPX. Die Dateien werden nur in
							diesem Browser gelesen, nicht hochgeladen.
						</Typography>
						<Button variant="outlined" component="label">
							Dateien wählen
							<input
								hidden
								multiple
								type="file"
								accept=".tif,.tiff,.jpg,.jpeg,.png,.jgw,.pgw,.tfw,.wld,.j2w,.geojson,.json,.kml,.gpx"
								onChange={(e) => setFiles(e.target.files ?? [])}
							/>
						</Button>
						{files.length > 0 && (
							<Typography variant="caption">
								{[...files].map((f) => f.name).join(", ")}
							</Typography>
						)}
						{needsEpsg && (
							<TextField
								select
								size="small"
								label="Bezugssystem des World-Files"
								value={epsg}
								onChange={(e) => setEpsg(e.target.value)}
							>
								{Object.entries(CRS).map(([code, c]) => (
									<MenuItem key={code} value={code}>
										{c.label}
									</MenuItem>
								))}
							</TextField>
						)}
					</Stack>
				)}

				{tab === "service" && (
					<Stack spacing={2}>
						<TextField
							select
							size="small"
							label="Art"
							value={type}
							onChange={(e) => setType(e.target.value)}
						>
							<MenuItem value="xyz">
								Kacheln (XYZ / WMTS-REST mit {"{z}/{x}/{y}"})
							</MenuItem>
							<MenuItem value="wms">WMS</MenuItem>
						</TextField>
						<TextField
							size="small"
							label={type === "wms" ? "WMS-Adresse" : "Kachel-URL"}
							placeholder={
								type === "wms"
									? "https://www.wms.nrw.de/geobasis/wms_nw_dop"
									: "https://…/{z}/{x}/{y}.png"
							}
							value={url}
							onChange={(e) => setUrl(e.target.value)}
						/>
						{type === "wms" && (
							<TextField
								size="small"
								label="Layername(n), durch Komma getrennt"
								value={layersParam}
								onChange={(e) => setLayersParam(e.target.value)}
							/>
						)}
						<Typography variant="caption" color="text.secondary">
							Der Dienst muss Web-Mercator (EPSG:3857) liefern und Zugriffe von
							anderen Seiten erlauben (CORS). Er wird in diesem Browser gemerkt.
						</Typography>
					</Stack>
				)}

				{tab === "google" && (
					<Stack spacing={2}>
						<Typography variant="body2" color="text.secondary">
							Satellitenbilder über die Google Map Tiles API mit deinem eigenen
							API-Schlüssel. Der Schlüssel bleibt in diesem Browser und wird
							nicht gespeichert. Google rechnet die Kacheln über dein Konto ab.
						</Typography>
						<TextField
							size="small"
							type="password"
							label="API-Schlüssel"
							value={key}
							onChange={(e) => setKey(e.target.value)}
							autoComplete="off"
						/>
					</Stack>
				)}

				<TextField
					size="small"
					label="Name (optional)"
					value={name}
					onChange={(e) => setName(e.target.value)}
					sx={{ mt: 2 }}
					fullWidth
				/>
				{error && (
					<Alert severity="error" sx={{ mt: 2 }}>
						{error}
					</Alert>
				)}
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>Abbrechen</Button>
				<Button variant="contained" onClick={submit} disabled={busy}>
					{busy ? "Wird gelesen …" : "Hinzufügen"}
				</Button>
			</DialogActions>
		</Dialog>
	)
}
