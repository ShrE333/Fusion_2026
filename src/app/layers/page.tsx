"use client";

import { useMemo, useState } from "react";
import { Database, Eye, Layers3, Maximize2, Minus, Plus, SlidersHorizontal } from "lucide-react";
import { AtlasMap } from "@/components/map/atlas-map";
import { AtlasNav } from "@/components/shell/atlas-nav";
import { demoDiscoveryResults, demoVectorFeatures } from "@/lib/demo/discovery";
import type { AtlasFeature } from "@/types/geo";

type DatasetKey = "imagery" | "vectors";
const metadata = {
  imagery: { name: "Retrieved imagery candidates", source: "Deterministic GeoAI fixture", category: "Imagery footprint", geometry: "Polygon", count: "2 synthetic candidates", extent: "Bengaluru demo sector", crs: "WGS 84 (EPSG:4326)" },
  vectors: { name: "Drainage reference geometry", source: "Deterministic OSM-vector fixture", category: "Vector context", geometry: "LineString", count: "1 synthetic reference", extent: "Bengaluru demo sector", crs: "WGS 84 (EPSG:4326)" },
};

export default function LayersPage() {
  const [enabled, setEnabled] = useState({ imagery: true, vectors: true }); const [active, setActive] = useState<DatasetKey>("imagery"); const [opacity, setOpacity] = useState(80); const [selected, setSelected] = useState<AtlasFeature>();
  const features = useMemo(() => [...demoDiscoveryResults, ...demoVectorFeatures], []);
  const current = metadata[active];
  return <main className="explorer-page"><AtlasNav/><header className="explorer-header"><div><p>GEOGRAPHIC DATA EXPLORER</p><h1>Layers & spatial context</h1></div><span><i/> DEMO DATA · LOCAL FIXTURES</span></header><section className="explorer-map"><AtlasMap features={features} selected={selected} onSelect={setSelected} initialView={{ center: [77.575, 12.972], zoom: 13.1 }} visible={{ search: enabled.imagery, infrastructure: enabled.vectors, hazard: false }} opacity={{ search: opacity / 100, infrastructure: opacity / 100 }}/></section>
    <aside className="catalogue-panel"><div className="panel-title"><Layers3 size={16}/><span>Layer catalogue</span></div><section><p>BASE MAPS</p><label className="fixed-layer"><input type="checkbox" checked readOnly/>OpenStreetMap street map</label></section><section><p>IMAGERY</p><button className={active === "imagery" ? "layer-row active" : "layer-row"} onClick={() => setActive("imagery")}><Eye size={15}/><span><b>Image-tile footprints</b><small>DEMO · {metadata.imagery.count}</small></span><input aria-label="Toggle imagery footprints" type="checkbox" checked={enabled.imagery} onChange={(event) => setEnabled({ ...enabled, imagery: event.target.checked })}/></button></section><section><p>OSM VECTOR FEATURES</p><button className={active === "vectors" ? "layer-row active" : "layer-row"} onClick={() => setActive("vectors")}><Database size={15}/><span><b>Drainage reference</b><small>DEMO · vector fixture</small></span><input aria-label="Toggle drainage reference" type="checkbox" checked={enabled.vectors} onChange={(event) => setEnabled({ ...enabled, vectors: event.target.checked })}/></button></section><section className="unavailable"><p>SPATIAL ANALYSIS</p><span>Buffers and intersections appear when the backend supplies computed geometry.</span></section></aside>
    <aside className="metadata-panel"><div className="panel-title"><SlidersHorizontal size={16}/><span>Dataset inspector</span></div><h2>{selected?.title || current.name}</h2><dl><dt>SOURCE</dt><dd>{selected ? selected.source : current.source}</dd><dt>CATEGORY</dt><dd>{current.category}</dd><dt>GEOMETRY</dt><dd>{selected?.geometry.type || current.geometry}</dd><dt>FEATURES</dt><dd>{current.count}</dd><dt>EXTENT</dt><dd>{current.extent}</dd><dt>CRS</dt><dd>{current.crs}</dd></dl><label className="opacity"><span>Layer opacity <b>{opacity}%</b></span><input type="range" min="20" max="100" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))}/></label><button className="zoom-layer" onClick={() => setSelected(active === "imagery" ? demoDiscoveryResults[0] : demoVectorFeatures[0])}><Maximize2 size={15}/> Zoom to selected layer</button></aside>
    <footer className="explorer-footer">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · synthetic fixtures are not live OSM or imagery coverage</footer></main>;
}
