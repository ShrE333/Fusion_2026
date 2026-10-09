# GeoSathi Atlas audit — 2026-10-09

## Scope and evidence

This was an audit-only pass. No application code, dependencies, environment values, or configuration were changed. The only artifact created is this report. Evidence came from the repository at commit `b14b582`, supported scripts, and a local browser smoke test at `http://localhost:3000`.

## Executive assessment

GeoSathi Atlas is a polished, static Next.js frontend prototype for the intended GeoAI workflow. Its Discover journey, map shell, layer controls, selection/evidence view, synthetic panorama, and GeoJSON download are usable as a clearly labelled deterministic demo. It is **not yet a genuine natural-language GeoAI discovery system**: no query parsing, imagery retrieval, model inference, live OSM-vector retrieval, projected spatial calculation, backend request, persistence, or authentication is wired into the running UI.

The product messaging generally labels deterministic evidence and panorama content honestly. The strongest judge-demo risk is that arbitrary text submitted in Discover still yields the same fixed Bengaluru intent and two fixed candidate results, rather than an explicit “demo supports this example only” or a real service result.

## Repository and setup

- **Framework/package manager:** Next.js 16.4.0 at build time, React 19, TypeScript, npm (`package-lock.json`).
- **Entry points/routes:** App Router root layout (`src/app/layout.tsx`); `/` (`src/app/page.tsx`), `/layers` (`src/app/layers/page.tsx`), `/street-view` (`src/app/street-view/page.tsx`). Shared navigation is `src/components/shell/atlas-nav.tsx`.
- **Map:** MapLibre GL 5 with a raster OSM source configured in `src/components/map/atlas-map.tsx`. The default tile template is `https://tile.openstreetmap.org/{z}/{x}/{y}.png`; attribution is visible and links to the OSM copyright page.
- **Configuration:** `src/lib/config/index.ts`; documented public values are in `.env.example`. A local `.env.local` exists and is ignored; it was not read because it may contain deployment credentials. No server-side configuration or database exists.
- **Quality tooling:** scripts only for ESLint, TypeScript, and Next production build. No repository test files, test script, or configured E2E suite were found. Playwright appears only as an optional transitive dependency, not a project test setup.
- **Error handling:** API client reports missing endpoint/non-2xx/shape error, and browser geolocation reports unsupported/denied/timeout text. No error boundary, API retry policy, empty-result UI, or map-tile failure UI was found.

## Routes and runtime audit

| Feature/area | Status | Code evidence | Runtime verification | Actual current behavior | Remaining work | Priority |
|---|---|---|---|---|---|---|
| Discover navigation and main route | Working | `src/app/page.tsx`, `atlas-nav.tsx` | Local route loaded; nav visible | Global map workspace, query input, examples, Locate Me and demo journey are rendered | Responsive/mobile and error-state testing still needed | P1 |
| Query submission | Demo/mock only | `page.tsx`: `submit` sets local state and opens fixed results | Clicked DISCOVER; deterministic journey then fixed panel rendered | Any submitted string is stored as display text, but results and intent stay fixed | Call backend and display response/empty/error states | P0 |
| Query interpretation | Demo/mock only | `src/lib/demo/discovery.ts`: constant `demoIntent` | Panel displayed “commercial roof / solar panel”; fixed fixture | No text parsing or keyword logic; only the sample intent is shown | Backend/VLM parser contract and response integration | P0 |
| Candidate results and inspector | Working as demo | `page.tsx`, `demoDiscoveryResults` | Selected Candidate roof footprint A; evidence inspector showed tile ID, object, OSM ID, relation | Two static candidates, normalized object boxes, scores and distance fixture values; visibly labelled demo | Render genuine evidence and multiple/empty/error states | P0 |
| GeoJSON export | Demo/mock only | `demoGeoJsonExport`, browser Blob download | Export button rendered; download action was not invoked to avoid creating a local file during audit | Fixed FeatureCollection uses polygon geometry and `[longitude, latitude]`; properties match fixture candidates, not UI-derived/live analysis | Validate download against displayed response; backend export/provenance | P0 |
| Map initialization/controls | Working, basemap tiles unverified | `atlas-map.tsx` | Map container, zoom controls and linked OSM attribution observed | MapLibre initializes OSM raster source; no credential needed | Test offline/tile error state and public OSM production suitability | P1 |
| Feature rendering/selection | Working as demo | `atlas-map.tsx` GeoJSON sources/layers and selected overlay | Result selection opened inspector; layer checkbox state changed from 1 to 0 | Synthetic polygons, line and marker styles update from client fixtures; selected feature fits bounds only if its layer is visible | Real source/layer provenance, popups lifecycle, live geometries | P1 |
| Layers/data explorer | Working as demo | `src/app/layers/page.tsx` | Route loaded; imagery checkbox toggled from checked to unchecked | Toggles update synthetic map-source data; opacity and zoom-to-layer are client-only | Live coverage/counts/metadata and computed buffers | P1 |
| Global-to-street journey | Working as deterministic demo | `page.tsx`, `atlas-map.tsx` timed `easeTo` stages | DISCOVER ran World→Continent→Country→Region→Local Area→Street Level and showed breadcrumbs | Fixed Bengaluru camera choreography and synthetic fallback panorama | Reduced-motion support, cancellation robustness, live street imagery integration | P1 |
| Geolocation | Partial / unverified | `page.tsx` uses `navigator.geolocation.getCurrentPosition` | Control observed but permission request not triggered during audit | Real coordinates are used only after permission, but no reverse geocoder; error copy exists | Test grant/deny/timeout in target browsers; add explicit unavailable state on map | P1 |
| Street View route | Working as demo | `src/app/street-view/page.tsx` | Route loaded; draggable-panorama controls and Return to Map link visible | Locally generated, explicitly unverified panorama; companion OSM map optional | Real imagery provider/coverage, attribution and no-coverage contract | P1 |
| Reporting/incidents | Not implemented | No route/module found | N/A | No report, upload, history, or persistence feature exists | Only pursue after GeoAI core | P2 |
| Authentication | Not implemented | No auth route/module/provider found | N/A | No product auth UI or service | Define only if required | P2 |
| WhatsApp | Not implemented | No route/module/QR found | N/A | No onboarding, QR, bot, or credentials | Supporting work only | P2 |
| Backend integration boundary | Partial | `src/lib/api/client.ts`, `src/types/geo.ts` | Not callable from UI; API base URL blank by default | Typed POST `${API_BASE_URL}/search` checks only that `results` is an array; page never imports/calls it | Confirm contract, validation, integration and error states | P0 |
| Build/static reliability | Working | package scripts/Next config | lint and typecheck passed; elevated production build passed | Static routes `/`, `/layers`, `/street-view` generated successfully | Add automated tests and CI | P1 |

## Core GeoAI pipeline trace

### A. Query interpretation — Demo/mock only

`src/app/page.tsx` stores the entered query in `submitted`; `src/lib/demo/discovery.ts` provides one constant `demoIntent`. There is no parser, model call, location extraction, spatial-expression evaluation, or supported-query validation. Runtime confirms the fixed intent appears after the sample query. Any other input follows the same path.

### B. Imagery retrieval and visual detection — Not implemented

No imagery API, tile catalog, image URL, CLIP/OpenCLIP/OWL-ViT import, model service, server code, or inference call was found. `demoDiscoveryResults` contains fixed `imageTileId`, normalized bounding boxes, illustrative scores, and text explicitly stating that no satellite image is embedded. These are fixtures, not detections.

### C. OSM/vector data — Partial

The **basemap** is a real OSM raster tile source when network access permits. Its roads/features are raster pixels and are not queryable by the app. The drainage vector and OSM IDs shown by results are `demoVectorFeatures` derived from hardcoded fixture geometries. No Overpass, OSM API, vector-tile, or local geodata retrieval exists.

### D. Geospatial analysis — Not implemented

No GeoPandas/Shapely/Turf or equivalent calculation was found. The 146 m/192 m distances and “inside a 200 m drain buffer” explanations are literals in `demo/discovery.ts`; no CRS transform or metric computation occurs. MapLibre only draws GeoJSON and fits displayed bounds.

### E. Evidence and export — Demo/mock only

The types (`DiscoveryResult`, `OSMFeatureReference`, `SpatialRelationship`, `GeoJsonExport`) reasonably describe a future explainable result. The generated FeatureCollection has valid-looking GeoJSON geometry and uses longitude/latitude ordering. It always exports deterministic candidates and generated date; it is not confirmed against a map/service response and the current UI only renders the first relation/object prominently.

## Demo inventory and disclosure

- `src/lib/demo/fixtures.ts`: synthetic search, hazard and infrastructure records.
- `src/lib/demo/discovery.ts`: deterministic Bengaluru intent, two candidate roofs, OSM-like drainage reference, scores, distances, export.
- `src/app/page.tsx`: fixed Bengaluru coordinates, example queries, synthetic panorama, time-based camera path.
- `src/app/layers/page.tsx`: fixture counts, extent, metadata and coverage.
- `src/app/street-view/page.tsx`: CSS/generated panorama and demo coordinate.

Most relevant UI surfaces visibly say **DEMO**, **SYNTHETIC**, **deterministic fixture**, or **unverified**. The exception to communicate in a judge script: arbitrary free text is accepted but not interpreted; it only changes the displayed query heading. No backend dataset is described as live in these inspected routes.

## Backend integration checklist (proposals, not agreed contracts)

The only current proposal is `POST {API_BASE_URL}/search` with `{ query }` from `src/lib/api/client.ts`. The backend owner must confirm:

1. Endpoint path, auth model, request schema, query scope/AOI representation, pagination and cancellation semantics.
2. A versioned response schema for intent, imagery tile provenance/URLs, captures, grounded objects, geometries, OSM IDs/tags/geometries, relation predicate, distance unit/CRS, and per-result errors.
3. Whether the backend returns an export-ready GeoJSON FeatureCollection or UI converts typed results; establish required properties and coordinate order.
4. Model identity/version, score semantics, imagery licensing/attribution, source timestamps, and confidence limitations.
5. OSM source/query provenance, rate limits, missing-data behavior, and geometry simplification policy.
6. Spatial-analysis CRS, buffer/distance method, geometry validity handling, and empty/no-match contract.
7. Stable error format/statuses and demo-vs-production mode behavior. Keep credentials server-side; do not put private secrets in `NEXT_PUBLIC_*` values.

## Checks executed

| Command/check | Result |
|---|---|
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` in sandbox | Inconclusive setup failure: Next compilation passed, then TypeScript worker failed with `spawn EPERM` |
| `npm run build` with normal process permission | Passed; static routes `/`, `/_not-found`, `/layers`, `/street-view` generated |
| Local HTTP smoke check | `http://localhost:3000` returned HTTP 200 before browser testing |
| Browser: Discover, submit, journey, candidate/evidence | Passed as deterministic demo; no backend request tested because UI does not call API client |
| Browser: `/layers`, imagery toggle | Passed: route loaded and checkbox changed checked→unchecked |
| Browser: `/street-view` | Passed: route loaded with explicit demo/unverified copy and Return to Map link |
| Geolocation permission, GeoJSON download contents, map tile network failures, mobile viewport, console/network log inspection | Not performed / unverified |

## Evidence-based completion assessment

- **UI and navigation completeness:** moderate for the three implemented routes; reporting/auth/WhatsApp are absent by design/current scope.
- **Functional frontend behavior:** moderate for deterministic client interactions (navigation, state changes, camera journey, selectors, toggle); low for arbitrary-query behavior because it is fixed-fixture only.
- **Genuine GeoAI/geospatial functionality:** absent in this repository.
- **Backend integration readiness:** early/partial. Useful shared types and a single abortable client exist, but it is uncalled and underspecified/under-validated.
- **Test/build/runtime reliability:** static checks pass in a normal process and focused browser smoke tests pass; automated behavior coverage and failure-mode testing are absent.
- **Judge-ready demo readiness:** viable only when presented explicitly as a deterministic interaction prototype. It is not ready to demonstrate live discovery claims.

## Prioritized work (do not implement in this audit)

### P0 — before judge demo

1. **Make Demo-mode query behavior unambiguous.** Files: `src/app/page.tsx`, `src/lib/demo/discovery.ts`. Outcome: supported example queries map to named deterministic scenarios; unsupported text says it is not interpreted yet. Acceptance: no arbitrary text is shown beside fixed inference as if processed. Frontend.
2. **Wire a confirmed search response to the UI.** Files: `src/lib/api/client.ts`, `src/types/geo.ts`, `src/app/page.tsx`. Outcome: loading, success, empty and error states use a real service when configured. Acceptance: a captured request/response drives intent, candidates, evidence and selection. Frontend + backend.
3. **Establish real imagery/OSM/spatial provenance.** New backend/data/model services. Outcome: each result has licensed imagery evidence, model version/score meaning, OSM source IDs/geometries, and computed predicate/distance. Acceptance: backend integration test verifies a known AOI against expected geometry. Backend + data/model.
4. **Make GeoJSON export response-derived.** Files: `src/types/geo.ts`, `src/app/page.tsx`. Outcome: downloaded features exactly match currently rendered service results. Acceptance: automated parse test compares IDs/geometries/properties. Frontend + backend.
5. **Add reliable core-flow tests.** New test/E2E configuration. Outcome: CI covers query states, selection, layers, attribution, export and error/empty cases. Acceptance: repeatable tests run from npm scripts. Frontend.

### P1 — after core verification

1. Add service-aware map tile/OSM/vector failure and no-data states (`atlas-map.tsx`); test offline/network failure. Frontend + data.
2. Confirm map layer metadata/counts/coverage from a catalog API, not literals (`layers/page.tsx`). Frontend + backend.
3. Test and improve reduced-motion, cancellation, geolocation grant/deny and small-viewport behavior (`page.tsx`, map component). Frontend.
4. Replace synthetic street panorama only after selecting/configuring an imagery provider and its attribution/coverage contract. Frontend + provider/backend.

### P2 — supporting/optional

1. Reporting/incidents: design persistence, upload privacy and moderation flow first. Backend + frontend.
2. Authentication: add only if product roles/saved data require it. Backend + frontend.
3. WhatsApp: add only with an approved public business integration; never expose session QR or secrets. Backend + frontend.

## Manual pre-demo smoke checklist

- [ ] Open `/`; expected: Discover route, OSM attribution link, and explicit demo status are visible.
- [ ] Submit the supported solar/drainage example; expected: deterministic journey completes, demo interpretation and two labelled candidates appear.
- [ ] Select a candidate; expected: evidence panel names the demo tile, grounded object, OSM reference and deterministic relation.
- [ ] Download GeoJSON; expected: a FeatureCollection download with the demo candidates; inspect it is labelled/demo-provenance aware.
- [ ] Click Layers, toggle imagery and drainage, change opacity, and use zoom-to-layer; expected: checkbox state and synthetic map display/selection stay synchronized.
- [ ] Open Street View; expected: explicit unverified demo panorama, controls, and Return to Map work.
- [ ] Test Locate Me with both allow and deny in the presentation browser; expected: no location before click; a clear capture or privacy-preserving error message afterward.
- [ ] With backend unset, use a non-example query; expected today: document to judges that the displayed result is a fixture, not an interpreted live result.
