# Fusion 2026 — GeoSathi AI

WhatsApp-first geospatial intelligence. GEOAI-05 infrastructure search is primary; image + pinned-location road damage reporting extends GEOAI-03. All actual detection/search results require real inference and GIS verification.

## Current release: v0.2
- **WAHA GOWS** connected on GCP EasyPanel (external WhatsApp session).
- **FastAPI WhatsApp adapter** under `apps/whatsapp`: HMAC authenticated webhook, two-option menu, persistent SQLite state, photo+pin and query+pin intake. **NEW:** tries native WAHA interactive `sendList`, falling back automatically to numbered text if unsupported.
- **NEW:** `apps/vlm` SkyCLIP ViT-B/32 inference service with official checkpoint loader, offline image embedding indexing, authenticated text-to-image search, bbox filters and typed output. **Requires official weights and real georeferenced imagery before producing searches**; no bundled model weights or fabricated results.
- **Not yet connected:** remote road YOLO from Member 3, AWS GIS from Member 2, frontend map from Member 4.

## Team and Git
- Member 1: WhatsApp + SkyCLIP (`member-1-whatsapp-vlm`).
- Member 2: AWS/PostGIS imagery catalogue and spatial query engine.
- Member 3: YOLO ONNX road hazard model worker.
- Member 4: Next.js/MapLibre frontend (currently independent `frontend` branch).
- Each member branch -> `retract` staging PR -> `main` after validation. Never merge independent root-level frontend over main; migrate into `apps/frontend` from common base first.

## Project layout
```text
apps/whatsapp/    WAHA webhook and conversational bot (existing EasyPanel deployment)
apps/vlm/         SkyCLIP model, offline indexing, private search API (deploy separately)
docs/INTEGRATION.md
```

## Deploy WhatsApp update (existing EasyPanel service)
1. Extract upgrade ZIP into local project root, **overwriting matching code/docs only**. Keep your local `.git`, any `.env` secrets, and teammate folders intact.
2. `git switch member-1-whatsapp-vlm && git status && git add apps/whatsapp apps/vlm docs README.md && git commit -m "feat: add interactive WAHA list fallback and SkyCLIP retrieval service" && git push origin member-1-whatsapp-vlm`.
3. In EasyPanel `fusion-2026` -> `whatsapp-bot`, source branch stays `member-1-whatsapp-vlm`, build context stays `apps/whatsapp`, Dockerfile stays `Dockerfile` (relative to context). Click **Deploy** to rebuild with menu support. Existing `/data` volume and `WAHA_API_KEY`/`WAHA_HMAC_SECRET` should remain unchanged. **Do not reinstall WAHA.**
4. Send `hi`. If WAHA edition/GOWS accepts `/api/sendList`, you'll see an interactive list. Otherwise the text menu appears automatically. Choosing list rows or typing `1`/`2` should work.

## SkyCLIP model upgrade
See [apps/vlm/README.md](apps/vlm/README.md) for the original checkpoint download, image manifest, indexing command, model Docker build, and authenticated `/search` API. Dockerizing the service does **not** automatically install the weights/data: these must be downloaded separately and mounted. On resource-constrained GCP, deploy model to a separate CPU VM or GPU provider after checking available RAM/CPU/GPU.

## Tests
```powershell
cd apps/whatsapp
python -m pip install -r requirements.txt
python -m pytest -q
```

## Interface limitations
- WAHA list API is edition/engine-dependent and may fail; safe text fallback is expected.
- SkyCLIP similarity is a candidate-ranking score, **not** a calibrated probability/confidence or object detection.
- This VLM service returns real tile matches *only when* indexed imagery and weights exist; Member 2's GIS spatial joins are required to answer spatial relationship questions.
- Member 3 image inference requires securely accessible media; the current WhatsApp adapter uses local file paths and **cannot** call a remote YOLO host correctly without signed object-storage upload support.
- The road location pin is a user-reported coordinate, not precisely measured defect geolocation.
- Use private/authenticated VLM networking, encrypted HTTPS, and restrict WhatsApp API/dashboard access. Do not commit private photos, database files, model weights, or credentials.
