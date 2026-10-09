# Fusion 2026 integration contract (v0.2)

## WhatsApp (Member 1)
Incoming WAHA `message` signed webhooks -> `/webhooks/waha`; list rows use `rowId` infrastructure / road. If `/api/sendList` fails (including unsupported edition/engine), text menu is used. Session ID is taken from the webhook. No model output is fabricated.

## VLM (Member 1)
`POST /search` on private SkyCLIP service expects `{"query":"...","top_k":5,"bbox":[minlon,minlat,maxlon,maxlat]}` and Bearer token. Returns top ranked georeferenced image tile metadata and cosine similarities (not object detections). Index is computed offline using image+text encoders from the SAME checkpoint.

## AWS GIS (Member 2)
Integrates SkyCLIP ranked tile IDs with PostGIS/OSM, performs actual geometry operations and provides verified/candidate geographic features; `INFRA_SEARCH_URL` in WhatsApp expects `{"query_id":"...","query":"...","location":{"lat":...,"lon":...}}`.

## Road hazard (Member 3)
YOLO ONNX worker detects potholes/cracks from authenticated media, returns classes/bboxes/scores. Cross-cloud paths like `/data/media/image.jpg` are not accessible: arrange private object storage with signed URLs or a secure binary upload contract before setting `ROAD_INFERENCE_URL`.

## Frontend (Member 4)
Existing frontend `frontend` branch is an independent root-level Next.js app with no common ancestor with main. Migrate to `apps/frontend/` from common base branch before integration. Frontend currently expects `POST /search` => `{query,results:[{id,kind,title,geometry,source,status,score,...}]}`. This response is NOT the SkyCLIP service output; member 2 must translate to final GeoJSON/AtlasFeature schema.

## Deployment
GCP EasyPanel: current WAHA GOWS and WhatsApp FastAPI. Model inference in separate container/host as resources permit. Model checkpoint and imagery never stored in git. Test native list capability on actual WAHA edition; text fallback is intentional.
