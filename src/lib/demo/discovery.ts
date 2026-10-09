import type { DiscoveryResult, GeoJsonExport, QueryIntent } from "@/types/geo";

export const demoIntent: QueryIntent = {
  visualTargets: ["commercial roof", "solar panel installation"],
  osmFeatureTypes: ["waterway=drain", "building=commercial"],
  spatialPredicates: ["within_distance", "buffer_contains"],
  distanceMetres: 200,
  scope: "Bengaluru test sector · deterministic fixture",
};

export const demoDiscoveryResults: DiscoveryResult[] = [
  {
    id: "demo-solar-roof-01", kind: "search", title: "Candidate roof footprint A", source: "Deterministic GeoAI workflow fixture", score: 0.87, imageTileId: "DEMO-BLR-18-079-043", imageCapturedAt: "Synthetic capture date · 2026-08-17", timestamp: "Demo analysis · 2026-10-09", evidence: "Illustrative tile reference; no satellite image is embedded.", bounds: [77.572, 12.966, 77.577, 12.968], geometry: { type: "Polygon", coordinates: [[[77.572, 12.966], [77.577, 12.966], [77.577, 12.968], [77.572, 12.968], [77.572, 12.966]]] },
    groundedObjects: [{ label: "solar panel installation", boundingBox: [0.24, 0.31, 0.66, 0.62], matchScore: 0.87 }],
    osmFeatures: [{ osmId: "demo-way-7781", type: "waterway=drain", geometry: { type: "LineString", coordinates: [[77.558, 12.961], [77.571, 12.97], [77.589, 12.981]] } }],
    relationships: [{ predicate: "within_distance", targetFeatureId: "demo-way-7781", targetType: "waterway=drain", distanceMetres: 146, explanation: "Deterministic fixture: candidate centroid falls inside a 200 m drain buffer." }],
  },
  {
    id: "demo-solar-roof-02", kind: "search", title: "Candidate roof footprint B", source: "Deterministic GeoAI workflow fixture", score: 0.74, imageTileId: "DEMO-BLR-18-079-044", imageCapturedAt: "Synthetic capture date · 2026-08-17", timestamp: "Demo analysis · 2026-10-09", evidence: "Illustrative tile reference; no satellite image is embedded.", bounds: [77.563, 12.974, 77.567, 12.976], geometry: { type: "Polygon", coordinates: [[[77.563, 12.974], [77.567, 12.974], [77.567, 12.976], [77.563, 12.976], [77.563, 12.974]]] },
    groundedObjects: [{ label: "solar panel installation", boundingBox: [0.18, 0.22, 0.54, 0.49], matchScore: 0.74 }],
    osmFeatures: [{ osmId: "demo-way-7781", type: "waterway=drain", geometry: { type: "LineString", coordinates: [[77.558, 12.961], [77.571, 12.97], [77.589, 12.981]] } }],
    relationships: [{ predicate: "within_distance", targetFeatureId: "demo-way-7781", targetType: "waterway=drain", distanceMetres: 192, explanation: "Deterministic fixture: candidate centroid falls inside a 200 m drain buffer." }],
  },
];

export const demoVectorFeatures = demoDiscoveryResults.flatMap((result) => result.osmFeatures.map((feature) => ({ id: feature.osmId, kind: "infrastructure" as const, title: feature.type, geometry: feature.geometry, source: "Deterministic OSM-vector fixture", status: "demo reference" })));

export function demoGeoJsonExport(query: string): GeoJsonExport {
  return { type: "FeatureCollection", metadata: { query, mode: "demo", generatedAt: "2026-10-09T00:00:00.000Z" }, features: demoDiscoveryResults.map((result) => ({ type: "Feature", geometry: result.geometry, properties: { id: result.id, image_tile_id: result.imageTileId, illustrative_similarity: result.score, grounded_objects: result.groundedObjects, osm_features: result.osmFeatures.map((feature) => ({ osm_id: feature.osmId, type: feature.type })), spatial_relationships: result.relationships } })) };
}
