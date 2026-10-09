# =============================================================================
# GeoSathi AI — Google Cloud Run Production Dockerfile
# Pothole Detection REST API (ONNX Runtime CPU Inference)
# =============================================================================

FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

# Install minimal OS runtime libraries needed by ONNX Runtime and OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install lightweight Python dependencies
COPY requirements-docker.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements-docker.txt

# Copy only the ONNX model and API application code
COPY models/pothole_detector.onnx ./models/pothole_detector.onnx
COPY api/ ./api/

# Create non-root user for container security
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app
USER appuser

# Expose default Cloud Run port
EXPOSE 8080

# Launch FastAPI with Uvicorn; PORT is dynamically injected by Cloud Run
CMD ["sh", "-c", "exec uvicorn api.main:app --host 0.0.0.0 --port ${PORT} --workers 1 --log-level info"]
