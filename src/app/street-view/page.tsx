"use client";

import { useState } from "react";
import Link from "next/link";
import { Compass, LocateFixed, Map, Minus, Plus, RotateCcw } from "lucide-react";
import { AtlasMap } from "@/components/map/atlas-map";
import { AtlasNav } from "@/components/shell/atlas-nav";

export default function StreetViewPage() {
  const [offset, setOffset] = useState(0); const [zoom, setZoom] = useState(1); const [dragStart, setDragStart] = useState<number>(); const [mapOpen, setMapOpen] = useState(false);
  const drag = (clientX: number) => { if (dragStart === undefined) return; setOffset((value) => value + (clientX - dragStart) * 0.18); setDragStart(clientX); };
  return <main className="street-page"><AtlasNav/><header className="explorer-header"><div><p>STREET-LEVEL EVIDENCE</p><h1>Inspect local context</h1></div><span><i/> DEMO PANORAMA · UNVERIFIED</span></header><section className="street-canvas"><div className="panorama-demo" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDragStart(event.clientX); }} onPointerMove={(event) => drag(event.clientX)} onPointerUp={() => setDragStart(undefined)} style={{ backgroundPosition: `${offset}px center`, backgroundSize: `${zoom * 100}% auto` }}><div className="pano-sky"/><div className="pano-buildings"/><div className="pano-road"/><span>DEMO PANORAMA — NOT VERIFIED AT THIS LOCATION</span><b><Compass size={14}/> N · 018°</b></div><div className="viewer-controls"><button onClick={() => setZoom((value) => Math.min(1.6, value + 0.1))} aria-label="Zoom panorama in"><Plus size={16}/></button><button onClick={() => setZoom((value) => Math.max(0.8, value - 0.1))} aria-label="Zoom panorama out"><Minus size={16}/></button><button onClick={() => { setOffset(0); setZoom(1); }} aria-label="Reset panorama"><RotateCcw size={16}/></button></div></section>
    <aside className="street-context"><p>LOCALITY CONTEXT · DEMO</p><h2>Bengaluru demo sector</h2><span>12.97160° N · 77.59460° E</span><small>Coverage unavailable. This draggable synthetic panorama is a UI fallback, not a 360° image or verified imagery at this location.</small><div><Link href="/" className="primary-link"><Map size={15}/> RETURN TO MAP</Link><button onClick={() => setMapOpen(!mapOpen)}><LocateFixed size={15}/> {mapOpen ? "HIDE MAP" : "LOCATE ANOTHER PLACE"}</button></div></aside>
    {mapOpen && <aside className="companion-map"><AtlasMap features={[]} selected={undefined} onSelect={() => {}} visible={{ search: false, infrastructure: false, hazard: false }} initialView={{ center: [77.5946, 12.9716], zoom: 14 }}/><span>OSM context map · demo coordinate</span></aside>}
    <footer className="explorer-footer">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · panorama is locally generated demo content</footer></main>;
}
