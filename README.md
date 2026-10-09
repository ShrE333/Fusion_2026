# GeoSathi Atlas

Map-first GeoAI discovery with a shared frontend and WhatsApp GIS search service. Road damage reporting is a supporting workflow. OSM footprints are vector data; SkyCLIP results are imagery tile candidates. Neither is AI segmentation.

## Run and verify

Use Node.js 22. Copy `.env.example` to a private `.env.local` as needed. Install with `npm ci` and start with `npm run dev`.

```text
npm run typecheck
npm run lint
npm run build
node scripts/test-gis-pipeline.cjs
cd apps/whatsapp
python -m pytest -q
```

## Search and imagery

The browser posts to `/api/skyclip/search`; WhatsApp posts text and an explicit GPS pin to `/api/infra-search` with a server-side bearer token. Both use `src/lib/server/geoai-search.ts`. Searches query a bounded backend GIS area, filter hospital and road semantics, validate typed GeoJSON, preserve OSM references, and restrict SkyCLIP fallback tiles to that area. Infrastructure requests follow searches, never map movement.

`/inspect?lat=18.5204&lon=73.8567&q=hospitals` opens the mobile inspection map. Add `#street` for nearby Mapillary captures. A missing pin uses a labelled Pune default. `/street-view` provides the street imagery journey; `/layers` provides layer controls. The deterministic demo uses labelled synthetic fixtures under `src/lib/demo`.

Street tiles retain OpenStreetMap attribution. Satellite requires a configured MapTiler browser key. Mapillary requires a browser client token restricted to the production origin. Private provider credentials stay in server environment variables. No provider coverage is assumed.

## Deployment

Vercel project: `geosathi-atlas`, intended production branch: `main`, URL: https://geosathi-atlas.vercel.app. Preserve existing environment variables. Configure `GEOSATHI_API_BASE_URL` for GIS and `SKYCLIP_BASE_URL` plus `SKYCLIP_SERVICE_TOKEN` for authenticated imagery retrieval. The WhatsApp adapter's `SERVICE_TOKEN` must match `SKYCLIP_SERVICE_TOKEN`; set `INFRA_SEARCH_URL` to Atlas `/api/infra-search` and `GEOSATHI_ATLAS_URL` to its public root.

EasyPanel `whatsapp-bot` uses build context `apps/whatsapp` and its `Dockerfile`. Verify its deployed source branch before redeployment. Preserve the `/data` volume and WAHA credentials/HMAC secret. Native multilingual lists fall back to text when unsupported; search and road-report completion return the service menu. Road inference uploads multipart image bytes with a separate road-service token.

Live WAHA delivery, GIS coverage, model availability, Mapillary coverage, and deployment require authenticated runtime checks. Offline tests use mocked providers and do not establish live availability.
