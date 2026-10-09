# SkyCLIP ViT-B/32 retrieval service

**Separate service** from WhatsApp and Member 2's PostGIS backend. Semantic similarity is not proof of object presence. Real georeferenced imagery and model checkpoint are NOT included in the ZIP.

## Obtain original model checkpoint (one-time)
Download official `SkyCLIP_ViT_B32_top50pct.zip` from the SkyScript project. Unzip it and find `epoch_20.pt` (the checkpoint structure can be nested). Mount file into `/models/epoch_20.pt` in your service. Never commit weights or images to GitHub.

Official download URL:
https://opendatasharing.s3.us-west-2.amazonaws.com/SkyScript/ckpt/SkyCLIP_ViT_B32_top50pct.zip

## Image data
Copy *licensed and georeferenced* JPG/PNG tiles to `/data/images`. Build `/data/tiles.json` based on `example-tiles.json`, replacing all example records with real metadata. Bbox is longitude-latitude in EPSG:4326 `[minlon,minlat,maxlon,maxlat]`. Do not fabricate image coordinates.

## Run / build index
```bash
cd apps/vlm
python -m pip install -r requirements.txt
export SKYCLIP_CHECKPOINT=/absolute/path/to/epoch_20.pt
export IMAGE_ROOT=/absolute/path/to/images
export INDEX_DIR=/absolute/path/to/index
export SERVICE_TOKEN=choose-a-long-secret
python scripts/build_index.py /absolute/path/to/tiles.json
uvicorn app.main:app --host 0.0.0.0 --port 8100
```

Container: `docker build -t geosathi-skyclip apps/vlm`, with persistent mounts for `/models`, `/data`. Runs CPU by default; use GPU only after validating host drivers/torch CUDA build. Keep port 8100 private behind authenticated internal networking. OpenCLIP runtime can take substantial RAM; benchmark on actual GCP hardware.

## API
`GET /health` does not load the model. `POST /search` requires `Authorization: Bearer <SERVICE_TOKEN>`, request `{"query":"unpaved roads","top_k":5,"bbox":[73.8,18.4,74.0,18.7]}`. Returns ranked tiles, **not** verified buildings/roads or GeoJSON. Member 2 must apply real GIS filtering before results reach the map.

## Integration
The existing WhatsApp adapter's `INFRA_SEARCH_URL` is intended for a central orchestration endpoint that accepts `query_id,query,location`. It must **not** be pointed directly at `/search` without an adapter because their request/response schemas differ. Member 2's future AWS backend can call this `/search` service securely, then perform PostGIS joins.
