# GeoSathi Atlas

## Purpose
Map-first research interface for natural-language imagery retrieval, road-hazard evidence, and backend-supplied geospatial features.

## Design direction
Preserve the cartographic workstation character: restrained paper/charcoal/survey-green palette, vermilion reserved for hazards, compact technical metadata, and a visually dominant map. Do not turn this into a generic dashboard or a fake monitoring system.

## GIS and data rules
- All displayed geometry must be valid typed GeoJSON and retain its provenance.
- Demo fixtures are synthetic, live in `src/lib/demo`, and must always be labelled as such.
- Use the configurable OSM raster tile URL only as a street basemap, never label it imagery, and retain visible OpenStreetMap attribution.
- Do not fetch Overpass/OSM data in response to map movement. Infrastructure overlays belong to a backend or scoped ingestion pipeline.
- Future imagery layers require their own attribution and must be enabled only when a genuine configured source exists.

## API boundary
`src/lib/api/client.ts` is the centralized client. Backend contracts are awaiting confirmation; do not fabricate endpoint success or expose secrets through public environment variables.

## Testing
Run `npm run lint`, `npm run typecheck`, and `npm run build` before handoff. Exercise search, layer filters, feature selection, inspector, and a narrow viewport manually when a browser is available.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
