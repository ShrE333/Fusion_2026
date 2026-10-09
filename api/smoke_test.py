"""
api/smoke_test.py
-----------------
Lightweight smoke tests for all three GeoSathi AI API endpoints.
Run with:  python api/smoke_test.py
"""

import io
import sys
import traceback
from pathlib import Path

import numpy as np
import cv2

# Make project root importable
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# ── Build a tiny synthetic road image (RGB, 640×480) ─────────────────────────
def _make_test_image_bytes(w: int = 320, h: int = 240) -> bytes:
    img = np.zeros((h, w, 3), dtype=np.uint8)
    # grey asphalt look
    img[:] = (80, 80, 80)
    # fake pothole blob
    cv2.ellipse(img, (w // 2, h // 2), (40, 25), 0, 0, 360, (30, 30, 30), -1)
    ok, buf = cv2.imencode(".jpg", img)
    assert ok
    return buf.tobytes()


TEST_IMAGE_BYTES = _make_test_image_bytes()


def _post_image(client, url: str):
    return client.post(url, files={"file": ("test.jpg", io.BytesIO(TEST_IMAGE_BYTES), "image/jpeg")})


def run_tests():
    from fastapi.testclient import TestClient
    from api.main import app

    passed = 0
    failed = 0

    def check(name: str, resp, expected_status: int = 200):
        nonlocal passed, failed
        if resp.status_code == expected_status:
            print(f"  [PASS]  {name} -> {resp.status_code}")
            passed += 1
            return resp.json()
        else:
            print(f"  [FAIL]  {name} -> {resp.status_code}  body={resp.text[:300]}")
            failed += 1
            return None

    print("\n=== GeoSathi AI API Smoke Tests ===\n")

    # Use context manager so lifespan runs (loads Model V1 + registers V2)
    with TestClient(app, raise_server_exceptions=True) as client:

        # 1. Root metadata
        r = client.get("/")
        check("GET /", r)

        # 2. Health check
        r = client.get("/health")
        data = check("GET /health", r)
        if data:
            v1_loaded = data.get("model_loaded", False)
            print(f"       status={data.get('status')}  v1_loaded={v1_loaded}")

        # 3. Pothole detection (Model V1)
        r = _post_image(client, "/predict")
        data = check("POST /predict", r)
        if data:
            print(f"       potholes_count={data.get('potholes_count', 'n/a')}  "
                  f"latency_ms={data.get('inference', {}).get('latency_ms', 'n/a')}")

        # 4. Semantic segmentation (Model V2)
        try:
            import transformers  # noqa: F401
            r = _post_image(client, "/segment")
            data = check("POST /segment", r)
            if data:
                # Response key is 'detected_classes' (a list)
                classes = data.get("detected_classes", [])[:5]
                print(f"       detected_classes(top5)={classes}")
        except ImportError:
            print("  [SKIP]  POST /segment SKIPPED -- transformers not installed")

        # 5. Combined analysis (Model V1 + V2)
        try:
            import transformers  # noqa: F401
            r = _post_image(client, "/analyze")
            data = check("POST /analyze", r)
            if data:
                print(f"       potholes_count={data.get('potholes_count', 'n/a')}  "
                      f"semantic_classes={len(data.get('detected_semantic_classes', []))}")
        except ImportError:
            print("  [SKIP]  POST /analyze SKIPPED -- transformers not installed")

    # Summary
    total = passed + failed
    print(f"\n{'='*38}")
    status_str = "ALL PASSED" if failed == 0 else f"{failed} FAILED"
    print(f"  Results: {passed}/{total} passed  [{status_str}]")
    print(f"{'='*38}\n")
    return failed == 0


if __name__ == "__main__":
    try:
        ok = run_tests()
        sys.exit(0 if ok else 1)
    except Exception:
        traceback.print_exc()
        sys.exit(2)
