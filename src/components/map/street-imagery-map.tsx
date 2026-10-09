"use client";

import { useEffect, useRef } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { config } from "@/lib/config";
import type { MapillaryImage } from "@/lib/api/mapillary";

type Props = {
  center: [number, number];
  actualLocation?: [number, number];
  images: MapillaryImage[];
  selectedId?: string;
  onCenterChange: (center: [number, number]) => void;
  onSelect: (imageId: string) => void;
};

const imageSourceId = "mapillary-images";
const imageLayerId = "mapillary-image-points";
const focusSourceId = "street-search-focus";

export function StreetImageryMap({ center, actualLocation, images, selectedId, onCenterChange, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const callbacks = useRef({ onCenterChange, onSelect });
  const imagesRef = useRef(images);
  const centerRef = useRef(center);
  const actualLocationRef = useRef(actualLocation);
  const selectedRef = useRef(selectedId);

  useEffect(() => { callbacks.current = { onCenterChange, onSelect }; }, [onCenterChange, onSelect]);
  useEffect(() => { imagesRef.current = images; }, [images]);
  useEffect(() => { centerRef.current = center; }, [center]);
  useEffect(() => { actualLocationRef.current = actualLocation; }, [actualLocation]);
  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);

  useEffect(() => {
    if (!container.current || map.current) return;
    const instance = new maplibregl.Map({
      container: container.current,
      center: centerRef.current,
      zoom: 15,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: [config.osmTileUrl],
            tileSize: 256,
            attribution: "© <a href='https://www.openstreetmap.org/copyright' target='_blank' rel='noreferrer'>OpenStreetMap contributors</a>",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
    });
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    instance.on("load", () => {
      instance.addSource(imageSourceId, { type: "geojson", data: toFeatureCollection(imagesRef.current) });
      instance.addLayer({
        id: imageLayerId,
        type: "circle",
        source: imageSourceId,
        paint: {
          "circle-radius": ["case", ["==", ["get", "id"], selectedRef.current ?? ""], 10, 7],
          "circle-color": ["case", ["==", ["get", "id"], selectedRef.current ?? ""], "#242424", "#ffd84d"],
          "circle-stroke-color": "#fff9eb",
          "circle-stroke-width": ["case", ["==", ["get", "id"], selectedRef.current ?? ""], 3, 2],
        },
      });
      instance.addSource(focusSourceId, { type: "geojson", data: focusFeature(centerRef.current) });
      instance.addLayer({ id: "street-search-focus-point", type: "circle", source: focusSourceId, paint: { "circle-radius": 5, "circle-color": "#b64b34", "circle-stroke-width": 2, "circle-stroke-color": "#fff9eb" } });
      instance.addSource("street-actual-location", { type: "geojson", data: focusFeature(actualLocationRef.current) });
      instance.addLayer({ id: "street-actual-location-point", type: "circle", source: "street-actual-location", paint: { "circle-radius": 8, "circle-color": "#315e4b", "circle-stroke-width": 2.5, "circle-stroke-color": "#fff9eb" } });
      instance.on("click", imageLayerId, (event) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === "string") callbacks.current.onSelect(id);
      });
      instance.on("mouseenter", imageLayerId, () => { instance.getCanvas().style.cursor = "pointer"; });
      instance.on("mouseleave", imageLayerId, () => { instance.getCanvas().style.cursor = ""; });
    });
    const emitCenter = () => {
      const { lng, lat } = instance.getCenter();
      callbacks.current.onCenterChange([lng, lat]);
    };
    instance.on("moveend", emitCenter);
    const resizeObserver = new ResizeObserver(() => instance.resize());
    resizeObserver.observe(container.current);
    map.current = instance;
    return () => {
      resizeObserver.disconnect();
      instance.off("moveend", emitCenter);
      instance.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !instance.isStyleLoaded()) return;
    const current = instance.getCenter();
    if (Math.abs(current.lng - center[0]) > 0.00002 || Math.abs(current.lat - center[1]) > 0.00002) {
      instance.easeTo({ center, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 500, essential: false });
    }
    const source = instance.getSource(focusSourceId) as maplibregl.GeoJSONSource | undefined;
    source?.setData(focusFeature(center));
  }, [center]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !instance.isStyleLoaded()) return;
    (instance.getSource("street-actual-location") as maplibregl.GeoJSONSource | undefined)?.setData(focusFeature(actualLocation));
  }, [actualLocation]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !instance.isStyleLoaded()) return;
    const source = instance.getSource(imageSourceId) as maplibregl.GeoJSONSource | undefined;
    source?.setData(toFeatureCollection(images));
  }, [images]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !instance.getLayer(imageLayerId)) return;
    instance.setPaintProperty(imageLayerId, "circle-radius", ["case", ["==", ["get", "id"], selectedId ?? ""], 10, 7]);
    instance.setPaintProperty(imageLayerId, "circle-color", ["case", ["==", ["get", "id"], selectedId ?? ""], "#242424", "#ffd84d"]);
    instance.setPaintProperty(imageLayerId, "circle-stroke-width", ["case", ["==", ["get", "id"], selectedId ?? ""], 3, 2]);
  }, [selectedId]);

  return <div ref={container} className="street-map" aria-label="Map with Mapillary imagery search results" />;
}

function toFeatureCollection(images: MapillaryImage[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: images.map((image) => ({
      type: "Feature",
      properties: { id: image.id },
      geometry: { type: "Point", coordinates: image.coordinates },
    })),
  };
}

function focusFeature(center?: [number, number]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: center ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: center } }] : [] };
}
