# Discover backend integration proposal

No backend contract is confirmed by this repository. The frontend currently proposes `POST {NEXT_PUBLIC_API_BASE_URL}/search` with `{ "query": string }` and validates a response shaped as `SearchResponse` in `src/types/geo.ts`.

Backend owner confirmation is required for: supported query scope/AOI and auth; parsed intent targets, OSM feature types and predicates; imagery tile IDs, URLs, licensing, capture time and model/detection provenance; OSM IDs, tags and geometries; result geometry; confidence meaning; spatial predicate, metric distance units and CRS; export authority/format; empty-result semantics; and machine-readable error schema/statuses.

`NEXT_PUBLIC_DISCOVERY_MODE=demo` is the safe default. `api` sends the user query to the configured endpoint. API failure, malformed payloads, and no matches stay visible as such: the client never substitutes synthetic results after an API request. The backend must mark export metadata `mode: "backend"`; demo export metadata remains `mode: "demo"`.
