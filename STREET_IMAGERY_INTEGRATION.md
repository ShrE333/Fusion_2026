# Street-level imagery integration

`/street-view` uses Mapillary Graph API image search and MapillaryJS 4.1.2. Image searches use an approximately 1 km × 1 km bounding box centered on the active location and a maximum of 40 results. The search requests image ID, computed geometry, capture time, original and computed compass angles, camera type, thumbnail URL, and sequence metadata. The viewer is initialized only with a returned Mapillary image ID; the CSS panorama is retained only as a labelled demo fallback.

Configure `NEXT_PUBLIC_MAPILLARY_ACCESS_TOKEN` with a Mapillary **client access token** intended for browser use. This value is necessarily included in browser code, so restrict the application's authorized origins in Mapillary settings. Do not put the Mapillary client secret in this app, `.env.local`, or any `NEXT_PUBLIC_` variable. Restart Next.js after changing the environment. The project does not persist the token in source control.

For local setup, copy the blank Mapillary entry from `.env.example` into `.env.local`, then set its value to a fresh, origin-restricted token. Since credentials were shared in a chat, rotate the provided token/client secret before deployment. The client secret is not needed for the browser client-token flow.

The Graph API request uses the documented `GET https://graph.mapillary.com/images` endpoint with `bbox`, `limit`, and selected `fields`, authenticated using an `Authorization: OAuth ...` header. The response must contain `data[]` entries with an ID and valid `computed_geometry` Point before they are shown. 401/403 responses are presented as authentication/configuration errors; other HTTP/network failures are provider errors; a valid empty `data` array is a no-coverage result. Moving the map clears old results, and in-flight requests are aborted/sequence-guarded.

Attribution remains visible for OpenStreetMap map tiles and Mapillary street imagery. Mapillary imagery is a separate street-level context capability and is not connected to the aerial/satellite GeoAI object-detection pipeline. A true no-coverage result only means the provider returned no images in the current approximately 1 km × 1 km search area; it is not a claim that the wider area has no imagery.

Official references: [MapillaryJS quick start](https://mapillary.github.io/mapillary-js/docs/intro/try/), [MapillaryJS Viewer API](https://mapillary.github.io/mapillary-js/api/classes/viewer.Viewer/), and [Mapillary API demo](https://mapillary.github.io/api-demo/).
