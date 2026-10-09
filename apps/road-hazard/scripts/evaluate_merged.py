#!/usr/bin/env python3
"""
scripts/evaluate_merged.py
===========================
Evaluate the best.pt model on the merged test split (dataset_merged/test).
Produces:
  - reports/evaluation_report.md
  - reports/metrics.json
  - outputs/  (sample annotated images)

Usage:
    python scripts/evaluate_merged.py [--model models/best.pt] [--conf 0.25]
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from ultralytics import YOLO


def evaluate(model_path: str = "models/best.pt", conf: float = 0.25, iou: float = 0.45):
    model_p = ROOT / model_path
    if not model_p.exists():
        raise FileNotFoundError(f"Model not found: {model_p}")

    data_yaml = ROOT / "dataset_merged" / "data.yaml"
    if not data_yaml.exists():
        # Fall back to original dataset if merged doesn't exist
        data_yaml = ROOT / "dataset" / "data.yaml"
        print(f"[Warning] dataset_merged not found, using {data_yaml}")

    device = "0" if torch.cuda.is_available() else "cpu"
    print(f"Loading model: {model_p}")
    print(f"Data config:   {data_yaml}")
    print(f"Device:        {device}")
    print(f"Conf thresh:   {conf}  IoU thresh: {iou}")

    model = YOLO(str(model_p))

    print("\nRunning validation on test split...")
    results = model.val(
        data=str(data_yaml),
        split="test",
        imgsz=640,
        conf=conf,
        iou=iou,
        device=device,
        save_json=False,
        plots=True,
        verbose=True,
        project=str(ROOT / "runs" / "evaluate_merged"),
        name=f"eval_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
    )

    # Extract metrics
    box = results.box
    metrics = {
        "precision": float(box.mp),
        "recall": float(box.mr),
        "map50": float(box.map50),
        "map50_95": float(box.map),
    }

    # Speed info
    speed = {
        "preprocess_ms": float(results.speed.get("preprocess", 0)),
        "inference_ms": float(results.speed.get("inference", 0)),
        "postprocess_ms": float(results.speed.get("postprocess", 0)),
    }
    total_ms = sum(speed.values())
    fps = 1000.0 / total_ms if total_ms > 0 else 0.0

    print("\n" + "=" * 55)
    print("EVALUATION RESULTS (Test Split)")
    print("=" * 55)
    for k, v in metrics.items():
        print(f"  {k:12s}: {v:.4f}  ({v:.1%})")
    print(f"  Latency (ms): {total_ms:.1f}  FPS: {fps:.1f}")
    print("=" * 55)

    # Save metrics.json
    metrics_json = {
        "model": str(model_p),
        "data": str(data_yaml),
        "split": "test",
        "conf_threshold": conf,
        "iou_threshold": iou,
        "metrics": metrics,
        "latency_ms": {**speed, "total_ms": total_ms, "fps": fps},
        "timestamp": datetime.now().isoformat(),
    }
    metrics_path = ROOT / "reports" / "metrics.json"
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    with open(metrics_path, "w") as f:
        json.dump(metrics_json, f, indent=2)
    print(f"Metrics saved: {metrics_path}")

    # Save evaluation_report.md
    report_path = ROOT / "reports" / "evaluation_report.md"
    report = f"""# GeoSathi AI — Pothole Detection Evaluation Report
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## Model
| Field | Value |
|-------|-------|
| Architecture | YOLO11n (Ultralytics) |
| Weights | `{model_p.name}` |
| Inference device | {'CUDA (GPU)' if device != 'cpu' else 'CPU'} |
| Image size | 640 × 640 |

## Dataset
| Split | Description |
|-------|-------------|
| Source | Merged DS1 (533 imgs) + DS2 (2,677 imgs) |
| Test split | `dataset_merged/test` |
| Classes | 1 — `pothole` |
| Conf threshold | {conf} |
| IoU (NMS) threshold | {iou} |

## Test-Set Metrics
| Metric | Value |
|--------|-------|
| Precision | {metrics['precision']:.4f} ({metrics['precision']:.1%}) |
| Recall | {metrics['recall']:.4f} ({metrics['recall']:.1%}) |
| mAP@0.5 | {metrics['map50']:.4f} ({metrics['map50']:.1%}) |
| mAP@0.5:0.95 | {metrics['map50_95']:.4f} ({metrics['map50_95']:.1%}) |

## Latency
| Stage | Time (ms) |
|-------|-----------|
| Preprocess | {speed['preprocess_ms']:.2f} |
| Inference | {speed['inference_ms']:.2f} |
| Postprocess | {speed['postprocess_ms']:.2f} |
| **Total** | **{total_ms:.2f}** |
| FPS (equivalent) | {fps:.1f} |

## Limitations & Next Steps
1. Small potholes (<20px at 640px resolution) may have lower recall.
2. Night / heavy rain / glare conditions are underrepresented in training data.
3. Phase 2: GPS-based geolocation and incident reporting.
4. Phase 3: Repair-quality assessment model (separate task).
"""
    report_path.write_text(report, encoding="utf-8")
    print(f"Report saved:  {report_path}")
    return metrics


def main():
    parser = argparse.ArgumentParser(description="Evaluate merged pothole model on test split")
    parser.add_argument("--model", default="models/best.pt")
    parser.add_argument("--conf", type=float, default=0.25)
    parser.add_argument("--iou",  type=float, default=0.45)
    args = parser.parse_args()
    evaluate(args.model, args.conf, args.iou)


if __name__ == "__main__":
    main()
