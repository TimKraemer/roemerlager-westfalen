"use client"

import {
	Box,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableRow,
	Typography,
} from "@mui/material"
import { useEffect, useState } from "react"
import { assetUrl } from "@/config"
import { SectionTitle } from "./layer-panel"

const pct = (v) => `P${Math.round(v * 100)}`

/** Ergebnis der Gegenprobe (scripts/validate-model.mjs). */
export default function ValidationPanel() {
	const [data, setData] = useState(null)
	useEffect(() => {
		fetch(assetUrl("precomputed/validation.json"))
			.then((r) => (r.ok ? r.json() : null))
			.then(setData)
			.catch(() => {})
	}, [])
	const full = data?.voll
	const noRoutes = data?.["ohne-routen"]
	const opt = data?.optimierung
	if (!full) return null
	const above = full.rows.filter((r) => r.percentile > 0.5).length
	return (
		<Box>
			<SectionTitle>Je ein Lager weggelassen</SectionTitle>
			<Typography variant="body2" color="text.secondary">
				Für jedes bekannte augusteische Lager im Netzgebiet wurde das Lager samt
				Begleitanlagen im Umkreis von 3 km aus dem Modell genommen und alles neu
				gerechnet: Ringe, Routen, Abstände. Dann wurde das Potenzial an seiner
				Stelle abgelesen. Das Perzentil sagt, wie viel Prozent aller Flächen
				niedriger bewertet sind.
			</Typography>
			<Typography variant="body2" sx={{ mt: 1 }}>
				An der Lagerstelle liegt das Perzentil im Median bei{" "}
				{pct(full.summary.medianPercentile)}, an 300 Zufallsorten bei{" "}
				{pct(full.baseline.medianPercentile)}. {above} von {full.rows.length}{" "}
				Lagern liegen über dem Median, zufällig wäre das selten (Vorzeichentest
				rund 2 %). Ohne den Routen-Faktor liegt der Median bei{" "}
				{pct(noRoutes.summary.medianPercentile)}, das Ergebnis hängt also nicht
				an den berechneten Wegen.
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
				Am schwächsten schneiden Hedemünden und Kneblinghausen ab. Beide sind
				Befestigungen in Höhenlage und keine Marschlager. Das Modell stuft
				ausgeprägte Hügel nach Ps.-Hyginus 56 bewusst niedriger ein als sanft
				ansteigendes Gelände. Der beste Wert im Umkreis von 2 km taugt nicht als
				Beleg, weil auch Zufallsorte dort hoch liegen (
				{pct(full.baseline.medianPercentileBest)}).
			</Typography>
			<Table
				size="small"
				sx={{ mt: 1, "& td, & th": { px: 0.5, fontSize: 12 } }}
			>
				<TableHead>
					<TableRow>
						<TableCell>Lager</TableCell>
						<TableCell align="right">Stelle</TableCell>
						<TableCell align="right">ohne Routen</TableCell>
					</TableRow>
				</TableHead>
				<TableBody>
					{full.rows.map((r) => {
						const nr = noRoutes?.rows.find((x) => x.id === r.id)
						return (
							<TableRow key={r.id}>
								<TableCell>{r.name}</TableCell>
								<TableCell align="right">{pct(r.percentile)}</TableCell>
								<TableCell align="right">
									{nr ? pct(nr.percentile) : "–"}
								</TableCell>
							</TableRow>
						)
					})}
				</TableBody>
			</Table>
			{opt && <Optimization opt={opt} />}
		</Box>
	)
}

/** Gewichte an der Gegenprobe ausgerichtet, verschachtelt geprüft. */
function Optimization({ opt }) {
	const mean = (key) =>
		opt.nested.reduce((a, r) => a + r[key], 0) / opt.nested.length
	return (
		<Box sx={{ mt: 2 }}>
			<SectionTitle>Gewichtung an der Gegenprobe ausgerichtet</SectionTitle>
			<Typography variant="body2" color="text.secondary">
				Für jedes Lager wurden die Gewichte nur an den übrigen elf Lagern
				optimiert und an ihm geprüft. Mit den fachlich gesetzten Gewichten liegt
				das mittlere Perzentil bei {pct(mean("defaults"))}, mit den optimierten
				bei {pct(mean("heldOut"))}. Gemessen an denselben Lagern, an denen
				optimiert wurde, wären es {pct(opt.inSample)}, ein geschönter Wert. Die
				Optimierung passt sich an die zwölf Lager an, statt Allgemeines zu
				lernen. Die Karte behält deshalb die fachlichen Gewichte.
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
				Gebracht hat die Prüfung fachliche Änderungen statt neuer Zahlen. Ringe
				gelten auch bei zwei und drei Tagesmärschen, weil zwischen bekannten
				Lagern oft eines fehlt. Nach Ps.-Hyginus 56 zählen sanfte Erhebungen und
				Terrassen über der Aue mehr als ausgeprägte Hügel. Zusammen hoben sie
				Barkhausen und Sennestadt von P31 auf P70.
			</Typography>
		</Box>
	)
}
