"use client";

import { useEffect, useRef } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { config } from "@/lib/config";
import type { AtlasFeature } from "@/types/geo";

type LayerVisibility = Record<AtlasFeature["kind"], boolean>;
interface Props { features: AtlasFeature[]; visible: LayerVisibility; selected?: AtlasFeature; onSelect: (feature: AtlasFeature) => void; }
const groups: AtlasFeature["kind"][] = ["search", "hazard", "infrastructure"];
const sourceId = (kind: AtlasFeature["kind"]) => `atlas-${kind}`;
const layerId = (kind: AtlasFeature["kind"]) => `${sourceId(kind)}-visual`;

function featureCollection(features: AtlasFeature[], kind: AtlasFeature["kind"], isVisible: boolean): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: isVisible ? features.filter((feature) => feature.kind === kind).map((feature) => ({ type: "Feature", properties: { id: feature.id, title: feature.title, synthetic: "Synthetic demo feature" }, geometry: feature.geometry })) : [] };
}
function boundsFor(feature: AtlasFeature) {
  const coordinates = feature.geometry.type === "Point" ? [feature.geometry.coordinates] : feature.geometry.type === "LineString" ? feature.geometry.coordinates : feature.geometry.coordinates[0];
  return coordinates.reduce((bounds, coordinate) => bounds.extend(coordinate as [number, number]), new maplibregl.LngLatBounds(coordinates[0] as [number, number], coordinates[0] as [number, number]));
}

export function AtlasMap({ features, visible, selected, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null); const map = useRef<MapLibreMap | null>(null);
  const featureLookup = useRef<AtlasFeature[]>(features); const onSelectRef = useRef(onSelect);
  useEffect(() => { featureLookup.current = features; onSelectRef.current = onSelect; }, [features, onSelect]);
  useEffect(() => {
    if (!container.current || map.current) return;
    const instance = new maplibregl.Map({ container: container.current, center: [77.575, 12.972], zoom: 13.2, style: { version: 8, sources: { osm: { type: "raster", tiles: [config.osmTileUrl], tileSize: 256, attribution: "© <a href='https://www.openstreetmap.org/copyright' target='_blank' rel='noreferrer'>OpenStreetMap contributors</a>" } }, layers: [{ id: "osm", type: "raster", source: "osm" }] } });
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
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
    map.current = instance; return () => { instance.remove(); map.current = null; };
  }, []);
  useEffect(() => { const instance = map.current; if (!instance) return; const sync = () => groups.forEach((kind) => (instance.getSource(sourceId(kind)) as maplibregl.GeoJSONSource | undefined)?.setData(featureCollection(features, kind, visible[kind]))); if (instance.isStyleLoaded()) sync(); else instance.once("load", sync); }, [features, visible]);
  useEffect(() => { const instance = map.current; if (!instance) return; const sync = () => { const isLayerVisible = selected ? visible[selected.kind] : false; const data: GeoJSON.FeatureCollection = selected && isLayerVisible ? { type: "FeatureCollection", features: [{ type: "Feature", properties: { id: selected.id }, geometry: selected.geometry }] } : featureCollection([], "search", false); (instance.getSource("atlas-selected") as maplibregl.GeoJSONSource | undefined)?.setData(data); if (selected && isLayerVisible) instance.fitBounds(boundsFor(selected), { padding: 140, maxZoom: 16, duration: 650 }); }; if (instance.isStyleLoaded()) sync(); else instance.once("load", sync); }, [selected, visible]);
  return <div ref={container} className="map" aria-label="Interactive OpenStreetMap workspace" />;
}
