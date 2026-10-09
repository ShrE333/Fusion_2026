"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Crosshair, MapPin, Satellite, Search } from "lucide-react";
import { AtlasMap } from "@/components/map/atlas-map";
import { AtlasNav } from "@/components/shell/atlas-nav";
import { MapillaryViewer } from "@/components/street-view/mapillary-viewer";
import { searchMapillaryImages, type MapillaryImage } from "@/lib/api/mapillary";
import { runDiscovery } from "@/lib/discovery/service";
import { config } from "@/lib/config";
import type { DiscoveryResult } from "@/types/geo";
import "./inspect.css";

const PUNE:[number,number]=[73.8567,18.5204];
function parseLocation(latValue:string|null,lonValue:string|null):[number,number] | null {
  if(!latValue||!lonValue)return null;
  const lat=Number(latValue),lon=Number(lonValue);
  return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180 ? [lon,lat] : null;
}
function InspectionWorkspace(){
  const params=useSearchParams();
  const location=useMemo(()=>parseLocation(params.get("lat"),params.get("lon"))||PUNE,[params]);
  const initialQuery=useMemo(()=>params.get("q")?.slice(0,300)||"buildings near me",[params]);
  const featureId=params.get("feature_id");
  const [query,setQuery]=useState(initialQuery);
  const [results,setResults]=useState<DiscoveryResult[]>([]);
  const [selected,setSelected]=useState<DiscoveryResult>();
  const [view,setView]=useState<"map"|"street">("map");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [images,setImages]=useState<MapillaryImage[]>([]);
  const [imageId,setImageId]=useState("");
  const [streetError,setStreetError]=useState("");
  const [streetLoading,setStreetLoading]=useState(false);
  const [cameraId,setCameraId]=useState(0);
  const [cameraTarget,setCameraTarget]=useState<{id:number;coordinates:[number,number];zoom:number}>();
  const sourceKey=`${location.join(",")}|${initialQuery}`;
  const requestId=useRef(0);
  const streetRequestId=useRef(0);
  const search=useCallback(async (q:string)=>{
    const nextId=++requestId.current;
    setLoading(true);setError("");setNotice("");setSelected(undefined);
    try{
      const response=await runDiscovery("api",q,location);
      if(nextId!==requestId.current)return;
      setResults(response.results);
      setNotice(response.search_meta?.source==="gis"
        ? `${response.results.length} GIS feature(s); polygons are OSM footprints, not AI-generated masks.`
        : response.search_meta?.source==="skyclip"
          ? `${response.results.length} imagery tile candidate(s). Rectangles are TILE footprints, not building detections.`
          : response.search_meta?.issue || "No GIS features or indexed imagery found for this location.");
      if(response.results.length){
        const top=response.results.find(item=>item.id===featureId) || response.results[0];
        setSelected(top);
        const b=top.bounds;
        if(b){const id=Date.now();setCameraId(id);setCameraTarget({id,coordinates:[(b[0]+b[2])/2,(b[1]+b[3])/2],zoom:16});}
      }else setResults([]);
    }catch(e){if(nextId===requestId.current){setResults([]);setError(e instanceof Error?e.message:"Search failed");}}
    finally{if(nextId===requestId.current)setLoading(false);}
  },[location,featureId]);
  useEffect(()=>{
    const timer=setTimeout(()=>{void search(initialQuery);},0);
    const counter=requestId;
    return ()=>{clearTimeout(timer);counter.current++;};
  },[search,initialQuery,sourceKey]);
  useEffect(()=>{
    const update=()=>{if(window.location.hash==="#street")setView("street");};
    const timer=setTimeout(update,0);
    window.addEventListener("hashchange",update);
    return ()=>{clearTimeout(timer);window.removeEventListener("hashchange",update);};
  },[]);

  const streetLocation=useMemo<[number,number]>(()=>{
    const b=selected?.bounds;
    return b?[(b[0]+b[2])/2,(b[1]+b[3])/2]:location;
  },[selected,location]);
  useEffect(()=>{
    if(view!=="street")return;
    const current=++streetRequestId.current;
    const counter=streetRequestId;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
    setStreetError("");setImages([]);setImageId("");
    setStreetLoading(true);
    searchMapillaryImages(streetLocation,controller.signal).then(found=>{
      if(current!==streetRequestId.current||controller.signal.aborted)return;
      const sorted=[...found].sort((a,b)=>
        Math.hypot(a.coordinates[0]-streetLocation[0],a.coordinates[1]-streetLocation[1]) -
        Math.hypot(b.coordinates[0]-streetLocation[0],b.coordinates[1]-streetLocation[1]));
      setImages(sorted);if(sorted.length)setImageId(sorted[0].id);
      else setStreetError("No Mapillary street images for this nearby search area. No other city's imagery is substituted.");
    }).catch(e=>{if(current===streetRequestId.current&&!controller.signal.aborted)setStreetError(e instanceof Error?e.message:"Mapillary request failed");})
      .finally(()=>{if(current===streetRequestId.current&&!controller.signal.aborted)setStreetLoading(false);});
    },0);
    return ()=>{clearTimeout(timer);controller.abort();counter.current++;};
  },[view,streetLocation]);

  return <main className="inspect-page">
    <AtlasNav/>
    <div className="inspect-inner">
      <header className="inspect-header">
        <div><Link href="/" className="inspect-home"><ArrowLeft size={15}/> GeoSathi Atlas</Link><h1>Infrastructure inspection</h1><small><MapPin size={12}/> {location[1].toFixed(5)}, {location[0].toFixed(5)} · source: {parseLocation(params.get("lat"),params.get("lon")) ? "link coordinates" : "Pune default (no location pin supplied)"}</small></div>
        <div className="inspect-toggle" role="group" aria-label="Inspection view"><button className={view==="map"?"active":""} onClick={()=>setView("map")}>Map + footprints</button><button className={view==="street"?"active":""} onClick={()=>setView("street")}>Street imagery</button></div>
      </header>
      <form className="inspect-search" onSubmit={e=>{e.preventDefault();void search(query);}}><Search size={18}/><input aria-label="Infrastructure query" value={query} onChange={e=>setQuery(e.target.value)}/><button type="submit" disabled={loading}>{loading?"Searching…":"Search"}</button></form>
      {error&&<div className="inspect-warning" role="alert">{error}</div>}
      {notice&&<div className="inspect-note" role="status">{notice}</div>}
      <div className="inspect-workspace">
        <section className="inspect-map" hidden={view!=="map"}>
          <AtlasMap
            features={results} visible={{search:true,hazard:false,infrastructure:false}}
            selected={selected} onSelect={feature=>{const match=results.find(r=>r.id===feature.id);if(match)setSelected(match);}}
            initialView={{center:location,zoom:14}} cameraTarget={cameraTarget} userLocation={{coordinates:location,label:"Shared search location"}}
          />
          <div className="inspect-map-caption"><Satellite size={13}/> Street/Satellite toggle at top right (MapTiler key required for satellite). Colored filled areas are GIS/OSM footprints.</div>
        </section>
        {view==="street"&&<section className="inspect-street">
          {streetLoading&&<div className="inspect-street-message">Looking up Mapillary captures near this exact location…</div>}
          {streetError&&<div className="inspect-street-message" role="status">{streetError}</div>}
          {imageId&&config.mapillaryAccessToken&&<div className="inspect-viewer"><MapillaryViewer key={imageId} imageId={imageId} accessToken={config.mapillaryAccessToken} onLoaded={()=>{}} onFailure={()=>setStreetError("This provider capture could not load. Choose another image.")}/></div>}
          {!!images.length&&<div className="inspect-street-controls"><span>Mapillary images: {images.length} · nearest first</span><select value={imageId} onChange={e=>setImageId(e.target.value)} aria-label="Select street image">{images.map((im,i)=><option key={im.id} value={im.id}>{i+1}. {im.id} · {im.coordinates[1].toFixed(5)}, {im.coordinates[0].toFixed(5)}</option>)}</select>{imageId&&<a target="_blank" rel="noreferrer" href={`https://www.mapillary.com/app/?pKey=${encodeURIComponent(imageId)}`}>Open capture on Mapillary ↗</a>}</div>}
          <small>Mapillary gives interactive geotagged street imagery and navigation. This is not a true 3D reconstructed city model.</small>
        </section>}
        <aside className="inspect-results"><b>{results.length} returned feature{results.length===1?"":"s"}</b><small>Choose any result to highlight its geometry. OSM footprints retain their GIS provenance; SkyCLIP rectangles mark imagery tiles.</small>
          {results.map(r=><button key={r.id} onClick={()=>{setSelected(r);setView("map");const b=r.bounds;if(b){const id=cameraId+1;setCameraId(id);setCameraTarget({id,coordinates:[(b[0]+b[2])/2,(b[1]+b[3])/2],zoom:16});}}} className={selected?.id===r.id?"active":""}><strong>{r.title}</strong><span>{r.status==="gis_verified"?"GIS polygon / geometry":"SkyCLIP tile candidate"} · {r.source}</span></button>)}
          {!results.length&&!loading&&<div className="inspect-empty">No matches inside the selected geographic area. The map will stay here rather than moving to Bengaluru.</div>}
          <a className="inspect-osm" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${location[1].toFixed(6)}&mlon=${location[0].toFixed(6)}#map=16/${location[1].toFixed(6)}/${location[0].toFixed(6)}`}><Crosshair size={14}/> Open pin on OpenStreetMap</a>
        </aside>
      </div>
      <footer>GeoSathi GIS/PostGIS & OSM © contributors · Satellite MapTiler if configured · Street images © Mapillary. Geometry ≠ machine-learned segmentation.</footer>
    </div>
  </main>;
}
export default function InspectPage(){return <Suspense fallback={<main className="inspect-page">Loading GeoSathi inspection…</main>}><InspectionWorkspace/></Suspense>}
