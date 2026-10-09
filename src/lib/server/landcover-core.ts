/** Sentinel-2 L2A experimental land-cover search; pixels are candidates, not legal parcels. */
export type LCClass = "open" | "forest" | "vegetation" | "water";
export type LonLat = [number, number];
export type Bounds = [number, number, number, number];
export interface ParsedLandcover { kind: LCClass; radiusM: number; minimumAreaM2: number; }
export interface Candidate {
  className: LCClass;
  id: string;
  geometry: GeoJSON.MultiPolygon;
  bounds: Bounds;
  areaM2: number;
  pixels: number;
  rasterCellM2: number;
  centroid: LonLat;
}
const PATTERNS: Record<LCClass, RegExp> = {
  open: /\b(open (land|spaces?|plots?|areas?)|(?:empty|emply) (land|spaces?|plots?|areas?)|vacant (land|plots?|spaces?)|bare (land|soil|ground)|undeveloped (land|plots?)|unused land|free land|land for (building|construction))\b|खाली जागा|मोकळी जागा/i,
  forest: /\b(forests?|woodlands?|tree cover|dense trees|green cover|vegetation cover)\b|जंगल|वनक्षेत्र/i,
  vegetation: /\b(vegetation|grassland|grass cover|greenery|green spaces?)\b|गवताळ/i,
  water: /\b(rivers?|streams?|lakes?|ponds?|reservoirs?|water ?bodies|waterways?)\b|नदी|तलाव|जलाशय/i,
};
export function parseLandcoverQuery(query: string): ParsedLandcover | null {
  const kind = (Object.keys(PATTERNS) as LCClass[]).find(k => PATTERNS[k].test(query));
  if (!kind) return null;
  const radius = query.match(/\b(?:within|with|radius(?: of)?|in a radius of|up to|around)\s*(\d+(?:\.\d+)?)\s*(km|kilomet(?:er|re)s?|m|met(?:er|re)s?)\b/i);
  const radiusM = radius ? Number(radius[1]) * (/^k/i.test(radius[2]) ? 1000 : 1) : 500;
  const area = query.match(/\b(?:at least|min(?:imum)?(?: area)?|larger than|more than|over|above)\s*(\d+(?:\.\d+)?)\s*(m2|m²|sq\.?\s*m|square met(?:er|re)s?|ha|hectares?)(?=$|\s|[.,;])/i);
  const minimumAreaM2 = area ? Number(area[1]) * (/^h/i.test(area[2]) ? 10000 : 1) : kind === "open" ? 400 : 200;
  if (!Number.isFinite(radiusM) || radiusM <= 0 || radiusM > 2000) throw new Error("Satellite search radius must be between 1 metre and 2 km.");
  if (!Number.isFinite(minimumAreaM2) || minimumAreaM2 < 0 || minimumAreaM2 > 4000000) throw new Error("Requested minimum area is outside the supported range (0–4,000,000 m²).");
  return { kind, radiusM, minimumAreaM2 };
}
export const classCode: Record<LCClass, number> = { open: 10, forest: 30, vegetation: 20, water: 40 };

/** Convert categorized raster cells to precise *pixel-grid* rectangles grouped by contiguous regions.
 * MultiPolygon includes pixel-run rectangles; no parcel or high-resolution boundary is claimed.
 */
export function extractCandidates(pixels: Uint8Array, width: number, height: number, bbox: Bounds, center: {lat:number;lon:number}, query: ParsedLandcover): Candidate[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width<1 || height<1 || width*height>80000 || pixels.length!==width*height) throw new Error("Invalid classified raster dimensions");
  const dx=(bbox[2]-bbox[0])/width, dy=(bbox[3]-bbox[1])/height;
  const metreX=111320*Math.cos(center.lat*Math.PI/180), metreY=111320;
  const cellM2=Math.abs(dx*metreX*dy*metreY);
  const accepted=new Uint8Array(width*height), seen=new Uint8Array(width*height);
  const needed=classCode[query.kind];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const lon=bbox[0]+(x+.5)*dx,lat=bbox[3]-(y+.5)*dy;
    if(pixels[y*width+x]===needed && Math.hypot((lon-center.lon)*metreX,(lat-center.lat)*metreY)<=query.radiusM) accepted[y*width+x]=1;
  }
  const groups: number[][]=[];
  for(let i=0;i<accepted.length;i++){
    if(!accepted[i]||seen[i])continue;
    const component:number[]=[],queue=[i];seen[i]=1;
    for(let head=0;head<queue.length;head++){
      const at=queue[head],x=at%width,y=Math.floor(at/width);component.push(at);
      const neighbours=[x>0?at-1:-1,x<width-1?at+1:-1,y>0?at-width:-1,y<height-1?at+width:-1];
      for(const next of neighbours)if(next>=0&&accepted[next]&&!seen[next]){seen[next]=1;queue.push(next);}
    }
    if(component.length*cellM2>=query.minimumAreaM2)groups.push(component);
  }
  groups.sort((a,b)=>b.length-a.length);
  return groups.slice(0,40).flatMap((members,i)=>{
    const cells=new Set(members);
    let minX=width,minY=height,maxX=-1,maxY=-1,sx=0,sy=0;
    for(const at of members){const x=at%width,y=Math.floor(at/width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);sx+=x+.5;sy+=y+.5;}
    // Merge vertically adjacent identical horizontal runs; preserves class pixel extents.
    const merged:Array<{x0:number;x1:number;y0:number;y1:number}>=[];
    let current=new Map<string,{x0:number;x1:number;y0:number;y1:number}>();
    for(let y=minY;y<=maxY;y++){
      const next=new Map<string,{x0:number;x1:number;y0:number;y1:number}>();
      for(let x=minX;x<=maxX;){if(!cells.has(y*width+x)){x++;continue;}
        const from=x;while(x<=maxX&&cells.has(y*width+x))x++;
        const key=`${from}:${x}`, prior=current.get(key);
        const rect=prior?{...prior,y1:y+1}:{x0:from,x1:x,y0:y,y1:y+1};next.set(key,rect);
      }
      for(const [key,rect] of current)if(!next.has(key))merged.push(rect);
      current=next;
    }
    merged.push(...current.values());
    // Excessively fragmented noisy rasters should be ignored rather than misleadingly polygonized.
    if(merged.length>2400)return [];
    const polygons:GeoJSON.Position[][][]=merged.map(r=>{const west=bbox[0]+r.x0*dx,east=bbox[0]+r.x1*dx,north=bbox[3]-r.y0*dy,south=bbox[3]-r.y1*dy;
      return [[[west,south],[east,south],[east,north],[west,north],[west,south]]];
    });
    return [{id:`s2:${query.kind}:${i+1}`,className:query.kind,geometry:{type:"MultiPolygon" as const,coordinates:polygons},
      bounds:[bbox[0]+minX*dx,bbox[3]-(maxY+1)*dy,bbox[0]+(maxX+1)*dx,bbox[3]-minY*dy] as Bounds,
      areaM2:Math.round(members.length*cellM2),pixels:members.length,rasterCellM2:cellM2,
      centroid:[bbox[0]+sx/members.length*dx,bbox[3]-sy/members.length*dy] as LonLat}];
  });
}
