"""
api/main.py
===========
GeoSathi AI Dual-Model Road Intelligence REST API for Google Cloud Run Deployment.

Models Served (Single Service, Same Base URL):
1. Model V1: High-Precision Pothole Detector (YOLO11n ONNX) -> POST /predict
2. Model V2: Road Scene Semantic Segmentor (Mask2Former Swin-Large Mapillary Vistas) -> POST /segment
3. Combined: Dual-Model Unified Road Analysis -> POST /analyze

Health & Introspection:
- GET /         -> Service metadata & endpoint directory
- GET /health   -> Health check & model readiness reporting for Cloud Run
"""

import base64
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

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
from api.segmentor import RoadSceneSegmentor, get_segmentor

MODEL_PATH = ROOT / "models" / "pothole_detector.onnx"

# Global references
detector: Optional[ONNXPotholeDetector] = None
segmentor: Optional[RoadSceneSegmentor] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Load Model V1 (ONNX Pothole Detector) immediately on application startup.
    Prepare Model V2 (Mask2Former Segmentor) with on-demand/cached loading.
    """
    global detector, segmentor
    print(f"Loading Model V1 (ONNX) from: {MODEL_PATH}")
    if not MODEL_PATH.exists():
        print(f"ERROR: Model file not found at {MODEL_PATH}")
        raise RuntimeError(f"Model file not found at {MODEL_PATH}")

    detector = ONNXPotholeDetector(str(MODEL_PATH))
    app.state.detector = detector
    print(
        f"[OK] Model V1 loaded: input={detector.input_shape}, "
        f"output={detector.output_shape}, size={MODEL_PATH.stat().st_size / 1e6:.2f} MB"
    )

    # Initialize Model V2 reference with lazy loading so container starts up instantly
    try:
        segmentor = get_segmentor(lazy_load=True)
        app.state.segmentor = segmentor
        print("[OK] Model V2 (Mask2Former) registered for on-demand execution.")
    except Exception as e:
        print(f"[WARN] Model V2 registration deferred: {e}")
        segmentor = None

    yield
    print("Shutting down GeoSathi AI Road Intelligence API...")


app = FastAPI(
    title="GeoSathi AI — Dual-Model Road Intelligence API",
    description=(
        "Production REST service combining YOLO11n Pothole Detection (Model V1) "
        "and Mask2Former Road Scene Semantic Segmentation (Model V2) on Google Cloud Run."
    ),
    version="2.0.0",
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


# ── Pydantic Schemas (Model V1 — Backward Compatible) ──────────────────────
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
    channels: int = 3


class InferenceMeta(BaseModel):
    latency_ms: float
    conf_threshold: Optional[float] = None
    iou_threshold: Optional[float] = None
    device: str = "cpu"


class PredictionResponse(BaseModel):
    """Preserved contract for POST /predict."""
    status: str = "success"
    model: str = "pothole_detector.onnx"
    image: ImageMeta
    inference: InferenceMeta
    potholes_count: int
    detections: List[DetectionItem]


# ── Pydantic Schemas (Model V2 — Semantic Segmentation) ────────────────────
class ClassStatItem(BaseModel):
    class_id: int
    class_name: str
    pixel_count: int
    area_percentage: float


class SegmentationResponse(BaseModel):
    """Contract for POST /segment."""
    status: str = "success"
    model: str = "facebook/mask2former-swin-large-mapillary-vistas-semantic"
    image: ImageMeta
    inference: InferenceMeta
    detected_classes: List[str]
    class_statistics: List[ClassStatItem]
    overlay_base64: Optional[str] = Field(None, description="Base64-encoded PNG semantic overlay")
    masks_base64: Optional[Dict[str, str]] = Field(None, description="Per-class binary PNG masks")


# ── Pydantic Schemas (Combined Analysis) ───────────────────────────────────
class CombinedInferenceMeta(BaseModel):
    total_latency_ms: float
    pothole_latency_ms: float
    segmentation_latency_ms: float
    device: str = "cpu"


class CombinedAnalysisResponse(BaseModel):
    """Contract for POST /analyze (Dual-Model)."""
    status: str = "success"
    models: List[str] = [
        "pothole_detector.onnx",
        "facebook/mask2former-swin-large-mapillary-vistas-semantic",
    ]
    image: ImageMeta
    inference: CombinedInferenceMeta
    potholes_count: int
    detections: List[DetectionItem]
    detected_semantic_classes: List[str]
    class_statistics: List[ClassStatItem]
    composite_overlay_base64: Optional[str] = Field(
        None, description="Base64 PNG combining semantic segmentation map and pothole bounding boxes"
    )
    masks_base64: Optional[Dict[str, str]] = None


# ── Pydantic Schemas (Health) ──────────────────────────────────────────────
class ModelStatus(BaseModel):
    name: str
    loaded: bool
    size_mb: Optional[float] = None
    device: str = "cpu"


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_name: str
    model_size_mb: float
    input_shape: List[Any]
    output_shape: List[Any]
    classes: List[str]
    ready: bool
    models: Optional[Dict[str, ModelStatus]] = None


# ── Helper Utilities ───────────────────────────────────────────────────────
async def validate_and_decode_image(file: UploadFile) -> Tuple[str, np.ndarray]:
    """Validate upload format and decode image to BGR numpy array."""
    filename = file.filename or "upload.jpg"
    ext = Path(filename).suffix.lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Allowed: .jpg, .jpeg, .png, .webp",
        )

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

    return filename, img_bgr


# ── Endpoints ──────────────────────────────────────────────────────────────
@app.get("/", tags=["General"])
async def root():
    return {
        "service": "GeoSathi AI Dual-Model Road Intelligence API",
        "version": "2.0.0",
        "models": {
            "model_v1": "Pothole Detection (YOLO11n ONNX) -> POST /predict",
            "model_v2": "Road Scene Segmentation (Mask2Former Swin-Large) -> POST /segment",
            "combined": "Dual-Model Unified Road Analysis -> POST /analyze",
        },
        "docs_url": "/docs",
        "health_url": "/health",
    }


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Report model readiness and server status for Cloud Run liveness/readiness probes."""
    v1_loaded = detector is not None
    v2_loaded = segmentor is not None and segmentor.is_loaded

    size_mb = round(MODEL_PATH.stat().st_size / (1024 * 1024), 2) if MODEL_PATH.exists() else 0.0

    models_info = {
        "model_v1_pothole": ModelStatus(
            name="pothole_detector.onnx",
            loaded=v1_loaded,
            size_mb=size_mb,
            device="cpu",
        ),
        "model_v2_mask2former": ModelStatus(
            name="facebook/mask2former-swin-large-mapillary-vistas-semantic",
            loaded=v2_loaded,
            size_mb=866.0,
            device=segmentor.device if segmentor else "cpu",
        ),
    }

    return HealthResponse(
        status="healthy" if v1_loaded else "unhealthy",
        model_loaded=v1_loaded,
        model_name="pothole_detector.onnx",
        model_size_mb=size_mb,
        input_shape=list(detector.input_shape) if detector else [],
        output_shape=list(detector.output_shape) if detector else [],
        classes=detector.class_names if detector else [],
        ready=v1_loaded,
        models=models_info,
    )


# ── Endpoint 1: Model V1 (Preserved Pothole Detector) ───────────────────────
@app.post("/predict", response_model=PredictionResponse, tags=["Model V1 — Pothole Detection"])
async def predict_image(
    file: UploadFile = File(..., description="Road image file (JPG, JPEG, PNG, WEBP)"),
    conf: float = Query(0.25, ge=0.01, le=0.99, description="Confidence threshold"),
    iou: float = Query(0.45, ge=0.01, le=0.99, description="IoU threshold for NMS"),
):
    """
    MODEL V1 — PRESERVED EXISTING POTHOLE DETECTOR.
    Detects potholes with bounding boxes, confidence scores, and latency.
    Backward-compatible response contract.
    """
    if detector is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model V1 (Pothole Detector) is not ready.",
        )

    filename, img_bgr = await validate_and_decode_image(file)
    h, w, c = img_bgr.shape

    try:
        detections, latency_ms = detector.predict(img_bgr, conf_thresh=conf, iou_thresh=iou)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference error: {str(e)}",
        )

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


# ── Endpoint 2: Model V2 (Mask2Former Road Scene Segmentation) ──────────────
@app.post("/segment", response_model=SegmentationResponse, tags=["Model V2 — Road Scene Segmentation"])
async def segment_road_scene(
    file: UploadFile = File(..., description="Road image file (JPG, JPEG, PNG, WEBP)"),
    return_masks: bool = Query(False, description="Generate separate binary masks for key detected classes"),
    classes: Optional[str] = Query(None, description="Comma-separated class names for binary masks (e.g. 'Road,Sidewalk,Car')"),
):
    """
    MODEL V2 — MASK2FORMER ROAD SCENE SEMANTIC SEGMENTATION.
    Segments road imagery into 65 Mapillary Vistas classes (Road, Sidewalk, Vehicles,
    Pedestrians, Vegetation, Lane Markings, Signs, Potholes, etc.).
    Returns pixel statistics, detected classes, and base64-encoded PNG overlay.
    """
    seg = get_segmentor(lazy_load=False)
    filename, img_bgr = await validate_and_decode_image(file)
    h, w, c = img_bgr.shape

    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    selected_list = [c.strip() for c in classes.split(",") if c.strip()] if classes else None

    try:
        res = seg.predict_rgb(
            img_rgb=img_rgb,
            return_overlay=True,
            return_masks=return_masks,
            selected_classes=selected_list,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Segmentation error: {str(e)}",
        )

    # Encode overlay as base64
    overlay_b64 = None
    if res.get("overlay_png_bytes"):
        overlay_b64 = base64.b64encode(res["overlay_png_bytes"]).decode("utf-8")

    # Encode individual masks
    masks_b64 = None
    if return_masks and res.get("masks_png_bytes"):
        masks_b64 = {
            cls_name: base64.b64encode(m_bytes).decode("utf-8")
            for cls_name, m_bytes in res["masks_png_bytes"].items()
        }

    return SegmentationResponse(
        status="success",
        model="facebook/mask2former-swin-large-mapillary-vistas-semantic",
        image=ImageMeta(filename=filename, width=w, height=h, channels=c),
        inference=InferenceMeta(
            latency_ms=round(res["latency_ms"], 2),
            device=res["device"],
        ),
        detected_classes=res["detected_classes"],
        class_statistics=[ClassStatItem(**s) for s in res["class_statistics"]],
        overlay_base64=overlay_b64,
        masks_base64=masks_b64,
    )


# ── Endpoint 3: Combined Dual-Model Road Analysis ───────────────────────────
@app.post("/analyze", response_model=CombinedAnalysisResponse, tags=["Dual-Model Combined Analysis"])
async def analyze_road_scene_combined(
    file: UploadFile = File(..., description="Road image file (JPG, JPEG, PNG, WEBP)"),
    conf: float = Query(0.25, ge=0.01, le=0.99, description="Pothole detector confidence threshold"),
    iou: float = Query(0.45, ge=0.01, le=0.99, description="IoU threshold for NMS"),
    return_masks: bool = Query(False, description="Generate separate binary masks for key detected classes"),
):
    """
    DUAL-MODEL COMBINED ROAD ANALYSIS.
    Runs both Model V1 (YOLO11n Pothole Detection) and Model V2 (Mask2Former Scene Segmentation).
    Combines pothole bounding boxes with dense road-scene semantic segmentation.
    Produces a composite overlay showing semantic road context + glowing pothole detections.
    """
    if detector is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model V1 (Pothole Detector) is not ready.",
        )

    seg = get_segmentor(lazy_load=False)
    filename, img_bgr = await validate_and_decode_image(file)
    h, w, c = img_bgr.shape

    # 1. Run Model V1 (Pothole Detection)
    try:
        pothole_dets, pothole_latency = detector.predict(img_bgr, conf_thresh=conf, iou_thresh=iou)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Pothole detector error: {str(e)}",
        )

    # 2. Run Model V2 (Mask2Former Segmentation)
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    try:
        seg_res = seg.predict_rgb(
            img_rgb=img_rgb,
            return_overlay=True,
            return_masks=return_masks,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Segmentation error: {str(e)}",
        )

    seg_latency = seg_res["latency_ms"]
    total_latency = pothole_latency + seg_latency

    # 3. Create Composite Overlay (Segmentation Overlay + Pothole Boxes drawn on top)
    composite_b64 = None
    if seg_res.get("overlay_png_bytes"):
        overlay_arr = np.frombuffer(seg_res["overlay_png_bytes"], np.uint8)
        composite_bgr = cv2.imdecode(overlay_arr, cv2.IMREAD_COLOR)

        # Draw pothole detections with glowing neon HUD styling onto composite
        for i, det in enumerate(pothole_dets, 1):
            x1, y1 = det["bbox"]["x1"], det["bbox"]["y1"]
            x2, y2 = det["bbox"]["x2"], det["bbox"]["y2"]
            c_score = det["confidence"]

            # Box
            color = (30, 45, 255)  # Crimson / Vivid Red
            cv2.rectangle(composite_bgr, (x1, y1), (x2, y2), color, 3)

            # Badge
            lbl = f"POTHOLE #{i} ({c_score:.0%})"
            (tw, th), bl = cv2.getTextSize(lbl, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            y_top = max(0, y1 - th - 8)
            cv2.rectangle(composite_bgr, (x1, y_top), (x1 + tw + 8, y_top + th + 6), color, -1)
            cv2.putText(
                composite_bgr,
                lbl,
                (x1 + 4, y_top + th + 2),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (255, 255, 255),
                1,
                cv2.LINE_AA,
            )

        success, enc_comp = cv2.imencode(".png", composite_bgr)
        if success:
            composite_b64 = base64.b64encode(enc_comp.tobytes()).decode("utf-8")

    # Encode binary masks if requested
    masks_b64 = None
    if return_masks and seg_res.get("masks_png_bytes"):
        masks_b64 = {
            cls_name: base64.b64encode(m_bytes).decode("utf-8")
            for cls_name, m_bytes in seg_res["masks_png_bytes"].items()
        }

    formatted_detections = [
        DetectionItem(
            class_id=d["class_id"],
            class_name=d["class_name"],
            confidence=d["confidence"],
            bbox=BoundingBox(**d["bbox"]),
        )
        for d in pothole_dets
    ]

    return CombinedAnalysisResponse(
        status="success",
        models=[
            "pothole_detector.onnx",
            "facebook/mask2former-swin-large-mapillary-vistas-semantic",
        ],
        image=ImageMeta(filename=filename, width=w, height=h, channels=c),
        inference=CombinedInferenceMeta(
            total_latency_ms=round(total_latency, 2),
            pothole_latency_ms=round(pothole_latency, 2),
            segmentation_latency_ms=round(seg_latency, 2),
            device=seg_res["device"],
        ),
        potholes_count=len(formatted_detections),
        detections=formatted_detections,
        detected_semantic_classes=seg_res["detected_classes"],
        class_statistics=[ClassStatItem(**s) for s in seg_res["class_statistics"]],
        composite_overlay_base64=composite_b64,
        masks_base64=masks_b64,
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("api.main:app", host="0.0.0.0", port=port, log_level="info")
