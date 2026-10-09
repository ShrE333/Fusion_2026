import { config } from "@/lib/config";
import type { SearchResponse } from "@/types/geo";
export async function searchAtlas(query:string,center?:[number,number],signal?:AbortSignal):Promise<SearchResponse> {
  if(!config.apiBaseUrl) throw new Error("GeoSathi search URL not configured");
  const result=await fetch(`${config.apiBaseUrl}/search`,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({query,center:center?{lon:center[0],lat:center[1]}:undefined}),signal,cache:"no-store"});
  const payload=await result.json().catch(()=>({})) as SearchResponse & {error?:string};
  if(!result.ok) throw new Error(payload.error||`Search failed (${result.status})`);
  return payload;
}
