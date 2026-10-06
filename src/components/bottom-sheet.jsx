"use client"

import { Box, ButtonBase, Paper } from "@mui/material"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { SHEET_TALL, sheetBounds, sheetHeight } from "@/lib/sheet"

const EASE = "height 320ms cubic-bezier(0.32, 0.72, 0, 1)"

/**
 * Sheet am unteren Rand für das Handy. Griff und Kopf lassen sich ziehen,
 * die Höhe bleibt dort, wo man loslässt. Schnell nach unten wischen klappt
 * ein, schnell nach oben öffnet ganz.
 */
export default function BottomSheet({
	open,
	frac,
	onChange,
	header,
	children,
}) {
	const ref = useRef(null)
	const drag = useRef(null)
	const swallowClick = useRef(false)
	const [vh, setVh] = useState(() => window.innerHeight)

	useEffect(() => {
		const onResize = () => setVh(window.innerHeight)
		window.addEventListener("resize", onResize)
		return () => window.removeEventListener("resize", onResize)
	}, [])

	// Höhe direkt am Element setzen, damit beim Ziehen nichts neu rendert.
	// Die Karte bekommt sie als CSS-Variable für ihre Bedienelemente.
	const apply = (h) => {
		const el = ref.current
		if (!el) return
		el.style.height = `${h}px`
		const parent = el.parentElement
		parent.style.setProperty("--sheet-h", `${h}px`)
		parent.classList.toggle("sheet-tall", h > vh * SHEET_TALL)
	}

	const height = sheetHeight(open, frac, vh)
	useLayoutEffect(() => apply(height), [height, vh])

	const onPointerDown = (e) => {
		if (e.pointerType === "mouse" && e.button !== 0) return
		drag.current = {
			id: e.pointerId,
			y0: e.clientY,
			h0: ref.current.getBoundingClientRect().height,
			h: null,
			moves: [{ y: e.clientY, t: e.timeStamp }],
		}
	}

	const onPointerMove = (e) => {
		const d = drag.current
		if (!d || d.id !== e.pointerId) return
		const dy = e.clientY - d.y0
		if (d.h === null) {
			// Erst ab ein paar Pixeln ziehen, sonst ist es ein Tippen
			if (Math.abs(dy) < 6) return
			e.currentTarget.setPointerCapture(e.pointerId)
			ref.current.style.transition = "none"
		}
		const { min, max } = sheetBounds(vh)
		let h = d.h0 - dy
		// Über die Grenzen hinaus nur gedämpft
		if (h > max) h = max + (h - max) * 0.2
		if (h < min) h = min - (min - h) * 0.2
		d.h = h
		d.moves.push({ y: e.clientY, t: e.timeStamp })
		if (d.moves.length > 6) d.moves.shift()
		apply(h)
	}

	const onPointerUp = (e) => {
		const d = drag.current
		if (!d || d.id !== e.pointerId) return
		drag.current = null
		if (d.h === null) return
		swallowClick.current = true
		ref.current.style.transition = ""

		const first = d.moves[0]
		const last = d.moves[d.moves.length - 1]
		const recent = e.timeStamp - last.t < 80
		const v = recent ? (last.y - first.y) / Math.max(1, last.t - first.t) : 0
		const { min, max } = sheetBounds(vh)
		const h = Math.min(max, Math.max(min, d.h))

		let next
		if (v > 0.6 || h < min + 48) next = { open: false, frac }
		else if (v < -0.6) {
			next = { open: true, frac: d.h0 <= min + 1 ? Math.max(frac, 0.5) : 1 }
		} else if (h > max - 32) next = { open: true, frac: 1 }
		else next = { open: true, frac: h / vh }

		apply(sheetHeight(next.open, next.frac, vh))
		onChange(next)
	}

	const dragProps = {
		onPointerDown,
		onPointerMove,
		onPointerUp,
		onPointerCancel: onPointerUp,
		onClickCapture: (e) => {
			if (!swallowClick.current) return
			swallowClick.current = false
			e.stopPropagation()
			e.preventDefault()
		},
	}

	return (
		<Paper
			ref={ref}
			elevation={8}
			component="section"
			aria-label="Bedienung"
			sx={{
				position: "absolute",
				left: 0,
				right: 0,
				bottom: 0,
				zIndex: 5,
				display: "flex",
				flexDirection: "column",
				borderRadius: "16px 16px 0 0",
				overflow: "hidden",
				pb: "env(safe-area-inset-bottom)",
				transition: EASE,
				"@media (prefers-reduced-motion: reduce)": { transition: "none" },
			}}
		>
			<Box
				{...dragProps}
				sx={{
					flexShrink: 0,
					touchAction: "none",
					userSelect: "none",
					WebkitUserSelect: "none",
					borderBottom: open ? 1 : 0,
					borderColor: "divider",
				}}
			>
				<ButtonBase
					onClick={() => onChange({ open: !open, frac })}
					aria-label={open ? "Bedienung einklappen" : "Bedienung aufklappen"}
					aria-expanded={open}
					disableRipple
					sx={{ width: "100%", height: 22, display: "flex" }}
				>
					<Box
						sx={{
							width: 40,
							height: 5,
							borderRadius: 3,
							bgcolor: "action.disabled",
						}}
					/>
				</ButtonBase>
				{header}
			</Box>
			<Box
				sx={{
					flex: 1,
					minHeight: 0,
					overflowY: "auto",
					overflowX: "hidden",
					overscrollBehavior: "contain",
					WebkitOverflowScrolling: "touch",
				}}
			>
				{children}
			</Box>
		</Paper>
	)
}
