/** Min-Heap über Knotennummern, für Dijkstra auf Raster und Flussnetz. */
export class Heap {
	constructor() {
		this.ids = []
		this.keys = []
	}
	get size() {
		return this.ids.length
	}
	push(id, key) {
		const { ids, keys } = this
		let i = ids.length
		ids.push(id)
		keys.push(key)
		while (i > 0) {
			const p = (i - 1) >> 1
			if (keys[p] <= key) break
			ids[i] = ids[p]
			keys[i] = keys[p]
			i = p
		}
		ids[i] = id
		keys[i] = key
	}
	pop() {
		const { ids, keys } = this
		const top = ids[0]
		const lastId = ids.pop()
		const lastKey = keys.pop()
		if (ids.length) {
			let i = 0
			while (true) {
				let c = 2 * i + 1
				if (c >= ids.length) break
				if (c + 1 < ids.length && keys[c + 1] < keys[c]) c++
				if (keys[c] >= lastKey) break
				ids[i] = ids[c]
				keys[i] = keys[c]
				i = c
			}
			ids[i] = lastId
			keys[i] = lastKey
		}
		return top
	}
}
