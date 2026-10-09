# Phase 4 — Street-level imagery integration report

## Result

`/street-view` now has a Mapillary-backed imagery search and MapillaryJS viewer workflow. The map and location controls remain usable without a provider token, and the existing synthetic panorama is retained only with an explicit unverified-demo label. With the user-provided browser client access token configured locally, Mapillary returned real Pune image records and a returned image was displayed in the embedded MapillaryJS viewer.

## Provider and package

- Provider: Mapillary Graph API v4 image search and MapillaryJS **4.1.2**.
- Existing app versions: Next.js 16.4.0, React 19.3.0, MapLibre GL JS 5.24.0.
- MapillaryJS is imported only after the selected-image viewer mounts in the browser; the viewer is removed and its image event listener detached on unmount.
- Official integration references: [MapillaryJS quick start](https://mapillary.github.io/mapillary-js/docs/intro/try/), [Viewer API](https://mapillary.github.io/mapillary-js/api/classes/viewer.Viewer/), and [Mapillary API demo](https://mapillary.github.io/api-demo/).

## Credentials and security

Set `NEXT_PUBLIC_MAPILLARY_ACCESS_TOKEN` locally to a **client access token intended for browser use**, restricted to the app's authorized origins in Mapillary settings, then restart Next.js. The token is necessarily visible to browser code. For this requested local integration, the supplied access token was placed only in ignored `.env.development.local`; it is not in source or the example env file. The Mapillary client secret was not used or copied. Before deploying, configure the browser token in the deployment environment and restrict its authorized origins.

## Discovery and display

Search uses the active shared browser location when available; otherwise it starts at Pune. The map's current center can be searched after panning, and latitude/longitude can be entered directly. No geolocation permission is requested on this route. Each Graph API request uses an approximately 1 km × 1 km `bbox`, a 40-result limit, and requests `id`, `computed_geometry`, `captured_at`, `compass_angle`, `computed_compass_angle`, `camera_type`, `thumb_256_url`, and `sequence`. Requests use the documented `Authorization: OAuth` header pattern. Results are filtered to entries with a string image ID and valid GeoJSON Point coordinates; only a selected returned ID is passed to MapillaryJS. The viewer now registers its image listener before calling `moveTo(imageId)` so the initial image event cannot be missed. In-flight searches are aborted and sequence-guarded, and moving the map clears results from the previous area.

No results in a successful response is shown as no coverage in that approximately 1 km × 1 km search area. HTTP 401/403 is shown as an authentication error, other provider statuses and network failures are distinct provider errors, and a missing token produces an explicit configuration message. The app does not switch to a different city. A selected-image viewer timeout/failure is shown separately and leaves the user able to select a different result. Mapillary results are street-level context, not part of GeoAI aerial/satellite inference.

## Attribution

The MapLibre map retains the linked `© OpenStreetMap contributors` attribution control. Street imagery has a visible Mapillary attribution link, and the viewer uses the provider image ID and its own interactive navigation.

## Changed files for this phase

- `.env.example`
- `STREET_IMAGERY_INTEGRATION.md`
- `STREET_VIEW_INTEGRATION_REPORT.md`
- `package.json`, `package-lock.json`
- `src/app/layout.tsx`
- `src/app/street-view/page.tsx`
- `src/app/street-view.css`
- `src/lib/config/index.ts`
- `src/lib/api/mapillary.ts`
- `src/components/map/street-imagery-map.tsx`
- `src/components/street-view/mapillary-viewer.tsx`
- `.env.development.local` (local-only, ignored by Git; contains the browser client token and is not part of the source change set)
- `src/app/page.tsx`, `src/app/layers/page.tsx`, `src/components/map/atlas-map.tsx`, `src/components/shell/location-context.tsx`, and `src/app/map-focus.css` were also modified in the working tree for related location/map work; preserved during this task.

## Validation

- `npm run lint` — fails on 20 errors and 2 warnings in the pre-existing untracked `.vercel-deploy-main/.next` generated deployment output (missing generated-file ESLint rule and `module` assignment warnings); no reported source-file lint issues.
- `npm run lint -- --ignore-pattern '.vercel-deploy-main/**'` — passed; source lint is clean.
- `npm run typecheck` — passed.
- `npm run build` — passed after the sandbox denied the initial worker spawn and the command was rerun with process permission; `/street-view` is prerendered as a static route.
- Local browser with the provided access token: Mapillary Graph search returned 40 real provider records for Pune. Selected returned image ID `1331656542321730` (18.51841, 73.85622; Jan 26, 2026); the embedded MapillaryJS viewer displayed its street capture and provider navigation controls. A prior selection (`1141152257381865`) also displayed the provider capture after using Mapillary's viewer cover/play control, which exposed that the page's timeout could report a failure while the viewer remained usable; the listener-before-`moveTo` fix was then verified with the first image above.
- Local browser: verified the Pune default, linked OSM attribution, returned image pins and cards, selected-image metadata, actual viewer image, and visible Mapillary branding/navigation. Mapillary and OSM attribution were present. The viewer's own navigation controls were present, but moving to an adjacent capture was not separately tested. No authenticated provider-error/no-coverage scenarios were induced.
- The unconfigured-token state is implemented and documented; it was not re-tested in this token-configured browser run. Provider 401/403, network-failure, and valid-empty response UI states still require separate controlled tests.

Installing MapillaryJS reported 6 dependency audit findings (5 high, 1 critical). No broad audit fix was applied because upgrading transitive dependencies is outside this integration scope.
