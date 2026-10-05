// Läuft als statische Seite unter experiments.erleben.app/roemer
// (deploy/README.md). Alles rechnet im Browser, ein Server ist nicht nötig.
const basePath = "/roemer"

/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	output: "export",
	basePath,
	trailingSlash: true,
	env: { NEXT_PUBLIC_BASE_PATH: basePath },
}

module.exports = nextConfig
