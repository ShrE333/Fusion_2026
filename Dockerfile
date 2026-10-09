# =============================================================================
# GeoSathi AI — Google Cloud Run Production Dockerfile (v2.0 — Dual Model)
# Model V1: YOLO11n ONNX Pothole Detector
# Model V2: Mask2Former Swin-Large Mapillary Vistas Semantic Segmentation
# =============================================================================

FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    # Pin HuggingFace cache to a predictable in-container path
    HF_HOME=/app/.cache/huggingface \
    TRANSFORMERS_CACHE=/app/.cache/huggingface/hub \
    # Disable symlink warning on Linux containers (not needed)
    HF_HUB_DISABLE_SYMLINKS_WARNING=1 \
    # Silence progress bars in build logs
    HF_HUB_DISABLE_PROGRESS_BARS=1

WORKDIR /app

# Install OS runtime libraries needed by ONNX Runtime, OpenCV, and PyTorch
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    libglib2.0-0 \
    libsm6 \
    libxrender1 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies (CPU-only torch for smaller image)
COPY requirements-docker.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
      torch torchvision --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements-docker.txt

# Copy application code and models
COPY models/pothole_detector.onnx ./models/pothole_detector.onnx
COPY api/ ./api/

# Pre-download Mask2Former checkpoint during build so the container starts
# instantly without needing internet access at runtime.
RUN python -c "\
from transformers import AutoImageProcessor, Mask2FormerForUniversalSegmentation; \
print('Downloading Mask2Former processor...'); \
AutoImageProcessor.from_pretrained('facebook/mask2former-swin-large-mapillary-vistas-semantic'); \
print('Downloading Mask2Former model weights...'); \
Mask2FormerForUniversalSegmentation.from_pretrained('facebook/mask2former-swin-large-mapillary-vistas-semantic'); \
print('Mask2Former cached successfully.')"

# Create non-root user for container security
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app
USER appuser

# Expose default Cloud Run port
EXPOSE 8080

# Launch FastAPI with Uvicorn; PORT is dynamically injected by Cloud Run
CMD ["sh", "-c", "exec uvicorn api.main:app --host 0.0.0.0 --port ${PORT} --workers 1 --log-level info"]
