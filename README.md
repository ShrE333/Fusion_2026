# fusion_2026 — GeoSathi AI

WhatsApp-first geospatial intelligence for FUSION 2026: GEOAI-05 infrastructure search (primary) and a GEOAI-03 road-damage-report extension.

## Status (initial commit)
- ✅ Existing WAHA **GOWS** service running on GCP EasyPanel, paired WhatsApp session (managed outside this repository).
- ✅ FastAPI adapter source: WAHA signed webhook, 1/2 conversational menu, image + reported-location intake, infrastructure query + search-location intake, SQLite state/idempotency, outbound replies.
- 🟡 AI endpoints are **optional and not yet integrated**. The adapter saves pending work instead of fabricating detections or map search results.
- ⏳ Member 2 AWS/PostGIS/pgvector and OSM/imagery integration; Member 3 trained YOLO ONNX worker; frontend MapLibre integration.

## Team and branches
- Member 1: WhatsApp gateway + future SkyCLIP (ViT-B/32) retrieval.
- Member 2: AWS API, GIS data, imagery catalogue, PostGIS + pgvector.
- Member 3: trained road-damage YOLO ONNX worker (RDD2022 or validated equivalent).
- Member 4: MapLibre/Vercel map and evidence UI.
- Member branches → `retract` integration/staging → `main` after verification. Retain existing actual branch names.

## Repository
- `apps/whatsapp/` — working first-commit adapter and tests.
- `docs/` — integration contract and deployment notes.

## Local run
```bash
cd apps/whatsapp
cp .env.example .env
# Fill WAHA_API_KEY and WAHA_HMAC_SECRET; never commit .env
python -m venv .venv
source .venv/bin/activate   # on Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
pytest -q
```

## Deploy on GCP EasyPanel
1. In existing `fusion-2026` project, create a **new App service** `whatsapp-bot` from GitHub (the member branch) with **Dockerfile path** `apps/whatsapp/Dockerfile` and **build context** `apps/whatsapp` (if EasyPanel cannot set build context, configure an alternative Docker build rooted at that folder).
2. Expose container port **8000** on an HTTPS domain. Set `.env.example` values as EasyPanel environment variables (not committed). Set `WAHA_URL` to the current HTTPS WAHA domain. `WAHA_API_KEY` must equal its current API key. Generate a **separate** 32+-character `WAHA_HMAC_SECRET`.
3. Mount persistent storage `/data` (SQLite and incoming image evidence). Configure backup and privacy controls for PII/media; do not share or expose `/data` publicly.
4. In WAHA session settings, add exactly one webhook targeting `https://YOUR-BOT-DOMAIN/webhooks/waha`, event `message`, HMAC key equal to `WAHA_HMAC_SECRET`. WAHA signs raw body using SHA-512; the adapter verifies it.
5. Send `hi` **from another WhatsApp account** to your connected bot number. Reply `1` (infrastructure) or `2` (road), and follow the prompts. You should see a pending result until actual inference/spatial workers are connected.
6. Restrict frontend endpoints and WAHA dashboard/API to trusted users; keep API secrets server-side. This is an MVP, not an enterprise-ready service.

## Real models and deployment plan
- **Phase 1 (this commit):** No pretrained model is loaded in the bot. The flow, webhook, image intake, and test suite work on a CPU-only GCP instance; reports remain `pending_inference` and imagery searches `pending_index` without integrations.
- **Phase 2 (infrastructure):** pretrained **SkyCLIP ViT-B/32 (`SkyCLIP_ViT_B32_top50pct`)** from the original SkyScript release; prepare georeferenced tile embeddings *offline* and implement text-image ranking in a separate model service. Model checkpoint must be downloaded, deployed and tested independently. Pair with PostGIS for actual geographic results; CLIP similarity is not object verification.
- **Phase 2 (road):** Member 3's **fine-tuned YOLO exported to ONNX** on an inference host with sufficient CPU/GPU. No generic YOLO checkpoint should be claimed to detect potholes without validation. Shared-file paths in this starter are for co-located workers only; for an AWS/GCP split define authenticated object-storage access rather than forwarding local paths.

## API handoff
- `GET /health` (no credentials)
- `POST /webhooks/waha` requires `X-Webhook-Hmac` SHA-512 signature using raw body; only `message` handled.
- Optional internal worker `ROAD_INFERENCE_URL` receives `{report_id,image_path,location}` **only for co-located worker**. Remote worker requires a signed media handoff upgrade.
- Optional `INFRA_SEARCH_URL` receives `{query_id,query,location}`; results must come from actual imagery index + GIS.

## Security / limitations
- Never share API keys, HMAC keys or live session tokens.
- Only accepts private inbound chats (ignores groups and bot's own messages).
- Uses message-id deduplication; message processing happens after fast webhook acknowledgement. For higher reliability replace FastAPI background tasks with a durable queue/outbox before heavy usage.
- Current location parser covers common location payload variants; verify actual GOWS payload with a redacted sample if a location is not detected.
- Incoming images max 8 MB. WAHA must provide `media.url`; remote media is downloaded only from configured WAHA `/api/files/` path.
- User pin is **reported location**, not the pothole's independently verified position.
- Demo is limited to the chosen geographic study area and validated model classes.
