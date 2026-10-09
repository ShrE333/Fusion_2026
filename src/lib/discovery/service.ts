import { searchAtlas } from "@/lib/api/client";
import { demoDiscoveryResults, demoGeoJsonExport, demoIntent } from "@/lib/demo/discovery";
import type { DiscoveryResult, GeoJsonExport, QueryIntent, SearchResponse } from "@/types/geo";

export type DiscoveryMode = "demo" | "api";
export const supportedDemoQuery = "Find commercial roofs with solar panel installations within 200 metres of open drainage";

const normalise = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
export const isSupportedDemoQuery = (query: string) => normalise(query) === normalise(supportedDemoQuery);

function isGeometry(value: unknown): value is DiscoveryResult["geometry"] {
  return Boolean(value) && typeof value === "object" && ["Point", "LineString", "Polygon"].includes((value as { type?: unknown }).type as string) && Array.isArray((value as { coordinates?: unknown }).coordinates);
}
function isIntent(value: unknown): value is QueryIntent {
  if (!value || typeof value !== "object") return false;
  const intent = value as Partial<QueryIntent>;
  return Array.isArray(intent.visualTargets) && Array.isArray(intent.osmFeatureTypes) && Array.isArray(intent.spatialPredicates) && typeof intent.scope === "string";
}
function isResult(value: unknown): value is DiscoveryResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<DiscoveryResult>;
  return typeof result.id === "string" && typeof result.title === "string" && typeof result.source === "string" && typeof result.imageTileId === "string" && isGeometry(result.geometry) && Array.isArray(result.groundedObjects) && Array.isArray(result.osmFeatures) && Array.isArray(result.relationships);
}
function isExport(value: unknown): value is GeoJsonExport {
  if (!value || typeof value !== "object") return false;
  const exportValue = value as Partial<GeoJsonExport>;
  return exportValue.type === "FeatureCollection" && Array.isArray(exportValue.features) && Boolean(exportValue.metadata) && (exportValue.metadata as { mode?: unknown }).mode === "backend";
}

export function validateSearchResponse(value: unknown): SearchResponse {
  const response = value as Partial<SearchResponse> | null;
  if (!response || typeof response.query !== "string" || !isIntent(response.intent) || !Array.isArray(response.results) || !response.results.every(isResult) || !isExport(response.export)) {
    throw new Error("Backend response does not match the proposed GeoSathi search contract.");
  }
  return response as SearchResponse;
}

export async function runDiscovery(mode: DiscoveryMode, query: string, signal?: AbortSignal): Promise<SearchResponse> {
  if (mode === "demo") {
    if (!isSupportedDemoQuery(query)) throw new Error("This deterministic demo supports the solar-roof and drainage example only. Switch to API mode for other queries.");
    return { query: supportedDemoQuery, intent: demoIntent, results: demoDiscoveryResults, export: demoGeoJsonExport(supportedDemoQuery) };
  }
  return validateSearchResponse(await searchAtlas(query, signal));
}
