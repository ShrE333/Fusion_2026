FROM python:3.11-slim

# Prevent python from writing pyc files and buffering stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/app/model_cache \
    PORT=8080

WORKDIR /app

# Install system dependencies (curl for healthchecks, libgomp1 for OpenMP/PyTorch)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Pre-download and cache model weights into /app/model_cache during container build
# Avoids downloading ~860MB at runtime and eliminates cold-start timeouts
RUN python -c "from transformers import AutoImageProcessor, Mask2FormerForUniversalSegmentation; \
AutoImageProcessor.from_pretrained('facebook/mask2former-swin-large-mapillary-vistas-semantic'); \
Mask2FormerForUniversalSegmentation.from_pretrained('facebook/mask2former-swin-large-mapillary-vistas-semantic', use_safetensors=True)"

# Copy application source code
COPY main.py .

# Expose port (Cloud Run sets PORT env var)
EXPOSE 8080

# Run uvicorn server with 1 worker to optimize memory allocation for Swin-Large
CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT} --workers 1
