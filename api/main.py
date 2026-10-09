"""
api/main.py
===========
GeoSathi AI Pothole Detection REST API for Google Cloud Run Deployment.

Endpoints:
- GET  /health   -> Health check and model readiness reporting
- POST /predict  -> Run pothole detection on uploaded image
"""

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, File, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Ensure project root is in sys.path
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api.detector import ONNXPotholeDetector

MODEL_PATH = ROOT / "models" / "pothole_detector.onnx"

# Shared detector reference
detector: Optional[ONNXPotholeDetector] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load ONNX model once on application startup."""
    global detector
    print(f"Loading ONNX model from: {MODEL_PATH}")
    if not MODEL_PATH.exists():
        print(f"ERROR: Model file not found at {MODEL_PATH}")
        raise RuntimeError(f"Model file not found at {MODEL_PATH}")

    detector = ONNXPotholeDetector(str(MODEL_PATH))
    app.state.detector = detector
    print(
        f"[OK] Model loaded successfully: input={detector.input_shape}, "
        f"output={detector.output_shape}, size={MODEL_PATH.stat().st_size / 1e6:.2f} MB"
    )
    yield
    print("Shutting down GeoSathi AI Pothole API...")


app = FastAPI(
    title="GeoSathi AI — Pothole Detection API",
    description="Lightweight ONNX Runtime inference service for road hazard and pothole detection on Google Cloud Run.",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for web apps & integrations
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic Schemas ───────────────────────────────────────────────────────
class BoundingBox(BaseModel):
    x1: int = Field(..., description="Top-left X coordinate in pixels")
    y1: int = Field(..., description="Top-left Y coordinate in pixels")
    x2: int = Field(..., description="Bottom-right X coordinate in pixels")
    y2: int = Field(..., description="Bottom-right Y coordinate in pixels")
    width: int = Field(..., description="Box width in pixels")
    height: int = Field(..., description="Box height in pixels")


class DetectionItem(BaseModel):
    class_id: int = Field(0, description="Target class ID (0: pothole)")
    class_name: str = Field("pothole", description="Target class name")
    confidence: float = Field(..., description="Detection confidence score (0.0 to 1.0)")
    bbox: BoundingBox


class ImageMeta(BaseModel):
    filename: str
    width: int
    height: int
    channels: int


class InferenceMeta(BaseModel):
    latency_ms: float
    conf_threshold: float
    iou_threshold: float
    device: str = "cpu"


class PredictionResponse(BaseModel):
    status: str = "success"
    model: str = "pothole_detector.onnx"
    image: ImageMeta
    inference: InferenceMeta
    potholes_count: int
    detections: List[DetectionItem]


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_name: str
    model_size_mb: float
    input_shape: List[Any]
    output_shape: List[Any]
    classes: List[str]
    ready: bool


# ── Endpoints ──────────────────────────────────────────────────────────────
@app.get("/", tags=["General"])
async def root():
    return {
        "service": "GeoSathi AI Pothole Detection API",
        "version": "1.0.0",
        "docs_url": "/docs",
        "health_url": "/health",
    }


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Report model readiness and server status for Cloud Run liveness/readiness probes."""
    if detector is None:
        return HealthResponse(
            status="unhealthy",
            model_loaded=False,
            model_name="pothole_detector.onnx",
            model_size_mb=0.0,
            input_shape=[],
            output_shape=[],
            classes=[],
            ready=False,
        )

    size_mb = round(MODEL_PATH.stat().st_size / (1024 * 1024), 2)
    return HealthResponse(
        status="healthy",
        model_loaded=True,
        model_name="pothole_detector.onnx",
        model_size_mb=size_mb,
        input_shape=list(detector.input_shape),
        output_shape=list(detector.output_shape),
        classes=detector.class_names,
        ready=True,
    )


@app.post("/predict", response_model=PredictionResponse, tags=["Inference"])
async def predict_image(
    file: UploadFile = File(..., description="Road image file (JPG, JPEG, PNG, WEBP)"),
    conf: float = Query(0.25, ge=0.01, le=0.99, description="Confidence threshold"),
    iou: float = Query(0.45, ge=0.01, le=0.99, description="IoU threshold for NMS"),
):
    """
    Detect potholes in an uploaded road image.
    Returns detected bounding boxes, confidence scores, and latency.
    """
    if detector is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model is not ready or failed to load.",
        )

    # Validate file extension
    filename = file.filename or "upload.jpg"
    ext = Path(filename).suffix.lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Allowed: .jpg, .jpeg, .png, .webp",
        )

    # Read and decode image
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img_bgr is None:
            raise ValueError("cv2.imdecode returned None")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not decode image file: {str(e)}",
        )

    h, w, c = img_bgr.shape

    # Run inference
    try:
        detections, latency_ms = detector.predict(img_bgr, conf_thresh=conf, iou_thresh=iou)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference error: {str(e)}",
        )

    # Format response
    formatted_detections = [
        DetectionItem(
            class_id=d["class_id"],
            class_name=d["class_name"],
            confidence=d["confidence"],
            bbox=BoundingBox(**d["bbox"]),
        )
        for d in detections
    ]

    return PredictionResponse(
        status="success",
        model="pothole_detector.onnx",
        image=ImageMeta(filename=filename, width=w, height=h, channels=c),
        inference=InferenceMeta(
            latency_ms=round(latency_ms, 2),
            conf_threshold=conf,
            iou_threshold=iou,
            device="cpu",
        ),
        potholes_count=len(formatted_detections),
        detections=formatted_detections,
    )


if __name__ == "__main__":
    # Support Cloud Run dynamic PORT variable, default to 8080
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("api.main:app", host="0.0.0.0", port=port, log_level="info")
