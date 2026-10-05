import { evaluate, prepare } from "./pipeline"

/** Web Worker um die Rechenkette in pipeline.js. */

let state = null
// Nur die jüngste Anfrage zählt, ältere brechen nach dem Laden ab
let generation = 0

const onProgress = (stage, value = 0) =>
	self.postMessage({ type: "progress", stage, value })

self.onmessage = async (event) => {
	const msg = event.data
	const gen = ++generation
	const isStale = () => gen !== generation
	try {
		if (msg.type === "analyze") {
			const prepared = await prepare(msg.bbox, msg.params, {
				onProgress,
				isStale,
			})
			if (!prepared) return
			state = prepared
		} else if (msg.type !== "update" || !state) {
			return
		}
		const result = await evaluate(state, msg, { isStale })
		if (result && !isStale()) self.postMessage({ type: "result", ...result })
	} catch (error) {
		self.postMessage({ type: "error", message: error.message ?? String(error) })
	}
}
