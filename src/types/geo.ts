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

export interface SearchResponse { query: string; results: AtlasFeature[]; }
