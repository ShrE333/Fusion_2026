import { searchAtlas } from "@/lib/api/client";
import { isGeoGeometry } from "@/lib/geo-validation";
import { demoDiscoveryResults, demoGeoJsonExport, demoIntent } from "@/lib/demo/discovery";
import type { DiscoveryResult, GeoJsonExport, QueryIntent, SearchResponse } from "@/types/geo";
export type DiscoveryMode="demo"|"api";
export const supportedDemoQuery="Find commercial roofs with solar panel installations within 200 metres of open drainage";
const normalize=(value:string)=>value.trim().replace(/\s+/g," ").toLowerCase();
function isResult(result:unknown):result is DiscoveryResult {
  const x=result as Partial<DiscoveryResult> | null;
  return !!x && typeof x.id==="string" && typeof x.title==="string" && typeof x.source==="string" &&
    isGeoGeometry(x.geometry) &&
    typeof x.imageTileId==="string" && Array.isArray(x.groundedObjects) && Array.isArray(x.osmFeatures) && Array.isArray(x.relationships);
}
function isIntent(x:unknown):x is QueryIntent {
  const i=x as Partial<QueryIntent> | null;
  return !!i&&Array.isArray(i.visualTargets)&&Array.isArray(i.osmFeatureTypes)&&Array.isArray(i.spatialPredicates)&&typeof i.scope==="string";
}
function isExport(x:unknown):x is GeoJsonExport {
  const e=x as Partial<GeoJsonExport> | null;
  return !!e && e.type==="FeatureCollection" && Array.isArray(e.features) && e.features.every(f => f?.type === "Feature" && isGeoGeometry(f.geometry)) && e.metadata?.mode==="backend";
}
export function validateSearchResponse(raw:unknown):SearchResponse {
  const r=raw as Partial<SearchResponse> | null;
  if(!r||typeof r.query!=="string"||!isIntent(r.intent)||!Array.isArray(r.results)||!r.results.every(isResult)||!isExport(r.export))
    throw new Error("GeoSathi returned an invalid search response");
  return r as SearchResponse;
}
export async function runDiscovery(mode:DiscoveryMode,query:string,center?:[number,number],signal?:AbortSignal):Promise<SearchResponse> {
  if(mode==="demo") {
    if(normalize(query)!==normalize(supportedDemoQuery)) throw new Error("Demo only supports the fixed solar/drainage example");
    return {query,results:demoDiscoveryResults,intent:demoIntent,export:demoGeoJsonExport(query)};
  }
  return validateSearchResponse(await searchAtlas(query,center,signal));
}
