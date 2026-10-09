#!/usr/bin/env python3
"""Run pothole detection inference on a single image.

Usage:
    python scripts/predict_image.py --source "path/to/image.jpg" --conf 0.25
"""

import argparse
import os
import sys
from pathlib import Path
import cv2
import numpy as np

# Add project root to path
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from ultralytics import YOLO


def find_model_checkpoint(custom_path: str = None) -> Path:
    """Find the best available model checkpoint."""
    if custom_path:
        p = Path(custom_path)
        if p.exists():
            return p
        raise FileNotFoundError(f"Specified model checkpoint not found: {custom_path}")

    # Standard model location
    canonical_model = ROOT_DIR / "models" / "best.pt"
    if canonical_model.exists():
        return canonical_model

    # Check runs directory for any best.pt
    run_candidates = list((ROOT_DIR / "runs").rglob("best.pt"))
    if run_candidates:
        # Pick the most recently modified one
        run_candidates.sort(key=lambda x: x.stat().st_mtime, reverse=True)
        return run_candidates[0]

    raise FileNotFoundError(
        "No trained model checkpoint found in models/best.pt or runs/**/best.pt. "
        "Please train the model first using scripts/train.py"
    )


def predict(
    image_path: str,
    model_path: str = None,
    conf_thresh: float = 0.25,
    output_dir: str = "outputs",
    save_annotated: bool = True,
    device: str = ""
):
    """Run inference on a single image and save the annotated result."""
    img_path = Path(image_path)
    if not img_path.exists():
        print(f"Error: Image file does not exist: {image_path}", file=sys.stderr)
        return []

    checkpoint = find_model_checkpoint(model_path)
    print(f"Loading model checkpoint: {checkpoint}")

    model = YOLO(str(checkpoint))

    # Read image to verify integrity
    img_bgr = cv2.imread(str(img_path))
    if img_bgr is None:
        print(f"Error: Unable to read image file: {image_path}", file=sys.stderr)
        return []

    h, w = img_bgr.shape[:2]
    print(f"Processing image: {img_path.name} ({w}x{h})")

    kwargs = {"conf": conf_thresh, "verbose": False}
    if device:
        kwargs["device"] = device

    results = model.predict(source=str(img_path), **kwargs)
    result = results[0]

    detections = []
    boxes = result.boxes

    print("\n" + "=" * 50)
    print(f"Detection Results: {len(boxes)} pothole(s) detected (confidence >= {conf_thresh:.2f})")
    print("=" * 50)

    for i, box in enumerate(boxes):
        xyxy = box.xyxy[0].cpu().numpy().tolist()
        conf = float(box.conf[0].cpu().numpy())
        cls_id = int(box.cls[0].cpu().numpy())
        cls_name = model.names.get(cls_id, f"class_{cls_id}")

        x1, y1, x2, y2 = xyxy
        det_info = {
            "index": i + 1,
            "class": cls_name,
            "confidence": conf,
            "box": [round(x, 1) for x in [x1, y1, x2, y2]],
            "center": [round((x1 + x2) / 2.0, 1), round((y1 + y2) / 2.0, 1)],
            "dimensions": [round(x2 - x1, 1), round(y2 - y1, 1)],
        }
        detections.append(det_info)

        print(
            f"[{i+1}] {cls_name.upper()} | Conf: {conf*100:.1f}% | "
            f"BBox: [{x1:.1f}, {y1:.1f}, {x2:.1f}, {y2:.1f}] | "
            f"Size: {x2-x1:.1f}x{y2-y1:.1f}px"
        )

    if len(detections) == 0:
        print("No potholes detected above the confidence threshold.")

    if save_annotated:
        out_dir = ROOT_DIR / output_dir
        out_dir.mkdir(parents=True, exist_ok=True)
        out_filename = f"pred_{img_path.stem}.jpg"
        out_path = out_dir / out_filename

        # Save annotated image using ultralytics plot
        annotated_bgr = result.plot()
        cv2.imwrite(str(out_path), annotated_bgr)
        print(f"\nAnnotated image saved to: {out_path}")

    return detections


def main():
    parser = argparse.ArgumentParser(description="Run pothole detection on an image")
    parser.add_argument("--source", "--image", "-i", dest="source", type=str, required=True,
                        help="Path to the input image")
    parser.add_argument("--model", "-m", type=str, default=None,
                        help="Path to YOLO model checkpoint (default: models/best.pt)")
    parser.add_argument("--conf", "-c", type=float, default=0.25,
                        help="Confidence threshold (default: 0.25)")
    parser.add_argument("--output", "-o", type=str, default="outputs",
                        help="Directory to save annotated images (default: outputs)")
    parser.add_argument("--device", "-d", type=str, default="",
                        help="Inference device ('cpu', '0', etc.)")
    parser.add_argument("--no-save", action="store_true",
                        help="Do not save annotated output image")

    args = parser.parse_args()

    try:
        predict(
            image_path=args.source,
            model_path=args.model,
            conf_thresh=args.conf,
            output_dir=args.output,
            save_annotated=not args.no_save,
            device=args.device
        )
    except Exception as e:
        print(f"Inference failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
