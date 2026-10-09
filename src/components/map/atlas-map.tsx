"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { config } from "@/lib/config";
import type { AtlasFeature } from "@/types/geo";

type LayerVisibility = Record<AtlasFeature["kind"], boolean>;
export type JourneyStage = "WORLD OVERVIEW" | "CONTINENT" | "COUNTRY" | "REGION" | "LOCAL AREA" | "STREET LEVEL";
export interface CameraJourney { id: number; target: [number, number]; demo: boolean; }
interface Props { features: AtlasFeature[]; visible: LayerVisibility; selected?: AtlasFeature; onSelect: (feature: AtlasFeature) => void; journey?: CameraJourney; onJourneyStage?: (stage: JourneyStage) => void; onJourneyComplete?: () => void; initialView?: { center: [number, number]; zoom: number }; opacity?: Partial<Record<AtlasFeature["kind"], number>>; userLocation?: { id: number; coordinates: [number, number] }; }
const groups: AtlasFeature["kind"][] = ["search", "hazard", "infrastructure"];
const sourceId = (kind: AtlasFeature["kind"]) => `atlas-${kind}`;
const layerId = (kind: AtlasFeature["kind"]) => `${sourceId(kind)}-visual`;
const satelliteSourceId = "atlas-satellite";
const satelliteLayerId = "atlas-satellite-raster";
const satelliteTileTemplate = (key: string) => `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${key}`;

function featureCollection(features: AtlasFeature[], kind: AtlasFeature["kind"], isVisible: boolean): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: isVisible ? features.filter((feature) => feature.kind === kind).map((feature) => ({ type: "Feature", properties: { id: feature.id, title: feature.title, synthetic: "Synthetic demo feature" }, geometry: feature.geometry })) : [] };
}
function boundsFor(feature: AtlasFeature) {
  const coordinates = feature.geometry.type === "Point" ? [feature.geometry.coordinates] : feature.geometry.type === "LineString" ? feature.geometry.coordinates : feature.geometry.coordinates[0];
  return coordinates.reduce((bounds, coordinate) => bounds.extend(coordinate as [number, number]), new maplibregl.LngLatBounds(coordinates[0] as [number, number], coordinates[0] as [number, number]));
}
function isSatelliteResourceError(event: unknown, tileOrigin: string) {
  const candidate = event as { sourceId?: unknown; source?: { id?: unknown }; tile?: { source?: unknown }; error?: { message?: unknown } };
  if (candidate.sourceId === satelliteSourceId || candidate.source?.id === satelliteSourceId || candidate.tile?.source === satelliteSourceId) return true;
  const message = candidate.error?.message;
  return typeof message === "string" && (message.includes(satelliteSourceId) || message.includes(tileOrigin));
}

export function AtlasMap({ features, visible, selected, onSelect, journey, onJourneyStage, onJourneyComplete, initialView, opacity, userLocation }: Props) {
  const container = useRef<HTMLDivElement>(null); const map = useRef<MapLibreMap | null>(null); const journeyTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const initialViewRef = useRef(initialView);
  const featureLookup = useRef<AtlasFeature[]>(features); const onSelectRef = useRef(onSelect);
  const [basemap, setBasemap] = useState<"street" | "satellite">("street"); const [satelliteError, setSatelliteError] = useState("");
  const basemapRef = useRef(basemap); const satelliteErrorReported = useRef(false);
  useEffect(() => { featureLookup.current = features; onSelectRef.current = onSelect; }, [features, onSelect]);
  useEffect(() => { basemapRef.current = basemap; }, [basemap]);
  useEffect(() => {
    if (!container.current || map.current) return;
    const initial = initialViewRef.current;
    const instance = new maplibregl.Map({ container: container.current, center: initial?.center ?? [0, 20], zoom: initial?.zoom ?? 1.35, style: { version: 8, sources: { osm: { type: "raster", tiles: [config.osmTileUrl], tileSize: 256, attribution: "© <a href='https://www.openstreetmap.org/copyright' target='_blank' rel='noreferrer'>OpenStreetMap contributors</a>" } }, layers: [{ id: "osm", type: "raster", source: "osm" }] } });
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    const satelliteOrigin = config.mapTilerApiKey ? new URL(satelliteTileTemplate(config.mapTilerApiKey)).origin : "";
    instance.on("error", (event) => { if (basemapRef.current === "satellite" && satelliteOrigin && !satelliteErrorReported.current && isSatelliteResourceError(event, satelliteOrigin)) { satelliteErrorReported.current = true; setSatelliteError("Satellite imagery could not be loaded. Return to Street or check the MapTiler key and its domain restrictions."); } });
    instance.on("load", () => {
      groups.forEach((kind) => {
        instance.addSource(sourceId(kind), { type: "geojson", data: featureCollection([], kind, false) });
        if (kind === "search") { instance.addLayer({ id: layerId(kind), type: "fill", source: sourceId(kind), paint: { "fill-color": "#d7774f", "fill-opacity": 0.13, "fill-outline-color": "#a44932" } }); instance.addLayer({ id: `${layerId(kind)}-edge`, type: "line", source: sourceId(kind), paint: { "line-color": "#a44932", "line-width": 1.5, "line-dasharray": [2, 1] } }); }
        else if (kind === "hazard") instance.addLayer({ id: layerId(kind), type: "circle", source: sourceId(kind), paint: { "circle-radius": 7, "circle-color": "#bd432e", "circle-stroke-width": 2.5, "circle-stroke-color": "#fff9eb" } });
        else instance.addLayer({ id: layerId(kind), type: "line", source: sourceId(kind), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#315e4b", "line-width": 4, "line-opacity": 0.9, "line-dasharray": [1.4, 0.7] } });
        const interactive = kind === "search" ? [layerId(kind), `${layerId(kind)}-edge`] : [layerId(kind)];
        interactive.forEach((layer) => { instance.on("click", layer, (event) => { const id = event.features?.[0]?.properties?.id; const feature = featureLookup.current.find((candidate) => candidate.id === id); if (!feature) return; onSelectRef.current(feature); const popup = document.createElement("div"); const title = document.createElement("strong"); const provenance = document.createElement("span"); title.textContent = feature.title; provenance.textContent = "SYNTHETIC DEMO FEATURE"; popup.append(title, provenance); new maplibregl.Popup({ offset: 10, closeButton: false, className: "atlas-popup" }).setLngLat(event.lngLat).setDOMContent(popup).addTo(instance); }); instance.on("mouseenter", layer, () => { instance.getCanvas().style.cursor = "pointer"; }); instance.on("mouseleave", layer, () => { instance.getCanvas().style.cursor = ""; }); });
      });
      instance.addSource("atlas-selected", { type: "geojson", data: featureCollection([], "search", false) });
      instance.addLayer({ id: "atlas-selected-polygon", type: "line", source: "atlas-selected", filter: ["==", "$type", "Polygon"], paint: { "line-color": "#f9f0dc", "line-width": 4, "line-opacity": 0.95 } });
      instance.addLayer({ id: "atlas-selected-line", type: "line", source: "atlas-selected", filter: ["==", "$type", "LineString"], paint: { "line-color": "#f9f0dc", "line-width": 7, "line-opacity": 0.9 } });
      instance.addLayer({ id: "atlas-selected-point", type: "circle", source: "atlas-selected", filter: ["==", "$type", "Point"], paint: { "circle-radius": 12, "circle-color": "#f8eed9", "circle-opacity": 0.2, "circle-stroke-color": "#f8eed9", "circle-stroke-width": 3 } });
    });
    const resizeObserver = new ResizeObserver(() => instance.resize());
    resizeObserver.observe(container.current);
    map.current = instance; return () => { resizeObserver.disconnect(); journeyTimers.current.forEach(clearTimeout); instance.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const instance = map.current; if (!instance || !instance.isStyleLoaded()) return;
    if (!config.mapTilerApiKey) return;
    if (!instance.getSource(satelliteSourceId)) instance.addSource(satelliteSourceId, { type: "raster", tiles: [satelliteTileTemplate(config.mapTilerApiKey)], tileSize: 256, maxzoom: 22, attribution: "© <a href='https://www.maptiler.com/copyright/' target='_blank' rel='noreferrer'>MapTiler</a> © contributors" });
    if (!instance.getLayer(satelliteLayerId)) instance.addLayer({ id: satelliteLayerId, type: "raster", source: satelliteSourceId, layout: { visibility: "none" } }, layerId("search"));
    instance.setLayoutProperty("osm", "visibility", basemap === "street" ? "visible" : "none");
    instance.setLayoutProperty(satelliteLayerId, "visibility", basemap === "satellite" ? "visible" : "none");
  }, [basemap]);
  useEffect(() => { const instance = map.current; if (!instance) return; const sync = () => groups.forEach((kind) => (instance.getSource(sourceId(kind)) as maplibregl.GeoJSONSource | undefined)?.setData(featureCollection(features, kind, visible[kind]))); if (instance.isStyleLoaded()) sync(); else instance.once("load", sync); }, [features, visible]);
  useEffect(() => { const instance = map.current; if (!instance || !instance.isStyleLoaded()) return; if (instance.getLayer(layerId("search"))) instance.setPaintProperty(layerId("search"), "fill-opacity", opacity?.search ?? 0.13); if (instance.getLayer(layerId("infrastructure"))) instance.setPaintProperty(layerId("infrastructure"), "line-opacity", opacity?.infrastructure ?? 0.9); if (instance.getLayer(layerId("hazard"))) instance.setPaintProperty(layerId("hazard"), "circle-opacity", opacity?.hazard ?? 1); }, [opacity]);
  useEffect(() => { const instance = map.current; if (!instance) return; const sync = () => { const isLayerVisible = selected ? visible[selected.kind] : false; const data: GeoJSON.FeatureCollection = selected && isLayerVisible ? { type: "FeatureCollection", features: [{ type: "Feature", properties: { id: selected.id }, geometry: selected.geometry }] } : featureCollection([], "search", false); (instance.getSource("atlas-selected") as maplibregl.GeoJSONSource | undefined)?.setData(data); if (selected && isLayerVisible) instance.fitBounds(boundsFor(selected), { padding: 140, maxZoom: 16, duration: 650 }); }; if (instance.isStyleLoaded()) sync(); else instance.once("load", sync); }, [selected, visible]);
  useEffect(() => {
    const instance = map.current; if (!instance || !journey) return;
    journeyTimers.current.forEach(clearTimeout); journeyTimers.current = []; instance.stop();
    const [longitude, latitude] = journey.target;
    const stages: Array<{ stage: JourneyStage; center: [number, number]; zoom: number; pitch: number; duration: number }> = [
      { stage: "WORLD OVERVIEW", center: [0, 20], zoom: 1.35, pitch: 0, duration: 500 },
      { stage: "CONTINENT", center: [longitude * 0.35, latitude * 0.35], zoom: 3.1, pitch: 18, duration: 1200 },
      { stage: "COUNTRY", center: [longitude * 0.72, latitude * 0.72], zoom: 5.2, pitch: 28, duration: 1200 },
      { stage: "REGION", center: [longitude * 0.92, latitude * 0.92], zoom: 8.1, pitch: 38, duration: 1200 },
      { stage: "LOCAL AREA", center: journey.target, zoom: 12.1, pitch: 48, duration: 1200 },
      { stage: "STREET LEVEL", center: journey.target, zoom: 15.5, pitch: 58, duration: 1100 },
    ];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) { stages.forEach((step) => { onJourneyStage?.(step.stage); instance.jumpTo({ center: step.center, zoom: step.zoom, pitch: step.pitch }); }); onJourneyComplete?.(); return; }
    let offset = 0; stages.forEach((step, index) => { const timer = setTimeout(() => { onJourneyStage?.(step.stage); instance.easeTo({ center: step.center, zoom: step.zoom, pitch: step.pitch, duration: step.duration, essential: false, easing: (t) => t * (2 - t) }); if (index === stages.length - 1) { const complete = setTimeout(() => onJourneyComplete?.(), step.duration + 80); journeyTimers.current.push(complete); } }, offset); journeyTimers.current.push(timer); offset += step.duration + 140; });
    return () => { journeyTimers.current.forEach(clearTimeout); journeyTimers.current = []; instance.stop(); };
  }, [journey, onJourneyComplete, onJourneyStage]);
  useEffect(() => { const instance = map.current; if (!instance || !userLocation) return; journeyTimers.current.forEach(clearTimeout); journeyTimers.current = []; instance.stop(); instance.easeTo({ center: userLocation.coordinates, zoom: Math.max(instance.getZoom(), 13), pitch: 35, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 900, essential: false }); }, [userLocation]);
  return <div className="map-shell"><div ref={container} className="map" aria-label="Interactive map workspace"/><div className="map-style-switch" aria-label="Basemap style"><button className={basemap === "street" ? "active" : ""} onClick={() => setBasemap("street")}>Street</button><button className={basemap === "satellite" ? "active" : ""} onClick={() => { satelliteErrorReported.current = false; setSatelliteError(""); setBasemap("satellite"); }} disabled={!config.mapTilerApiKey} title={config.mapTilerApiKey ? "Use MapTiler satellite imagery" : "Set NEXT_PUBLIC_MAPTILER_API_KEY to enable satellite imagery"}>Satellite</button>{!config.mapTilerApiKey && <small>Satellite needs MapTiler key</small>}{satelliteError && <small role="status">{satelliteError}</small>}</div></div>;
}
