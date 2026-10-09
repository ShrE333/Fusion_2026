# Phase 2 audit — Satellite basemap, real geolocation, and street-view readiness

## A. Executive summary

Phase 2 is **partially complete**. The deployed production app has a working Street/Satellite toggle backed by MapTiler and displays the required MapTiler attribution after satellite selection. The existing OSM street source, deterministic journey, Discover demo, Layers route, and clearly labelled Street View fallback remain available.

Real browser geolocation is implemented in code with actual coordinates, browser accuracy, timestamp, request identity protection, and camera movement. It was not permission-tested in this audit, so success/denial/timeout outcomes are code-present but runtime-unverified. Two material gaps remain: the timed demo journey uses `essential: true`, which does not respect reduced-motion, and the satellite error listener is not scoped to satellite resource failures.

This audit created only this file. No application files, dependency versions, environment values, or deployment configuration were changed.

## B. Implementation scorecard

| Requirement | Status | Code evidence | Runtime evidence | Remaining work | Priority |
|---|---|---|---|---|---|
| Street basemap | Working — verified | `atlas-map.tsx` raster `osm` source uses configured OSM tile template | Production MapLibre attribution exposed linked OSM contributors in Street mode | Production OSM tile policy/provider review remains | P2 |
| Satellite basemap | Working — verified | `atlas-map.tsx` adds MapTiler `satellite-v2` raster source only with configured key | Production Satellite button enabled; repeated Street/Satellite interaction showed MapTiler attribution | Visual imagery content was not screenshot-inspected pixel-by-pixel | P1 |
| Missing satellite key | Working — verified locally | `config.mapTilerApiKey` gate and disabled control | Local browser previously showed disabled Satellite and “Satellite needs MapTiler key” | None | P3 |
| Satellite provider attribution | Working — verified | Source attribution links MapTiler copyright | Production Satellite mode exposed linked MapTiler attribution | Confirm plan/logo requirements in provider account | P1 |
| Satellite tile failure feedback | Partial | Map `error` listener sets user feedback | Failure was not induced; listener is not limited to satellite source/tile errors | Scope failure detection and test invalid/restricted key | P1 |
| Camera/bearing/pitch preservation | Code present — runtime unverified | Basemap change toggles raster layer visibility; no `setStyle` or camera mutation | Repeated switch did not visibly reset route/UI state; camera values were not instrumented | Verify center/zoom/bearing/pitch with automated/map-state test | P1 |
| Custom overlay/layer preservation | Partial | Source/layers stay in the same MapLibre style, so no layer restoration lifecycle is needed | Candidate evidence inspector remained open after attempted map-style changes; canvas overlay pixels were not independently verified | Visual/automated assertion for selected outline and each toggle/opacity | P1 |
| Genuine Locate Me request | Code present — runtime unverified | `page.tsx` calls `navigator.geolocation.getCurrentPosition` only inside Locate Me handler | Permission was deliberately not requested or granted | Test on permission-capable browser/device | P1 |
| Actual coordinate camera target | Code present — runtime unverified | Browser longitude/latitude form `userLocation`; `AtlasMap` eases to it | No real coordinates observed | Verify returned values and resulting map center | P1 |
| Accuracy/timestamp display | Code present — runtime unverified | Detail string includes rounded accuracy and `position.timestamp` time | No location result observed | Verify against real browser response | P1 |
| Location failure messages | Code present — runtime unverified | Explicit permission-denied, timeout, unavailable, unsupported branches | No permission/error response induced | Test denial, timeout, unavailable | P1 |
| Stale/conflicting location requests | Partial | monotonically increasing `locationRequestId`; location move clears journey timers and stops map | Not stress-tested | Test double click and demo-start during pending request | P1 |
| Reduced-motion journey | Broken — code evidence | Timed demo `easeTo` uses `essential: true` for every stage | Not preference-tested | Honor `prefers-reduced-motion` for the demo sequence | P1 |
| Deterministic demo separation | Working — verified | Bengaluru target remains fixed in `startJourney`; Locate Me does not call it | Production Preview Demo Journey showed Bengaluru label and continent-stage breadcrumb | Test interruption during location request | P1 |
| Street View genuine imagery | Demo/mock only | `street-view/page.tsx` builds CSS panorama; no provider lookup | Production route says “DEMO PANORAMA — NOT VERIFIED” and “Coverage unavailable” | Provider credential, coverage/image lookup, verified ID, attribution/no-coverage flow | P2 |

## C. Basemap switching

`src/components/map/atlas-map.tsx` retains the original OSM raster source (`osm`) and inserts a MapTiler `satellite-v2` raster source when `NEXT_PUBLIC_MAPTILER_API_KEY` is configured. It toggles the two raster layers’ visibility rather than calling `map.setStyle`. This is a sound approach for preserving the map instance, camera, custom GeoJSON sources/layers, selection state, opacity state, and event listeners; there is no style lifecycle requiring layer recreation.

The production configuration is present (the key value was not inspected or recorded). Production browser testing performed Street → Satellite → Street → Satellite. MapTiler attribution appeared in Satellite mode; OSM attribution appeared in Street mode. No duplicated control/layer error was observed in browser accessibility output.

The code has two limitations:

- The `error` handler reports a satellite failure for **any** MapLibre error while a MapTiler key exists; it does not inspect the error/source/tile URL. This can mislabel unrelated OSM/overlay failures.
- This audit did not capture MapLibre camera values or inspect rendered canvas pixels, so exact camera preservation and on-canvas outline/opacity preservation are not fully runtime-verified.

## D. Real geolocation

Locate Me is user-initiated. On success, `page.tsx` uses `position.coords.longitude`, `position.coords.latitude`, `position.coords.accuracy`, and `position.timestamp`; it labels the UI “YOUR CURRENT LOCATION” and retains no persistent storage. It does not invent locality/admin names. It passes a `{id, coordinates}` focus command to `AtlasMap`, which clears journey timers, calls `map.stop()`, and eases to the returned coordinates. The request identity guard ignores older callbacks after a newer request/demo action.

Failure branches distinguish unsupported geolocation, denied permission, timeout, and unavailable position without replacing them with Bengaluru. Browser geolocation was **not invoked** in this audit: no permission was requested or granted on the user’s behalf, therefore no real coordinates, accuracy value, success camera transition, denied message, or timeout was verified at runtime.

## E. Global-to-street journey

Production browser testing confirmed Preview Demo Journey remains clearly labelled `DEMO LOCATION · Bengaluru`, advances into `CONTINENT`, shows the geographic breadcrumb, and reaches the explicit local demo panorama. Journey effects clear prior timers and stop the current map; effect cleanup clears timers and removes the map/ResizeObserver on unmount.

The location request ID is incremented when starting the demo journey, preventing an old geolocation result from overriding it. However, `atlas-map.tsx` marks every demo camera `easeTo` as `essential: true`; this bypasses reduced-motion preferences. The separate real-location camera duration correctly becomes zero when reduced motion is preferred.

## F. Street-view readiness

`/street-view` is not genuine street-level imagery. It is a draggable CSS/generated scene with zoom/reset controls and repeated explicit disclosure: `DEMO PANORAMA — NOT VERIFIED AT THIS LOCATION`, `LOCALITY CONTEXT · DEMO`, and `Coverage unavailable`. No provider lookup, image ID, coverage endpoint, credential use, or real 360° capture exists. Return to Map is a valid route link.

`STREET_IMAGERY_INTEGRATION.md` correctly identifies the minimum genuine integration prerequisites: authorized credential, coordinate coverage lookup, verified image ID/capture provenance, provider attribution, and a no-coverage state.

## G. Regression results

- **Discover:** Production supported demo query still ran the deterministic Bengaluru journey; query interpretation/candidate card remained explicitly demo-labelled.
- **Candidate/evidence:** Candidate selection opened the demo evidence inspector with object, OSM reference, and relation information.
- **Layers:** `/layers` loaded, showed both fixture-layer toggles and the map-style control; OSM attribution was visible in Street mode.
- **Navigation:** Discover → Layers → Street View navigation loaded all three routes.
- **Street View:** Explicit demo/unverified fallback and Return to Map link were present.
- **GeoJSON export:** Control was observed but download contents were not triggered/inspected during this audit to avoid creating a local artifact.
- **No claim of genuine GeoAI:** The application remains a deterministic/demo frontend unless a separately configured API is used.

## H. Test results

| Check | Result |
|---|---|
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; static `/`, `/layers`, `/street-view` routes generated |
| Production Street/Satellite repeated switching | Passed; MapTiler attribution appeared on Satellite mode |
| Production deterministic journey | Passed through breadcrumb/street fallback |
| Production candidate/evidence inspector | Passed |
| Production Layers and Street View navigation | Passed |
| Satellite tile failure | Unverified; no failing/restricted-key test performed |
| Real geolocation success/accuracy/camera | Unverified; permission not granted |
| Geolocation denial/timeout/unavailable | Unverified; no permission/error test induced |
| Reduced motion | Broken by code review (`essential: true` demo transition) |
| Canvas-level overlay persistence/camera numeric state | Unverified; browser accessibility cannot inspect canvas geometry or MapLibre state |

## I. Remaining work, ranked

### P0

None reproduced in this audit.

### P1

1. **Respect reduced motion in demo journey.** `src/components/map/atlas-map.tsx`. Acceptance: with `prefers-reduced-motion: reduce`, Preview Demo Journey moves without timed camera animation while completing a coherent state transition. Dependency: frontend only.
2. **Scope satellite load failures to satellite resources.** `src/components/map/atlas-map.tsx`. Acceptance: an OSM/overlay error does not display a satellite error; an invalid/restricted satellite key displays actionable satellite feedback. Dependency: frontend + test key/domain configuration.
3. **Validate actual geolocation on a permission-capable device.** `src/app/page.tsx`, `src/components/map/atlas-map.tsx`. Acceptance: grant shows real coordinate/accuracy/timestamp and map center; deny/timeout retain usability and no Bengaluru substitution; repeated request/demo action cannot overwrite current state. Dependency: user/browser/device permission.
4. **Add map-state regression coverage.** `src/components/map/atlas-map.tsx`. Acceptance: integration/E2E test asserts center/zoom/bearing/pitch, selected outline, and active GeoJSON layers before/after Street/Satellite toggles. Dependency: existing project has no test harness.

### P2

1. **Integrate genuine street-view provider only after coverage design.** `src/app/street-view/page.tsx`, `STREET_IMAGERY_INTEGRATION.md`. Acceptance: real coordinate lookup returns verified image ID/provenance or explicit no-coverage, correct attribution, and no synthetic image is presented as genuine. Dependency: provider account, authorized credentials, coverage API.
2. **Review MapTiler plan/domain restriction and attribution/logo obligations.** `.env.example`, deployment configuration. Acceptance: provider dashboard restricts browser key to intended domain and production display meets account/plan requirements. Dependency: account owner.

### P3

1. **Manual visual QA of satellite coverage and mobile switch control.** `src/app/globals.css`. Acceptance: selector is usable, unobscured, and attribution readable across target viewports. Dependency: device/browser matrix.

## J. Manual verification checklist

- [ ] On production, switch Street → Satellite → Street repeatedly. Expected: imagery/attribution changes, no blank map or console errors.
- [ ] Run the supported demo query, select a candidate, switch basemaps, and verify the selected outline and evidence inspector persist.
- [ ] Pan/rotate/tilt the map, switch basemaps, and verify center, zoom, bearing and pitch do not change.
- [ ] With a real device/browser, click Locate Me and grant permission. Expected: actual displayed coordinates, reported accuracy, timestamp, and map camera at that location.
- [ ] Deny Locate Me. Expected: actionable denial message, no Bengaluru substitution, demo button still works.
- [ ] Test location timeout/unavailable (where browser tooling supports it). Expected: actionable message and usable map.
- [ ] Enable OS/browser reduced motion and run Preview Demo Journey. Expected after P1 fix: no forced multi-stage animated flight.
- [ ] Open `/street-view`. Expected: explicit demo/unverified and no-coverage notices; Return to Map works.

## K. Final recommendation

Fix the P1 reduced-motion and satellite-error-scoping gaps, then complete device-level geolocation verification **before** starting full street-view integration. Proceed to genuine street-level imagery only when the team has a provider with authorized credentials, a verified coverage/image-ID lookup, required attribution, and a no-coverage contract. The current CSS panorama is appropriate only as the clearly labelled fallback it already is.
