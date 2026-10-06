/**
 * Legt nach dem Build neben jede größere Textdatei in out/ eine .gz-Fassung
 * mit höchster Stufe. nginx liefert sie per gzip_static aus (deploy/nginx.conf)
 * und muss nicht bei jeder Anfrage selbst packen, das spart gegenüber dem
 * schnellen Packen im Server 7–20 % (Potenzialkarte 1,48 → 1,38 MB).
 * HTML bleibt außen vor, damit der Deploy es zuletzt austauschen kann.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { constants, gzipSync } from "node:zlib"

const OUT = new URL("../out/", import.meta.url).pathname
const TYPES = /\.(js|mjs|css|json|geojson|bin|csl|svg|wasm)$/
// Altkarten sind WebP, Laserscan-Fenster JPEG, beides schon gepackt
const SKIP = /^(altkarten|precomputed\/lrm)\//

let files = 0
let saved = 0
function walk(dir) {
	for (const e of readdirSync(join(OUT, dir), { withFileTypes: true })) {
		const rel = dir ? `${dir}/${e.name}` : e.name
		if (SKIP.test(`${rel}/`)) continue
		if (e.isDirectory()) walk(rel)
		else if (TYPES.test(e.name)) {
			const path = join(OUT, rel)
			if (statSync(path).size < 1024) continue
			const data = readFileSync(path)
			const gz = gzipSync(data, { level: constants.Z_BEST_COMPRESSION })
			if (gz.length > data.length * 0.9) continue
			writeFileSync(`${path}.gz`, gz)
			files++
			saved += data.length - gz.length
		}
	}
}
walk("")
console.log(
	`precompress: ${files} Dateien, ${(saved / 1e6).toFixed(1)} MB kleiner`,
)
