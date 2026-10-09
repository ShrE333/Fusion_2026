"""
api/detector.py
===============
Lightweight, standalone ONNX Runtime inference engine for GeoSathi AI Pothole Detection.
No PyTorch or Ultralytics dependencies required.
"""

import time
from pathlib import Path
from typing import Any, Dict, List, Tuple

import cv2
import numpy as np
import onnxruntime as ort


def letterbox(
    img: np.ndarray,
    new_shape: Tuple[int, int] = (640, 640),
    color: Tuple[int, int, int] = (114, 114, 114),
) -> Tuple[np.ndarray, float, Tuple[float, float]]:
    """Resize and pad image while preserving aspect ratio."""
    shape = img.shape[:2]  # [height, width]
    if isinstance(new_shape, int):
        new_shape = (new_shape, new_shape)

    # Scale ratio (new / old)
    r = min(new_shape[0] / shape[0], new_shape[1] / shape[1])

    # Compute padding
    new_unpad = int(round(shape[1] * r)), int(round(shape[0] * r))
    dw, dh = new_shape[1] - new_unpad[0], new_shape[0] - new_unpad[1]
    dw /= 2
    dh /= 2

    if shape[::-1] != new_unpad:
        img = cv2.resize(img, new_unpad, interpolation=cv2.INTER_LINEAR)

    top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
    left, right = int(round(dw - 0.1)), int(round(dw + 0.1))
    img = cv2.copyMakeBorder(img, top, bottom, left, right, cv2.BORDER_CONSTANT, value=color)
    return img, r, (dw, dh)


class ONNXPotholeDetector:
    """Production ONNX Runtime detector for pothole detection."""

    def __init__(self, model_path: str):
        self.model_path = Path(model_path)
        if not self.model_path.exists():
            raise FileNotFoundError(f"ONNX model file not found at: {self.model_path}")

        # Configure session options for fast Cloud Run / container execution
        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess_options.intra_op_num_threads = 2  # Balanced for container vCPUs

        self.session = ort.InferenceSession(
            str(self.model_path),
            sess_options=sess_options,
            providers=["CPUExecutionProvider"],
        )

        inp = self.session.get_inputs()[0]
        self.input_name = inp.name
        self.input_shape = inp.shape
        self.input_type = inp.type
        self.img_size = (self.input_shape[2], self.input_shape[3]) if len(self.input_shape) == 4 else (640, 640)

        out = self.session.get_outputs()[0]
        self.output_name = out.name
        self.output_shape = out.shape
        self.output_type = out.type

        self.class_names = ["pothole"]

        # Warm up session with a dummy inference
        self.warmup()

    def warmup(self):
        """Warm up the ONNX runtime session to avoid initial request latency."""
        dummy = np.zeros((1, 3, self.img_size[0], self.img_size[1]), dtype=np.float32)
        self.session.run([self.output_name], {self.input_name: dummy})

    def preprocess(self, img_bgr: np.ndarray) -> Tuple[np.ndarray, float, Tuple[float, float]]:
        """Preprocess BGR image to normalized NCHW tensor."""
        padded_img, ratio, (pad_w, pad_h) = letterbox(img_bgr, new_shape=self.img_size)
        img_rgb = cv2.cvtColor(padded_img, cv2.COLOR_BGR2RGB)
        tensor = img_rgb.transpose(2, 0, 1).astype(np.float32) / 255.0
        tensor = np.expand_dims(tensor, axis=0)
        return tensor, ratio, (pad_w, pad_h)

    def postprocess(
        self,
        raw_outputs: np.ndarray,
        ratio: float,
        pad: Tuple[float, float],
        orig_shape: Tuple[int, int],
        conf_thresh: float = 0.25,
        iou_thresh: float = 0.45,
    ) -> List[Dict[str, Any]]:
        """
        Convert raw YOLO ONNX outputs [1, 5, 8400] to scaled bounding box detections.
        """
        preds = raw_outputs
        if len(preds.shape) == 3 and preds.shape[1] < preds.shape[2]:
            preds = np.transpose(preds[0], (1, 0))  # [8400, 5]
        elif len(preds.shape) == 3:
            preds = preds[0]

        boxes = []
        confidences = []
        class_ids = []

        pad_w, pad_h = pad
        orig_h, orig_w = orig_shape

        for row in preds:
            cx, cy, w, h = row[:4]
            scores = row[4:]
            class_id = int(np.argmax(scores))
            score = float(scores[class_id])

            if score >= conf_thresh:
                # Convert center (cx, cy, w, h) to top-left (x1, y1, w, h)
                x1 = (cx - w / 2 - pad_w) / ratio
                y1 = (cy - h / 2 - pad_h) / ratio
                box_w = w / ratio
                box_h = h / ratio

                # Clip to image boundaries
                x1 = max(0.0, min(float(orig_w), float(x1)))
                y1 = max(0.0, min(float(orig_h), float(y1)))
                box_w = max(1.0, min(float(orig_w - x1), float(box_w)))
                box_h = max(1.0, min(float(orig_h - y1), float(box_h)))

                boxes.append([int(round(x1)), int(round(y1)), int(round(box_w)), int(round(box_h))])
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
                "class_id": cid,
                "class_name": name,
                "confidence": round(float(c), 4),
                "bbox": {
                    "x1": int(x),
                    "y1": int(y),
                    "x2": int(x + w),
                    "y2": int(y + h),
                    "width": int(w),
                    "height": int(h),
                },
            })

        return detections

    def predict(
        self,
        img_bgr: np.ndarray,
        conf_thresh: float = 0.25,
        iou_thresh: float = 0.45,
    ) -> Tuple[List[Dict[str, Any]], float]:
        """Run full prediction pipeline on a BGR image."""
        t0 = time.perf_counter()
        orig_shape = img_bgr.shape[:2]
        tensor, ratio, pad = self.preprocess(img_bgr)
        outputs = self.session.run([self.output_name], {self.input_name: tensor})[0]
        detections = self.postprocess(outputs, ratio, pad, orig_shape, conf_thresh, iou_thresh)
        latency_ms = (time.perf_counter() - t0) * 1000.0
        return detections, latency_ms
