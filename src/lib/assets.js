import { assetUrl } from "@/config"

/**
 * JSON-Dateien aus public/ laden: im Browser und Worker über fetch, in der
 * Vorberechnung direkt von der Platte (setAssetReader).
 */
let reader = async (file) => {
	const res = await fetch(assetUrl(file))
	if (!res.ok) throw new Error(`${file}: Antwort ${res.status}`)
	return res.json()
}

export const readJsonAsset = (file) => reader(file)

export function setAssetReader(read) {
	reader = read
}
