import { evaluate, prepare } from "./pipeline"

/**
 * Web Worker um die Rechenkette in pipeline.js.
 *
 * "analyze" lädt das Gelände für einen Ausschnitt (prepare) und bewertet
 * es, "update" bewertet das geladene Gelände mit neuen Reglern neu. Nur
 * die jüngste Anfrage zählt: ein neues "analyze" bricht ein laufendes ab,
 * ein "update" während des Ladens wird danach mit seinen Reglern gerechnet.
 */

let state = null
let preparing = false
// Zuletzt angefragte Einstellungen, gelten für die nächste Bewertung
let latest = null
let analyzeGen = 0
let evaluateGen = 0

const post = (msg) => self.postMessage(msg)
const fail = (error) =>
	post({ type: "error", message: error?.message ?? String(error) })

async function evaluateLatest() {
	const gen = ++evaluateGen
	const isStale = () => gen !== evaluateGen
	const result = await evaluate(state, latest, { isStale })
	if (result && !isStale()) post({ type: "result", ...result })
}

async function analyze(msg) {
	const gen = ++analyzeGen
	const isStale = () => gen !== analyzeGen
	evaluateGen++
	latest = msg
	preparing = true
	try {
		const prepared = await prepare(msg.bbox, msg.params, {
			onProgress: (stage, value = 0) => {
				if (!isStale()) post({ type: "progress", stage, value })
			},
			isStale,
		})
		if (!prepared || isStale()) return
		state = prepared
	} finally {
		if (!isStale()) preparing = false
	}
	await evaluateLatest()
}

self.onmessage = async (event) => {
	const msg = event.data
	try {
		if (msg.type === "analyze") {
			await analyze(msg)
		} else if (msg.type === "update") {
			latest = { ...latest, ...msg }
			// Während des Ladens übernimmt analyze() die neuen Regler
			if (state && !preparing) await evaluateLatest()
		}
	} catch (error) {
		fail(error)
	}
}
