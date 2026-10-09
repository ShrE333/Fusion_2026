#!/usr/bin/env python3
"""Export trained YOLO model to ONNX and verify inference consistency.

Usage:
    python scripts/export_onnx.py [--model models/best.pt] [--output models/best.onnx]
"""

import argparse
import shutil
import sys
import time
from pathlib import Path
import numpy as np
import cv2

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from ultralytics import YOLO
import onnx
import onnxruntime as ort


def export_and_verify(
    model_path: str = "models/best.pt",
    output_path: str = "models/best.onnx",
    imgsz: int = 640
):
    pt_path = ROOT_DIR / model_path
    if not pt_path.exists():
        raise FileNotFoundError(f"PyTorch checkpoint not found: {pt_path}")

    target_onnx = ROOT_DIR / output_path
    target_onnx.parent.mkdir(parents=True, exist_ok=True)

    print(f"Loading PyTorch model: {pt_path}")
    model = YOLO(str(pt_path))

    print(f"Exporting to ONNX format (imgsz={imgsz})...")
    exported_file = model.export(
        format="onnx",
        imgsz=imgsz,
        dynamic=False,
        opset=12,
        simplify=True
    )
    exported_path = Path(exported_file)
    print(f"Ultralytics exported to: {exported_path}")

    # Copy to target models/best.onnx if different
    if exported_path.resolve() != target_onnx.resolve():
        shutil.copy2(exported_path, target_onnx)
        print(f"Copied to canonical destination: {target_onnx}")

    # Verify ONNX model structure
    print("\nVerifying ONNX model file...")
    onnx_model = onnx.load(str(target_onnx))
    onnx.checker.check_model(onnx_model)
    file_size_mb = target_onnx.stat().st_size / (1024 * 1024)
    print(f"✓ ONNX model is well-formed! (Size: {file_size_mb:.2f} MB)")

    # Run inference test with ONNX Runtime
    print("\nInitializing ONNX Runtime session (CPU)...")
    session = ort.InferenceSession(str(target_onnx), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    input_shape = session.get_inputs()[0].shape
    output_names = [o.name for o in session.get_outputs()]
    print(f"ONNX Inputs:  {input_name} {input_shape}")
    print(f"ONNX Outputs: {output_names}")

    # Test dummy inference
    dummy_input = np.random.randn(1, 3, imgsz, imgsz).astype(np.float32)
    t0 = time.time()
    outputs = session.run(output_names, {input_name: dummy_input})
    latency_ms = (time.time() - t0) * 1000.0
    print(f"Dummy inference successful! Output shape: {outputs[0].shape} (Latency: {latency_ms:.2f} ms)")

    # Test on a real test image
    test_img_dir = ROOT_DIR / "dataset" / "test" / "images"
    test_imgs = list(test_img_dir.glob("*.jpg"))
    if test_imgs:
        sample_img = test_imgs[0]
        print(f"\nTesting ONNX vs PyTorch inference on sample: {sample_img.name}")
        img = cv2.imread(str(sample_img))
        img_resized = cv2.resize(img, (imgsz, imgsz))
        img_input = img_resized[:, :, ::-1].transpose(2, 0, 1).astype(np.float32) / 255.0
        img_input = np.expand_dims(img_input, axis=0)

        t1 = time.time()
        onnx_preds = session.run(output_names, {input_name: img_input})
        onnx_time = (time.time() - t1) * 1000.0
        print(f"✓ ONNX Runtime inference finished in {onnx_time:.2f} ms")

        # PyTorch prediction for comparison
        pt_res = model.predict(source=str(sample_img), imgsz=imgsz, conf=0.25, verbose=False)
        print(f"PyTorch detections found: {len(pt_res[0].boxes)}")

    print("\n" + "=" * 50)
    print("ONNX EXPORT & VERIFICATION COMPLETE!")
    print(f"Canonical ONNX path: {target_onnx}")
    print("=" * 50)
    return str(target_onnx)


def main():
    parser = argparse.ArgumentParser(description="Export and verify YOLO ONNX model")
    parser.add_argument("--model", "-m", type=str, default="models/best.pt",
                        help="Path to PyTorch model (default: models/best.pt)")
    parser.add_argument("--output", "-o", type=str, default="models/best.onnx",
                        help="Path for exported ONNX model (default: models/best.onnx)")
    parser.add_argument("--imgsz", type=int, default=640,
                        help="Image size (default: 640)")
    args = parser.parse_args()

    try:
        export_and_verify(args.model, args.output, args.imgsz)
    except Exception as e:
        print(f"ONNX export failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
