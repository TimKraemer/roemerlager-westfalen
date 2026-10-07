// Statischer Export: alles rechnet im Browser, ausgeliefert wird nur der
// Ordner out/ (deploy/README.md). BASE_PATH legt den Unterpfad fest, z. B.
// "/roemer" für experiments.erleben.app/roemer. Ohne Angabe liegt die App
// im Wurzelpfad. Weitere Einstellungen: src/config.js und .env.example.
const { createHash } = require("node:crypto")
const { existsSync, readdirSync, readFileSync } = require("node:fs")
const path = require("node:path")

const basePath = (process.env.BASE_PATH ?? "").replace(/\/+$/, "")

/**
 * Kurze Inhalts-Prüfsummen der Dateien unter public/, die die App per
 * fetch lädt. Sie hängen als ?v= an der URL (assetUrl in src/config.js),
 * damit Server und Browser sie unbegrenzt cachen dürfen und nach einer
 * Änderung trotzdem die neue Fassung holen. Altkarten zählen über ihre
 * meta.json, die beim Kacheln neu geschrieben wird.
 */
function assetHashes() {
	const pub = path.join(__dirname, "public")
	const hashes = {}
	const add = (rel) => {
		const data = readFileSync(path.join(pub, rel))
		hashes[rel] = createHash("sha1").update(data).digest("hex").slice(0, 10)
	}
	const walk = (dir) => {
		if (!existsSync(path.join(pub, dir))) return
		for (const e of readdirSync(path.join(pub, dir), { withFileTypes: true })) {
			const rel = `${dir}/${e.name}`
			if (e.isDirectory()) walk(rel)
			else if (e.isFile()) add(rel)
		}
	}
	for (const dir of ["precomputed", "models", "csl", "audio"]) walk(dir)
	const alt = path.join(pub, "altkarten")
	if (existsSync(alt)) {
		for (const id of readdirSync(alt)) {
			if (existsSync(path.join(alt, id, "meta.json")))
				add(`altkarten/${id}/meta.json`)
		}
	}
	return hashes
}

/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	output: "export",
	basePath,
	trailingSlash: true,
	env: {
		NEXT_PUBLIC_BASE_PATH: basePath,
		NEXT_PUBLIC_ASSET_HASHES: JSON.stringify(assetHashes()),
	},
}

module.exports = nextConfig
