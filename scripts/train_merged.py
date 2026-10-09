#!/usr/bin/env python3
"""
scripts/train_merged.py
=======================
Train YOLO11n on the merged pothole dataset (dataset_merged/).
Supports fresh training only (resume from last.pt not needed here since
merged dataset is new).

Usage:
    python scripts/train_merged.py [--epochs 60] [--batch 16] [--device 0]
"""

import argparse
import json
import os
import sys
import shutil
import numpy as np
import torch
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from ultralytics import YOLO


def setup_dirs():
    for d in ("models", "runs", "reports", "outputs", "plots"):
        (ROOT / d).mkdir(parents=True, exist_ok=True)


def train(
    model_name: str = "yolo11n.pt",
    data_yaml: str = "dataset_merged/data.yaml",
    epochs: int = 60,
    batch: int = 16,
    imgsz: int = 640,
    patience: int = 15,
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
        print(f"GPU: {torch.cuda.get_device_name(0)}  CUDA {torch.version.cuda}")

    data_path = ROOT / data_yaml
    if not data_path.exists():
        raise FileNotFoundError(f"data.yaml not found: {data_path}")

    # Determine model weight source
    local_yolo = ROOT / "yolo11n.pt"
    model_src = str(local_yolo) if local_yolo.exists() else model_name
    print(f"Loading pretrained weights: {model_src}")
    model = YOLO(model_src)

    if not run_name:
        run_name = "pothole_merged_" + datetime.now().strftime("%Y%m%d_%H%M%S")

    train_args = {
        "data": str(data_path),
        "epochs": epochs,
        "batch": batch,
        "imgsz": imgsz,
        "patience": patience,
        "seed": seed,
        "device": device,
        "project": str(ROOT / "runs" / "train"),
        "name": run_name,
        "exist_ok": False,
        "verbose": True,
        "save": True,
        "save_period": 10,      # checkpoint every 10 epochs
        "cache": False,
        "workers": 4,
        "amp": True,
        "deterministic": True,
        "plots": True,
        # Augmentation tuned for road imagery
        "hsv_h": 0.015,
        "hsv_s": 0.5,
        "hsv_v": 0.3,
        "fliplr": 0.5,
        "flipud": 0.0,
        "mosaic": 1.0,
        "mixup": 0.05,
        "degrees": 5.0,         # slight rotation for camera tilt
        "translate": 0.1,
        "scale": 0.4,
        "shear": 2.0,
        "perspective": 0.0,
        "erasing": 0.3,
        "auto_augment": "randaugment",
        "copy_paste": 0.0,
        # Loss weights
        "box": 7.5,
        "cls": 0.5,
        "dfl": 1.5,
        # Optimizer
        "optimizer": "auto",
        "lr0": 0.01,
        "lrf": 0.01,
        "momentum": 0.937,
        "weight_decay": 0.0005,
        "warmup_epochs": 3.0,
        "warmup_momentum": 0.8,
        "warmup_bias_lr": 0.1,
        "nbs": 64,
    }

    print(f"\nStarting training: {run_name}")
    print(f"  Epochs: {epochs}  Batch: {batch}  imgsz: {imgsz}  Patience: {patience}")
    results = model.train(**train_args)

    save_dir = Path(results.save_dir)
    best_pt = save_dir / "weights" / "best.pt"
    last_pt = save_dir / "weights" / "last.pt"

    # Copy to canonical model paths
    models_dir = ROOT / "models"
    if best_pt.exists():
        shutil.copy2(best_pt, models_dir / "best.pt")
        print(f"Copied best.pt -> models/best.pt")
    if last_pt.exists():
        shutil.copy2(last_pt, models_dir / "last.pt")
        print(f"Copied last.pt -> models/last.pt")

    # Extract and save metrics
    metrics_dict: dict = {}
    try:
        if hasattr(results, "results_dict") and results.results_dict:
            for k, v in results.results_dict.items():
                try:
                    metrics_dict[k] = float(v)
                except Exception:
                    metrics_dict[k] = str(v)
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

    training_summary = {
        "model": model_src,
        "data": str(data_path),
        "epochs": epochs,
        "batch": batch,
        "imgsz": imgsz,
        "patience": patience,
        "device": device,
        "run_name": run_name,
        "save_dir": str(save_dir),
        "best_pt": str(models_dir / "best.pt"),
        "last_pt": str(models_dir / "last.pt"),
        "timestamp": datetime.now().isoformat(),
        "val_metrics": metrics_dict,
    }

    report_path = ROOT / "reports" / "training_merged.json"
    with open(report_path, "w") as f:
        json.dump(training_summary, f, indent=2)
    print(f"Training report saved to: {report_path}")

    print("\n" + "=" * 60)
    print("Training COMPLETE")
    print(f"  best.pt : models/best.pt")
    print(f"  last.pt : models/last.pt")
    if metrics_dict:
        for k, v in metrics_dict.items():
            if isinstance(v, float):
                print(f"  {k}: {v:.4f}")
    print("=" * 60)
    return str(models_dir / "best.pt"), results


def main():
    parser = argparse.ArgumentParser(description="Train YOLO11n on merged pothole dataset")
    parser.add_argument("--model", default="yolo11n.pt")
    parser.add_argument("--data", default="dataset_merged/data.yaml")
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--patience", type=int, default=15)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", default="")
    parser.add_argument("--run-name", default="")
    args = parser.parse_args()

    try:
        best, _ = train(
            model_name=args.model,
            data_yaml=args.data,
            epochs=args.epochs,
            batch=args.batch,
            imgsz=args.imgsz,
            patience=args.patience,
            seed=args.seed,
            device=args.device,
            run_name=args.run_name,
        )
        print(f"\nBest model: {best}")
        return 0
    except Exception as exc:
        print(f"\nTraining failed: {exc}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
