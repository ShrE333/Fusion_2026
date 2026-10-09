#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GeoSathi AI — Pothole Detection Web App
app.py

Run:
    python -m streamlit run app.py
"""

import io
import json
import time
from pathlib import Path

import cv2
import numpy as np
import streamlit as st
from PIL import Image

# ── Page config (must be first Streamlit call) ─────────────────────────────
st.set_page_config(
    page_title="GeoSathi AI — Pothole Detector",
    page_icon="🛣️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Paths ──────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent
MODEL_PT     = ROOT / "models" / "best.pt"
MODEL_ONNX   = ROOT / "models" / "pothole_detector.onnx"
METRICS_FILE = ROOT / "reports" / "metrics.json"
MERGE_REPORT = ROOT / "reports" / "merge_report.json"
TRAINING_REPORT = ROOT / "reports" / "training_merged.json"

# ── Custom CSS ─────────────────────────────────────────────────────────────
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

html, body, [class*="css"] {
    font-family: 'Inter', sans-serif;
}

/* Dark gradient background */
.stApp {
    background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
    color: #e0e0e0;
}

/* Sidebar */
[data-testid="stSidebar"] {
    background: rgba(255,255,255,0.06);
    backdrop-filter: blur(12px);
    border-right: 1px solid rgba(255,255,255,0.1);
}

/* Cards */
.metric-card {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 14px;
    padding: 1.2rem 1.5rem;
    text-align: center;
    backdrop-filter: blur(10px);
    transition: transform 0.2s, box-shadow 0.2s;
}
.metric-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 32px rgba(100,120,255,0.3);
}
.metric-value {
    font-size: 2rem;
    font-weight: 700;
    background: linear-gradient(90deg, #a78bfa, #60a5fa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}
.metric-label {
    font-size: 0.8rem;
    color: rgba(200,200,220,0.75);
    margin-top: 4px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
}

/* Detection result box */
.detection-success {
    background: linear-gradient(135deg, rgba(52,211,153,0.15), rgba(16,185,129,0.08));
    border: 1px solid rgba(52,211,153,0.5);
    border-radius: 12px;
    padding: 1rem 1.4rem;
    margin: 0.5rem 0;
}
.detection-none {
    background: linear-gradient(135deg, rgba(96,165,250,0.15), rgba(59,130,246,0.08));
    border: 1px solid rgba(96,165,250,0.5);
    border-radius: 12px;
    padding: 1rem 1.4rem;
    margin: 0.5rem 0;
}

/* Hero header */
.hero-header {
    background: linear-gradient(135deg, rgba(167,139,250,0.15), rgba(96,165,250,0.1));
    border: 1px solid rgba(167,139,250,0.3);
    border-radius: 20px;
    padding: 2rem 2.5rem;
    margin-bottom: 2rem;
    text-align: center;
}
.hero-title {
    font-size: 2.5rem;
    font-weight: 700;
    background: linear-gradient(90deg, #a78bfa, #60a5fa, #34d399);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 0.5rem;
}
.hero-subtitle {
    color: rgba(200,200,220,0.8);
    font-size: 1rem;
}

/* Confidence box */
.conf-box {
    display: inline-block;
    background: rgba(167,139,250,0.2);
    border: 1px solid rgba(167,139,250,0.4);
    border-radius: 8px;
    padding: 2px 10px;
    font-size: 0.85rem;
    font-weight: 600;
    color: #c4b5fd;
    margin: 2px;
}

/* Buttons */
.stButton>button {
    background: linear-gradient(135deg, #7c3aed, #2563eb);
    color: white;
    border: none;
    border-radius: 10px;
    font-weight: 600;
    transition: all 0.2s;
}
.stButton>button:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(124,58,237,0.5);
}

/* Upload area */
[data-testid="stFileUploader"] {
    border: 2px dashed rgba(167,139,250,0.4) !important;
    border-radius: 14px !important;
    background: rgba(255,255,255,0.04) !important;
}

/* Divider */
hr { border-color: rgba(255,255,255,0.1); }

/* Progress / spinners */
.stSpinner { color: #a78bfa; }

h1, h2, h3 { color: #e0e0f0; }
</style>
""", unsafe_allow_html=True)


# ── Model loading (cached) ─────────────────────────────────────────────────
@st.cache_resource(show_spinner="Loading PyTorch YOLO model…")
def load_pytorch_model(model_path: str):
    try:
        from ultralytics import YOLO
        m = YOLO(model_path)
        return m, None
    except Exception as e:
        return None, str(e)


@st.cache_resource(show_spinner="Loading ONNX Runtime detector…")
def load_onnx_detector(onnx_path: str):
    try:
        import sys
        if str(ROOT) not in sys.path:
            sys.path.insert(0, str(ROOT))
        from scripts.predict_onnx import PotholeONNXDetector
        m = PotholeONNXDetector(onnx_path, device="cpu")
        return m, None
    except Exception as e:
        return None, str(e)


def load_metrics() -> dict:
    # Prefer merged training report, fall back to original metrics
    for path in (TRAINING_REPORT, METRICS_FILE):
        if path.exists():
            try:
                with open(path) as f:
                    data = json.load(f)
                    # Normalise structure
                    if "val_metrics" in data:
                        m = data["val_metrics"]
                        return {
                            "precision": m.get("metrics/precision(B)", m.get("precision", 0)),
                            "recall":    m.get("metrics/recall(B)",    m.get("recall",    0)),
                            "map50":     m.get("metrics/mAP50(B)",     m.get("map50",     0)),
                            "map50_95":  m.get("metrics/mAP50-95(B)", m.get("map", m.get("map50_95", 0))),
                        }
                    return data.get("metrics", data)
            except Exception:
                pass
    return {}


def run_pytorch_inference(model, img_pil: Image.Image, conf: float, iou: float, imgsz: int = 640, augment: bool = False):
    """Run PyTorch YOLO inference."""
    img_np = np.array(img_pil.convert("RGB"))
    t0 = time.perf_counter()
    results = model.predict(
        source=img_np,
        conf=conf,
        iou=iou,
        imgsz=imgsz,
        augment=augment,
        save=False,
        verbose=False,
    )
    elapsed_ms = (time.perf_counter() - t0) * 1000
    res = results[0]
    annotated_bgr = res.plot(line_width=2, font_size=12, labels=True, conf=True)
    annotated_pil = Image.fromarray(annotated_bgr[..., ::-1])

    detections = []
    if res.boxes is not None and len(res.boxes) > 0:
        boxes_xyxy = res.boxes.xyxy.cpu().numpy()
        confs = res.boxes.conf.cpu().numpy()
        for box, c in zip(boxes_xyxy, confs):
            x1, y1, x2, y2 = box
            detections.append({
                "class_name": "pothole",
                "confidence": float(c),
                "box_xyxy": [int(x1), int(y1), int(x2), int(y2)],
                "w_px": int(x2 - x1),
                "h_px": int(y2 - y1),
            })
    return annotated_pil, detections, elapsed_ms


def run_onnx_inference(detector, img_pil: Image.Image, conf: float, iou: float):
    """Run ONNX Runtime inference."""
    img_bgr = cv2.cvtColor(np.array(img_pil.convert("RGB")), cv2.COLOR_RGB2BGR)
    dets, elapsed_ms = detector.predict(img_bgr, conf_thresh=conf, iou_thresh=iou)
    annotated_bgr = detector.draw_detections(img_bgr, dets)
    annotated_pil = Image.fromarray(cv2.cvtColor(annotated_bgr, cv2.COLOR_BGR2RGB))

    detections = []
    for d in dets:
        x1, y1, x2, y2 = d["box_xyxy"]
        detections.append({
            "class_name": d["class_name"],
            "confidence": float(d["confidence"]),
            "box_xyxy": [int(x1), int(y1), int(x2), int(y2)],
            "w_px": int(x2 - x1),
            "h_px": int(y2 - y1),
        })
    return annotated_pil, detections, elapsed_ms


# ── Sidebar ────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("### 🛠️ Runtime Engine")
    engine_choice = st.radio(
        "Model Format",
        ["PyTorch (.pt)", "ONNX Runtime (.onnx)"],
        index=0,
        help="PyTorch uses GPU/CUDA if available. ONNX Runtime provides portable CPU-first inference."
    )

    st.markdown("### ⚙️ Detection Settings")
    conf_threshold = st.slider(
        "Confidence threshold", 0.05, 0.95, 0.25, 0.05,
        help="Lower = more sensitive. Higher = fewer, more certain detections."
    )
    iou_threshold = st.slider(
        "IoU threshold (NMS)", 0.10, 0.90, 0.45, 0.05,
        help="Non-maximum suppression overlap threshold."
    )

    if engine_choice.startswith("PyTorch"):
        img_size = st.select_slider(
            "Inference Resolution (imgsz)",
            options=[640, 800, 1024, 1280],
            value=640,
            help="Higher resolution (800 or 1024) significantly increases confidence on small or distant potholes."
        )
        boost_conf = st.checkbox(
            "⚡ TTA Confidence Boost",
            value=False,
            help="Test-Time Augmentation: evaluates multi-scale and flipped versions to boost confidence."
        )
    else:
        img_size = 640
        boost_conf = False
        st.caption("ℹ️ ONNX exported with fixed 640×640 input resolution.")

    st.divider()
    st.markdown("### 📊 Model Info")

    col_btn1, col_btn2 = st.columns(2)
    with col_btn1:
        if st.button("🔄 Reload Model", help="Clear cache and reload latest weights"):
            st.cache_resource.clear()
            st.rerun()

    active_model_path = MODEL_PT if engine_choice.startswith("PyTorch") else MODEL_ONNX
    if active_model_path.exists():
        size_mb = active_model_path.stat().st_size / 1e6
        st.success(f"✅ {engine_choice.split()[0]} loaded")
        st.caption(f"`{active_model_path.name}` ({size_mb:.1f} MB)")
    else:
        st.error(f"❌ Model not found: `{active_model_path.name}`")

    metrics = load_metrics()
    if metrics:
        cols = st.columns(2)
        if "precision" in metrics:
            cols[0].metric("Precision", f"{float(metrics.get('precision', 0)):.1%}")
        if "recall" in metrics:
            cols[1].metric("Recall", f"{float(metrics.get('recall', 0)):.1%}")
        if "map50" in metrics:
            cols[0].metric("mAP50", f"{float(metrics.get('map50', 0)):.1%}")
        if "map50_95" in metrics or "map" in metrics:
            v = metrics.get("map50_95") or metrics.get("map", 0)
            cols[1].metric("mAP50-95", f"{float(v):.1%}")

    st.divider()
    st.markdown("### 📁 Dataset")
    if MERGE_REPORT.exists():
        try:
            with open(MERGE_REPORT) as f:
                mr = json.load(f)
            v = mr.get("validation", {})
            train_n = v.get("train", {}).get("images", "?")
            val_n   = v.get("valid", {}).get("images", "?")
            test_n  = v.get("test",  {}).get("images", "?")
            st.caption(f"Train: {train_n} | Val: {val_n} | Test: {test_n}")
            total = (train_n if isinstance(train_n, int) else 0) + \
                    (val_n  if isinstance(val_n,  int) else 0) + \
                    (test_n if isinstance(test_n, int) else 0)
            if total:
                st.caption(f"Total: {total} merged images")
        except Exception:
            pass

    st.divider()
    st.caption("GeoSathi AI v2.0 | Member 3 — Road Hazard Module")


# ── Main content ───────────────────────────────────────────────────────────
st.markdown("""
<div class="hero-header">
    <div class="hero-title">🛣️ GeoSathi AI</div>
    <div class="hero-subtitle">
        Pothole Detection · Powered by YOLO11n trained on 3,210 road images
    </div>
</div>
""", unsafe_allow_html=True)

# Load model based on engine choice
is_pytorch = engine_choice.startswith("PyTorch")
active_model_path = MODEL_PT if is_pytorch else MODEL_ONNX

if not active_model_path.exists():
    st.error(
        f"**Model not found.** Expected `{active_model_path.name}` at `{active_model_path}`. "
        "Run `python scripts/train_merged.py` or `python scripts/export_onnx.py` to generate it."
    )
    st.stop()

if is_pytorch:
    model_obj, err = load_pytorch_model(str(active_model_path))
else:
    model_obj, err = load_onnx_detector(str(active_model_path))

if err:
    st.error(f"**Failed to load model:** {err}")
    st.stop()

# ── Upload area ────────────────────────────────────────────────────────────
st.markdown("### 📤 Upload Road Image")
uploaded = st.file_uploader(
    "Drag and drop or click to upload a road photo",
    type=["jpg", "jpeg", "png", "webp"],
    label_visibility="collapsed",
)

# ── Batch mode (multiple images) ───────────────────────────────────────────
st.markdown("---")
col_demo, col_batch = st.columns([1, 1])
with col_batch:
    st.markdown("**Upload multiple images:**")
    batch_files = st.file_uploader(
        "Batch upload",
        type=["jpg", "jpeg", "png", "webp"],
        accept_multiple_files=True,
        label_visibility="collapsed",
        key="batch_uploader",
    )

# ── Inference ──────────────────────────────────────────────────────────────
if uploaded is not None:
    st.divider()
    st.markdown(f"### 🔍 Detection Results ({engine_choice.split()[0]})")

    try:
        img_pil = Image.open(io.BytesIO(uploaded.read())).convert("RGB")
    except Exception as e:
        st.error(f"Cannot open image: {e}")
        st.stop()

    col_orig, col_ann = st.columns(2)
    with col_orig:
        st.markdown("**Original Image**")
        st.image(img_pil, use_container_width=True)

    with st.spinner(f"Running inference with {engine_choice.split()[0]}…"):
        try:
            if is_pytorch:
                annotated, detections, latency_ms = run_pytorch_inference(
                    model_obj, img_pil, conf_threshold, iou_threshold, imgsz=img_size, augment=boost_conf
                )
            else:
                annotated, detections, latency_ms = run_onnx_inference(
                    model_obj, img_pil, conf_threshold, iou_threshold
                )
        except Exception as e:
            st.error(f"Inference error: {e}")
            import traceback
            st.code(traceback.format_exc())
            st.stop()

    with col_ann:
        st.markdown(f"**Detections ({engine_choice.split()[0]})**")
        st.image(annotated, use_container_width=True)

    # Results summary
    n_det = len(detections)

    if n_det > 0:
        st.markdown(f"""
        <div class="detection-success">
            <b>⚠️ {n_det} pothole{"s" if n_det != 1 else ""} detected</b>
        </div>
        """, unsafe_allow_html=True)

        det_data = []
        for i, d in enumerate(detections, 1):
            x1, y1, x2, y2 = d["box_xyxy"]
            det_data.append({
                "#": i,
                "Confidence": f"{d['confidence']:.1%}",
                "X1, Y1": f"({x1}, {y1})",
                "W × H (px)": f"{d['w_px']} × {d['h_px']}",
            })
        st.dataframe(det_data, use_container_width=True, hide_index=True)
    else:
        st.markdown("""
        <div class="detection-none">
            <b>✅ No potholes detected</b> — road surface appears clear at current confidence threshold.
        </div>
        """, unsafe_allow_html=True)
        st.info(f"Try lowering the confidence threshold (currently {conf_threshold:.0%}) in the sidebar if you expect detections.")

    # Latency info
    st.caption(f"⚡ Inference latency: **{latency_ms:.1f} ms** ({1000/latency_ms:.0f} FPS equivalent) using **{engine_choice}**")

    # Download annotated image
    buf = io.BytesIO()
    annotated.save(buf, format="PNG")
    st.download_button(
        "⬇️ Download annotated image",
        data=buf.getvalue(),
        file_name=f"pothole_detected_{uploaded.name}",
        mime="image/png",
    )

# ── Batch mode results ─────────────────────────────────────────────────────
elif batch_files:
    st.divider()
    st.markdown(f"### 📦 Batch Results ({engine_choice.split()[0]}) — {len(batch_files)} images")
    prog = st.progress(0)
    summary_rows = []

    for i, bf in enumerate(batch_files):
        try:
            img = Image.open(io.BytesIO(bf.read())).convert("RGB")
            if is_pytorch:
                _, dets, lat = run_pytorch_inference(model_obj, img, conf_threshold, iou_threshold, imgsz=img_size, augment=boost_conf)
            else:
                _, dets, lat = run_onnx_inference(model_obj, img, conf_threshold, iou_threshold)

            n = len(dets)
            avg_c = np.mean([d["confidence"] for d in dets]) if n > 0 else 0
            summary_rows.append({
                "File": bf.name,
                "Potholes": n,
                "Avg Conf": f"{avg_c:.1%}" if n > 0 else "—",
                "Latency (ms)": f"{lat:.1f}",
            })
        except Exception as e:
            summary_rows.append({"File": bf.name, "Potholes": "ERROR", "Avg Conf": str(e), "Latency (ms)": "—"})
        prog.progress((i + 1) / len(batch_files))

    st.dataframe(summary_rows, use_container_width=True, hide_index=True)
    total_potholes = sum(r["Potholes"] for r in summary_rows if isinstance(r["Potholes"], int))
    affected = sum(1 for r in summary_rows if isinstance(r["Potholes"], int) and r["Potholes"] > 0)
    col1, col2, col3 = st.columns(3)
    col1.metric("Images processed", len(batch_files))
    col2.metric("Images with potholes", affected)
    col3.metric("Total potholes found", total_potholes)

else:
    # Placeholder when no image uploaded
    st.markdown("""
    <div style="text-align:center; padding:3rem 2rem; opacity:0.6;">
        <div style="font-size:4rem;">🛣️</div>
        <div style="font-size:1.1rem; margin-top:1rem; color:#a0aec0;">
            Upload a road image above to start pothole detection
        </div>
        <div style="font-size:0.85rem; margin-top:0.5rem; color:#718096;">
            Supports JPG, JPEG, PNG, WEBP
        </div>
    </div>
    """, unsafe_allow_html=True)

# ── Info expander ──────────────────────────────────────────────────────────
with st.expander("ℹ️ About this model"):
    st.markdown("""
**Architecture:** YOLO11n (Ultralytics)  
**Training dataset:** Merged — Dataset 1 (533 images, converted OBB→AABB) + Dataset 2 (2,677 images, yolov5-obb)  
**Total training images:** 2,247 (train) | 638 (val) | 325 (test)  
**Classes:** 1 — `pothole`  
**Non-pothole classes excluded:** `crocodile-crack`, `longitudinal-crack`  
**Image size:** 640×640  
**Inference device:** RTX 5050 Laptop GPU (or CPU fallback)

**Class mapping rationale:**  
Only annotations explicitly labeled `pothole` in both datasets were retained.  
Cracks, longitudinal damage, and crocodile cracks were excluded to avoid 
ambiguous ground truth and keep the model focused on actionable road hazards.

**Limitations:**  
- Small potholes (<20px at inference resolution) may be missed  
- Heavy rainfall, nighttime, or glare scenes underrepresented in training data  
- Model is not calibrated for GPS localization (Phase 2)
""")
