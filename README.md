# GeoSathi Atlas — Frontend

GeoSathi Atlas is the map-first frontend for the GeoSathi AI hackathon project. It is a compact cartographic workstation for exploring imagery-search candidates, road-hazard evidence, and backend-provided geographic features without presenting synthetic demo content as real-world inference.

## What this frontend owns

- Natural-language search workspace and ranked evidence drawer.
- Client-side MapLibre GL map with an OpenStreetMap street basemap.
- Independent map layers for imagery-search footprints, road hazards, and survey/infrastructure corridors.
- Feature selection, map navigation, evidence inspection, coordinate copying, and compact layer controls.
- An isolated typed API boundary ready for the vision-language and geospatial teams to confirm their contract.
- A World-to-Street judge demo with separate real-location and deterministic demo journeys.

## World-to-Street demo

The product opens at a global OSM map overview. `LOCATE ME` requests browser geolocation only after the user activates it, retains the captured coordinate/accuracy, and labels locality resolution as unavailable until a reverse-geocoder is configured. `PREVIEW DEMO JOURNEY` instead follows a deterministic Bengaluru camera path, then opens a **DEMO PANORAMA — NOT VERIFIED AT THIS LOCATION** fallback. No Mapillary token, image ID, or verified street coverage is currently configured.

## Design principles

The map is the primary workspace. The interface uses a forest-green, warm-paper, and survey-vermilion cartographic palette; OSM is a street basemap, never imagery. Synthetic fixtures are marked **DEMO DATA — SYNTHETIC** everywhere they appear, including map cards, popups, legend, and evidence inspector.

## Quick start

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verification

```bash
npm run lint
npm run typecheck
npm run build
```

## Configuration

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_OSM_TILE_URL` | Raster street-map tile template. Defaults to the standard OSM tile URL. |
| `NEXT_PUBLIC_API_BASE_URL` | Future backend base URL. Leave blank until the API contract is confirmed. |
| `NEXT_PUBLIC_DEMO_MODE` | Set to `false` to disable all synthetic fixtures and show honest empty/disconnected states. |

## API handoff

The frontend deliberately does not invent a working integration. The typed, abortable request boundary is in `src/lib/api/client.ts`; demo fixtures remain isolated in `src/lib/demo/fixtures.ts`. Before wiring the service, the backend owner should confirm the search path, request body, response schema, evidence URLs, geometry format, timestamps, and provenance fields.

Never place database credentials, model keys, or private tokens in frontend code or a `NEXT_PUBLIC_` variable.

### Discovery result contract

The frontend’s future search response is typed in `src/types/geo.ts`. A result contains the image-tile identifier and footprint, grounded visual objects, referenced OSM feature IDs/geometries, explicit spatial predicates and distances, plus an export-ready `FeatureCollection`. `src/lib/demo/discovery.ts` is a deterministic demonstration of this contract—not model output or a spatial join against live OSM data.

## OpenStreetMap use

The default raster source is a development convenience. GeoSathi Atlas retains visible, linked `© OpenStreetMap contributors` attribution and does not prefetch, scrape, or download tiles. Review the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/) and arrange an appropriate provider or hosting arrangement before public production use.

## Project layout

```text
src/app/                 Application shell, workspace, and styling
src/components/map/      Client-side MapLibre canvas and layer rendering
src/lib/api/             Typed backend integration boundary
src/lib/demo/            Explicitly synthetic interaction fixtures
src/types/               Shared GeoJSON-oriented TypeScript types
```
