#!/usr/bin/env python3
"""
scripts/train_high_precision.py
===============================
Fine-tune YOLO11n on dataset_merged/ specifically optimized for HIGH PRECISION.

Key optimizations to maximize precision:
1. Increased classification loss weight (cls: 1.2 vs standard 0.5) to severely penalize false positives.
2. Fine-tuning from existing trained checkpoint (models/best.pt) with conservative learning rate (lr0: 0.003).
3. Disables mosaic augmentation in the final 10 epochs (close_mosaic: 10) so the model trains on intact, realistic road textures.
4. Slightly increased box loss (box: 8.0) and dfl loss (dfl: 1.5) for tight, accurate bounding boxes.
5. Saves to models/best_high_precision.pt and produces detailed precision evaluation metrics.

Usage:
    python scripts/train_high_precision.py [--epochs 25] [--batch 16] [--device 0]
"""

import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
import torch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from ultralytics import YOLO


def setup_dirs():
    for d in ("models", "runs", "reports", "outputs", "plots"):
        (ROOT / d).mkdir(parents=True, exist_ok=True)


def train_high_precision(
    base_model: str = "models/best.pt",
    data_yaml: str = "dataset_merged/data.yaml",
    epochs: int = 25,
    batch: int = 16,
    imgsz: int = 640,
    patience: int = 10,
    seed: int = 42,
    device: str = "",
    run_name: str = "",
):
    setup_dirs()

    torch.manual_seed(seed)
    np.random.seed(seed)

    if not device:
        device = "0" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device}")
    if device != "cpu" and torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)} | CUDA {torch.version.cuda}")

    data_path = ROOT / data_yaml
    if not data_path.exists():
        raise FileNotFoundError(f"data.yaml not found: {data_path}")

    # Fallback to local or default if models/best.pt not found
    model_src = ROOT / base_model
    if not model_src.exists():
        model_src = ROOT / "yolo11n.pt"
    print(f"Loading initial checkpoint: {model_src}")
    model = YOLO(str(model_src))

    if not run_name:
        run_name = "pothole_high_precision_" + datetime.now().strftime("%Y%m%d_%H%M%S")

    # High-precision tuned hyperparameters
    train_args = {
        "data": str(data_path),
        "epochs": epochs,
        "batch": batch,
        "imgsz": imgsz,
        "patience": patience,
        "seed": seed,
        "device": device,
        "project": str(ROOT / "runs" / "train_precision"),
        "name": run_name,
        "exist_ok": False,
        "verbose": True,
        "save": True,
        "save_period": 5,
        "cache": False,
        "workers": 4,
        "amp": True,
        "deterministic": True,
        "plots": True,
        # Turn off mosaic for final epochs to train on clean, realistic road textures
        "close_mosaic": 10,
        # Loss weights tuned to suppress false positives (higher cls weight)
        "box": 8.0,
        "cls": 1.2,        # 2.4x higher than standard 0.5 to strongly penalize false alarms
        "dfl": 1.5,
        # Fine-tuning learning rate schedule
        "optimizer": "auto",
        "lr0": 0.003,      # gentler learning rate for fine-tuning
        "lrf": 0.01,
        "momentum": 0.937,
        "weight_decay": 0.0005,
        "warmup_epochs": 2.0,
    }

    print(f"\nStarting High-Precision Fine-Tuning: {run_name}")
    print(f"  Base weights: {model_src.name}")
    print(f"  Epochs: {epochs} | Batch: {batch} | Imgsz: {imgsz}")
    print(f"  Classification Penalty: cls=1.2 (enhanced false-positive suppression)")
    results = model.train(**train_args)

    save_dir = Path(results.save_dir)
    best_pt = save_dir / "weights" / "best.pt"

    models_dir = ROOT / "models"
    target_pt = models_dir / "best_high_precision.pt"
    if best_pt.exists():
        shutil.copy2(best_pt, target_pt)
        print(f"Copied {best_pt} -> {target_pt}")

    # Extract metrics
    metrics_dict = {}
    try:
        if hasattr(results, "results_dict") and results.results_dict:
            for k, v in results.results_dict.items():
                metrics_dict[k] = float(v)
        elif hasattr(results, "box"):
            b = results.box
            metrics_dict = {
                "precision": float(b.mp),
                "recall": float(b.mr),
                "map50": float(b.map50),
                "map": float(b.map),
            }
    except Exception as e:
        print(f"Warning: could not extract metrics: {e}")

    summary = {
        "model": str(model_src),
        "data": str(data_path),
        "epochs": epochs,
        "batch": batch,
        "imgsz": imgsz,
        "device": device,
        "run_name": run_name,
        "save_dir": str(save_dir),
        "best_high_precision_pt": str(target_pt),
        "timestamp": datetime.now().isoformat(),
        "metrics": metrics_dict,
    }

    report_path = ROOT / "reports" / "high_precision_training.json"
    with open(report_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"High-precision report saved to: {report_path}")

    return str(target_pt), results


def main():
    parser = argparse.ArgumentParser(description="Train YOLO11n for High Precision")
    parser.add_argument("--base-model", default="models/best.pt")
    parser.add_argument("--data", default="dataset_merged/data.yaml")
    parser.add_argument("--epochs", type=int, default=25)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--patience", type=int, default=10)
    parser.add_argument("--device", default="")
    args = parser.parse_args()

    train_high_precision(
        base_model=args.base_model,
        data_yaml=args.data,
        epochs=args.epochs,
        batch=args.batch,
        imgsz=args.imgsz,
        patience=args.patience,
        device=args.device,
    )


if __name__ == "__main__":
    main()
