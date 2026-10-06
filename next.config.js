// Statischer Export: alles rechnet im Browser, ausgeliefert wird nur der
// Ordner out/ (deploy/README.md). BASE_PATH legt den Unterpfad fest, z. B.
// "/roemer" für experiments.erleben.app/roemer. Ohne Angabe liegt die App
// im Wurzelpfad. Weitere Einstellungen: src/config.js und .env.example.
const basePath = (process.env.BASE_PATH ?? "").replace(/\/+$/, "")

/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	output: "export",
	basePath,
	trailingSlash: true,
	env: { NEXT_PUBLIC_BASE_PATH: basePath },
}

module.exports = nextConfig
