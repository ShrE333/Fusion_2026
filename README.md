# 🛣️ GeoSathi AI — Multimodal Road Hazard & Pothole Detection

GeoSathi AI is a computer vision and geospatial reporting system designed to identify road hazards, potholes, and infrastructure degradation from dashcam imagery, mobile camera uploads, and field inspection feeds.

This repository contains the core **Pothole Detection Module** (Member 3 — Road Hazard Module), trained on a merged and verified dataset of **3,210 road images** (6,968 pothole instances), with dual runtime support for **PyTorch (GPU/CUDA)** and **ONNX Runtime (CPU/Edge)**.

---

## 📌 Features

- **Trained YOLO11n Detector**: Optimized lightweight detector trained across 60 epochs on diverse asphalt conditions, angles, and lighting scenarios.
- **ONNX Export (`models/pothole_detector.onnx`)**: Fully slimmed and verified ONNX model (~10.1 MB) runnable on any CPU without PyTorch or CUDA dependencies.
- **High-Precision Evaluation**: Verified on held-out test split with **78.8% Precision** and **62.0% mAP50**.
- **Interactive Streamlit Web Interface (`app.py`)**: Real-time image upload, batch processing, confidence/IoU threshold adjustment, resolution scaling, and annotated download.
- **CLI Inference Script (`scripts/predict_onnx.py`)**: Standalone, dependency-light prediction tool.

---

## 📊 Measured Evaluation Metrics

Evaluated on the held-out test split (**325 images**, **870 pothole instances**):

| Metric | Measured Value | Description |
| :--- | :--- | :--- |
| **Precision** | **78.8%** | Ratio of true positive detections over total positive predictions |
| **Recall** | **60.6%** | Detection coverage of ground-truth potholes |
| **mAP@0.50** | **62.0%** | Mean Average Precision at 0.50 IoU |
| **mAP@0.50:0.95** | **32.4%** | Strict COCO-style multi-threshold mAP |
| **PyTorch Latency** | **6.8 ms** (~146 FPS) | NVIDIA RTX 5050 Laptop GPU (batch=1, 640×640) |
| **ONNX CPU Latency** | **~42 ms** (~24 FPS) | Intel Core i7-13620H CPU (batch=1, 640×640) |

*Full metrics and training progression are available in [`reports/metrics.json`](reports/metrics.json) and [`reports/evaluation_report.md`](reports/evaluation_report.md).*

---

## 🚀 Quick Start

### 1. Installation

Clone the repository and install dependencies in a Python 3.10+ virtual environment:

```bash
git clone https://github.com/your-username/geosathi-ai-pothole.git
cd geosathi-ai-pothole

# Create and activate virtual environment
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install requirements
pip install -r requirements.txt
```

---

### 2. Run ONNX Inference (CLI)

Run inference on any image using ONNX Runtime (no GPU required):

```bash
python scripts/predict_onnx.py --image path/to/road_image.jpg --conf 0.25
```

**Options:**
- `--image`, `-i`: Path to the input image (JPG, PNG, WEBP).
- `--conf`, `-c`: Confidence threshold (default: `0.25`).
- `--iou`: IoU threshold for Non-Maximum Suppression (default: `0.45`).
- `--output`, `-o`: Custom path to save the annotated output image.

Output images are automatically saved to `outputs/onnx_<image_name>`.

---

### 3. Google Cloud Run Production Deployment (Live)

The API is deployed and live on Google Cloud Run:

- **Service Base URL:** `https://geosathi-pothole-api-883668519860.asia-south1.run.app`
- **Region:** `asia-south1` (Mumbai)
- **Interactive Swagger Docs:** `https://geosathi-pothole-api-883668519860.asia-south1.run.app/docs`
- **Health Check Endpoint:** `https://geosathi-pothole-api-883668519860.asia-south1.run.app/health`
- **Inference Endpoint:** `POST https://geosathi-pothole-api-883668519860.asia-south1.run.app/predict?conf=0.25&iou=0.45`

**Live Test Command (cURL):**
```bash
curl -X POST "https://geosathi-pothole-api-883668519860.asia-south1.run.app/predict?conf=0.25" \
  -F "file=@path/to/road_photo.jpg"
```

---

### 4. Run FastAPI Service Locally

Run the production REST API locally on port 8080:

```bash
# Using uvicorn directly:
uvicorn api.main:app --host 0.0.0.0 --port 8080

# Or run the main module:
python api/main.py
```

- **Health Check:** `http://localhost:8080/health`
- **Interactive Swagger Docs:** `http://localhost:8080/docs`
- **Inference Endpoint:** `POST http://localhost:8080/predict?conf=0.25&iou=0.45`

---

### 5. Build and Test Docker Container Locally

```bash
# Build lightweight production container (~220 MB)
docker build -t geosathi-pothole-api:latest .

# Run container locally on port 8080
docker run -p 8080:8080 geosathi-pothole-api:latest
```

---

### 6. Launch Streamlit Web Application

Launch the interactive dark-mode dashboard:

```bash
python -m streamlit run app.py
```

Open your browser at `http://localhost:8501`.

**Dashboard Capabilities:**
- **Engine Switching:** Toggle between **PyTorch (.pt)** for GPU acceleration or **ONNX Runtime (.onnx)** for portable CPU execution.
- **Detection Settings:** Live sliders for Confidence threshold and IoU threshold.
- **Resolution Scaling:** Select between 640, 800, 1024, or 1280 pixel inference.
- **TTA Confidence Boost:** Test-Time Augmentation toggle for boosting confidence on difficult potholes.
- **Batch Processing:** Upload multiple images simultaneously and download an aggregated summary.

---

## 🧠 Model Architecture & Export Details

- **Base Architecture:** Ultralytics YOLO11n (2.58M parameters, 6.4 GFLOPs).
- **Canonical ONNX Model:** `models/pothole_detector.onnx` (10.11 MB).
- **Input Dimensions:** `[1, 3, 640, 640]` (RGB, normalized to `[0.0, 1.0]`).
- **Output Dimensions:** `[1, 5, 8400]` (`[cx, cy, w, h, score]` for class `pothole`).
- **Opset Version:** 12, simplified via `onnxslim`.
- **Target Classes:** Single class — `0: pothole`.

### Model Download & Large Checkpoints
- The standalone ONNX model (`models/pothole_detector.onnx`) is **10.1 MB** and is tracked directly in this repository.
- Full PyTorch checkpoints (`models/best.pt`, `models/last.pt`) can be downloaded from the **GitHub Releases** page or re-exported using:
  ```bash
  python scripts/export_onnx.py --model models/best.pt --output models/pothole_detector.onnx
  ```

---

## 📁 Repository Structure

```
├── app.py                         # Streamlit interactive application
├── requirements.txt               # Sanitized Python dependencies
├── README.md                      # Project documentation
├── .gitignore                     # Git ignore rules for datasets & checkpoints
├── models/
│   ├── pothole_detector.onnx      # Canonical exported ONNX model (~10.1 MB)
│   └── best.pt                    # PyTorch best checkpoint (local/release)
├── scripts/
│   ├── predict_onnx.py            # Standalone ONNX Runtime prediction script
│   ├── verify_onnx_vs_pytorch.py  # Model numerical consistency test
│   ├── export_onnx.py             # ONNX export and validation pipeline
│   ├── evaluate_merged.py         # Test split evaluation script
│   ├── train_merged.py            # 60-epoch YOLO11 training script
│   └── build_merged_dataset.py    # Dataset conversion and merging pipeline
└── reports/
    ├── metrics.json               # Raw test split evaluation metrics
    ├── evaluation_report.md       # Markdown evaluation breakdown
    └── training_merged.json       # Training history and validation record
```

---

## ⚠️ Known Limitations & Future Work

1. **Small Pothole Resolution:** Potholes occupying fewer than 20×20 pixels in wide dashcam views may have lower confidence at 640×640. Using 800px or 1024px inference in the app addresses this.
2. **Extreme Weather:** Training data primarily features daylight conditions; night scenes and heavy rainfall puddles may occasionally trigger false positives.
3. **Phase 2 Integration:** Road hazard localization using EXIF / GPS telemetry and automated incident reporting via WhatsApp/FastAPI endpoints will be integrated in subsequent milestones.
