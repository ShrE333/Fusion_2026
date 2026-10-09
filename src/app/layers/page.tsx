"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Database, Eye, Layers3, SlidersHorizontal } from "lucide-react";
import { AtlasMap, type LiveMapLayer } from "@/components/map/atlas-map";
import { AtlasNav } from "@/components/shell/atlas-nav";
import { getBackendHealth, getManagedFeatures, getOsmFeatures, type Bounds, type GeoJsonCollection, type OSMBackendLayer } from "@/lib/api/geosathi";
import { demoDiscoveryResults, demoVectorFeatures } from "@/lib/demo/discovery";
import type { AtlasFeature } from "@/types/geo";

const empty: GeoJsonCollection = { type: "FeatureCollection", features: [] };
const initialBounds: Bounds = { west: 77.54, south: 12.93, east: 77.62, north: 13.01 };
const count = (data: GeoJsonCollection) => `${data.features.length} returned`;
const osmLayerIds: OSMBackendLayer[] = ["buildings", "roads", "places"];

export default function LayersPage() {
  const [demoEnabled, setDemoEnabled] = useState({ imagery: true, vectors: true }); const [liveEnabled, setLiveEnabled] = useState({ managed: true, buildings: false, roads: false, places: false }); const [opacity, setOpacity] = useState(80); const [selected, setSelected] = useState<AtlasFeature>(); const [bounds, setBounds] = useState<Bounds>(initialBounds); const [health, setHealth] = useState("Checking backend…"); const [notice, setNotice] = useState(""); const [managed, setManaged] = useState<GeoJsonCollection>(empty); const [osm, setOsm] = useState<Record<OSMBackendLayer, GeoJsonCollection>>({ buildings: empty, roads: empty, places: empty });
  const requestId = useRef(0); const abort = useRef<AbortController | undefined>(undefined); const features = useMemo(() => [...demoDiscoveryResults, ...demoVectorFeatures], []);
  const handleBoundsChange = useCallback((next: Bounds) => {
    setBounds((current) => current.west === next.west && current.south === next.south && current.east === next.east && current.north === next.north ? current : next);
  }, []);
  useEffect(() => { const controller = new AbortController(); getBackendHealth(controller.signal).then((value) => setHealth(value.status === "healthy" ? "Backend available" : `Backend reported: ${value.status}`)).catch((error: Error) => setHealth(error.message)); return () => controller.abort(); }, []);
  useEffect(() => {
    const id = ++requestId.current;
    abort.current?.abort();
    const enabled = (Object.keys(liveEnabled) as Array<keyof typeof liveEnabled>).filter((key) => liveEnabled[key]);
    if (!enabled.length) return;
    const timer = window.setTimeout(() => {
      const controller = new AbortController();
      abort.current = controller;
      setNotice("Loading viewport data…");
      const jobs: Promise<void>[] = [];
      if (liveEnabled.managed) jobs.push(getManagedFeatures(bounds, controller.signal).then((data) => { if (id === requestId.current) setManaged(data); }));
      osmLayerIds.filter((layer) => liveEnabled[layer]).forEach((layer) => jobs.push(getOsmFeatures(layer, bounds, controller.signal).then((data) => { if (id === requestId.current) setOsm((current) => ({ ...current, [layer]: data })); })));
      Promise.all(jobs).then(() => { if (id === requestId.current) setNotice(""); }).catch((error: Error) => { if (error.name !== "AbortError" && id === requestId.current) setNotice(error.message); });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [bounds, liveEnabled]);
  const liveLayers: LiveMapLayer[] = [{ id: "managed", label: "GeoSathi-managed features", data: managed, visible: liveEnabled.managed, opacity: opacity / 100 }, ...(["buildings", "roads", "places"] as OSMBackendLayer[]).map((id) => ({ id, label: `OSM ${id}`, data: osm[id], visible: liveEnabled[id], opacity: opacity / 100 }))]; const toggleLive = (key: keyof typeof liveEnabled) => setLiveEnabled((current) => ({ ...current, [key]: !current[key] }));
  return <main className="explorer-page"><AtlasNav/><header className="explorer-header"><div><p>GEOGRAPHIC DATA EXPLORER</p><h1>Layers & spatial context</h1></div><span><i/> {health}</span></header><section className="explorer-map"><AtlasMap features={features} selected={selected} onSelect={setSelected} initialView={{ center: [77.575, 12.972], zoom: 13.1 }} visible={{ search: demoEnabled.imagery, infrastructure: demoEnabled.vectors, hazard: false }} opacity={{ search: opacity / 100, infrastructure: opacity / 100 }} liveLayers={liveLayers} onBoundsChange={handleBoundsChange}/></section>
    <aside className="catalogue-panel"><div className="panel-title"><Layers3 size={16}/><span>Layer catalogue</span></div><section><p>BASE MAPS</p><label className="fixed-layer"><input type="checkbox" checked readOnly/>OpenStreetMap street map</label></section><section><p>LIVE GEOSATHI DATA</p><label className="layer-row"><Database size={15}/><span><b>Managed features</b><small>BACKEND · {count(managed)}</small></span><input aria-label="Toggle managed backend features" type="checkbox" checked={liveEnabled.managed} onChange={() => toggleLive("managed")}/></label></section><section><p>LIVE IMPORTED OSM</p>{(["buildings", "roads", "places"] as OSMBackendLayer[]).map((layer) => <label className="layer-row" key={layer}><Database size={15}/><span><b>{layer[0].toUpperCase() + layer.slice(1)}</b><small>BACKEND · {count(osm[layer])}</small></span><input aria-label={`Toggle live OSM ${layer}`} type="checkbox" checked={liveEnabled[layer]} onChange={() => toggleLive(layer)}/></label>)}</section><section><p>DEMO FIXTURES</p><label className="layer-row"><Eye size={15}/><span><b>Image-tile footprints</b><small>SYNTHETIC DEMO</small></span><input aria-label="Toggle imagery footprints" type="checkbox" checked={demoEnabled.imagery} onChange={() => setDemoEnabled((value) => ({ ...value, imagery: !value.imagery }))}/></label><label className="layer-row"><Database size={15}/><span><b>Drainage reference</b><small>SYNTHETIC DEMO</small></span><input aria-label="Toggle drainage reference" type="checkbox" checked={demoEnabled.vectors} onChange={() => setDemoEnabled((value) => ({ ...value, vectors: !value.vectors }))}/></label></section></aside>
    <aside className="metadata-panel"><div className="panel-title"><SlidersHorizontal size={16}/><span>Live layer status</span></div><h2>{notice || health}</h2><dl><dt>VIEWPORT</dt><dd>{bounds.south.toFixed(3)}, {bounds.west.toFixed(3)} → {bounds.north.toFixed(3)}, {bounds.east.toFixed(3)}</dd><dt>MANAGED</dt><dd>{count(managed)} · backend response</dd><dt>OSM</dt><dd>{count(osm.buildings)} buildings · {count(osm.roads)} roads · {count(osm.places)} places</dd><dt>CRS</dt><dd>WGS 84 (EPSG:4326)</dd></dl><label className="opacity"><span>Layer opacity <b>{opacity}%</b></span><input type="range" min="20" max="100" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))}/></label></aside>
    <footer className="explorer-footer">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · live backend layers retain backend provenance; fixtures remain synthetic</footer></main>;
}
