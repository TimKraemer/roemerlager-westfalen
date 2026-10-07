/**
 * Vertont die Erzählung der Texte (src/data/vertonung.json) mit ElevenLabs v3
 * über fal.ai, wie die Audio-Guides in erleben.app. Je Schritt eine MP3 unter
 * public/audio/erzaehlung/, auf -16 LUFS normalisiert und mono. Nur geänderte
 * Sprechtexte werden neu erzeugt, die Prüfsummen stehen in index.json.
 *
 *   FAL_AI_API_KEY=… bun scripts/build-audio.mjs [--force] [id …]
 *
 * Braucht ffmpeg. Kosten: ElevenLabs v3 auf fal.ai rund 0,10 $ je 1000 Zeichen.
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname
const OUT = join(ROOT, "public/audio/erzaehlung")
const config = JSON.parse(
	readFileSync(join(ROOT, "src/data/vertonung.json"), "utf8"),
)
const KEY = process.env.FAL_AI_API_KEY ?? process.env.FAL_KEY
if (!KEY) {
	console.error("FAL_AI_API_KEY fehlt")
	process.exit(1)
}

const args = process.argv.slice(2)
const force = args.includes("--force")
const only = args.filter((a) => !a.startsWith("--"))

mkdirSync(OUT, { recursive: true })
const indexFile = join(OUT, "index.json")
const index = existsSync(indexFile)
	? JSON.parse(readFileSync(indexFile, "utf8"))
	: {}

const hashOf = (text) =>
	createHash("sha1")
		.update(`${config.model}|${config.voice}|${text}`)
		.digest("hex")
		.slice(0, 12)

async function speak(text) {
	const res = await fetch(`https://fal.run/${config.model}`, {
		method: "POST",
		headers: {
			Authorization: `Key ${KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ text, voice: config.voice, language_code: "de" }),
	})
	if (!res.ok) throw new Error(`fal ${res.status}: ${await res.text()}`)
	const data = await res.json()
	const url = data.audio?.url ?? data.audio_url?.url ?? data.audio
	if (typeof url !== "string") throw new Error("keine Audio-URL in der Antwort")
	const audio = await fetch(url)
	if (!audio.ok) throw new Error(`Download ${audio.status}`)
	return Buffer.from(await audio.arrayBuffer())
}

function master(raw, file) {
	const tmp = `${file}.raw.mp3`
	writeFileSync(tmp, raw)
	execFileSync("ffmpeg", [
		"-y",
		"-loglevel",
		"error",
		"-i",
		tmp,
		"-af",
		"loudnorm=I=-16:TP=-1.5:LRA=11",
		"-ac",
		"1",
		"-ar",
		"44100",
		"-b:a",
		"64k",
		file,
	])
	execFileSync("rm", [tmp])
	const seconds = Number(
		execFileSync("ffprobe", [
			"-v",
			"error",
			"-show_entries",
			"format=duration",
			"-of",
			"csv=p=0",
			file,
		]).toString(),
	)
	return Math.round(seconds * 10) / 10
}

const todo = Object.entries(config.steps).filter(([id, text]) => {
	if (only.length && !only.includes(id)) return false
	const file = join(OUT, `${id}.mp3`)
	return force || !existsSync(file) || index[id]?.hash !== hashOf(text)
})
const chars = todo.reduce((s, [, t]) => s + t.length, 0)
console.log(`${todo.length} Schritte, ${chars} Zeichen`)

// Drei gleichzeitig, mehr erlaubt fal je Schlüssel ohnehin nicht immer
let next = 0
async function worker() {
	while (next < todo.length) {
		const [id, text] = todo[next++]
		const raw = await speak(text)
		const seconds = master(raw, join(OUT, `${id}.mp3`))
		index[id] = { hash: hashOf(text), seconds }
		console.log(`${id}: ${seconds} s`)
	}
}
await Promise.all([worker(), worker(), worker()])

// Einträge entfernter Schritte fallen weg
for (const id of Object.keys(index)) if (!config.steps[id]) delete index[id]
writeFileSync(indexFile, `${JSON.stringify(index, null, "\t")}\n`)
