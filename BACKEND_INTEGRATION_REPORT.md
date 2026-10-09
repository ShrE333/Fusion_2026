# Phase 3 backend integration report

## Connected endpoints

The browser uses same-origin `/api/geosathi/*` routes. The server-side allowlist forwards only `health`, `features`, `osm`, and `incidents` to `GEOSATHI_API_BASE_URL`; it rejects arbitrary resources and invalid OSM bounds/layers, uses no-store responses, and aborts upstream calls after eight seconds.

`/layers` now checks health and can render separate backend sources for GeoSathi-managed features and imported OSM `buildings`, `roads`, and `places`. Requests are made from current map bounds, debounced by 350 ms, and older requests are aborted/ignored. Synthetic imagery footprints and drainage remain explicit, separate demo fixtures.

## Observed backend responses (2026-10-09)

- `GET /health`: HTTP 200; object with `status: "healthy"` plus database/PostGIS metadata.
- `GET /api/v1/features`: HTTP 200 GeoJSON FeatureCollection. The observed record was `Pune Test Location` with `properties.source: "test"`; the UI does not label it as a verified detection.
- `GET /api/v1/osm`: HTTP 200 GeoJSON FeatureCollection. A Bengaluru buildings query with a limit of 5 returned an empty collection.
- `GET /incidents`: HTTP 200 `{ count, incidents }`; the observed incident metadata explicitly marked it synthetic. No incident UI was added.
- `/openapi.json`: no natural-language search endpoint was documented. Discover therefore remains a clearly labelled deterministic demo; `/api/v1/search` was not called.

## Configuration

Append (do not replace existing lines) to `.env.local` and restart Next.js:

```text
GEOSATHI_API_BASE_URL=http://8.234.86.28:8000
```

The variable is server-only. The HTTPS frontend never sends browser traffic directly to the HTTP upstream, avoiding mixed-content browser failures. Vercel must configure the same environment variable before live proxy use.

## Files

- `src/app/api/geosathi/[resource]/route.ts`: constrained server proxy.
- `src/lib/api/geosathi.ts`: typed, response-validating browser service layer.
- `src/components/map/atlas-map.tsx`: live GeoJSON source/layer and viewport callback support.
- `src/app/layers/page.tsx`: backend health and live-layer controls.
- `.env.example`: server-only URL documentation.

## Validation and remaining work

Direct upstream read-only checks succeeded for every endpoint above. `npm run lint`, `npm run typecheck`, and `npm run build` completed successfully. The production build includes the dynamic proxy route.

The local proxy positive path still requires the environment variable above; `.env.local` was deliberately not changed. Browser geolocation, satellite-key configuration, actual OSM data in a populated viewport, feature-click property inspection, and proxy deployment on Vercel remain manual checks. No live GeoAI inference, imagery retrieval, or spatial-analysis claim is made.

## Post-integration runtime investigation (2026-10-09)

The local application logs supplied for this review reported HTTP 200 responses for `/api/geosathi/health`, `/api/geosathi/features`, and all three OSM layer proxy requests. This confirms that the configured same-origin proxy path has been reached in the running application. The verification shell could not independently connect to `localhost:3000` at the time of this review, so it did not record response bodies or map rendering from that session.

### Duplicate managed-feature requests

The duplicate identical-bounds requests had a reproducible client-side cause. `AtlasMap` reports its bounds both on `moveend` and once on `load`. Each notification constructed a new bounds object, so React treated identical numeric bounds as a changed `bounds` state value and re-ran the live-fetch effect. React Strict Mode can replay lifecycle work during development, but it was not required for this duplicate-fetch path.

`src/app/layers/page.tsx` now compares the four bound coordinates before replacing state. Identical bounds retain the existing state object and therefore do not schedule another managed-feature request. The existing 350 ms debounce remains in place.

### Response and stale-data handling

- Managed features are fetched through `getManagedFeatures`; buildings, roads, and places each use `getOsmFeatures` with their explicit layer name.
- The service rejects non-`FeatureCollection` payloads or invalid feature geometry before data reaches the map.
- Each returned collection is supplied to its corresponding `geosathi-managed`, `geosathi-buildings`, `geosathi-roads`, or `geosathi-places` MapLibre GeoJSON source with `setData`.
- A valid empty `FeatureCollection` replaces that source with an empty collection; it does not append to or retain previous features.
- On viewport/layer changes, the prior controller is aborted and a monotonic request id is advanced. State writes from managed and OSM responses occur only when that id is still current, preventing a late response from overwriting newer results.
- Synthetic discovery fixtures remain on the separate `atlas-*` sources and are still visibly labelled as synthetic in `/layers`.

Browser verification still required: pan/zoom requests and their bound values, rapid toggle/cancellation behavior under real network timing, populated Pune rendering, valid empty Bengaluru rendering, and preservation of overlays across Street/Satellite switches. No live GeoAI search endpoint is claimed.
