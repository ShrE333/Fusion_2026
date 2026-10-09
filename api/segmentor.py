"""
api/segmentor.py
================
Modular, production-conscious road-scene semantic segmentation module using
facebook/mask2former-swin-large-mapillary-vistas-semantic.

Features:
- Singleton model management with thread-safe loading
- Automatic device placement (CUDA when available, CPU fallback)
- torch.inference_mode() for fast, memory-efficient inference
- Full Mapillary Vistas 65-class semantic decoding
- Semantic overlay blending with intuitive urban road color palette
- Per-class pixel statistics and surface area percentage calculation
- Binary mask generation for selected classes (Road, Sidewalk, Vehicles, etc.)
- PNG Base64 serialization for compact HTTP transmission
"""

import base64
import logging
import threading
import time
from typing import Any, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np
import torch
from PIL import Image

logger = logging.getLogger("geosathi.segmentor")

DEFAULT_MODEL_ID = "facebook/mask2former-swin-large-mapillary-vistas-semantic"

# ── Mapillary Vistas 65-Class Color Palette ────────────────────────────────
# Curated color map matching standard autonomous driving and urban GIS benchmarks.
# Predefined semantic colors for key categories, deterministic palette for others.
KEY_CLASS_COLORS = {
    13: (128, 64, 128),   # Road (Purple/Slate)
    15: (244, 35, 232),   # Sidewalk (Magenta)
    7:  (100, 149, 237),  # Bike Lane (Cornflower blue)
    8:  (255, 255, 255),  # Crosswalk (White)
    10: (250, 170, 160),  # Parking (Peach)
    19: (220, 20, 60),    # Person (Crimson)
    20: (255, 0, 0),      # Bicyclist (Red)
    21: (255, 69, 0),     # Motorcyclist (Orange-Red)
    23: (255, 255, 255),  # Lane Marking - Crosswalk (White)
    24: (255, 215, 0),    # Lane Marking - General (Gold)
    27: (70, 130, 180),   # Sky (Sky Blue)
    29: (152, 251, 152),  # Terrain (Pale Green)
    30: (107, 142, 35),   # Vegetation (Olive/Forest Green)
    43: (255, 128, 0),    # Pothole (Vibrant Amber/Orange)
    48: (250, 170, 30),   # Traffic Light (Gold)
    49: (220, 220, 0),    # Traffic Sign Back (Yellow)
    50: (250, 210, 0),    # Traffic Sign Front (Bright Yellow)
    52: (119, 11, 32),    # Bicycle (Dark Burgundy)
    54: (0, 60, 100),     # Bus (Navy)
    55: (0, 0, 142),      # Car (Dark Red/Crimson)
    57: (0, 0, 230),      # Motorcycle (Vivid Blue)
    61: (0, 0, 70),       # Truck (Midnight Blue)
}


def build_palette(num_classes: int = 66) -> np.ndarray:
    """Build a deterministic 66-class RGB color lookup table."""
    palette = np.zeros((num_classes, 3), dtype=np.uint8)
    for cid in range(num_classes):
        if cid in KEY_CLASS_COLORS:
            palette[cid] = KEY_CLASS_COLORS[cid]
        else:
            # Deterministic color formula
            r = (cid * 43 + 37) % 256
            g = (cid * 67 + 19) % 256
            b = (cid * 89 + 53) % 256
            palette[cid] = [r, g, b]
    return palette


MAPILLARY_PALETTE = build_palette(66)


class RoadSceneSegmentor:
    """
    Reusable Mask2Former road scene semantic segmentor.
    Loads checkpoint once, supports CPU/CUDA inference, and produces
    color-coded overlays and class statistics.
    """

    def __init__(
        self,
        model_id: str = DEFAULT_MODEL_ID,
        device: Optional[str] = None,
        lazy_load: bool = False,
    ):
        self.model_id = model_id
        self._lock = threading.Lock()
        self._is_loaded = False
        self.processor = None
        self.model = None

        # Device determination
        if device is None:
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            self.device = device

        self.id2label: Dict[int, str] = {}
        self.label2id: Dict[str, int] = {}

        if not lazy_load:
            self.load()

    def load(self):
        """Thread-safe model loading."""
        if self._is_loaded:
            return

        with self._lock:
            if self._is_loaded:
                return

            logger.info("Loading Mask2Former processor from: %s", self.model_id)
            from transformers import AutoImageProcessor, Mask2FormerForUniversalSegmentation

            t0 = time.time()
            self.processor = AutoImageProcessor.from_pretrained(self.model_id)

            logger.info("Loading Mask2Former model weights onto %s...", self.device)
            self.model = Mask2FormerForUniversalSegmentation.from_pretrained(
                self.model_id
            ).to(self.device)
            self.model.eval()

            # Extract label mappings from model configuration
            raw_id2label = getattr(self.model.config, "id2label", {})
            self.id2label = {int(k): str(v) for k, v in raw_id2label.items()}
            self.label2id = {v: k for k, v in self.id2label.items()}

            self._is_loaded = True
            logger.info(
                "Mask2Former loaded successfully in %.2fs (%d classes, device: %s)",
                time.time() - t0,
                len(self.id2label),
                self.device,
            )

    @property
    def is_loaded(self) -> bool:
        return self._is_loaded

    def predict_rgb(
        self,
        img_rgb: np.ndarray,
        return_overlay: bool = True,
        return_masks: bool = False,
        selected_classes: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Run semantic segmentation on an RGB numpy image.

        Parameters:
        - img_rgb: uint8 array with shape (H, W, 3) in RGB order.
        - return_overlay: Whether to generate semi-transparent color overlay.
        - return_masks: Whether to generate binary masks for selected classes.
        - selected_classes: Optional list of class names to return masks for.

        Returns dict:
        - latency_ms: Float
        - device: String
        - image_shape: Tuple (H, W)
        - detected_classes: List of string names
        - class_statistics: List of dicts (class_id, class_name, pixel_count, area_percentage)
        - overlay_png_bytes: Optional bytes
        - masks_png_bytes: Optional dict of class_name -> bytes
        - semantic_map: 2D numpy array (H, W)
        """
        if not self._is_loaded:
            self.load()

        h, w = img_rgb.shape[:2]
        total_pixels = float(h * w)

        pil_img = Image.fromarray(img_rgb)
        inputs = self.processor(images=pil_img, return_tensors="pt").to(self.device)

        t_inf = time.perf_counter()
        with torch.inference_mode():
            outputs = self.model(**inputs)
            # Post-process restores exact original image dimensions (h, w)
            results = self.processor.post_process_semantic_segmentation(
                outputs, target_sizes=[(h, w)]
            )[0]

        latency_ms = (time.perf_counter() - t_inf) * 1000.0
        semantic_map = results.cpu().numpy().astype(np.int32)

        # Calculate per-class pixel counts & statistics
        unique_ids, counts = np.unique(semantic_map, return_counts=True)
        class_stats = []
        detected_names = []

        for cid, cnt in zip(unique_ids, counts):
            cid_int = int(cid)
            name = self.id2label.get(cid_int, f"Class_{cid_int}")
            pct = round((float(cnt) / total_pixels) * 100.0, 3)
            class_stats.append({
                "class_id": cid_int,
                "class_name": name,
                "pixel_count": int(cnt),
                "area_percentage": pct,
            })
            detected_names.append(name)

        # Sort classes by area percentage descending
        class_stats.sort(key=lambda x: x["pixel_count"], reverse=True)

        # Generate semi-transparent overlay
        overlay_bytes = None
        if return_overlay:
            # Map 2D class IDs to RGB color mask
            valid_ids = np.clip(semantic_map, 0, len(MAPILLARY_PALETTE) - 1)
            color_mask_rgb = MAPILLARY_PALETTE[valid_ids]

            # Blend with original image (55% original + 45% semantic color)
            blended_rgb = cv2.addWeighted(img_rgb, 0.55, color_mask_rgb, 0.45, 0)
            blended_bgr = cv2.cvtColor(blended_rgb, cv2.COLOR_RGB2BGR)

            success, encoded_png = cv2.imencode(".png", blended_bgr)
            if success:
                overlay_bytes = encoded_png.tobytes()

        # Generate individual binary masks
        masks_bytes = {}
        if return_masks:
            classes_to_extract = selected_classes or detected_names
            for name in classes_to_extract:
                cid = self.label2id.get(name)
                if cid is not None and cid in unique_ids:
                    mask = (semantic_map == cid).astype(np.uint8) * 255
                    success, enc_mask = cv2.imencode(".png", mask)
                    if success:
                        masks_bytes[name] = enc_mask.tobytes()

        return {
            "latency_ms": latency_ms,
            "device": self.device,
            "image_shape": (h, w),
            "detected_classes": detected_names,
            "class_statistics": class_stats,
            "overlay_png_bytes": overlay_bytes,
            "masks_png_bytes": masks_bytes if return_masks else None,
            "semantic_map": semantic_map,
        }


# ── Global Singleton Accessor ──────────────────────────────────────────────
_GLOBAL_SEGMENTOR: Optional[RoadSceneSegmentor] = None
_INIT_LOCK = threading.Lock()


def get_segmentor(lazy_load: bool = True) -> RoadSceneSegmentor:
    """Return the global RoadSceneSegmentor instance."""
    global _GLOBAL_SEGMENTOR
    if _GLOBAL_SEGMENTOR is None:
        with _INIT_LOCK:
            if _GLOBAL_SEGMENTOR is None:
                _GLOBAL_SEGMENTOR = RoadSceneSegmentor(lazy_load=lazy_load)
    return _GLOBAL_SEGMENTOR
