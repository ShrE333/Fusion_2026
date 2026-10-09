import base64
import io
import os
import time
from contextlib import asynccontextmanager
from threading import Lock
from typing import Any, Dict, List

import numpy as np
import torch
from PIL import Image
from fastapi import FastAPI, File, HTTPException, UploadFile
from transformers import (
    AutoImageProcessor,
    Mask2FormerForUniversalSegmentation,
)

MODEL_ID = "facebook/mask2former-swin-large-mapillary-vistas-semantic"
MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB limit

processor = None
model = None
model_lock = Lock()
model_error = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan event handler to load model during startup."""
    global processor, model, model_error
    try:
        print(f"Loading processor: {MODEL_ID}...")
        processor = AutoImageProcessor.from_pretrained(MODEL_ID)
        print(f"Loading model weights: {MODEL_ID}...")
        model = Mask2FormerForUniversalSegmentation.from_pretrained(
            MODEL_ID,
            use_safetensors=True,
        )
        model.eval()
        model_error = None
        print(f"Successfully initialized model: {MODEL_ID}")
    except Exception as exc:
        model_error = str(exc)
        print(f"Model initialization error: {model_error}")
    yield
    print("Shutting down GeoSathi Segmentation API...")


app = FastAPI(
    title="GeoSathi Segmentation API",
    description="Road-scene semantic segmentation API for GeoSathi AI using Mask2Former Swin-Large.",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/")
def root():
    return {
        "service": "GeoSathi Segmentation API",
        "model": MODEL_ID,
        "docs": "/docs",
    }


@app.get("/health")
def health():
    if model is None or processor is None:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "not_ready",
                "model": MODEL_ID,
                "error": model_error or "Model is initializing or failed to load",
            },
        )

    return {
        "status": "ready",
        "model": MODEL_ID,
        "device": "cpu",
    }


def image_to_base64_png(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


@app.post("/segment")
async def segment(file: UploadFile = File(...)):
    if model is None or processor is None:
        raise HTTPException(
            status_code=503,
            detail=f"Model is not ready: {model_error or 'Still initializing'}",
        )

    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=415,
            detail="Unsupported media type. Please upload an image file (e.g., JPEG, PNG).",
        )

    raw = await file.read()

    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB upload limit.",
        )

    try:
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Invalid image file or format could not be decoded.",
        )

    started = time.perf_counter()

    try:
        with model_lock, torch.inference_mode():
            inputs = processor(images=image, return_tensors="pt")
            outputs = model(**inputs)

            segmentation = (
                processor.post_process_semantic_segmentation(
                    outputs,
                    target_sizes=[(image.height, image.width)],
                )[0]
                .cpu()
                .numpy()
            )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Segmentation inference failed: {str(exc)[:300]}",
        )

    inference_ms = round((time.perf_counter() - started) * 1000, 2)

    overlay = np.asarray(image, dtype=np.uint8).copy()
    color_map = np.zeros_like(overlay)
    class_stats: List[Dict[str, Any]] = []

    id2label = getattr(model.config, "id2label", {})

    for class_id in np.unique(segmentation):
        class_id = int(class_id)
        label = str(
            id2label.get(
                class_id,
                id2label.get(str(class_id), f"class_{class_id}"),
            )
        )

        # Stable pseudo-random visualization color based on class ID
        color = (
            (class_id * 67 + 31) % 256,
            (class_id * 131 + 73) % 256,
            (class_id * 197 + 19) % 256,
        )

        mask = segmentation == class_id
        color_map[mask] = color
        pixels = int(mask.sum())

        class_stats.append({
            "class_id": class_id,
            "label": label,
            "pixel_count": pixels,
            "pixel_percentage": round(pixels * 100 / segmentation.size, 2),
        })

    # Semi-transparent blending: 55% original photo + 45% class color map
    overlay = (
        0.55 * overlay.astype(np.float32)
        + 0.45 * color_map.astype(np.float32)
    ).clip(0, 255).astype(np.uint8)

    overlay_image = Image.fromarray(overlay)

    # Class ID mask (8-bit grayscale image where pixel intensity = semantic class ID)
    mask_image = Image.fromarray(segmentation.astype(np.uint8), mode="L")

    class_stats.sort(key=lambda item: item["pixel_count"], reverse=True)

    return {
        "model": MODEL_ID,
        "image_width": image.width,
        "image_height": image.height,
        "inference_ms": inference_ms,
        "classes": class_stats,
        "overlay_png_base64": image_to_base64_png(overlay_image),
        "segmentation_mask_png_base64": image_to_base64_png(mask_image),
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
