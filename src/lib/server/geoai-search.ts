/** One shared search pipeline for both browser and WhatsApp.
 * OSM geometries are map masks/footprints, NOT AI segmentation predictions.
 * SkyCLIP outputs image-tile similarity bboxes, NOT object detection boxes.
 */
import type { SearchResponse, DiscoveryResult, GeoGeometry } from "@/types/geo";
import { isGeoGeometry } from "@/lib/geo-validation";

type Center = { lat: number; lon: number };
type BBox = [number, number, number, number];
type Layer = "buildings" | "roads" | "places";
type OsmFeature = { id?: string | number; type?: string; geometry?: unknown; properties?: Record<string, unknown> | null };
export type SearchOutput = { response: SearchResponse; center: Center; bbox: BBox; source: "gis" | "skyclip" | "none"; layer?: Layer; issue?: string };
const PUNE: Center = { lat: 18.5204, lon: 73.8567 };
const GIS_TERMS: Record<Layer, string[]> = {
  buildings: ["building", "buildings", "house", "houses", "built-up", "built up", "roof", "structure", "इमारत", "भवन", "बिल्डिंग", "इमारती", "बांधकाम"],
  roads: ["road", "roads", "unpaved", "street", "highway", "route", "सड़क", "सड़क", "रास्ता", "रस्ता", "महामार्ग"],
  places: ["hospital", "clinic", "school", "college", "temple", "restaurant", "shop", "market", "library", "place", "poi", "अस्पताल", "रुग्णालय", "मंदिर", "शाळा", "स्कूल", "ग्रंथालय", "दुकान", "बाज़ार"],
};
const PLACE_TYPES: Array<[string, string[]]> = [
  ["hospital", ["hospital", "अस्पताल", "रुग्णालय"]],
  ["clinic", ["clinic", "दवाखाना"]],
  ["school", ["school", "स्कूल", "शाळा"]],
  ["college", ["college", "महाविद्यालय"]],
  ["temple", ["temple", "मंदिर"]],
  ["restaurant", ["restaurant", "रेस्तरां", "रेस्टॉरंट"]],
  ["library", ["library", "पुस्तकालय", "ग्रंथालय"]],
  ["market", ["market", "marketplace", "बाज़ार", "बाजार"]],
  ["shop", ["shop", "दुकान"]],
];
const bboxOf = (c: Center): BBox => {
  const dy = 0.020;
  const dx = dy / Math.max(0.2, Math.cos(c.lat * Math.PI / 180));
  return [Math.max(-180, c.lon-dx), Math.max(-90,c.lat-dy), Math.min(180,c.lon+dx), Math.min(90,c.lat+dy)];
};
export function validCenter(value: unknown): Center | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  // Required explicit longitude + latitude. Do not accidentally convert null to 0.
  if (v.lat === undefined || v.lat === null || v.lon === undefined || v.lon === null) return null;
  if (typeof v.lat !== "number" || typeof v.lon !== "number") return null;
  const lat = v.lat, lon = v.lon;
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat)<=90 && Math.abs(lon)<=180 ? {lat,lon} : null;
}
export const defaultCenter = PUNE;
export const regionFor = (center: Center) => bboxOf(center);
export function validBBox(value: unknown): value is BBox {
  return Array.isArray(value) && value.length === 4 && value.every((v) => typeof v === "number" && Number.isFinite(v)) &&
    value[0] >= -180 && value[2] <= 180 && value[1] >= -90 && value[3] <= 90 && value[0] < value[2] && value[1] < value[3];
}
const intersects = (a:BBox,b:BBox) => a[0]<=b[2] && a[2]>=b[0] && a[1]<=b[3] && a[3]>=b[1];
const inside = (a:BBox,b:BBox) => a[0]>=b[0] && a[2]<=b[2] && a[1]>=b[1] && a[3]<=b[3];
function pairs(x:unknown, result:number[][]) {
  if (!Array.isArray(x)) return;
  if (x.length>=2 && typeof x[0]==="number" && typeof x[1]==="number" && Number.isFinite(x[0]) && Number.isFinite(x[1])) {
    if (Math.abs(x[0])<=180 && Math.abs(x[1])<=90) result.push([x[0],x[1]]);
    return;
  }
  for (const child of x) pairs(child,result);
}
function geometryBounds(geometry:unknown):BBox|null {
  if (!geometry || typeof geometry!=="object") return null;
  const cs:number[][]=[];
  pairs((geometry as Record<string,unknown>).coordinates, cs);
  if (!cs.length) return null;
  let west=180,south=90,east=-180,north=-90;
  for(const [x,y] of cs){west=Math.min(west,x);south=Math.min(south,y);east=Math.max(east,x);north=Math.max(north,y);}
  return [west,south,east,north];
}
function polygonFor(b:BBox):GeoJSON.Polygon {
  const [w,s,e,n]=b;
  const dx=w===e ? 0.00006 : 0, dy=s===n ? 0.00006 : 0;
  return {type:"Polygon",coordinates:[[[w-dx,s-dy],[e+dx,s-dy],[e+dx,n+dy],[w-dx,n+dy],[w-dx,s-dy]]]};
}
function normalizeGeometry(raw:unknown):GeoGeometry|null {
  return isGeoGeometry(raw) ? raw : null;
}
function layerFor(query:string):Layer|null {
  const q=query.toLocaleLowerCase();
  // A hospital is a 'place', not an arbitrary generic building. Check specific places first.
  for (const [kind,words] of PLACE_TYPES) if (words.some(w=>q.includes(w))) { void kind; return "places"; }
  for (const kind of ["roads","buildings","places"] as const) if (GIS_TERMS[kind].some(w=>q.includes(w))) return kind;
  return null;
}
function subtypeFor(query:string):string|null {
  const q=query.toLocaleLowerCase();
  return PLACE_TYPES.find(([,terms])=>terms.some(t=>q.includes(t)))?.[0] || null;
}
const prop=(obj:Record<string,unknown>,key:string)=>typeof obj[key]==="string" ? String(obj[key]).toLocaleLowerCase() : "";
function hasSubtype(f:OsmFeature, subtype:string|null):boolean {
  if (!subtype) return true;
  const p=f.properties||{}, amenity=prop(p,"amenity"), healthcare=prop(p,"healthcare"), name=`${prop(p,"name")} ${prop(p,"name:en")}`;
  if (subtype==="hospital") return amenity==="hospital" || healthcare==="hospital" || /hospital|medical cent(er|re)|अस्पताल|रुग्णालय/.test(name);
  if (subtype==="clinic") return amenity==="clinic" || healthcare==="clinic" || /clinic|दवाखाना/.test(name);
  if (subtype==="school") return amenity==="school" || /school|विद्यालय|शाळा/.test(name);
  if (subtype==="college") return amenity==="college" || amenity==="university" || /college|university/.test(name);
  if (subtype==="temple") return (amenity==="place_of_worship" && prop(p,"religion")==="hindu") || /temple|मंदिर/.test(name);
  if (subtype==="restaurant") return amenity==="restaurant" || /restaurant|रेस्तरां/.test(name);
  if (subtype==="library") return amenity==="library" || /library|ग्रंथालय/.test(name);
  if (subtype==="market") return amenity==="marketplace" || /market|bazaar|bazar/.test(name);
  if (subtype==="shop") return Boolean(prop(p,"shop")) || /shop|store/.test(name);
  return true;
}
function matchesSurface(f:OsmFeature, q:string):boolean {
  if (!/unpaved|gravel|dirt|कच्चा|मातीचा/.test(q.toLocaleLowerCase())) return true;
  const p=f.properties||{}, surface=prop(p,"surface"), track=prop(p,"tracktype"), highway=prop(p,"highway");
  return /unpaved|gravel|dirt|earth|ground|sand|mud|compacted|fine_gravel|pebblestone/.test(surface) || /grade[2-5]/.test(track) || highway==="track";
}
function readableName(f:OsmFeature,layer:Layer,index:number):string {
  const p=f.properties||{};
  for (const k of ["name","name:en","amenity","highway","building","place"]) if (typeof p[k]==="string" && String(p[k]).trim()) return String(p[k]);
  return `${layer.slice(0,-1)} ${index+1}`;
}
function distanceSquared(b:BBox,c:Center):number {const x=(b[0]+b[2])/2-c.lon,y=(b[1]+b[3])/2-c.lat;return (x*Math.cos(c.lat*Math.PI/180))**2+y*y;}
function resultGeo(query:string, results:DiscoveryResult[], layer:Layer | null, center:Center):SearchResponse {
  return { query, intent:{visualTargets:[query],osmFeatureTypes:layer?[layer]:[],spatialPredicates:[],scope:`${center.lat.toFixed(5)}, ${center.lon.toFixed(5)} (search area)`}, results,
    export:{type:"FeatureCollection",features:results.map(r=>({type:"Feature" as const,properties:{id:r.id,title:r.title,source:r.source,status:r.status||"unknown",score:r.score??null},geometry:r.geometry})),metadata:{query,mode:"backend",generatedAt:new Date().toISOString()}}
  };
}
export async function searchGeoSathi(query:string, center:Center, requestedBBox?:BBox):Promise<SearchOutput> {
  const bbox=requestedBBox || bboxOf(center);
  const layer=layerFor(query);
  const subtype=layer==="places"?subtypeFor(query):null;
  const gisBase=process.env.GEOSATHI_API_BASE_URL?.replace(/\/+$/,"");
  let issue="";
  if (layer && gisBase) {
    try {
      const [west,south,east,north]=bbox;
      const params=new URLSearchParams({layer,west:String(west),south:String(south),east:String(east),north:String(north),limit:"2000"});
      const res=await fetch(`${gisBase}/api/v1/osm?${params}`,{headers:{Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(16000)});
      if (!res.ok) throw new Error(`GIS HTTP ${res.status}`);
      const data=(await res.json()) as {type?:string;features?:OsmFeature[]};
      if(data.type!=="FeatureCollection" || !Array.isArray(data.features)) throw new Error("Malformed GIS GeoJSON");
      const matches = data.features.filter(f=>f && typeof f === "object" && hasSubtype(f,subtype) && (layer!=="roads" || matchesSurface(f,query)));
      const results=matches.map((f,i)=>{
        const native=normalizeGeometry(f.geometry),bounds=geometryBounds(f.geometry);
        if(!native || !bounds || !intersects(bounds,bbox)) return null;
        const uid=String(f.id??f.properties?.osm_id??f.properties?.id??i+1);
        return { id:`osm:${layer}:${uid}`,kind:"search" as const,title:readableName(f,layer,i),
          geometry:native,source:"OpenStreetMap via GeoSathi/PostGIS",status:"gis_verified",bounds,
          imageTileId:`OSM:${uid}`,groundedObjects:[],osmFeatures:[{osmId:uid,type:layer,geometry:native}],relationships:[],
          distance:distanceSquared(bounds,center)
        };
      }).filter((x): x is NonNullable<typeof x>=>x!==null)
        .sort((a,b)=>a.distance-b.distance).slice(0,350)
        .map(({distance,...r})=>{void distance;return r;});
      if(results.length) return {center,bbox,layer,source:"gis",response:resultGeo(query,results,layer,center)};
      issue=`No ${subtype || layer}${layer==="roads" && /unpaved/.test(query.toLowerCase()) ? " tagged unpaved" : ""} in GIS dataset for this area`;
    } catch (error) {issue=error instanceof Error ? error.message : "GIS request failed";}
  } else if(layer&&!gisBase) issue="GeoSathi GIS backend not configured";

  // SkyCLIP is a retrieval model indexed on *limited* imagery, not a detector.
  const modelBase=process.env.SKYCLIP_BASE_URL?.replace(/\/+$/,"");
  const token=process.env.SKYCLIP_SERVICE_TOKEN;
  if (!modelBase || !token) return {center,bbox,layer:layer||undefined,source:"none",issue:issue||"SkyCLIP not configured",response:resultGeo(query,[],layer,center)};
  try {
    const upstream=await fetch(`${modelBase}/search`,{
      method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
      body:JSON.stringify({query,bbox,top_k:25}),signal:AbortSignal.timeout(45000),cache:"no-store"});
    if (!upstream.ok) throw new Error(`SkyCLIP HTTP ${upstream.status}`);
    const value=await upstream.json() as {results?:Array<{tile_id:string;bbox:BBox;similarity:number;source?:string;acquired_at?:string}>};
    const tiles=(Array.isArray(value.results)?value.results:[]).filter(t=>t && typeof t.tile_id === "string" && typeof t.similarity === "number" && Number.isFinite(t.similarity) && validBBox(t.bbox) && inside(t.bbox,bbox));
    const results:DiscoveryResult[]=tiles.slice(0,15).map((tile,i)=>({
      id:`tile:${tile.tile_id}`,kind:"search",title:`Imagery candidate ${i+1}`,geometry:polygonFor(tile.bbox),
      source:tile.source||"SkyCLIP image index",status:"candidate",bounds:tile.bbox,score:tile.similarity,
      imageTileId:tile.tile_id,imageCapturedAt:tile.acquired_at,
      evidence:"SkyCLIP similarity to a tile, not a verified road/building mask or object boundary.",
      groundedObjects:[],osmFeatures:[],relationships:[],
    }));
    return {center,bbox,layer:layer||undefined,source:results.length?"skyclip":"none",issue:issue||undefined,response:resultGeo(query,results,layer,center)};
  } catch(e) {
    return {center,bbox,layer:layer||undefined,source:"none",issue:[issue,e instanceof Error?e.message:"SkyCLIP unavailable"].filter(Boolean).join("; "),response:resultGeo(query,[],layer,center)};
  }
}
