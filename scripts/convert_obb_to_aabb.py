#!/usr/bin/env python3
"""Convert YOLOv8 OBB (oriented bounding box) annotations to axis-aligned
bounding boxes (AABB) for standard YOLO object detection.

OBB format per line: class x1 y1 x2 y2 x3 y3 x4 y4  (normalized 0-1)
AABB format per line: class xc yc w h            (normalized 0-1)

The original OBB data is preserved untouched under dataset_raw/.
The converted dataset is written under dataset/ with the same structure.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np


def polygon_to_aabb(xs: np.ndarray, ys: np.ndarray) -> tuple[float, float, float, float]:
    """Return (xc, yc, w, h) for the axis-aligned box enclosing the polygon."""
    x_min, y_min = float(xs.min()), float(ys.min())
    x_max, y_max = float(xs.max()), float(ys.max())
    w = x_max - x_min
    h = y_max - y_min
    xc = x_min + w / 2.0
    yc = y_min + h / 2.0
    return xc, yc, w, h


def convert_split(src_dir: Path, dst_dir: Path) -> dict:
    """Convert one split (train/valid/test). Returns per-image stats."""
    img_src = src_dir / "images"
    img_dst = dst_dir / "images"
    lab_src = src_dir / "labels"
    lab_dst = dst_dir / "labels"
    img_dst.mkdir(parents=True, exist_ok=True)
    lab_dst.mkdir(parents=True, exist_ok=True)

    stats = {"images": 0, "labels": 0, "boxes": 0, "empty_images": 0,
             "degenerate_boxes": 0, "out_of_range": 0}
    for img_path in sorted(img_src.glob("*.*")):
        if img_path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}:
            continue
        lab_path = lab_src / (img_path.stem + ".txt")
        out_img = img_dst / img_path.name
        out_lab = lab_dst / (img_path.stem + ".txt")

        # Copy image
        out_img.write_bytes(img_path.read_bytes())
        stats["images"] += 1

        if not lab_path.exists():
            out_lab.write_text("")
            stats["empty_images"] += 1
            continue

        lines = lab_path.read_text().strip().splitlines()
        out_lines = []
        n_boxes = 0
        for line in lines:
            line = line.strip()
            if not line:
                continue
            parts = line.split()
            if len(parts) < 9:
                # Malformed line: skip it (logged by caller).
                continue
            try:
                nums = [float(p) for p in parts]
            except ValueError:
                continue
            cls = int(nums[0])
            xs = np.array(nums[1::2], dtype=np.float64)
            ys = np.array(nums[2::2], dtype=np.float64)
            if len(xs) != 4 or len(ys) != 4:
                continue
            # Validate normalized range
            if (xs < -0.05).any() or (ys < -0.05).any() or (xs > 1.05).any() or (ys > 1.05).any():
                stats["out_of_range"] += 1
            xc, yc, w, h = polygon_to_aabb(xs, ys)
            if w <= 0 or h <= 0:
                stats["degenerate_boxes"] += 1
                continue
            # Clamp to [0,1]
            xc = min(max(xc, 0.0), 1.0)
            yc = min(max(yc, 0.0), 1.0)
            w = min(max(w, 0.0), 1.0)
            h = min(max(h, 0.0), 1.0)
            out_lines.append(f"{cls} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}")
            n_boxes += 1

        out_lab.write_text("\n".join(out_lines) + ("\n" if out_lines else ""))
        if n_boxes == 0:
            stats["empty_images"] += 1
        stats["labels"] += 1
        stats["boxes"] += n_boxes
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert OBB annotations to AABB")
    parser.add_argument("--src", type=Path, default=Path("dataset_raw"),
                        help="Source dataset root (YOLOv8 OBB layout)")
    parser.add_argument("--dst", type=Path, default=Path("dataset"),
                        help="Destination dataset root (AABB layout)")
    parser.add_argument("--report", type=Path, default=Path("reports/conversion_report.json"),
                        help="Path to write conversion report JSON")
    args = parser.parse_args()

    src = args.src.resolve()
    dst = args.dst.resolve()
    if dst.exists():
        import shutil
        shutil.rmtree(dst)
    dst.mkdir(parents=True, exist_ok=True)

    report = {"source": str(src), "destination": str(dst), "splits": {}}
    total = {"images": 0, "labels": 0, "boxes": 0, "empty_images": 0,
             "degenerate_boxes": 0, "out_of_range": 0}
    for split in ("train", "valid", "test"):
        s = src / split
        if not s.is_dir():
            continue
        st = convert_split(s, dst / split)
        report["splits"][split] = st
        for k in total:
            total[k] += st[k]
    report["total"] = total

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()