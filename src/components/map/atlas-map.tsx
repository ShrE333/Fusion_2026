"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { config } from "@/lib/config";
import type { Bounds, GeoJsonCollection } from "@/lib/api/geosathi";
import type { AtlasFeature } from "@/types/geo";

type LayerVisibility = Record<AtlasFeature["kind"], boolean>;
export type LiveMapLayer = { id: "managed" | "buildings" | "roads" | "places"; label: string; data: GeoJsonCollection; visible: boolean; opacity?: number; };
export type CameraTarget = { id: number; coordinates: [number, number]; zoom: number };
interface Props { features: AtlasFeature[]; visible: LayerVisibility; selected?: AtlasFeature; onSelect: (feature: AtlasFeature) => void; cameraTarget?: CameraTarget; initialView?: { center: [number, number]; zoom: number }; opacity?: Partial<Record<AtlasFeature["kind"], number>>; liveLayers?: LiveMapLayer[]; onBoundsChange?: (bounds: Bounds) => void; }
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

export function AtlasMap({ features, visible, selected, onSelect, cameraTarget, initialView, opacity, liveLayers = [], onBoundsChange }: Props) {
  const container = useRef<HTMLDivElement>(null); const map = useRef<MapLibreMap | null>(null);
  const initialViewRef = useRef(initialView);
  const featureLookup = useRef<AtlasFeature[]>(features); const onSelectRef = useRef(onSelect);
  const liveLayersRef = useRef(liveLayers); const onBoundsChangeRef = useRef(onBoundsChange);
  const [basemap, setBasemap] = useState<"street" | "satellite">("street"); const [satelliteError, setSatelliteError] = useState("");
  const basemapRef = useRef(basemap); const satelliteErrorReported = useRef(false);
  useEffect(() => { featureLookup.current = features; onSelectRef.current = onSelect; }, [features, onSelect]);
  useEffect(() => { liveLayersRef.current = liveLayers; onBoundsChangeRef.current = onBoundsChange; }, [liveLayers, onBoundsChange]);
  useEffect(() => { basemapRef.current = basemap; }, [basemap]);
  useEffect(() => {
    if (!container.current || map.current) return;
    const initial = initialViewRef.current;
    const instance = new maplibregl.Map({ container: container.current, center: initial?.center ?? [73.8567, 18.5204], zoom: initial?.zoom ?? 12.2, style: { version: 8, sources: { osm: { type: "raster", tiles: [config.osmTileUrl], tileSize: 256, attribution: "© <a href='https://www.openstreetmap.org/copyright' target='_blank' rel='noreferrer'>OpenStreetMap contributors</a>" } }, layers: [{ id: "osm", type: "raster", source: "osm" }] } });
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    const satelliteOrigin = config.mapTilerApiKey ? new URL(satelliteTileTemplate(config.mapTilerApiKey)).origin : "";
    instance.on("error", (event) => { if (basemapRef.current === "satellite" && satelliteOrigin && !satelliteErrorReported.current && isSatelliteResourceError(event, satelliteOrigin)) { satelliteErrorReported.current = true; setSatelliteError("Satellite imagery could not be loaded. Return to Street or check the MapTiler key and its domain restrictions."); } });
    instance.on("load", () => {
      groups.forEach((kind) => {
        instance.addSource(sourceId(kind), { type: "geojson", data: featureCollection([], kind, false) });
        if (kind === "search") { instance.addLayer({ id: layerId(kind), type: "fill", source: sourceId(kind), paint: { "fill-color": "#d7774f", "fill-opacity": 0.22, "fill-outline-color": "#a44932" } }); instance.addLayer({ id: `${layerId(kind)}-edge`, type: "line", source: sourceId(kind), paint: { "line-color": "#a44932", "line-width": 2.8, "line-dasharray": [2, 1] } }); }
        else if (kind === "hazard") instance.addLayer({ id: layerId(kind), type: "circle", source: sourceId(kind), paint: { "circle-radius": 7, "circle-color": "#bd432e", "circle-stroke-width": 2.5, "circle-stroke-color": "#fff9eb" } });
        else instance.addLayer({ id: layerId(kind), type: "line", source: sourceId(kind), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#315e4b", "line-width": 4, "line-opacity": 0.9, "line-dasharray": [1.4, 0.7] } });
        const interactive = kind === "search" ? [layerId(kind), `${layerId(kind)}-edge`] : [layerId(kind)];
        interactive.forEach((layer) => { instance.on("click", layer, (event) => { const id = event.features?.[0]?.properties?.id; const feature = featureLookup.current.find((candidate) => candidate.id === id); if (!feature) return; onSelectRef.current(feature); const popup = document.createElement("div"); const title = document.createElement("strong"); const provenance = document.createElement("span"); title.textContent = feature.title; provenance.textContent = feature.source; popup.append(title, provenance); new maplibregl.Popup({ offset: 10, closeButton: false, className: "atlas-popup" }).setLngLat(event.lngLat).setDOMContent(popup).addTo(instance); }); instance.on("mouseenter", layer, () => { instance.getCanvas().style.cursor = "pointer"; }); instance.on("mouseleave", layer, () => { instance.getCanvas().style.cursor = ""; }); });
      });
      instance.addSource("atlas-selected", { type: "geojson", data: featureCollection([], "search", false) });
      instance.addLayer({ id: "atlas-selected-polygon", type: "line", source: "atlas-selected", filter: ["==", "$type", "Polygon"], paint: { "line-color": "#f9f0dc", "line-width": 4, "line-opacity": 0.95 } });
      instance.addLayer({ id: "atlas-selected-line", type: "line", source: "atlas-selected", filter: ["==", "$type", "LineString"], paint: { "line-color": "#f9f0dc", "line-width": 7, "line-opacity": 0.9 } });
      instance.addLayer({ id: "atlas-selected-point", type: "circle", source: "atlas-selected", filter: ["==", "$type", "Point"], paint: { "circle-radius": 12, "circle-color": "#f8eed9", "circle-opacity": 0.2, "circle-stroke-color": "#f8eed9", "circle-stroke-width": 3 } });
      liveLayersRef.current.forEach((live) => addLiveLayer(instance, live));
    });
    const notifyBounds = () => { const bounds = instance.getBounds(); onBoundsChangeRef.current?.({ west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() }); };
    instance.on("moveend", notifyBounds); instance.once("load", notifyBounds);
    const resizeObserver = new ResizeObserver(() => instance.resize());
    resizeObserver.observe(container.current);
    map.current = instance; return () => { resizeObserver.disconnect(); instance.off("moveend", notifyBounds); instance.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const instance = map.current; if (!instance || !instance.isStyleLoaded()) return;
    if (!config.mapTilerApiKey) return;
    if (!instance.getSource(satelliteSourceId)) instance.addSource(satelliteSourceId, { type: "raster", tiles: [satelliteTileTemplate(config.mapTilerApiKey)], tileSize: 256, maxzoom: 22, attribution: "© <a href='https://www.maptiler.com/copyright/' target='_blank' rel='noreferrer'>MapTiler</a> © contributors" });
    if (!instance.getLayer(satelliteLayerId)) instance.addLayer({ id: satelliteLayerId, type: "raster", source: satelliteSourceId, layout: { visibility: "none" } }, layerId("search"));
    instance.setLayoutProperty("osm", "visibility", basemap === "street" ? "visible" : "none");
    instance.setLayoutProperty(satelliteLayerId, "visibility", basemap === "satellite" ? "visible" : "none");
  }, [basemap]);
  useEffect(() => { const instance = map.current; if (!instance) return; const sync = () => liveLayers.forEach((live) => { if (!instance.getSource(`geosathi-${live.id}`)) addLiveLayer(instance, live); const source = instance.getSource(`geosathi-${live.id}`) as maplibregl.GeoJSONSource | undefined; source?.setData(live.data); ["fill", "line", "point"].forEach((suffix) => { const id = `geosathi-${live.id}-${suffix}`; if (instance.getLayer(id)) instance.setLayoutProperty(id, "visibility", live.visible ? "visible" : "none"); }); }); if (instance.isStyleLoaded()) sync(); else instance.once("load", sync); }, [liveLayers]);
  useEffect(() => { const instance = map.current; if (!instance) return; const sync = () => groups.forEach((kind) => (instance.getSource(sourceId(kind)) as maplibregl.GeoJSONSource | undefined)?.setData(featureCollection(features, kind, visible[kind]))); if (instance.isStyleLoaded()) sync(); else instance.once("load", sync); }, [features, visible]);
  useEffect(() => { const instance = map.current; if (!instance || !instance.isStyleLoaded()) return; if (instance.getLayer(layerId("search"))) instance.setPaintProperty(layerId("search"), "fill-opacity", opacity?.search ?? 0.13); if (instance.getLayer(layerId("infrastructure"))) instance.setPaintProperty(layerId("infrastructure"), "line-opacity", opacity?.infrastructure ?? 0.9); if (instance.getLayer(layerId("hazard"))) instance.setPaintProperty(layerId("hazard"), "circle-opacity", opacity?.hazard ?? 1); }, [opacity]);
  useEffect(() => { const instance = map.current; if (!instance) return; const sync = () => { const isLayerVisible = selected ? visible[selected.kind] : false; const data: GeoJSON.FeatureCollection = selected && isLayerVisible ? { type: "FeatureCollection", features: [{ type: "Feature", properties: { id: selected.id }, geometry: selected.geometry }] } : featureCollection([], "search", false); (instance.getSource("atlas-selected") as maplibregl.GeoJSONSource | undefined)?.setData(data); if (selected && isLayerVisible) instance.fitBounds(boundsFor(selected), { padding: 140, maxZoom: 16, duration: 650 }); }; if (instance.getSource("atlas-selected")) sync(); else instance.once("load", sync); }, [selected, visible]);
  useEffect(() => { const instance = map.current; if (!instance || !cameraTarget) return; instance.stop(); instance.easeTo({ center: cameraTarget.coordinates, zoom: cameraTarget.zoom, pitch: 0, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 800, essential: false }); }, [cameraTarget]);
  return <div className="map-shell"><div ref={container} className="map" aria-label="Interactive map workspace"/><div className="map-style-switch" aria-label="Basemap style"><button className={basemap === "street" ? "active" : ""} onClick={() => setBasemap("street")}>Street</button><button className={basemap === "satellite" ? "active" : ""} onClick={() => { satelliteErrorReported.current = false; setSatelliteError(""); setBasemap("satellite"); }} disabled={!config.mapTilerApiKey} title={config.mapTilerApiKey ? "Use MapTiler satellite imagery" : "Set NEXT_PUBLIC_MAPTILER_API_KEY to enable satellite imagery"}>Satellite</button>{!config.mapTilerApiKey && <small>Satellite needs MapTiler key</small>}{satelliteError && <small role="status">{satelliteError}</small>}</div></div>;
}

function addLiveLayer(instance: MapLibreMap, live: LiveMapLayer) {
  const source = `geosathi-${live.id}`; if (instance.getSource(source)) return;
  const colors = { managed: "#6a4c93", buildings: "#c27a52", roads: "#2e6a68", places: "#b88a16" } as const; const color = colors[live.id];
  instance.addSource(source, { type: "geojson", data: live.data });
  instance.addLayer({ id: `${source}-fill`, type: "fill", source, filter: ["==", "$type", "Polygon"], layout: { visibility: live.visible ? "visible" : "none" }, paint: { "fill-color": color, "fill-opacity": live.opacity ?? 0.22, "fill-outline-color": color } });
  instance.addLayer({ id: `${source}-line`, type: "line", source, filter: ["in", "$type", "LineString"], layout: { "line-cap": "round", "line-join": "round", visibility: live.visible ? "visible" : "none" }, paint: { "line-color": color, "line-width": live.id === "roads" ? 3 : 2, "line-opacity": live.opacity ?? 0.9 } });
  instance.addLayer({ id: `${source}-point`, type: "circle", source, filter: ["in", "$type", "Point"], layout: { visibility: live.visible ? "visible" : "none" }, paint: { "circle-radius": live.id === "places" ? 5 : 7, "circle-color": color, "circle-stroke-width": 2, "circle-stroke-color": "#fff9eb", "circle-opacity": live.opacity ?? 1 } });
}
