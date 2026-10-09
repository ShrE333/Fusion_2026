#!/usr/bin/env python3
"""
scripts/predict_onnx.py
======================
Run inference using ONNX Runtime on road images with models/pothole_detector.onnx.

Features:
- Pure ONNX Runtime execution (CPU-first, optional CUDA)
- Letterbox image preprocessing matching YOLO training pipeline
- NMS postprocessing via cv2.dnn.NMSBoxes
- Annotates bounding boxes, confidence percentage, and labels
- Saves output image to disk
- CLI interface with configurable confidence and IoU thresholds

Usage:
    python scripts/predict_onnx.py --image path/to/road.jpg [--conf 0.25] [--output outputs/pred.jpg]
"""

import argparse
import sys
import time
from pathlib import Path
from typing import List, Tuple, Dict, Any

import cv2
import numpy as np
import onnxruntime as ort

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MODEL = ROOT / "models" / "pothole_detector.onnx"
DEFAULT_OUTPUT_DIR = ROOT / "outputs"


def letterbox(
    img: np.ndarray,
    new_shape: Tuple[int, int] = (640, 640),
    color: Tuple[int, int, int] = (114, 114, 114),
) -> Tuple[np.ndarray, float, Tuple[float, float]]:
    """Resize and pad image while meeting stride-multiple constraints."""
    shape = img.shape[:2]  # [height, width]
    if isinstance(new_shape, int):
        new_shape = (new_shape, new_shape)

    # Scale ratio (new / old)
    r = min(new_shape[0] / shape[0], new_shape[1] / shape[1])

    # Compute padding
    new_unpad = int(round(shape[1] * r)), int(round(shape[0] * r))
    dw, dh = new_shape[1] - new_unpad[0], new_shape[0] - new_unpad[1]
    dw /= 2  # divide padding into 2 sides
    dh /= 2

    if shape[::-1] != new_unpad:
        img = cv2.resize(img, new_unpad, interpolation=cv2.INTER_LINEAR)

    top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
    left, right = int(round(dw - 0.1)), int(round(dw + 0.1))
    img = cv2.copyMakeBorder(img, top, bottom, left, right, cv2.BORDER_CONSTANT, value=color)
    return img, r, (dw, dh)


class PotholeONNXDetector:
    """Standalone ONNX Runtime detector for pothole detection."""

    def __init__(self, model_path: str = str(DEFAULT_MODEL), device: str = "cpu"):
        self.model_path = Path(model_path)
        if not self.model_path.exists():
            raise FileNotFoundError(f"ONNX model file not found: {self.model_path}")

        providers = ["CPUExecutionProvider"]
        if device.lower() in ("gpu", "cuda") and "CUDAExecutionProvider" in ort.get_available_providers():
            providers.insert(0, "CUDAExecutionProvider")

        self.session = ort.InferenceSession(str(self.model_path), providers=providers)
        self.input_name = self.session.get_inputs()[0].name
        self.input_shape = self.session.get_inputs()[0].shape
        self.img_size = (self.input_shape[2], self.input_shape[3]) if len(self.input_shape) == 4 else (640, 640)
        self.output_names = [o.name for o in self.session.get_outputs()]

        # Metadata
        self.class_names = ["pothole"]

    def preprocess(self, img_bgr: np.ndarray) -> Tuple[np.ndarray, float, Tuple[float, float]]:
        """Preprocess BGR image to normalized NCHW tensor."""
        padded_img, ratio, (pad_w, pad_h) = letterbox(img_bgr, new_shape=self.img_size)
        img_rgb = cv2.cvtColor(padded_img, cv2.COLOR_BGR2RGB)
        tensor = img_rgb.transpose(2, 0, 1).astype(np.float32) / 255.0
        tensor = np.expand_dims(tensor, axis=0)
        return tensor, ratio, (pad_w, pad_h)

    def postprocess(
        self,
        raw_outputs: List[np.ndarray],
        ratio: float,
        pad: Tuple[float, float],
        orig_shape: Tuple[int, int],
        conf_thresh: float = 0.25,
        iou_thresh: float = 0.45,
    ) -> List[Dict[str, Any]]:
        """Convert raw YOLO ONNX outputs to bounding box detections."""
        preds = raw_outputs[0]  # shape typically (1, 5, 8400) or (1, 8400, 5)

        if len(preds.shape) == 3 and preds.shape[1] < preds.shape[2]:
            preds = np.transpose(preds[0], (1, 0))  # -> (8400, 5)
        elif len(preds.shape) == 3:
            preds = preds[0]

        boxes = []
        confidences = []
        class_ids = []

        pad_w, pad_h = pad
        orig_h, orig_w = orig_shape

        for row in preds:
            cx, cy, w, h = row[:4]
            # Class scores
            scores = row[4:]
            class_id = int(np.argmax(scores))
            score = float(scores[class_id])

            if score >= conf_thresh:
                # Convert center xywh to top-left xywh on original image
                x1 = (cx - w / 2 - pad_w) / ratio
                y1 = (cy - h / 2 - pad_h) / ratio
                box_w = w / ratio
                box_h = h / ratio

                # Clip to original image boundaries
                x1 = max(0, min(orig_w, x1))
                y1 = max(0, min(orig_h, y1))
                box_w = max(1, min(orig_w - x1, box_w))
                box_h = max(1, min(orig_h - y1, box_h))

                boxes.append([int(x1), int(y1), int(box_w), int(box_h)])
                confidences.append(float(score))
                class_ids.append(class_id)

        if not boxes:
            return []

        # Non-Maximum Suppression
        indices = cv2.dnn.NMSBoxes(boxes, confidences, conf_thresh, iou_thresh)
        if len(indices) == 0:
            return []

        if isinstance(indices, np.ndarray):
            indices = indices.flatten()

        detections = []
        for idx in indices:
            x, y, w, h = boxes[idx]
            c = confidences[idx]
            cid = class_ids[idx]
            name = self.class_names[cid] if cid < len(self.class_names) else f"class_{cid}"
            detections.append({
                "box_xywh": [x, y, w, h],
                "box_xyxy": [x, y, x + w, y + h],
                "confidence": c,
                "class_id": cid,
                "class_name": name,
            })

        return detections

    def predict(
        self,
        img_bgr: np.ndarray,
        conf_thresh: float = 0.25,
        iou_thresh: float = 0.45,
    ) -> Tuple[List[Dict[str, Any]], float]:
        """Run end-to-end inference on a BGR image."""
        t0 = time.perf_counter()
        orig_shape = img_bgr.shape[:2]
        tensor, ratio, pad = self.preprocess(img_bgr)
        outputs = self.session.run(self.output_names, {self.input_name: tensor})
        detections = self.postprocess(outputs, ratio, pad, orig_shape, conf_thresh, iou_thresh)
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        return detections, elapsed_ms

    def draw_detections(self, img_bgr: np.ndarray, detections: List[Dict[str, Any]]) -> np.ndarray:
        """Annotate bounding boxes and labels on image."""
        annotated = img_bgr.copy()
        for det in detections:
            x1, y1, x2, y2 = det["box_xyxy"]
            conf = det["confidence"]
            label = f"{det['class_name']} {conf:.1%}"

            # Box styling: Vibrant hazard orange
            color = (0, 140, 255)
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

            # Label badge
            (tw, th), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
            y_badge = max(y1, th + baseline + 4)
            cv2.rectangle(
                annotated,
                (x1, y_badge - th - baseline - 4),
                (x1 + tw + 6, y_badge + 2),
                color,
                -1,
            )
            cv2.putText(
                annotated,
                label,
                (x1 + 3, y_badge - 2),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (255, 255, 255),
                1,
                cv2.LINE_AA,
            )
        return annotated


def main():
    parser = argparse.ArgumentParser(description="GeoSathi AI - Pothole ONNX Predictor")
    parser.add_argument("--image", "-i", type=str, required=True, help="Path to input image")
    parser.add_argument("--model", "-m", type=str, default=str(DEFAULT_MODEL), help="Path to ONNX model")
    parser.add_argument("--conf", "-c", type=float, default=0.25, help="Confidence threshold (default: 0.25)")
    parser.add_argument("--iou", type=float, default=0.45, help="IoU NMS threshold (default: 0.45)")
    parser.add_argument("--device", type=str, default="cpu", help="Device: 'cpu' or 'cuda'")
    parser.add_argument("--output", "-o", type=str, default="", help="Output image save path")
    args = parser.parse_args()

    img_path = Path(args.image)
    if not img_path.exists():
        print(f"Error: Image not found: {img_path}", file=sys.stderr)
        sys.exit(1)

    img = cv2.imread(str(img_path))
    if img is None:
        print(f"Error: Failed to decode image: {img_path}", file=sys.stderr)
        sys.exit(1)

    try:
        detector = PotholeONNXDetector(model_path=args.model, device=args.device)
    except Exception as e:
        print(f"Error initializing detector: {e}", file=sys.stderr)
        sys.exit(1)

    detections, latency_ms = detector.predict(img, conf_thresh=args.conf, iou_thresh=args.iou)

    print(f"\nImage: {img_path.name} ({img.shape[1]}x{img.shape[0]})")
    print(f"Inference Latency: {latency_ms:.2f} ms")
    print(f"Detected Potholes: {len(detections)}")

    for i, d in enumerate(detections, 1):
        x1, y1, x2, y2 = d["box_xyxy"]
        print(f"  [{i}] {d['class_name']} conf={d['confidence']:.4f} bbox=[{x1}, {y1}, {x2}, {y2}]")

    annotated = detector.draw_detections(img, detections)

    out_path = Path(args.output) if args.output else DEFAULT_OUTPUT_DIR / f"onnx_{img_path.name}"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out_path), annotated)
    print(f"Saved annotated image: {out_path}")


if __name__ == "__main__":
    main()
