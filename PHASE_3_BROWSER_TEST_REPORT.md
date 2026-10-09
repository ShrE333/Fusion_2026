# Phase 3 Live Browser Integration Test Report

Date: 2026-10-09

## 1. Executive summary

Live browser integration testing is **blocked** because no existing Next.js server was listening at `http://localhost:3000`. The test brief explicitly prohibits starting a second server, so no endpoint, map, browser, or interaction result below is represented as tested.

No application source, dependencies, or environment files were modified. This report is the only file created for this QA task.

### Classification totals

| Classification | Count |
| --- | ---: |
| PASS | 3 |
| FAIL | 0 |
| BLOCKED | 22 |
| UNVERIFIED | 0 |

The three passes are static environment prerequisites only; they are not evidence that live backend data renders in the map.

## 2. Environment and runtime status

| Test | Status | Observation | Scope |
| --- | --- | --- | --- |
| Project scripts inspected | PASS | `package.json` exposes `dev`, `build`, `start`, `lint`, and `typecheck`. | Frontend configuration |
| Backend base URL presence | PASS | `GEOSATHI_API_BASE_URL` is present in `.env.local`; its value was not read or displayed. | Local configuration |
| Proxy implementation present | PASS | `src/app/api/geosathi/[resource]/route.ts` and `src/lib/api/geosathi.ts` exist. | Source inspection |
| Existing local runtime | BLOCKED | No TCP listener was present on port 3000. | Runtime / environment |
| Browser automation | BLOCKED | Automation capability is available, but no running local page exists to test. | Test environment |

## 3. Proxy endpoint results

The following endpoints were not called because the required local runtime is absent. No HTTP status, content type, feature count, or payload shape was observed in this QA session.

| Endpoint | Status | Reason |
| --- | --- | --- |
| `GET /api/geosathi/health` | BLOCKED | No local application listener. |
| `GET /api/geosathi/features` | BLOCKED | No local application listener. |
| `GET /api/geosathi/osm?layer=buildings&…` | BLOCKED | No local application listener. |
| `GET /api/geosathi/osm?layer=roads&…` | BLOCKED | No local application listener. |
| `GET /api/geosathi/osm?layer=places&…` | BLOCKED | No local application listener. |
| `GET /api/geosathi/incidents` | BLOCKED | No local application listener. |

## 4. Buildings, roads, places, and managed-feature rendering results

All four live layer rendering tests are **BLOCKED**. The `/layers` page could not be opened on the required existing local application, so no layer toggle, count, loading state, backend provenance, feature geometry, or property inspection was observed.

The source contains separate live-layer identifiers for managed features, buildings, roads, and places. This is not treated as a rendering pass.

## 5. Pune versus Bengaluru results

| Area | Status | Observation |
| --- | --- | --- |
| Current map viewport | BLOCKED | The map could not be opened; viewport bounds and response counts were not observed. |
| Bengaluru | BLOCKED | No same-origin requests were run. |
| Pune | BLOCKED | No same-origin requests were run. |

No inference was made about whether either area contains backend features.

## 6. Viewport-refresh and duplicate-request tests

All tests are **BLOCKED**: pan, zoom, rapid movement, toggling during load, request debouncing, duplicate-bound requests, and cancellation/sequence behavior require a running browser application and observable network activity.

No claim is made about React Strict Mode, request counts, or current-bounds request parameters from this session.

## 7. Empty-result and stale-response tests

**BLOCKED.** No valid empty `FeatureCollection` was received in this session, so stale-map-data replacement and independent layer preservation could not be observed.

## 8. Feature selection and property inspection

**BLOCKED.** No backend-rendered geometry was available to click. Consequently, feature selection, inspector properties, and geometry-to-response matching were not tested.

## 9. Street/Satellite overlay-preservation results

**BLOCKED.** The map could not be opened. Basemap switching, live-overlay persistence, attribution visibility, camera state, and missing-provider feedback remain untested.

## 10. Discover, export, geolocation, and Street View regressions

| Feature | Status | Reason |
| --- | --- | --- |
| Discover demo workflow | BLOCKED | No running app. |
| Candidate selection and evidence inspector | BLOCKED | No running app. |
| Demo GeoJSON export and synthetic labelling | BLOCKED | No running app. |
| Locate Me versus Preview Demo Journey | BLOCKED | No running app. |
| `/street-view` demo/unverified labelling | BLOCKED | No running app. |
| Sidebar navigation and backend-unavailable usability | BLOCKED | No running app. |

No natural-language GeoAI, satellite retrieval, or live spatial-analysis capability was claimed.

## 11. Confirmed bugs, blocked checks, and remaining uncertainty

### Confirmed bugs

None. The absent local server is a test-environment condition, not evidence of a frontend defect.

### Blocked checks

All runtime endpoint and browser interaction checks listed above are blocked solely by the missing existing local server.

### Remaining uncertainty

Whether actual backend features are fetched, rendered, refreshed, selected, or preserved cannot be determined without the running local app and browser network evidence.

## 12. Ranked fixes with acceptance criteria

1. **Restore the intended existing local development runtime.**
   - Acceptance: `http://localhost:3000/layers` loads without starting a second server; proxy endpoint responses can be observed.
2. **Run the live endpoint and map-layer matrix.**
   - Acceptance: each layer’s request, HTTP status, shape/count, map visibility, and empty/error behavior are captured for Bengaluru and Pune.
3. **Run movement and basemap regression checks.**
   - Acceptance: browser network evidence shows current bounds, debouncing, stale-response protection, and preserved overlays across Street/Satellite.

## 13. Manual checklist to resume testing

1. From `C:\Users\Lenovo\Downloads\GeoSathi AI`, start the intended existing local server once with `npm run dev` (or use the URL it reports if it selects another port).
2. Confirm the browser reaches `/layers` and report the exact local URL/port.
3. Re-run this QA pass against that live URL: endpoint matrix, individual layer toggles, Bengaluru/Pune viewport comparisons, rapid-pan/toggle race checks, and Street/Satellite preservation.
4. Capture browser network statuses and response counts without copying tokens, keys, or full sensitive payloads.
