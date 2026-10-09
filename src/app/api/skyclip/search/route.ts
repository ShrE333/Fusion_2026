import { NextResponse } from "next/server";
import { defaultCenter, searchGeoSathi, validBBox, validCenter } from "@/lib/server/geoai-search";
import { parseLandcoverQuery, SatelliteProviderError, searchSentinelLandcover } from "@/lib/server/sentinel-landcover";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request) {
  const raw:unknown=await request.json().catch(()=>null);
  if(!raw||typeof raw!=="object"||Array.isArray(raw)) return NextResponse.json({error:"A JSON object is required"},{status:422});
  const body=raw as {query?:unknown;center?:unknown;bbox?:unknown};
  const query=typeof body.query==="string"?body.query.trim():"";
  if(query.length<3||query.length>1000) return NextResponse.json({error:"Query length must be 3–1000 characters"},{status:422});
  if(body.center!==undefined&&!validCenter(body.center)) return NextResponse.json({error:"Invalid location pin"},{status:422});
  if(body.bbox!==undefined&&!validBBox(body.bbox)) return NextResponse.json({error:"Invalid search bounds"},{status:422});
  const center=validCenter(body.center)||defaultCenter;
  // Satellite queries must never be silently substituted with unrelated SkyCLIP tiles.
  try {
    const landcover = parseLandcoverQuery(query);
    if (landcover) {
      if (body.bbox !== undefined) return NextResponse.json({error:"Sentinel-2 currently uses a location + radius, not custom bounding boxes."},{status:422});
      const mapped = await searchSentinelLandcover(query,center,landcover);
      return NextResponse.json({...mapped.response,search_meta:{source:"sentinel2",layer:"landcover",center,search_bbox:mapped.bbox,issue:null}},{headers:{"Cache-Control":"no-store"}});
    }
  } catch (error) {
    const status=error instanceof SatelliteProviderError ? error.status : error instanceof Error && /radius|minimum area/i.test(error.message) ? 422 : 503;
    const message=error instanceof Error ? error.message : "Sentinel-2 processing could not be completed";
    return NextResponse.json({error:message},{status,headers:{"Cache-Control":"no-store"}});
  }
  const out=await searchGeoSathi(query,center,validBBox(body.bbox)?body.bbox:undefined);
  return NextResponse.json({...out.response,search_meta:{source:out.source,layer:out.layer,search_bbox:out.bbox,center:out.center,issue:out.issue||null}},{headers:{"Cache-Control":"no-store"}});
}
