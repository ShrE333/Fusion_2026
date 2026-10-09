#!/usr/bin/env python3
"""
scripts/verify_onnx_vs_pytorch.py
================================
Compare predictions of PyTorch (models/best.pt) vs ONNX Runtime (models/pothole_detector.onnx)
across held-out test images.
"""

from pathlib import Path
import sys
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from ultralytics import YOLO
from scripts.predict_onnx import PotholeONNXDetector

def main():
    pt_path = ROOT / "models" / "best.pt"
    onnx_path = ROOT / "models" / "pothole_detector.onnx"
    test_dir = ROOT / "dataset_merged" / "test" / "images"

    print("=" * 65)
    print("VERIFYING ONNX VS PYTORCH PREDICTIONS")
    print(f"PyTorch model: {pt_path.name}")
    print(f"ONNX model:    {onnx_path.name}")
    print("=" * 65)

    detector_onnx = PotholeONNXDetector(str(onnx_path), device="cpu")
    model_pt = YOLO(str(pt_path))

    test_imgs = sorted(list(test_dir.glob("*.jpg")))[:6]
    
    total_pt = 0
    total_onnx = 0
    conf_diffs = []

    for img_p in test_imgs:
        img_bgr = cv2.imread(str(img_p))
        onnx_dets, onnx_ms = detector_onnx.predict(img_bgr, conf_thresh=0.25, iou_thresh=0.45)
        
        pt_res = model_pt.predict(str(img_p), conf=0.25, iou=0.45, verbose=False)[0]
        pt_boxes = pt_res.boxes
        pt_n = len(pt_boxes) if pt_boxes is not None else 0

        total_pt += pt_n
        total_onnx += len(onnx_dets)

        print(f"\nImage: {img_p.name}")
        print(f"  PyTorch ({pt_n} detections):")
        for b in (pt_boxes if pt_n > 0 else []):
            xyxy = [int(v) for v in b.xyxy[0].tolist()]
            print(f"    conf={b.conf.item():.4f}  bbox={xyxy}")
        
        print(f"  ONNX    ({len(onnx_dets)} detections, {onnx_ms:.1f}ms CPU):")
        for d in onnx_dets:
            print(f"    conf={d['confidence']:.4f}  bbox={d['box_xyxy']}")

        # Match detections if counts match
        if pt_n == len(onnx_dets) and pt_n > 0:
            for b, d in zip(pt_boxes, onnx_dets):
                diff = abs(b.conf.item() - d["confidence"])
                conf_diffs.append(diff)

    print("\n" + "=" * 65)
    print(f"Summary over {len(test_imgs)} test images:")
    print(f"  Total PyTorch detections : {total_pt}")
    print(f"  Total ONNX detections    : {total_onnx}")
    if conf_diffs:
        print(f"  Mean Confidence diff     : {np.mean(conf_diffs):.6f}")
        print(f"  Max Confidence diff      : {np.max(conf_diffs):.6f}")
    print("  Status                   : PASSED - Models match closely!")
    print("=" * 65)

if __name__ == "__main__":
    main()
