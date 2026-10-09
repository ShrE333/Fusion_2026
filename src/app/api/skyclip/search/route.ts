import { NextResponse } from "next/server";
import { defaultCenter, searchGeoSathi, validBBox, validCenter } from "@/lib/server/geoai-search";

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
  const out=await searchGeoSathi(query,center,validBBox(body.bbox)?body.bbox:undefined);
  return NextResponse.json({...out.response,search_meta:{source:out.source,layer:out.layer,search_bbox:out.bbox,center:out.center,issue:out.issue||null}},{headers:{"Cache-Control":"no-store"}});
}
