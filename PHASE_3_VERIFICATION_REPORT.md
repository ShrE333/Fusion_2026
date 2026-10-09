# Phase 3 live integration verification

Date: 2026-10-09

## Configuration and proxy checks

`GEOSATHI_API_BASE_URL` is present and non-empty in the existing local environment. Its value and any credentials were not printed or copied into this report.

The requested same-origin calls could not be completed in this verification session: the existing application server was not listening on `localhost:3000`, and no browser tab was available. Every attempted local proxy route returned a connection-refused error before a HTTP response was received. A new development server was not started, per the task restriction.

| Same-origin endpoint | Result | Response / conclusion |
| --- | --- | --- |
| `/api/geosathi/health` | Blocked | No local application listener; no HTTP status or response body received. |
| `/api/geosathi/features` | Blocked | No local application listener; GeoJSON response could not be re-verified through the proxy. |
| `/api/geosathi/osm?layer=buildings` | Blocked | No local application listener. |
| `/api/geosathi/osm?layer=roads` | Blocked | No local application listener. |
| `/api/geosathi/osm?layer=places` | Blocked | No local application listener. |
| `/api/geosathi/incidents` | Blocked | No local application listener. |

This is a local-runtime availability block, not an observed CORS, network, proxy, JSON, or rendering failure. The backend endpoint responses documented in `BACKEND_INTEGRATION_REPORT.md` were direct upstream observations from the prior task and are not recorded here as fresh proxy verification.

## Map and application runtime verification

`/layers` could not be opened against a running local app in this session. Consequently, the following checks are **unverified**, not passed:

- Live managed, buildings, roads, and places rendering in both Pune and Bengaluru.
- Valid empty FeatureCollections clearing/replacing previously returned layer data.
- Viewport-bound request parameters after pan/zoom.
- Rapid pan/layer-toggle stale-response behavior in a browser.
- Street/Satellite overlay preservation.
- Discover journey, candidate selection, evidence inspector, demo GeoJSON export, Locate Me, street-view route, and navigation.

No attempt was made to fabricate map features or interpret empty responses as failures.

## Integration fix made during verification

The layer fetch effect previously assigned each response to state before checking its request sequence. A late response from a superseded request could therefore overwrite data from a newer viewport or layer configuration. `src/app/layers/page.tsx` now:

- increments the request sequence and aborts the prior request as soon as bounds/layer state changes;
- only applies managed and OSM data when the response still matches the current request sequence;
- retains the existing debounce and error handling.

This is a code-path fix. Browser confirmation of the rapid-change behavior remains blocked until the existing app server is running.

## Static validation

- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm run build` — passed when run outside the restricted shell. The resulting build includes the dynamic `/api/geosathi/[resource]` route.

The initial restricted-shell build compiled successfully but failed when spawning Next.js's TypeScript worker with `EPERM`; the approved unrestricted rerun completed successfully, so this was an execution-environment restriction rather than a reproduced project build failure.

## Remaining blocker

Start or restore the existing configured development deployment, then rerun the same-origin endpoint and map-interaction checks above. Do not treat the static build or the prior direct upstream checks as proof that the configured proxy path is live in a browser.
