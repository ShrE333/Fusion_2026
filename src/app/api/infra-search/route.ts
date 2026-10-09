import { NextResponse } from "next/server";
import { searchGeoSathi, validCenter } from "@/lib/server/geoai-search";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request) {
  const token=process.env.SKYCLIP_SERVICE_TOKEN;
  if(!token) return NextResponse.json({error:"Service authorization not configured"},{status:503});
  if(request.headers.get("authorization")!==`Bearer ${token}`) return NextResponse.json({error:"Unauthorized"},{status:401});
  const raw:unknown=await request.json().catch(()=>null);
  if(!raw||typeof raw!=="object"||Array.isArray(raw)) return NextResponse.json({error:"A JSON object is required"},{status:422});
  const body=raw as {query_id?:unknown;query?:unknown;location?:unknown};
  const query=typeof body.query==="string"?body.query.trim():"";
  const center=validCenter(body.location);
  if(query.length<3||query.length>1000||!center) return NextResponse.json({error:"A query and valid location pin are required"},{status:422});
  const search=await searchGeoSathi(query,center);
  const results=search.response.results.slice(0,10).map(r=>{
    const b=r.bounds!;
    return {
      id:r.id,name:r.title,kind:search.source==="gis"?"gis_feature":"imagery_candidate",
      gis_verified:search.source==="gis",gis_layer:search.layer??null,
      // Exact geographic geometry is retained for the linked mobile map.
      geometry:r.geometry,bbox:b,center:{lat:(b[1]+b[3])/2,lon:(b[0]+b[2])/2},
      source:r.source,similarity:r.score??null,properties:{status:r.status},
    };
  });
  return NextResponse.json({
    query_id:typeof body.query_id==="string"?body.query_id:"",query,
    location:center,search_bbox:search.bbox,model:search.source==="gis"?"GeoSathi/PostGIS":"SkyCLIP imagery retrieval",
    status:search.source==="gis"?"gis_matches":results.length?"candidate_matches":"no_indexed_match",
    gis_verified:search.source==="gis",gis_layer:search.layer??null,
    gis_error:search.issue||null,results,
    note:search.source==="gis"?"GIS geometries verified against the OSM/PostGIS layer (not model segmentation)":
      search.source==="skyclip"?"Unverified image-tile candidates, not object detections":"No matching GIS geometry or indexed SkyCLIP tile in the selected area",
  },{headers:{"Cache-Control":"no-store"}});
}
