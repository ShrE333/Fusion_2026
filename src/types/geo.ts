export type Position = [number, number];
export type GeoGeometry = GeoJSON.Point | GeoJSON.LineString | GeoJSON.Polygon;

export interface AtlasFeature {
  id: string;
  kind: "search" | "hazard" | "infrastructure";
  title: string;
  geometry: GeoGeometry;
  source: string;
  status?: string;
  hazardType?: "surface" | "flooding" | "obstruction";
  timestamp?: string;
  score?: number;
  evidence?: string;
  bounds?: [number, number, number, number];
}

export interface GroundedObject {
  label: string;
  boundingBox: [number, number, number, number];
  matchScore?: number;
}

export interface SpatialRelationship {
  predicate: "within_distance" | "intersects" | "buffer_contains";
  targetFeatureId: string;
  targetType: string;
  distanceMetres?: number;
  explanation: string;
}

export interface OSMFeatureReference {
  osmId: string;
  type: string;
  geometry: GeoGeometry;
}

export interface DiscoveryResult extends AtlasFeature {
  imageTileId: string;
  imageCapturedAt?: string;
  groundedObjects: GroundedObject[];
  osmFeatures: OSMFeatureReference[];
  relationships: SpatialRelationship[];
}

export interface QueryIntent {
  visualTargets: string[];
  osmFeatureTypes: string[];
  spatialPredicates: Array<"within_distance" | "intersects" | "buffer_contains">;
  distanceMetres?: number;
  scope: string;
}

export interface GeoJsonExport {
  type: "FeatureCollection";
  features: Array<GeoJSON.Feature<GeoGeometry, Record<string, unknown>>>;
  metadata: { query: string; mode: "demo" | "backend"; generatedAt: string; };
}

export interface SearchResponse { query: string; intent: QueryIntent; results: DiscoveryResult[]; export: GeoJsonExport; }
