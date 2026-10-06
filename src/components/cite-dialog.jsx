"use client"

import CloseIcon from "@mui/icons-material/Close"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import DownloadIcon from "@mui/icons-material/Download"
import FormatQuoteIcon from "@mui/icons-material/FormatQuote"
import {
	Box,
	Button,
	Chip,
	CircularProgress,
	Dialog,
	DialogContent,
	DialogTitle,
	IconButton,
	Link,
	Stack,
	Typography,
} from "@mui/material"
import { useEffect, useState } from "react"
import { create } from "zustand"
import {
	bibKey,
	FORMAT_BY_ID,
	FORMATS,
	fileName,
	formatCitations,
} from "@/lib/cite"

// Gewähltes Format bleibt im Browser, Standard ist der DAI-Stil
const FORMAT_KEY = "roemerlager:zitierformat"
function loadFormat() {
	try {
		const f = localStorage.getItem(FORMAT_KEY)
		return FORMAT_BY_ID[f] ? f : "dai"
	} catch {
		return "dai"
	}
}

const useFormat = create((set) => ({
	format: "dai",
	loaded: false,
	setFormat: (format) => {
		try {
			localStorage.setItem(FORMAT_KEY, format)
		} catch {
			// privates Fenster o. ä.
		}
		set({ format })
	},
}))

function useCitationFormat() {
	const { format, loaded, setFormat } = useFormat()
	useEffect(() => {
		if (!loaded) useFormat.setState({ format: loadFormat(), loaded: true })
	}, [loaded])
	return [format, setFormat]
}

/** Zitierdialog, einmal in der App eingehängt, geöffnet über openCite(). */
export const useCite = create((set) => ({
	request: null,
	openCite: (request) => set({ request }),
	close: () => set({ request: null }),
}))

export function openCite(request) {
	useCite.getState().openCite(request)
}

async function copyRich({ text, html }) {
	try {
		if (html && typeof ClipboardItem !== "undefined") {
			await navigator.clipboard.write([
				new ClipboardItem({
					"text/html": new Blob([html], { type: "text/html" }),
					"text/plain": new Blob([text], { type: "text/plain" }),
				}),
			])
		} else {
			await navigator.clipboard.writeText(text)
		}
		return true
	} catch {
		return false
	}
}

function download(text, name, mime = "text/plain") {
	const url = URL.createObjectURL(
		new Blob([text], { type: `${mime};charset=utf-8` }),
	)
	const a = document.createElement("a")
	a.href = url
	a.download = name
	a.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function LatexHint({ items, format }) {
	const keys = items.map((i) => bibKey(i.id)).join(",")
	const pre =
		format === "biblatex"
			? "\\usepackage[style=authoryear]{biblatex}\n\\addbibresource{literatur.bib}"
			: "\\bibliographystyle{plainnat}  % mit \\usepackage{natbib}"
	const post =
		format === "biblatex" ? "\\printbibliography" : "\\bibliography{literatur}"
	const [open, setOpen] = useState(false)
	return (
		<Box sx={{ mt: 0.5 }}>
			<Link
				component="button"
				variant="caption"
				onClick={() => setOpen(!open)}
				aria-expanded={open}
			>
				{open
					? "LaTeX-Einbindung ausblenden"
					: "So bindest du die Datei in LaTeX ein"}
			</Link>
			{open && (
				<Box
					component="pre"
					sx={{
						m: 0,
						mt: 0.5,
						p: 1,
						bgcolor: "action.hover",
						borderRadius: 1,
						fontFamily: "monospace",
						fontSize: 12,
						whiteSpace: "pre-wrap",
						overflowWrap: "anywhere",
					}}
				>
					{`${pre}\n…\n\\cite{${keys}}\n…\n${post}`}
				</Box>
			)}
		</Box>
	)
}

function useFormatted(items, format) {
	const [result, setResult] = useState(null)
	const [error, setError] = useState(null)
	useEffect(() => {
		let live = true
		setError(null)
		setResult(null)
		formatCitations(items, format)
			.then((r) => live && setResult(r))
			.catch((e) => live && setError(String(e.message ?? e)))
		return () => {
			live = false
		}
	}, [items, format])
	return { result, error }
}

function useCopy(result) {
	const [copied, setCopied] = useState(false)
	const copy = async () => {
		if (!result) return
		if (await copyRich(result)) {
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		}
	}
	return [copied, copy]
}

function CitationOutput({ result, error, maxHeight }) {
	return (
		<Box
			sx={{
				p: 1.5,
				bgcolor: "action.hover",
				borderRadius: 1,
				maxHeight,
				overflow: "auto",
				minHeight: 48,
			}}
		>
			{error ? (
				<Typography variant="body2" color="error">
					{error}
				</Typography>
			) : !result ? (
				<CircularProgress size={18} />
			) : result.html ? (
				<Box
					sx={{
						typography: "body2",
						userSelect: "text",
						overflowWrap: "anywhere",
						"& .csl-entry": { mb: 1, pl: 2, textIndent: -16 },
						"& .csl-entry:last-child": { mb: 0 },
						"& .csl-block": { fontWeight: 600, textIndent: 0, ml: -2 },
					}}
					// citeproc maskiert alle Inhalte, die Daten stammen aus dem Repository
					dangerouslySetInnerHTML={{ __html: result.html }}
				/>
			) : (
				<Box
					component="pre"
					sx={{
						m: 0,
						fontFamily: "monospace",
						fontSize: 12,
						whiteSpace: "pre-wrap",
						overflowWrap: "anywhere",
					}}
				>
					{result.text}
				</Box>
			)}
		</Box>
	)
}

/**
 * Kurzform für die Seitenleiste: ein Zitat im zuletzt gewählten Stil
 * (sonst DAI), Kopieren und ein Knopf zum Dialog mit allen Formaten.
 */
export function CitationSummary({ items, base, title, intro }) {
	const [format] = useCitationFormat()
	const style = FORMAT_BY_ID[format].style ? format : "dai"
	const { result, error } = useFormatted(items, style)
	const [copied, copy] = useCopy(result)
	return (
		<Box>
			<CitationOutput result={result} error={error} />
			<Stack direction="row" sx={{ mt: 0.5, flexWrap: "wrap", columnGap: 1 }}>
				<Button
					size="small"
					startIcon={<ContentCopyIcon fontSize="small" />}
					onClick={copy}
					disabled={!result}
					sx={{ textTransform: "none" }}
				>
					{copied ? "Kopiert" : `Kopieren (${FORMAT_BY_ID[style].label})`}
				</Button>
				<Button
					size="small"
					startIcon={<FormatQuoteIcon fontSize="small" />}
					onClick={() => openCite({ title, intro, items, base })}
					sx={{ textTransform: "none" }}
				>
					Andere Stile, BibTeX, RIS
				</Button>
			</Stack>
		</Box>
	)
}

/**
 * Zitate in einem wählbaren Stil oder Exportformat, mit Kopieren und
 * Herunterladen. `items` sind CSL-JSON-Einträge, `base` der Dateiname.
 */
export function CitationView({ items, base = "zitat" }) {
	const [format, setFormat] = useCitationFormat()
	const { result, error } = useFormatted(items, format)
	const [copied, copy] = useCopy(result)
	const f = FORMAT_BY_ID[format]

	return (
		<Box>
			<Stack
				direction="row"
				sx={{ flexWrap: "wrap", gap: 0.5, mb: 1 }}
				role="radiogroup"
				aria-label="Zitierformat"
			>
				{FORMATS.map((x) => (
					<Chip
						key={x.id}
						label={x.label}
						title={x.title}
						size="small"
						role="radio"
						aria-checked={x.id === format}
						color={x.id === format ? "primary" : "default"}
						variant={x.id === format ? "filled" : "outlined"}
						onClick={() => setFormat(x.id)}
					/>
				))}
			</Stack>
			<CitationOutput result={result} error={error} maxHeight="50vh" />
			<Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
				<Button
					size="small"
					startIcon={<ContentCopyIcon fontSize="small" />}
					onClick={copy}
					disabled={!result}
					sx={{ textTransform: "none" }}
				>
					{copied ? "Kopiert" : "Kopieren"}
				</Button>
				<Button
					size="small"
					startIcon={<DownloadIcon fontSize="small" />}
					disabled={!result}
					onClick={() => download(result.text, fileName(base, format), f.mime)}
					sx={{ textTransform: "none" }}
				>
					{f.ext ? `.${f.ext} herunterladen` : "Als Text herunterladen"}
				</Button>
			</Stack>
			{(format === "bibtex" || format === "biblatex") && (
				<LatexHint items={items} format={format} />
			)}
		</Box>
	)
}

export default function CiteDialog() {
	const request = useCite((s) => s.request)
	const close = useCite((s) => s.close)
	return (
		<Dialog
			open={Boolean(request)}
			onClose={close}
			fullWidth
			maxWidth="sm"
			aria-labelledby="zitieren-titel"
		>
			{request && (
				<>
					<DialogTitle id="zitieren-titel" sx={{ pr: 6 }}>
						{request.title}
						<IconButton
							aria-label="Schließen"
							onClick={close}
							sx={{ position: "absolute", right: 8, top: 8 }}
						>
							<CloseIcon />
						</IconButton>
					</DialogTitle>
					<DialogContent>
						{request.intro && (
							<Typography
								variant="body2"
								color="text.secondary"
								sx={{ mb: 1.5 }}
							>
								{request.intro}
							</Typography>
						)}
						<CitationView items={request.items} base={request.base} />
					</DialogContent>
				</>
			)}
		</Dialog>
	)
}
