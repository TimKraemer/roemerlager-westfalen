/**
 * Potenzialraster als Bild für die MapLibre-Bildquelle. Unter der Schwelle
 * bleibt die Zelle durchsichtig, darüber geht die Farbe von Gelb über
 * Orange nach Dunkelrot.
 */

const STOPS = [
	[0, [255, 241, 118]],
	[0.5, [251, 140, 0]],
	[1, [183, 28, 28]],
]

function ramp(t) {
	for (let i = 1; i < STOPS.length; i++) {
		const [t1, c1] = STOPS[i]
		const [t0, c0] = STOPS[i - 1]
		if (t <= t1) {
			const k = (t - t0) / (t1 - t0)
			return c0.map((v, j) => Math.round(v + (c1[j] - v) * k))
		}
	}
	return STOPS[STOPS.length - 1][1]
}

export function renderHeatmap(result, threshold) {
	const { grid, score } = result
	const canvas = document.createElement("canvas")
	canvas.width = grid.cols
	canvas.height = grid.rows
	const ctx = canvas.getContext("2d")
	const image = ctx.createImageData(grid.cols, grid.rows)
	let max = 0
	for (const v of score) if (v > max) max = v
	const span = Math.max(1e-6, max - threshold)
	for (let i = 0; i < score.length; i++) {
		const v = score[i]
		if (v < threshold) continue
		const t = Math.min(1, (v - threshold) / span)
		const [r, g, b] = ramp(t)
		image.data[i * 4] = r
		image.data[i * 4 + 1] = g
		image.data[i * 4 + 2] = b
		image.data[i * 4 + 3] = Math.round(90 + 165 * t)
	}
	ctx.putImageData(image, 0, 0)
	return canvas.toDataURL("image/png")
}
