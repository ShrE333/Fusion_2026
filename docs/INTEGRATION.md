# Module handoff (proposed v0.1)

WAHA -> Member 1 adapter: `POST /webhooks/waha` (HMAC signed, `message` event).
Member 1 -> Member 2 (future): `POST /search` with `query_id`, `query`, `location`, then PostGIS and GeoJSON results.
Member 1 -> Member 3 (future): `POST /road/infer` with `report_id`, a **secure media URL or uploaded bytes** and user pin. This first-commit adapter's local `image_path` contract is appropriate *only on the same host/volume*; **do not use it across AWS/GCP**.
Member 2 -> Member 4: `GET /results/{id}`, GeoJSON and shareable map link (not implemented here).

Road AI must return actual class, confidence, bbox, model_version. GIS should determine whether a reported location is near mapped roads and mark status accordingly, without pretending OSM verified the hole itself.

Infrastructure VLM should return ranked *tile IDs*, image similarity scores, and existing geographic bounds. Member 2 applies PostGIS geometry relationships and emits real GeoJSON. Do not present CLIP scores as object detection confidence.

Before the second commit: agree on image handoff (S3/GCS signed links or multipart upload), auth between services, radius/area schema, and map result URL.
