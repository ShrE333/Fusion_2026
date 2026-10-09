"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Database, Download, Eye, Map, Search, X } from "lucide-react";
import { AtlasMap, type CameraTarget } from "@/components/map/atlas-map";
import { AtlasNav } from "@/components/shell/atlas-nav";
import { useAtlasLocation } from "@/components/shell/location-context";
import { config } from "@/lib/config";
import { runDiscovery, supportedDemoQuery, type DiscoveryMode } from "@/lib/discovery/service";
import type { AtlasFeature, DiscoveryResult, SearchResponse } from "@/types/geo";
import { isGeoGeometry } from "@/lib/geo-validation";

const puneCoordinates: [number, number] = [73.8567, 18.5204];
const examples = ["Find hospitals near me", "Find hotels near me", "Find cafes near me", "Find restaurants near me", "Find buildings near me", "Find unpaved roads near me", "Find schools near me"];
type State = "idle" | "loading" | "success" | "empty" | "error";
const vectors = (results: DiscoveryResult[]): AtlasFeature[] => { const seen = new Set<string>(); return results.flatMap((r) => r.osmFeatures).filter((f) => !seen.has(f.osmId) && Boolean(seen.add(f.osmId))).map((f) => ({ id: f.osmId, kind: "infrastructure", title: f.type, geometry: f.geometry, source: "Result-provided OSM vector" })); };
const exportable = (r: SearchResponse | null) => Boolean(r?.export.type === "FeatureCollection" && r.export.features.every((f) => f?.type === "Feature" && isGeoGeometry(f.geometry)));

export default function Home() {
  const mode: DiscoveryMode = config.discoveryMode;
  const { location, setLocation, clearLocation } = useAtlasLocation();
  const [query, setQuery] = useState(mode === "demo" ? supportedDemoQuery : examples[0]), [submitted, setSubmitted] = useState(mode === "demo" ? supportedDemoQuery : examples[0]), [response, setResponse] = useState<SearchResponse | null>(null), [state, setState] = useState<State>("idle"), [requestError, setRequestError] = useState(""), [cameraTarget, setCameraTarget] = useState<CameraTarget>(), [cameraId, setCameraId] = useState(0), [locationLabel, setLocationLabel] = useState(location ? "YOUR CURRENT LOCATION" : "PUNE, MAHARASHTRA · DEFAULT VIEW"), [locationDetail, setLocationDetail] = useState(location ? `${location.coordinates[1].toFixed(5)}° N · ${location.coordinates[0].toFixed(5)}° E · ±${Math.round(location.accuracy)} m · ${new Date(location.timestamp).toLocaleTimeString()} · locality unavailable` : "18.52040° N · 73.85670° E · home area"), [mapContext, setMapContext] = useState(""), [locationState, setLocationState] = useState<"idle" | "requesting" | "captured" | "unavailable">(location ? "captured" : "idle"), [selected, setSelected] = useState<DiscoveryResult>(), [showDiscovery, setShowDiscovery] = useState(false), [error, setError] = useState("");
  const requestId = useRef(0), locationRequestId = useRef(0), controller = useRef<AbortController | undefined>(undefined);
  const results = response?.results ?? [], isDemo = mode === "demo";

  const locateMe = useCallback(() => {
    const locationId = ++locationRequestId.current;
    if (!navigator.geolocation) { setLocationState("unavailable"); setError("Geolocation is unavailable in this browser. You can still explore the current map or return to Pune."); return; }
    setError(""); setLocationState("requesting");
    navigator.geolocation.getCurrentPosition((position) => {
      if (locationId !== locationRequestId.current) return;
      const coordinates: [number, number] = [position.coords.longitude, position.coords.latitude];
      const nextCameraId = Date.now();
      setLocation({ coordinates, accuracy: position.coords.accuracy, timestamp: position.timestamp });
      setCameraId(nextCameraId); setCameraTarget({ id: nextCameraId, coordinates, zoom: 13 }); setLocationState("captured"); setLocationLabel("YOUR CURRENT LOCATION"); setMapContext("");
      setLocationDetail(`${coordinates[1].toFixed(5)}° N · ${coordinates[0].toFixed(5)}° E · ±${Math.round(position.coords.accuracy)} m · ${new Date(position.timestamp).toLocaleTimeString()} · locality unavailable`);
    }, (reason) => {
      if (locationId !== locationRequestId.current) return;
      setLocationState("unavailable");
      setError(reason.code === 1 ? "Location permission was denied. The map has not moved." : reason.code === 3 ? "Location request timed out. Check your device signal and retry. The map has not moved." : "Your position is unavailable. The map has not moved; you can retry or return to Pune.");
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  }, [setLocation]);
  const hadInitialLocation = useRef(Boolean(location));
  useEffect(() => {
    // User requested location on entering the workspace. The browser controls permission.
    // Do not immediately undo an explicit "Back to Pune" action.
    if (hadInitialLocation.current) return;
    const timer = window.setTimeout(() => locateMe(), 0);
    return () => window.clearTimeout(timer);
  }, [locateMe]);

  const resetToPune = () => {
    locationRequestId.current++;
    clearLocation();
    const nextCameraId = cameraId + 1;
    setCameraId(nextCameraId); setCameraTarget({ id: nextCameraId, coordinates: puneCoordinates, zoom: 12.2 });
    setLocationState("idle"); setLocationLabel("PUNE, MAHARASHTRA · DEFAULT VIEW"); setLocationDetail("18.52040° N · 73.85670° E · home area"); setMapContext(""); setSelected(undefined); setError("");
  };

  const selectResult = (result: DiscoveryResult) => {
    setSelected(result); setShowDiscovery(true);
    if (!location) {
      setLocationLabel(isDemo ? "DEMO FIXTURE · BENGALURU" : "SELECTED BACKEND RESULT");
      setLocationDetail(isDemo ? "Synthetic result geometry · not a current location or Pune data" : "Map focus uses coordinates supplied by the backend geometry");
    }
    setMapContext(isDemo ? "Map focused on synthetic Bengaluru fixture geometry · not Pune data" : "Map focused on geometry supplied by the backend result");
  };

  const submitQuery = async (value = query) => {
    const text = value.trim(); if (!text || state === "loading") return;
    controller.current?.abort(); const id = ++requestId.current, abort = new AbortController(); controller.current = abort;
    setSubmitted(text); setState("loading"); setRequestError(""); setSelected(undefined); setResponse(null); setShowDiscovery(true);
    try {
      const next = await runDiscovery(mode, text, location?.coordinates ?? puneCoordinates, abort.signal);
      if (id !== requestId.current) return;
      setResponse(next);
      if (next.results.length) {
        setState("success");
        const first = next.results[0];
        setSelected(first);
        setShowDiscovery(true);
        // AtlasMap fits the real selected geometry; do not overwrite it with a fixed zoom.
        setMapContext(
          isDemo
            ? "Map focused on synthetic result geometry."
            : "Map focused on the top backend result. Returned polygons/bounding boxes are highlighted."
        );
      } else {
        setState("empty");
      }
    } catch (cause) {
      if (abort.signal.aborted || id !== requestId.current) return;
      setState("error"); setRequestError(cause instanceof Error ? cause.message : "Search could not be completed.");
    }
  };

  const download = () => {
    if (!exportable(response)) { setState("error"); setRequestError("The current response does not contain a valid GeoJSON export."); return; }
    const href = URL.createObjectURL(new Blob([JSON.stringify(response!.export, null, 2)], { type: "application/geo+json" })); const link = document.createElement("a"); link.href = href; link.download = isDemo ? "geosathi-demo-discovery.geojson" : "geosathi-discovery.geojson"; link.click(); URL.revokeObjectURL(href);
  };

  return <main className="world-atlas premium-v2"><div className="map-workspace"><AtlasMap features={[...results, ...vectors(results)]} visible={{ search: true, hazard: false, infrastructure: true }} selected={selected} cameraTarget={cameraTarget} userLocation={location ? {coordinates:location.coordinates,accuracy:location.accuracy,label:"Your current location"} : undefined} initialView={{ center: location?.coordinates ?? puneCoordinates, zoom: location ? 13 : 12.2 }} onSelect={(feature) => { const found = results.find((result) => result.id === feature.id); if (found) selectResult(found); }}/></div><AtlasNav/>
    <header className="world-header"><form onSubmit={(event) => { event.preventDefault(); void submitQuery(); }}><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Natural language GeoAI query"/><button disabled={state === "loading"}>{state === "loading" ? "SEARCHING…" : "DISCOVER"}</button></form><div className="demo-status"><i/> {isDemo ? "DEMO MODE · SYNTHETIC EVIDENCE" : "API MODE · BACKEND ONLY"}</div></header>
    <div className="world-meta"><span>LOCAL AREA</span><b>{locationLabel}</b><small>{locationDetail}</small></div>{mapContext && <div className="map-focus-note" role="status">{mapContext}</div>}
    <section className="global-intro"><div className="intro-kicker"><Map size={15}/> GeoAI discovery workspace</div><h1>Start with a place.<br/>Then ask a spatial question.</h1><p className="intro-note">{isDemo ? "The deterministic demo supports the solar-roof and drainage example only. Results are synthetic and remain labelled as demo evidence." : "Queries are sent to the configured backend; results appear only when it responds."}</p><div className="global-actions"><button className="yellow-action" onClick={locateMe} disabled={locationState === "requesting"}><Crosshair size={17}/> {locationState === "requesting" ? "REQUESTING LOCATION…" : "LOCATE ME"}</button><button className="dark-action" onClick={resetToPune}>BACK TO PUNE</button></div>{error && <p className="location-error" role="status">{error}</p>}<div className="query-gallery"><span>EXAMPLE QUERIES</span>{(isDemo ? [supportedDemoQuery] : examples).map((example) => <button key={example} onClick={() => { setQuery(example); void submitQuery(example); }}>{example}</button>)}</div></section>
    {showDiscovery && <aside className="discovery-dock"><div className="dock-head"><div><p>QUERY INTERPRETATION · {isDemo ? "DEMO · SYNTHETIC" : "BACKEND"}</p><h2>{submitted}</h2></div><button onClick={() => setShowDiscovery(false)} aria-label="Close discovery panel"><X size={16}/></button></div>{state === "loading" && <p className="location-error">Submitting the exact query to {isDemo ? "the deterministic demo" : "the configured backend"}…</p>}{state === "error" && <div className="location-error"><p>{requestError}</p><button onClick={() => void submitQuery(submitted)}>RETRY</button></div>}{state === "empty" && <p className="location-error">No matching GIS features or indexed imagery for this area. Try another category, capture your location, or enlarge the search coverage; no unrelated city is substituted.</p>}{state === "success" && response && <><div className="intent-row"><span>VISUAL</span><b>{response.intent.visualTargets.join(" · ") || "Not supplied"}</b><span>VECTOR</span><b>{response.intent.osmFeatureTypes.join(" · ") || "Not supplied"}</b><span>SPATIAL</span><b>{response.intent.distanceMetres ? `${response.intent.distanceMetres} m` : "No distance supplied"} · {response.intent.spatialPredicates.join(" · ")}</b></div><div className="candidate-row">{results.map((result) => <button key={result.id} className={selected?.id === result.id ? "selected" : ""} onClick={() => selectResult(result)}><Eye size={15}/><span><b>{result.title}</b><small>{result.imageTileId}{result.relationships[0]?.distanceMetres ? ` · ${result.relationships[0].distanceMetres} m relation` : " · no spatial relationship supplied"}</small></span><em>{result.score?.toFixed(2) ?? "—"}<small>{isDemo ? "demo · synthetic" : "backend"}</small></em></button>)}<button className="export-button" onClick={download}><Download size={14}/> GEOJSON{isDemo ? " · DEMO" : ""}</button></div></>}</aside>}
    {selected && <aside className="evidence-card"><button onClick={() => setSelected(undefined)} aria-label="Close evidence"><X size={15}/></button><p>OBJECT GROUNDING · {isDemo ? "DEMO · SYNTHETIC" : "BACKEND"}</p><h2>{selected.title}</h2><div className="grounding-box"><i/><span>{selected.imageTileId}</span></div><dl><dt>OBJECT</dt><dd>{selected.groundedObjects[0]?.label || "No grounded object supplied"}</dd><dt>OSM</dt><dd>{selected.osmFeatures[0] ? `${selected.osmFeatures[0].type} · ${selected.osmFeatures[0].osmId}` : "No vector reference supplied"}</dd><dt>RELATION</dt><dd>{selected.relationships[0]?.explanation || "No spatial relationship supplied"}</dd></dl></aside>}
    <footer className="osm-footer"><Database size={13}/> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · street imagery attribution is separate; demo imagery is synthetic</footer></main>;
}
