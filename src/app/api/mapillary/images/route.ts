import { NextResponse } from "next/server";
import { MAPILLARY_SEARCH_HALF_EXTENT_METERS, MAPILLARY_SEARCH_LIMIT, normalizeMapillaryImages } from "@/lib/api/mapillary";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(request:Request){
  const params=new URL(request.url).searchParams;
  const latText=params.get("lat"),lonText=params.get("lon");
  const lat=Number(latText),lon=Number(lonText);
  if(!latText?.trim()||!lonText?.trim()||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>85||Math.abs(lon)>180)
    return reply({error:"Valid longitude and latitude between -85 and 85 are required for a bounded lookup."},422);
  const token=process.env.MAPILLARY_ACCESS_TOKEN;
  if(!token)return reply({error:"Mapillary lookup not configured.",kind:"unconfigured"},503);
  const dy=MAPILLARY_SEARCH_HALF_EXTENT_METERS/111320;
  const dx=dy/Math.cos(lat*Math.PI/180);
  const bbox=[Math.max(-180,lon-dx),lat-dy,Math.min(180,lon+dx),lat+dy];
  const query=new URLSearchParams({
    fields:"id,computed_geometry,captured_at,compass_angle,computed_compass_angle,camera_type,thumb_256_url,sequence",
    bbox:bbox.join(","),limit:String(MAPILLARY_SEARCH_LIMIT),
  });
  try{
    const response=await fetch(`https://graph.mapillary.com/images?${query}`,{
      headers:{Authorization:`OAuth ${token}`},cache:"no-store",redirect:"error",
      signal:AbortSignal.any([request.signal,AbortSignal.timeout(12000)]),
    });
    if(response.status===401||response.status===403)return reply({error:"Mapillary authorization failed.",kind:"auth"},response.status);
    if(response.status===404)return reply({data:[],coverage:"unavailable"});
    if(response.status===429)return reply({error:"Mapillary rate limit reached.",kind:"provider"},429);
    if(!response.ok)return reply({error:"Mapillary provider unavailable.",kind:"provider"},502);
    const payload:unknown=await response.json();
    const raw=(payload as {data?:unknown}|null)?.data;
    if(!Array.isArray(raw))return reply({error:"Invalid Mapillary response.",kind:"provider"},502);
    // Return only explicit safe fields; never forward provider errors, URLs with
    // credentials, pagination tokens, or raw metadata to the browser.
    const images=normalizeMapillaryImages(raw).filter(image=>
      image.coordinates[0]>=bbox[0]&&image.coordinates[0]<=bbox[2]&&image.coordinates[1]>=bbox[1]&&image.coordinates[1]<=bbox[3]);
    const data=images.map(image=>({
      id:image.id,computed_geometry:{type:"Point",coordinates:image.coordinates},
      captured_at:image.capturedAt,compass_angle:image.compassAngle,camera_type:image.cameraType,
      thumb_256_url:image.thumbnailUrl&&/^https:\/\//.test(image.thumbnailUrl)&&!image.thumbnailUrl.includes(token)?image.thumbnailUrl:undefined,
      sequence:image.sequenceId,
    }));
    if(JSON.stringify(data).includes(token))return reply({error:"Invalid Mapillary response.",kind:"provider"},502);
    return reply({data,coverage:data.length?"available":"unavailable"});
  }catch(error){
    const timeout=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError");
    return reply({error:timeout?"Mapillary lookup timed out.":"Mapillary provider unreachable.",kind:"network"},timeout?504:502);
  }
}
