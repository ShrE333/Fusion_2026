import asyncio
from pathlib import Path

import pytest

from app import main
from app.i18n import normalize_language, t


class DummyResponse:
    def __init__(self, payload, status=200):
        self.payload = payload
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self.payload


class DummyClient:
    last_call = None

    def __init__(self, *args, **kwargs):
        self.timeout = kwargs.get("timeout")

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, url, **kwargs):
        captured = dict(kwargs)
        if "files" in captured:
            filename, handle, mime = captured["files"]["file"]
            captured["uploaded_file"] = (filename, handle.read(), mime)
        DummyClient.last_call = (url, captured)
        return DummyResponse({
            "potholes_count": 1,
            "detections": [{"confidence": 0.81, "bbox": {"x1": 1, "y1": 2, "x2": 3, "y2": 4, "width": 2, "height": 2}}],
            "inference": {"latency_ms": 42.5},
        })


def test_language_aliases_and_copy():
    assert normalize_language("Hindi") == "hi"
    assert normalize_language("मराठी") == "mr"
    assert "सड़क" in t("hi", "road_prompt")
    assert "रस्ता" in t("mr", "road_prompt")


@pytest.mark.asyncio
async def test_road_detector_uses_multipart_bytes_and_dedicated_token(tmp_path, monkeypatch):
    image = tmp_path / "road.png"
    image.write_bytes(b"fake-image-bytes")

    monkeypatch.setattr(main.settings, "road_inference_url", "https://example.test/predict")
    monkeypatch.setattr(main.settings, "road_service_token", "road-only-secret")
    monkeypatch.setattr(main.settings, "service_token", "skyclip-secret")
    monkeypatch.setattr(main.settings, "road_conf", 0.31)
    monkeypatch.setattr(main.settings, "road_iou", 0.51)
    monkeypatch.setattr(main.settings, "max_image_bytes", 1024)
    monkeypatch.setattr(main.httpx, "AsyncClient", DummyClient)

    result = await main.call_road_detector(image)

    assert result["potholes_count"] == 1
    url, kwargs = DummyClient.last_call
    assert url == "https://example.test/predict"
    assert kwargs["params"] == {"conf": 0.31, "iou": 0.51}
    assert kwargs["headers"]["Authorization"] == "Bearer road-only-secret"
    assert kwargs["headers"]["Authorization"] != "Bearer skyclip-secret"
    filename, uploaded, mime = kwargs["uploaded_file"]
    assert filename == "road.png"
    assert uploaded == b"fake-image-bytes"
    assert mime == "image/png"


@pytest.mark.asyncio
async def test_zero_detection_is_retained_for_review(monkeypatch, tmp_path):
    image = tmp_path / "road.jpg"
    image.write_bytes(b"x")
    saved = {}
    messages = []

    async def fake_detector(_):
        return {"potholes_count": 0, "detections": [], "inference": {"latency_ms": 20}}

    def fake_save(*args):
        saved["args"] = args

    async def fake_send(_session, _chat, text):
        messages.append(text)

    monkeypatch.setattr(main.settings, "road_inference_url", "https://example.test/predict")
    monkeypatch.setattr(main, "call_road_detector", fake_detector)
    monkeypatch.setattr(main.store, "save_report", fake_save)
    monkeypatch.setattr(main, "send_text", fake_send)

    await main.finish_report("s", "1@c.us", "GS-TEST", image, {"lat": 18.5, "lon": 73.8}, "en")

    assert saved["args"][5] == "no_detection_pending_review"
    assert "saved for review" in messages[0]


@pytest.mark.asyncio
async def test_inference_failure_preserves_report(monkeypatch, tmp_path):
    image = tmp_path / "road.jpg"
    image.write_bytes(b"x")
    saved = {}

    async def broken(_):
        raise RuntimeError("down")

    async def fake_send(*_):
        return None

    def fake_save(*args):
        saved["args"] = args

    monkeypatch.setattr(main.settings, "road_inference_url", "https://example.test/predict")
    monkeypatch.setattr(main, "call_road_detector", broken)
    monkeypatch.setattr(main.store, "save_report", fake_save)
    monkeypatch.setattr(main, "send_text", fake_send)

    await main.finish_report("s", "1@c.us", "GS-FAIL", image, {"lat": 18.5, "lon": 73.8}, "mr")
    assert saved["args"][5] == "inference_failed"
