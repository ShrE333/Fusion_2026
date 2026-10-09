#!/usr/bin/env python3
"""Train YOLOv8 model on pothole detection dataset."""

import os
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from ultralytics import YOLO
import torch
import yaml
import json
from datetime import datetime
import matplotlib.pyplot as plt
import numpy as np


def setup_directories():
    """Create necessary directories."""
    directories = [
        "models",
        "runs",
        "reports",
        "outputs",
        "plots"
    ]
    for dir_path in directories:
        Path(dir_path).mkdir(parents=True, exist_ok=True)


def load_data_config():
    """Load dataset configuration."""
    with open("dataset/data.yaml", "r") as f:
        data_config = yaml.safe_load(f)
    return data_config


def train_model(
    model_name: str = "yolo11n.pt",
    epochs: int = 50,
    batch_size: int = 16,
    image_size: int = 640,
    patience: int = 10,
    seed: int = 42,
    device: str = "",  # empty string auto-detects GPU/CPU
    resume: bool = False,
    checkpoint: str = ""
):
    """Train the YOLO model."""

    print("=" * 50)
    print("Starting Pothole Detection Model Training")
    print("=" * 50)

    # Setup directories
    setup_directories()

    # Set seeds for reproducibility
    torch.manual_seed(seed)
    np.random.seed(seed)

    # Check device availability
    if device == "":
        device = "0" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {device}")
    if device != "cpu" and torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        print(f"CUDA Version: {torch.version.cuda}")

    # Load data config
    data_config = load_data_config()
    print(f"Dataset path: {data_config.get('path')}")
    print(f"Classes: {data_config.get('names')}")

    if resume and checkpoint:
        print(f"Resuming training from checkpoint: {checkpoint}")
        model = YOLO(checkpoint)
        results = model.train(resume=True)
    else:
        # Load pretrained model
        print(f"Loading pretrained model: {model_name}")
        model = YOLO(model_name)

        # Training parameters
        train_args = {
            "data": "dataset/data.yaml",
            "epochs": epochs,
            "batch": batch_size,
            "imgsz": image_size,
            "patience": patience,
            "seed": seed,
            "device": device,
            "project": "runs/train",
            "name": "pothole_detection_" + datetime.now().strftime("%Y%m%d_%H%M%S"),
            "exist_ok": False,
            "verbose": True,
            "save": True,
            "save_period": -1,
            "cache": False,
            "workers": 2,
            "amp": True,
            "fraction": 1.0,
            "single_cls": False,
            "deterministic": True,
            "plots": True,
        }

        # Start training
        print("\nStarting training...")
        results = model.train(**train_args)

    # Get the best model path
    save_dir = Path(results.save_dir) if hasattr(results, 'save_dir') else Path("runs/train").glob("pothole_detection_*")
    if not isinstance(save_dir, Path):
        runs = sorted(list(save_dir), key=lambda p: p.stat().st_mtime, reverse=True)
        save_dir = runs[0] if runs else Path("runs/train")

    best_model_path = save_dir / "weights" / "best.pt"
    print(f"\nBest model saved to: {best_model_path}")

    # Copy best model to models directory
    import shutil
    models_dir = Path("models")
    models_dir.mkdir(exist_ok=True)
    final_best_path = models_dir / "best.pt"
    if best_model_path.exists():
        shutil.copy2(best_model_path, final_best_path)
        print(f"Copied best model to: {final_best_path}")

    # Save training results summary
    metrics_dict = {}
    if hasattr(results, 'results_dict') and isinstance(results.results_dict, dict):
        for k, v in results.results_dict.items():
            metrics_dict[k] = float(v) if isinstance(v, (int, float, np.floating, np.integer)) else str(v)
    elif hasattr(results, 'box'):
        metrics_dict["precision"] = float(getattr(results.box, 'mp', 0.0))
        metrics_dict["recall"] = float(getattr(results.box, 'mr', 0.0))
        metrics_dict["map50"] = float(getattr(results.box, 'map50', 0.0))
        metrics_dict["map"] = float(getattr(results.box, 'map', 0.0))

    results_dict = {
        "model": str(model_name),
        "epochs": epochs,
        "batch_size": batch_size,
        "image_size": image_size,
        "dataset": data_config.get("path"),
        "classes": data_config.get("names"),
        "best_model": str(final_best_path),
        "results_dir": str(save_dir),
        "metrics": metrics_dict
    }

    # Save results to JSON
    reports_dir = Path("reports")
    reports_dir.mkdir(exist_ok=True)
    results_file = reports_dir / f"training_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(results_file, 'w') as f:
        json.dump(results_dict, f, indent=2)
    print(f"Training results saved to: {results_file}")

    # Plot and save training curves if available
    try:
        plot_training_results(str(save_dir))
    except Exception as e:
        print(f"Could not plot training results: {e}")

    print("\n" + "=" * 50)
    print("Training Complete!")
    print(f"Best model: {final_best_path}")
    print("=" * 50)

    return str(final_best_path), results


def plot_training_results(save_dir: str):
    """Plot training metrics from results."""
    save_path = Path(save_dir)
    results_csv = save_path / "results.csv"

    if not results_csv.exists():
        print("No results.csv found for plotting")
        return

    import pandas as pd

    # Read results
    df = pd.read_csv(results_csv)

    # Create plots
    fig, axes = plt.subplots(2, 2, figsize=(12, 10))
    fig.suptitle('Training Metrics', fontsize=16)

    # Plot losses
    axes[0, 0].plot(df['epoch'], df['train/box_loss'], label='Box Loss')
    axes[0, 0].plot(df['epoch'], df['train/cls_loss'], label='CLS Loss')
    axes[0, 0].plot(df['epoch'], df['train/dfl_loss'], label='DFL Loss')
    axes[0, 0].set_xlabel('Epoch')
    axes[0, 0].set_ylabel('Loss')
    axes[0, 0].set_title('Training Losses')
    axes[0, 0].legend()
    axes[0, 0].grid(True, alpha=0.3)

    # Plot validation metrics
    axes[0, 1].plot(df['epoch'], df['metrics/precision'], label='Precision')
    axes[0, 1].plot(df['epoch'], df['metrics/recall'], label='Recall')
    axes[0, 1].set_xlabel('Epoch')
    axes[0, 1].set_ylabel('Score')
    axes[0, 1].set_title('Validation Metrics')
    axes[0, 1].legend()
    axes[0, 1].grid(True, alpha=0.3)

    # Plot mAP
    axes[1, 0].plot(df['epoch'], df['metrics/mAP_0.5'], label='mAP@0.5')
    axes[1, 0].plot(df['epoch'], df['metrics/mAP_0.5:0.95'], label='mAP@0.5:0.95')
    axes[1, 0].set_xlabel('Epoch')
    axes[1, 0].set_ylabel('mAP')
    axes[1, 0].set_title('mAP Metrics')
    axes[1, 0].legend()
    axes[1, 0].grid(True, alpha=0.3)

    # Plot learning rate
    if 'lr/pg0' in df.columns:
        axes[1, 1].plot(df['epoch'], df['lr/pg0'], label='LR pg0')
    if 'lr/pg1' in df.columns:
        axes[1, 1].plot(df['epoch'], df['lr/pg1'], label='LR pg1')
    if 'lr/pg2' in df.columns:
        axes[1, 1].plot(df['epoch'], df['lr/pg2'], label='LR pg2')
    axes[1, 1].set_xlabel('Epoch')
    axes[1, 1].set_ylabel('Learning Rate')
    axes[1, 1].set_title('Learning Rate')
    axes[1, 1].legend()
    axes[1, 1].grid(True, alpha=0.3)

    plt.tight_layout()

    # Save plot
    plots_dir = Path("plots")
    plots_dir.mkdir(exist_ok=True)
    plot_file = plots_dir / f"training_curves_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
    plt.savefig(plot_file, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"Training curves saved to: {plot_file}")


def main():
    """Main training function."""
    import argparse

    parser = argparse.ArgumentParser(description="Train YOLO model for pothole detection")
    parser.add_argument("--model", type=str, default="yolo11n.pt", help="Pretrained model to use")
    parser.add_argument("--epochs", type=int, default=50, help="Number of training epochs")
    parser.add_argument("--batch", type=int, default=16, help="Batch size")
    parser.add_argument("--imgsz", type=int, default=640, help="Image size")
    parser.add_argument("--patience", type=int, default=10, help="Early stopping patience")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument("--device", type=str, default="", help="Device to use (empty for auto)")
    parser.add_argument("--resume", action="store_true", help="Resume training")
    parser.add_argument("--checkpoint", type=str, default="", help="Path to checkpoint to resume from")

    args = parser.parse_args()

    try:
        best_model_path, results = train_model(
            model_name=args.model,
            epochs=args.epochs,
            batch_size=args.batch,
            image_size=args.imgsz,
            patience=args.patience,
            seed=args.seed,
            device=args.device,
            resume=args.resume,
            checkpoint=args.checkpoint
        )
        print(f"\nTraining completed successfully!")
        print(f"Best model: {best_model_path}")
        return 0
    except Exception as e:
        print(f"\nTraining failed with error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())