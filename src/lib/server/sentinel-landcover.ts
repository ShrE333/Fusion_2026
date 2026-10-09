/** Production-optional Sentinel-2 L2A classifier via Sentinel Hub Process API.
 * This is spectral/SCL candidate mapping at ~10m, NOT parcel detection or legal suitability.
 * No credentials or provider data are fabricated when the service is unavailable.
 */
import type { SearchResponse, DiscoveryResult } from "@/types/geo";
import { extractCandidates, parseLandcoverQuery, type Bounds, type ParsedLandcover } from "./landcover-core";
import { decodeClassificationPng } from "./sentinel-png";
export { parseLandcoverQuery } from "./landcover-core";

const TOKEN_URL="https://services.sentinel-hub.com/auth/realms/main/protocol/openid-connect/token";
const PROCESS_URL="https://services.sentinel-hub.com/api/v1/process";
let savedToken="",tokenExpires=0;
// Based on SCL and spectral NDVI/NDWI; deliberately conservative on cloud/no-data.
// Classification: 10 bare/open candidate; 20 vegetation; 30 dense vegetation;
// 40 water; 50 other surfaces; 0 excluded cloud/shadow/no-data.
const EVALSCRIPT=`//VERSION=3
function setup(){return {input:["B03","B04","B08","B11","SCL","dataMask"],output:{bands:4,sampleType:"UINT8"}};}
function evaluatePixel(s){
 if(!s.dataMask||[0,1,2,3,7,8,9,10,11].includes(s.SCL))return [0,0,0,255];
 var ndvi=(s.B08-s.B04)/(s.B08+s.B04+0.000001);
 var ndwi=(s.B03-s.B08)/(s.B03+s.B08+0.000001);
 var ndbi=(s.B11-s.B08)/(s.B11+s.B08+0.000001);
 if(s.SCL===6||ndwi>0.3)return [40,0,0,255];
 if(s.SCL===4&&ndvi>=0.58)return [30,0,0,255];
 if(s.SCL===4&&ndvi>=0.27)return [20,0,0,255];
 if(s.SCL===5&&ndvi<0.22&&ndbi<0.16)return [10,0,0,255];
 return [50,0,0,255];
}`;

export class SatelliteProviderError extends Error {
  constructor(message:string,readonly status:number=503){super(message);this.name="SatelliteProviderError";}
}
async function acquireToken():Promise<string>{
  if(savedToken&&Date.now()<tokenExpires)return savedToken;
  const id=process.env.SENTINEL_HUB_CLIENT_ID,secret=process.env.SENTINEL_HUB_CLIENT_SECRET;
  if(!id||!secret)throw new SatelliteProviderError("Sentinel-2 search is not enabled: set SENTINEL_HUB_CLIENT_ID and SENTINEL_HUB_CLIENT_SECRET in Vercel Production.");
  let response:Response;
  try{
    response=await fetch(TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"client_credentials",client_id:id,client_secret:secret}),signal:AbortSignal.timeout(12000),cache:"no-store"});
  }catch{throw new SatelliteProviderError("Could not contact Sentinel Hub authentication service.");}
  if(!response.ok)throw new SatelliteProviderError(`Sentinel Hub authentication failed (HTTP ${response.status}); check OAuth credentials and subscription.`);
  const value=await response.json() as {access_token?:unknown;expires_in?:unknown};
  if(typeof value.access_token!=="string"||!value.access_token)throw new SatelliteProviderError("Sentinel Hub did not provide an access token.");
  savedToken=value.access_token;
  tokenExpires=Date.now()+Math.max(60,Number(value.expires_in)||300)*1000-60_000;
  return savedToken;
}
function boundsFor(center:{lat:number;lon:number},radiusM:number):Bounds {
  const dy=radiusM/111320,dx=radiusM/(111320*Math.max(0.05,Math.cos(center.lat*Math.PI/180)));
  return [center.lon-dx,center.lat-dy,center.lon+dx,center.lat+dy];
}
export async function searchSentinelLandcover(query:string,center:{lat:number;lon:number},parsed?:ParsedLandcover):Promise<{response:SearchResponse;bbox:Bounds}> {
  const target=parsed??parseLandcoverQuery(query);
  if(!target)throw new SatelliteProviderError("Query is not a supported Sentinel-2 land-cover query.",422);
  if(Math.abs(center.lat)>80)throw new SatelliteProviderError("Sentinel-2 classification is currently supported below 80° latitude.",422);
  const bbox=boundsFor(center,target.radiusM);
  const metres=2*target.radiusM;
  const side=Math.min(256,Math.max(24,Math.round(metres/10)));
  const to=new Date(),from=new Date(to.getTime()-120*86400_000);
  const windowFrom=from.toISOString(),windowTo=to.toISOString();
  const token=await acquireToken();
  const request={
    input:{bounds:{bbox,properties:{crs:"http://www.opengis.net/def/crs/OGC/1.3/CRS84"}},data:[{
      type:"sentinel-2-l2a",dataFilter:{timeRange:{from:windowFrom,to:windowTo},maxCloudCoverage:80,mosaickingOrder:"leastCC"},
      processing:{upsampling:"NEAREST",downsampling:"NEAREST"}
    }]},
    output:{width:side,height:side,responses:[{identifier:"default",format:{type:"image/png"}}]},
    evalscript:EVALSCRIPT,
  };
  let provider:Response;
  try{
    provider=await fetch(PROCESS_URL,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",Accept:"image/png"},body:JSON.stringify(request),signal:AbortSignal.timeout(28000),cache:"no-store"});
  }catch{throw new SatelliteProviderError("Sentinel Hub timed out or could not be reached; retry shortly.");}
  if(!provider.ok){
    if(provider.status===401){savedToken="";tokenExpires=0;}
    throw new SatelliteProviderError(`Sentinel Hub processing returned HTTP ${provider.status}. Verify account access, quota, and cloud-free coverage.`);
  }
  const contentType=provider.headers.get("content-type")||"";
  if(!contentType.includes("image/png"))throw new SatelliteProviderError("Sentinel Hub returned a non-PNG image response.");
  const headerLength=Number(provider.headers.get("content-length"));
  if(Number.isFinite(headerLength)&&headerLength>6_000_000)throw new SatelliteProviderError("Satellite result exceeds safety limit.");
  const bytes=Buffer.from(await provider.arrayBuffer());
  let decoded:ReturnType<typeof decodeClassificationPng>;
  try{decoded=decodeClassificationPng(bytes);}catch{throw new SatelliteProviderError("Sentinel Hub raster format could not be decoded.");}
  const candidates=extractCandidates(decoded.pixels,decoded.width,decoded.height,bbox,center,target);
  const results:DiscoveryResult[]=candidates.map(candidate=>({
    id:candidate.id,kind:"search",title:`${target.kind==="open"?"Open/bare land":target.kind==="forest"?"Dense vegetation":target.kind==="water"?"Water cover":"Vegetation"} · ~${candidate.areaM2.toLocaleString("en-IN")} m²`,
    source:"Sentinel-2 L2A / Sentinel Hub spectral classification",status:"satellite_candidate",geometry:candidate.geometry,bounds:candidate.bounds,
    imageTileId:`Sentinel-2 ${windowFrom.slice(0,10)}–${windowTo.slice(0,10)}`,
    evidence:`Estimated ${candidate.pixels} classified pixels (~${Math.round(candidate.rasterCellM2)} m²/cell), observed within ${target.radiusM}m radius using last-120-day least-cloudy Sentinel-2 L2A. Grid-cell boundaries only. Not verified vacant property, parcel, legal availability, zoning, river centerline or a building permit.`,
    groundedObjects:[],osmFeatures:[],relationships:[],
  }));
  const response:SearchResponse={query,
    intent:{visualTargets:[target.kind],osmFeatureTypes:["Sentinel-2 L2A spectral classification"],spatialPredicates:["within_distance"],distanceMetres:target.radiusM,scope:`${center.lat.toFixed(5)}, ${center.lon.toFixed(5)}; minimum ${target.minimumAreaM2} m²`},
    results,
    export:{type:"FeatureCollection",features:results.map(r=>({type:"Feature" as const,geometry:r.geometry,properties:{id:r.id,title:r.title,source:r.source,status:r.status,evidence:r.evidence,approximate:true}})),metadata:{mode:"backend",query,generatedAt:new Date().toISOString()}}
  };
  return {response,bbox};
}
