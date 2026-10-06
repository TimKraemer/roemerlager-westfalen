"use client"

import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import { Box, ButtonBase, Collapse, Typography } from "@mui/material"
import { useId } from "react"

/**
 * Aufklappbarer Abschnitt im Stil der Abschnittsüberschriften. badge steht
 * rechts neben dem Titel, etwa wie viele Ebenen darin an sind.
 */
export default function Fold({ title, badge, open, onToggle, children }) {
	const id = useId()
	return (
		<Box sx={{ mt: 1.5 }}>
			<ButtonBase
				onClick={() => onToggle(!open)}
				aria-expanded={open}
				aria-controls={id}
				sx={{
					width: "100%",
					justifyContent: "flex-start",
					gap: 1,
					py: 0.75,
					mx: -1,
					px: 1,
					borderRadius: 1,
					boxSizing: "content-box",
					"&:hover": { bgcolor: "action.hover" },
				}}
			>
				<Typography
					variant="overline"
					color="text.secondary"
					sx={{ lineHeight: 1.6, flex: 1, textAlign: "left" }}
				>
					{title}
				</Typography>
				{badge && (
					<Typography
						variant="caption"
						sx={{
							px: 0.75,
							borderRadius: 1,
							bgcolor: "action.selected",
							color: "text.secondary",
							lineHeight: "18px",
						}}
					>
						{badge}
					</Typography>
				)}
				<ExpandMoreIcon
					fontSize="small"
					sx={{
						color: "text.secondary",
						transition: "transform 200ms",
						transform: open ? "rotate(180deg)" : "none",
					}}
				/>
			</ButtonBase>
			<Collapse in={open} id={id}>
				{children}
			</Collapse>
		</Box>
	)
}
