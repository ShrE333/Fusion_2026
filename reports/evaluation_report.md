# GeoSathi AI — Pothole Detection Evaluation Report
Generated: 2026-10-09 17:17:15

## Model
| Field | Value |
|-------|-------|
| Architecture | YOLO11n (Ultralytics) |
| Weights | `best.pt` |
| Inference device | CUDA (GPU) |
| Image size | 640 × 640 |

## Dataset
| Split | Description |
|-------|-------------|
| Source | Merged DS1 (533 imgs) + DS2 (2,677 imgs) |
| Test split | `dataset_merged/test` |
| Classes | 1 — `pothole` |
| Conf threshold | 0.25 |
| IoU (NMS) threshold | 0.45 |

## Test-Set Metrics
| Metric | Value |
|--------|-------|
| Precision | 0.7880 (78.8%) |
| Recall | 0.6057 (60.6%) |
| mAP@0.5 | 0.6199 (62.0%) |
| mAP@0.5:0.95 | 0.3237 (32.4%) |

## Latency
| Stage | Time (ms) |
|-------|-----------|
| Preprocess | 1.68 |
| Inference | 3.66 |
| Postprocess | 1.51 |
| **Total** | **6.85** |
| FPS (equivalent) | 146.1 |

## Limitations & Next Steps
1. Small potholes (<20px at 640px resolution) may have lower recall.
2. Night / heavy rain / glare conditions are underrepresented in training data.
3. Phase 2: GPS-based geolocation and incident reporting.
4. Phase 3: Repair-quality assessment model (separate task).
