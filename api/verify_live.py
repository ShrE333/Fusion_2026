"""Live production verification of all three GeoSathi AI endpoints."""
import json
import sys
import urllib.request
import io
import cv2
import numpy as np

BASE = "https://geosathi-pothole-api-883668519860.asia-south1.run.app"

def get_json(path):
    with urllib.request.urlopen(BASE + path, timeout=30) as r:
        return json.loads(r.read())

def post_image_multipart(path):
    img = np.zeros((240, 320, 3), dtype="uint8")
    img[:] = (80, 80, 80)
    cv2.ellipse(img, (160, 120), (40, 25), 0, 0, 360, (30, 30, 30), -1)
    _, buf = cv2.imencode(".jpg", img)
    img_bytes = buf.tobytes()

    boundary = "GeoSathiBoundary12345"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="test.jpg"\r\n'
        f"Content-Type: image/jpeg\r\n\r\n"
    ).encode() + img_bytes + f"\r\n--{boundary}--\r\n".encode()

    req = urllib.request.Request(BASE + path, data=body, method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read())

print("\n=== Live Production Verification ===\n")
passed = failed = 0

def chk(label, fn):
    global passed, failed
    try:
        result = fn()
        print(f"  [PASS]  {label}")
        passed += 1
        return result
    except Exception as e:
        print(f"  [FAIL]  {label} -> {e}")
        failed += 1
        return None

d = chk("GET /", lambda: get_json("/"))
if d: print(f"         service={d.get('service')}")

d = chk("GET /health", lambda: get_json("/health"))
if d: print(f"         status={d['status']}  v1_loaded={d['model_loaded']}")

d = chk("POST /predict", lambda: post_image_multipart("/predict"))
if d: print(f"         potholes_count={d['potholes_count']}  latency_ms={d['inference']['latency_ms']}")

d = chk("POST /segment", lambda: post_image_multipart("/segment"))
if d: print(f"         detected_classes={d['detected_classes'][:4]}")

d = chk("POST /analyze", lambda: post_image_multipart("/analyze"))
if d: print(f"         potholes_count={d['potholes_count']}  seg_classes={len(d['detected_semantic_classes'])}")

print(f"\n{'='*38}")
print(f"  Results: {passed}/{passed+failed} passed  [{'ALL PASSED' if failed==0 else str(failed)+' FAILED'}]")
print(f"{'='*38}\n")
sys.exit(0 if failed == 0 else 1)
