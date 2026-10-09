# GeoSathi Segmentation API

Production-ready road-scene semantic segmentation API for the **GeoSathi AI** system, powered by Meta's pretrained Hugging Face model `facebook/mask2former-swin-large-mapillary-vistas-semantic` and deployed on **Google Cloud Run** in `asia-south1`.

---

## 1. System Overview

- **Service Name:** `geosathi-segmentation-api`
- **Region:** `asia-south1` (Mumbai)
- **Live Endpoint:** `https://geosathi-segmentation-api-883668519860.asia-south1.run.app`
- **Swagger Docs:** `https://geosathi-segmentation-api-883668519860.asia-south1.run.app/docs`
- **Model:** `facebook/mask2former-swin-large-mapillary-vistas-semantic`
- **Framework:** FastAPI + PyTorch (CPU) + Hugging Face Transformers
- **Target Platform:** Google Cloud Run (Containerized via Google Cloud Build)
- **Dataset / Taxonomy:** Mapillary Vistas (65 semantic road and street-scene categories)

> [!NOTE]
> This service provides 2D semantic scene segmentation (pixel-level class classification). It does not perform 3D mesh reconstruction or direct depth estimation.

---

## 2. API Endpoints

### `GET /`
Returns service metadata and documentation links.

**Response:**
```json
{
  "service": "GeoSathi Segmentation API",
  "model": "facebook/mask2former-swin-large-mapillary-vistas-semantic",
  "docs": "/docs"
}
```

### `GET /health`
Liveness/readiness probe. Returns HTTP `200` when the model is initialized in memory, or HTTP `503` if still initializing or if an error occurred.

**Response (Ready):**
```json
{
  "status": "ready",
  "model": "facebook/mask2former-swin-large-mapillary-vistas-semantic",
  "device": "cpu"
}
```

### `POST /segment`
Performs road-scene segmentation on an uploaded image.

- **Request:** `multipart/form-data` with parameter `file` (JPEG, PNG, WebP up to 15 MB).
- **Response:**
  - `model`: Hugging Face checkpoint ID.
  - `image_width`, `image_height`: Original dimensions.
  - `inference_ms`: Time taken for inference in milliseconds.
  - `classes`: Array of detected semantic classes sorted by pixel area descending, including `class_id`, `label`, `pixel_count`, and `pixel_percentage`.
  - `overlay_png_base64`: Semi-transparent (55% original photo + 45% class color map) visualization encoded in Base64 PNG.
  - `segmentation_mask_png_base64`: 8-bit grayscale PNG where each pixel's grayscale value represents its semantic class ID.

---

## 3. Container & Cloud Run Architecture

1. **Pre-Cached Weights:** Model weights (~860 MB safetensors) and preprocessor configuration are downloaded into `/app/model_cache` during container build. This eliminates runtime internet downloads from Hugging Face on cold starts.
2. **PyTorch CPU Wheels:** Leverages PyTorch's official CPU-only build (`--index-url https://download.pytorch.org/whl/cpu`) to keep the container lightweight (avoiding multi-gigabyte CUDA packages).
3. **Hardware Sizing:**
   - **vCPU:** `4` (Provides multi-threaded OpenMP CPU tensor acceleration).
   - **Memory:** `8Gi` (Mask2Former Swin-Large maintains intermediate attention maps; 8Gi prevents container OOM kills).
   - **Timeout:** `300s`
   - **Workers:** `1` (Prevents duplicating heavy Swin-Large model weights across multiple worker processes).

---

## 4. Deployment Instructions (PowerShell)

### Step 1: Open PowerShell and Navigate to the Directory
```powershell
Set-Location -Path "C:\PROJECTS\Fusion 2\segmentation-api"
```

### Step 2: Ensure Google Cloud SDK is on Path
If `gcloud` is not in your current PATH session:
```powershell
$env:Path += ";$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin"
```

### Step 3: Verify Project and Account
```powershell
gcloud config get-value project
gcloud auth list
```

### Step 4: Deploy to Google Cloud Run via Cloud Build
```powershell
gcloud run deploy geosathi-segmentation-api `
    --source . `
    --region asia-south1 `
    --platform managed `
    --cpu 4 `
    --memory 8Gi `
    --timeout 300 `
    --concurrency 1 `
    --min-instances 0 `
    --max-instances 2 `
    --allow-unauthenticated
```
*(Use `--no-allow-unauthenticated` if internal enterprise IAM token authentication is desired).*

---

## 5. Integrating with GeoSathi Streamlit App

Add this snippet to your GeoSathi Streamlit frontend:

```python
import base64
import requests
import streamlit as st
from PIL import Image
import io

SEGMENTATION_API_URL = "https://geosathi-segmentation-api-883668519860.asia-south1.run.app"

def segment_road_scene(image_bytes: bytes):
    response = requests.post(
        f"{SEGMENTATION_API_URL}/segment",
        files={"file": ("input.jpg", image_bytes, "image/jpeg")},
        timeout=120,
    )
    response.raise_for_status()
    return response.json()

# In your Streamlit page:
uploaded_file = st.file_uploader("Upload road image", type=["jpg", "jpeg", "png"])
if uploaded_file and st.button("Run Semantic Segmentation"):
    with st.spinner("Analyzing road scene with Mask2Former Swin-Large..."):
        data = segment_road_scene(uploaded_file.getvalue())
        
        st.success(f"Segmentation completed in {data['inference_ms']} ms")
        
        # Decode overlay
        overlay_bytes = base64.b64decode(data["overlay_png_base64"])
        overlay_img = Image.open(io.BytesIO(overlay_bytes))
        
        col1, col2 = st.columns(2)
        with col1:
            st.image(uploaded_file, caption="Original Image")
        with col2:
            st.image(overlay_img, caption="Segmented Overlay")
            
        st.subheader("Scene Breakdown")
        st.dataframe(data["classes"])
```
