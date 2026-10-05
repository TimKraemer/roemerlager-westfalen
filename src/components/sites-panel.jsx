"use client"

import {
	Box,
	Link,
	List,
	ListItemButton,
	ListItemText,
	Typography,
} from "@mui/material"
import sources from "@/data/quellen.json"
import { SITE_TYPES, SITES } from "@/lib/sites"
import { useMapStore } from "@/store/use-map-store"
import CitationBox from "./citation-box"
import { SectionTitle } from "./layer-panel"

export function SitesPanel() {
	const setSelectedSite = useMapStore((s) => s.setSelectedSite)
	const siteTypes = useMapStore((s) => s.siteTypes)

	return (
		<Box>
			{SITE_TYPES.filter((t) => siteTypes[t.id]).map((type) => {
				const items = SITES.features
					.filter((f) => f.properties.type === type.id)
					.sort((a, b) =>
						a.properties.name.localeCompare(b.properties.name, "de"),
					)
				if (!items.length) return null
				return (
					<Box key={type.id}>
						<SectionTitle>
							{type.label} ({items.length})
						</SectionTitle>
						<List dense disablePadding>
							{items.map((f) => (
								<ListItemButton
									key={f.properties.id}
									onClick={() => setSelectedSite(f.properties.id)}
									sx={{
										borderRadius: 1,
										borderLeft: `3px solid ${type.color}`,
										mb: 0.25,
									}}
								>
									<ListItemText
										primary={f.properties.name}
										secondary={[
											f.properties.dating,
											f.properties.size_ha && `${f.properties.size_ha} ha`,
										]
											.filter(Boolean)
											.join(" · ")}
									/>
								</ListItemButton>
							))}
						</List>
					</Box>
				)
			})}
		</Box>
	)
}

export function SourcesPanel() {
	return (
		<Box>
			<SectionTitle>Zitiervorschlag</SectionTitle>
			<Typography variant="body2" color="text.secondary">
				Karte, Modell und Zusammenstellung der Quellen von Tim Krämer, 2026.
			</Typography>
			<CitationBox />
			{sources.map((group) => (
				<Box key={group.title}>
					<SectionTitle>{group.title}</SectionTitle>
					{group.intro && (
						<Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
							{group.intro}
						</Typography>
					)}
					{group.items.map((item) => (
						<Box key={item.label} sx={{ mb: 1.25 }}>
							{item.url ? (
								<Link
									href={item.url}
									target="_blank"
									rel="noreferrer"
									variant="body2"
								>
									{item.label}
								</Link>
							) : (
								<Typography variant="body2">{item.label}</Typography>
							)}
							{item.note && (
								<Typography
									variant="caption"
									color="text.secondary"
									component="div"
								>
									{item.note}
								</Typography>
							)}
						</Box>
					))}
				</Box>
			))}
		</Box>
	)
}
