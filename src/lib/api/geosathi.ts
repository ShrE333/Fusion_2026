export type Bounds = { west: number; south: number; east: number; north: number };
export type OSMBackendLayer = "buildings" | "roads" | "places";
export type GeoJsonGeometry = GeoJSON.Point | GeoJSON.LineString | GeoJSON.Polygon | GeoJSON.MultiPoint | GeoJSON.MultiLineString | GeoJSON.MultiPolygon;
export type GeoJsonCollection = GeoJSON.FeatureCollection<GeoJsonGeometry, Record<string, unknown>>;
export type BackendHealth = { status: string; database?: string; postgis?: string; pgvector?: string };

const endpoint = (path: string) => `/api/geosathi/${path}`;
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isGeometry = (value: unknown): value is GeoJsonGeometry => isRecord(value) && ["Point", "LineString", "Polygon", "MultiPoint", "MultiLineString", "MultiPolygon"].includes(String(value.type)) && Array.isArray(value.coordinates);

export function isGeoJsonCollection(value: unknown): value is GeoJsonCollection {
  return isRecord(value) && value.type === "FeatureCollection" && Array.isArray(value.features) && value.features.every((feature) => isRecord(feature) && feature.type === "Feature" && isGeometry(feature.geometry) && (feature.properties === null || isRecord(feature.properties)));
}

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(endpoint(path), { signal, cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : `GeoSathi request failed (${response.status}).`);
  return payload;
}

function boundsQuery(bounds: Bounds, limit = 500) {
  const params = new URLSearchParams({ west: String(bounds.west), south: String(bounds.south), east: String(bounds.east), north: String(bounds.north), limit: String(Math.max(1, Math.min(2000, Math.floor(limit)))) });
  return params.toString();
}

export async function getBackendHealth(signal?: AbortSignal): Promise<BackendHealth> {
  const value = await getJson("health", signal);
  if (!isRecord(value) || typeof value.status !== "string") throw new Error("GeoSathi health response was malformed.");
  return value as BackendHealth;
}
export async function getManagedFeatures(bounds: Bounds, signal?: AbortSignal): Promise<GeoJsonCollection> {
  const value = await getJson(`features?${boundsQuery(bounds)}`, signal);
  if (!isGeoJsonCollection(value)) throw new Error("GeoSathi features response was not valid GeoJSON.");
  return value;
}
export async function getOsmFeatures(layer: OSMBackendLayer, bounds: Bounds, signal?: AbortSignal): Promise<GeoJsonCollection> {
  const value = await getJson(`osm?layer=${layer}&${boundsQuery(bounds)}`, signal);
  if (!isGeoJsonCollection(value)) throw new Error(`GeoSathi ${layer} response was not valid GeoJSON.`);
  return value;
}
export async function getIncidents(signal?: AbortSignal): Promise<unknown> { return getJson("incidents", signal); }
