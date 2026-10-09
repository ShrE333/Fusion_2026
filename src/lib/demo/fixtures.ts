import type { AtlasFeature } from "@/types/geo";

/** Synthetic fixtures only: never represent these as verified detections. */
export const demoFeatures: AtlasFeature[] = [
  { id: "synthetic-culvert", kind: "search", title: "Linear drainage corridor", geometry: { type: "Polygon", coordinates: [[[77.572, 12.966], [77.577, 12.966], [77.577, 12.968], [77.572, 12.968], [77.572, 12.966]]] }, source: "Synthetic demo fixture", score: 0.87, timestamp: "Demo capture · 2026-08-17", evidence: "Georeferenced image candidate", bounds: [77.572, 12.966, 77.577, 12.968] },
  { id: "synthetic-pothole", kind: "hazard", title: "Surface anomaly", geometry: { type: "Point", coordinates: [77.584, 12.972] }, source: "Synthetic inference fixture", hazardType: "surface", status: "review", timestamp: "Synthetic observation · 2026-08-18", evidence: "Road-edge evidence region" },
  { id: "synthetic-flood", kind: "hazard", title: "Standing-water risk", geometry: { type: "Point", coordinates: [77.565, 12.978] }, source: "Synthetic inference fixture", hazardType: "flooding", status: "unreviewed", timestamp: "Synthetic observation · 2026-08-19" },
  { id: "synthetic-road", kind: "infrastructure", title: "Survey corridor", geometry: { type: "LineString", coordinates: [[77.558, 12.961], [77.571, 12.97], [77.589, 12.981]] }, source: "Synthetic feature fixture", status: "reference" },
];
