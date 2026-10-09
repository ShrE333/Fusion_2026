#!/usr/bin/env python3
"""
scripts/build_merged_dataset.py
================================
Extracts Dataset 2 (Pothole detection.v1i.yolov5-obb.zip),
converts its OBB pixel-coordinate annotations to normalized YOLO AABB format
(keeping only the 'pothole' class), deduplicates against Dataset 1,
and builds a clean merged dataset at dataset_merged/.

Dataset 1 (already converted AABB, dataset/):
  - 372 train / 106 val / 55 test images
  - class: pothole

Dataset 2 (yolov5-obb, 640x640 images):
  - labelTxt format: x1 y1 x2 y2 x3 y3 x4 y4 class_name difficulty
  - Pixel coordinates (images are 640x640)
  - Keep only 'pothole' lines; drop 'crocodile-crack', 'longitudinal-crack'

Merged output (dataset_merged/):
  - train/images + labels
  - valid/images + labels
  - test/images  + labels
  - data.yaml

Usage:
    python scripts/build_merged_dataset.py [--ds2-zip "Pothole detection.v1i.yolov5-obb.zip"]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DS2_ZIP_DEFAULT = ROOT / "Pothole detection.v1i.yolov5-obb.zip"
DS1_DIR = ROOT / "dataset"           # already-converted AABB DS1
DS2_EXTRACT = ROOT / "dataset2_raw"  # raw extraction target for DS2
MERGED_DIR = ROOT / "dataset_merged"
REPORT_PATH = ROOT / "reports" / "merge_report.json"

IMG_SIZE = 640  # DS2 images are 640x640 (from README)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def file_md5(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def obb_pixel_to_yolo_aabb(
    coords: list[float], img_w: int = IMG_SIZE, img_h: int = IMG_SIZE
) -> tuple[float, float, float, float] | None:
    """
    Convert OBB pixel coords [x1,y1,x2,y2,x3,y3,x4,y4] to
    normalized YOLO (cx, cy, w, h). Returns None if degenerate.
    """
    xs = np.array(coords[0::2], dtype=np.float64)
    ys = np.array(coords[1::2], dtype=np.float64)
    xmin, xmax = xs.min(), xs.max()
    ymin, ymax = ys.min(), ys.max()
    w_px = xmax - xmin
    h_px = ymax - ymin
    if w_px <= 0 or h_px <= 0:
        return None
    cx = np.clip((xmin + xmax) / 2.0 / img_w, 0.0, 1.0)
    cy = np.clip((ymin + ymax) / 2.0 / img_h, 0.0, 1.0)
    w  = np.clip(w_px / img_w, 0.0, 1.0)
    h  = np.clip(h_px / img_h, 0.0, 1.0)
    return float(cx), float(cy), float(w), float(h)


def parse_ds2_label(content: str) -> list[str]:
    """
    Parse DS2 labelTxt content, return list of YOLO AABB lines for potholes only.
    Format: x1 y1 x2 y2 x3 y3 x4 y4 class_name difficulty
    """
    out_lines = []
    for raw in content.splitlines():
        raw = raw.strip()
        if not raw:
            continue
        parts = raw.split()
        if len(parts) < 9:
            continue
        class_name = parts[8].strip().lower()
        if class_name != "pothole":
            continue
        try:
            coords = [float(p) for p in parts[:8]]
        except ValueError:
            continue
        box = obb_pixel_to_yolo_aabb(coords)
        if box is None:
            continue
        cx, cy, w, h = box
        out_lines.append(f"0 {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}")
    return out_lines


# ---------------------------------------------------------------------------
# Step 1: Extract DS2 from zip
# ---------------------------------------------------------------------------

def extract_ds2(zip_path: Path, dst: Path, force: bool = False) -> None:
    if dst.exists() and not force:
        print(f"[DS2] Already extracted at {dst}. Skipping extraction.")
        return
    print(f"[DS2] Extracting {zip_path.name} to {dst} …")
    if dst.exists():
        shutil.rmtree(dst)
    dst.mkdir(parents=True)
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(dst)
    print(f"[DS2] Extraction complete.")


# ---------------------------------------------------------------------------
# Step 2: Convert DS2 labelTxt → YOLO AABB labels
# ---------------------------------------------------------------------------

def convert_ds2(extract_dir: Path, stats: dict) -> None:
    """
    For each split in DS2, convert labelTxt files to YOLO AABB labels/,
    written beside images.
    """
    for split in ("train", "valid", "test"):
        split_stats = {
            "images": 0, "pothole_files": 0, "pothole_boxes": 0,
            "non_pothole_boxes": 0, "empty_after_filter": 0, "skipped_malformed": 0
        }
        img_dir = extract_dir / split / "images"
        lbl_src = extract_dir / split / "labelTxt"
        lbl_dst = extract_dir / split / "labels"
        lbl_dst.mkdir(exist_ok=True)

        if not img_dir.exists():
            continue

        for img_path in sorted(img_dir.iterdir()):
            if img_path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                continue
            split_stats["images"] += 1
            lbl_txt = lbl_src / (img_path.stem + ".txt")
            lbl_out = lbl_dst / (img_path.stem + ".txt")

            if not lbl_txt.exists():
                lbl_out.write_text("")
                split_stats["empty_after_filter"] += 1
                continue

            raw_content = lbl_txt.read_text(encoding="utf-8", errors="replace")
            # Count non-pothole boxes for reporting
            for raw in raw_content.splitlines():
                parts = raw.strip().split()
                if len(parts) >= 9 and parts[8].strip().lower() != "pothole":
                    split_stats["non_pothole_boxes"] += 1

            yolo_lines = parse_ds2_label(raw_content)
            split_stats["pothole_boxes"] += len(yolo_lines)
            if yolo_lines:
                split_stats["pothole_files"] += 1
            else:
                split_stats["empty_after_filter"] += 1

            lbl_out.write_text("\n".join(yolo_lines) + ("\n" if yolo_lines else ""))

        stats["ds2_conversion"][split] = split_stats
        print(f"  [DS2/{split}] {split_stats['images']} images, "
              f"{split_stats['pothole_boxes']} pothole boxes, "
              f"{split_stats['non_pothole_boxes']} non-pothole dropped")


# ---------------------------------------------------------------------------
# Step 3: Build merged dataset (with deduplication)
# ---------------------------------------------------------------------------

def build_merged(ds1_dir: Path, ds2_dir: Path, dst: Path, stats: dict) -> None:
    """
    Merge DS1 (dataset/) and DS2 (dataset2_raw/) into dst (dataset_merged/).
    Deduplication via MD5 hash of image files.
    """
    dst.mkdir(parents=True, exist_ok=True)

    seen_hashes: set[str] = set()   # for dedup
    merge_stats: dict[str, dict] = {}

    for split in ("train", "valid", "test"):
        out_img = dst / split / "images"
        out_lbl = dst / split / "labels"
        out_img.mkdir(parents=True, exist_ok=True)
        out_lbl.mkdir(parents=True, exist_ok=True)

        s = {
            "ds1_added": 0, "ds2_added": 0,
            "ds1_dedup_skipped": 0, "ds2_dedup_skipped": 0,
            "ds2_empty_label_skipped": 0,
        }

        # --- DS1 images (they are valid, already converted) ---
        ds1_split = "valid" if split == "valid" else split
        ds1_img_dir = ds1_dir / ds1_split / "images"
        ds1_lbl_dir = ds1_dir / ds1_split / "labels"

        if ds1_img_dir.exists():
            for img_p in sorted(ds1_img_dir.iterdir()):
                if img_p.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                    continue
                md5 = file_md5(img_p)
                if md5 in seen_hashes:
                    s["ds1_dedup_skipped"] += 1
                    continue
                seen_hashes.add(md5)
                shutil.copy2(img_p, out_img / img_p.name)
                lbl_p = ds1_lbl_dir / (img_p.stem + ".txt")
                if lbl_p.exists():
                    shutil.copy2(lbl_p, out_lbl / (img_p.stem + ".txt"))
                else:
                    (out_lbl / (img_p.stem + ".txt")).write_text("")
                s["ds1_added"] += 1

        # --- DS2 images ---
        ds2_img_dir = ds2_dir / split / "images"
        ds2_lbl_dir = ds2_dir / split / "labels"

        if ds2_img_dir.exists():
            for img_p in sorted(ds2_img_dir.iterdir()):
                if img_p.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                    continue
                lbl_p = ds2_lbl_dir / (img_p.stem + ".txt")
                # Skip DS2 images with empty labels (no potholes after filtering)
                if lbl_p.exists():
                    content = lbl_p.read_text().strip()
                    if not content:
                        s["ds2_empty_label_skipped"] += 1
                        continue
                else:
                    s["ds2_empty_label_skipped"] += 1
                    continue

                md5 = file_md5(img_p)
                if md5 in seen_hashes:
                    s["ds2_dedup_skipped"] += 1
                    continue
                seen_hashes.add(md5)
                shutil.copy2(img_p, out_img / img_p.name)
                shutil.copy2(lbl_p, out_lbl / (img_p.stem + ".txt"))
                s["ds2_added"] += 1

        merge_stats[split] = s
        total = s["ds1_added"] + s["ds2_added"]
        print(f"  [Merge/{split}] DS1={s['ds1_added']} DS2={s['ds2_added']} → {total} total  "
              f"(dedup skipped: DS1={s['ds1_dedup_skipped']}, DS2={s['ds2_dedup_skipped']}, "
              f"DS2-empty-filtered={s['ds2_empty_label_skipped']})")

    stats["merge"] = merge_stats


# ---------------------------------------------------------------------------
# Step 4: Write data.yaml
# ---------------------------------------------------------------------------

def write_yaml(dst: Path) -> None:
    yaml_content = f"""path: {dst.as_posix()}
train: train/images
val: valid/images
test: test/images

nc: 1
names:
  0: pothole
"""
    (dst / "data.yaml").write_text(yaml_content)
    print(f"[YAML] Written to {dst / 'data.yaml'}")


# ---------------------------------------------------------------------------
# Step 5: Validate merged dataset
# ---------------------------------------------------------------------------

def validate_merged(dst: Path, stats: dict) -> None:
    val_stats = {}
    for split in ("train", "valid", "test"):
        img_dir = dst / split / "images"
        lbl_dir = dst / split / "labels"
        imgs = list(img_dir.iterdir()) if img_dir.exists() else []
        lbls = list(lbl_dir.iterdir()) if lbl_dir.exists() else []
        imgs_set = {p.stem for p in imgs}
        lbls_set = {p.stem for p in lbls}
        missing_lbl = imgs_set - lbls_set
        total_boxes = 0
        empty_lbls = 0
        for lbl in lbls:
            content = lbl.read_text().strip()
            if not content:
                empty_lbls += 1
            else:
                total_boxes += len([l for l in content.splitlines() if l.strip()])
        val_stats[split] = {
            "images": len(imgs),
            "labels": len(lbls),
            "missing_label_files": len(missing_lbl),
            "empty_label_files": empty_lbls,
            "total_boxes": total_boxes,
        }
        print(f"  [Validate/{split}] {len(imgs)} images, {len(lbls)} labels, "
              f"{total_boxes} boxes, {empty_lbls} empty-label files")
    stats["validation"] = val_stats


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Build merged pothole dataset from DS1 + DS2")
    parser.add_argument("--ds2-zip", default=str(DS2_ZIP_DEFAULT),
                        help="Path to Dataset 2 zip file")
    parser.add_argument("--force-extract", action="store_true",
                        help="Force re-extraction of DS2 even if already done")
    args = parser.parse_args()

    zip_path = Path(args.ds2_zip)
    if not zip_path.exists():
        raise FileNotFoundError(f"Dataset 2 zip not found: {zip_path}")

    stats: dict = {"ds2_conversion": {}}

    print("=" * 60)
    print("GeoSathi AI — Merged Dataset Builder")
    print("=" * 60)

    print("\n[Step 1] Extracting Dataset 2 from zip...")
    extract_ds2(zip_path, DS2_EXTRACT, force=args.force_extract)

    print("\n[Step 2] Converting DS2 OBB pixel labels -> YOLO AABB normalized...")
    convert_ds2(DS2_EXTRACT, stats)

    print(f"\n[Step 3] Building merged dataset at {MERGED_DIR}...")
    if MERGED_DIR.exists():
        print(f"  Removing existing {MERGED_DIR}...")
        shutil.rmtree(MERGED_DIR)
    build_merged(DS1_DIR, DS2_EXTRACT, MERGED_DIR, stats)

    print("\n[Step 4] Writing data.yaml...")
    write_yaml(MERGED_DIR)

    print("\n[Step 5] Validating merged dataset...")
    validate_merged(MERGED_DIR, stats)

    # Save report
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(REPORT_PATH, "w") as f:
        json.dump(stats, f, indent=2)
    print(f"\n[Report] Saved to {REPORT_PATH}")

    print("\n" + "=" * 60)
    print("Dataset merge COMPLETE.")
    train_total = (stats["validation"]["train"]["images"])
    val_total   = stats["validation"]["valid"]["images"]
    test_total  = stats["validation"]["test"]["images"]
    print(f"  Train: {train_total} images")
    print(f"  Valid: {val_total} images")
    print(f"  Test:  {test_total} images")
    print(f"  Total: {train_total + val_total + test_total} images")
    print("=" * 60)


if __name__ == "__main__":
    main()
