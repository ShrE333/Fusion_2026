"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Crosshair, MapPin, RefreshCw, Search } from "lucide-react";
import { StreetImageryMap } from "@/components/map/street-imagery-map";
import { MapillaryViewer } from "@/components/street-view/mapillary-viewer";
import { AtlasNav } from "@/components/shell/atlas-nav";
import { useAtlasLocation } from "@/components/shell/location-context";
import { MapillarySearchError, searchMapillaryImages, type MapillaryImage } from "@/lib/api/mapillary";
import { config } from "@/lib/config";

const PUNE: [number, number] = [73.8567, 18.5204];
const TOKEN_SETUP_MESSAGE = "Street imagery lookup is not configured. Configure the private server MAPILLARY_ACCESS_TOKEN; the viewer separately needs a restricted browser token.";
type CoverageState = "unconfigured" | "idle" | "loading" | "success" | "empty" | "error" | "auth";

const coordinateText = (coordinates: [number, number]) => `${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}`;
const formatCaptureDate = (capturedAt?: number) => capturedAt === undefined ? "Not supplied" : new Date(capturedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

export default function StreetViewPage() {
  const { location } = useAtlasLocation();
  const [center, setCenter] = useState<[number, number]>(() => location?.coordinates ?? PUNE);
  const [focusSource, setFocusSource] = useState<"actual" | "map" | "manual" | "pune">(() => location ? "actual" : "pune");
  const [coordinateInput, setCoordinateInput] = useState(() => coordinateText(location?.coordinates ?? PUNE));
  const [images, setImages] = useState<MapillaryImage[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [activeImageId, setActiveImageId] = useState<string>();
  const [coverageState, setCoverageState] = useState<CoverageState>("idle");
  const [message, setMessage] = useState("");
  const requestId = useRef(0);
  const request = useRef<AbortController | undefined>(undefined);

  const searchCoverage = useCallback(async (searchCenter: [number, number] = center) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const id = ++requestId.current;
    setImages([]);
    setSelectedId(undefined);
    setActiveImageId(undefined);
    setMessage("");
    setCoverageState("loading");
    try {
      const found = await searchMapillaryImages(searchCenter, controller.signal);
      if (controller.signal.aborted || requestId.current !== id) return;
      setImages(found);
      setCoverageState(found.length ? "success" : "empty");
    } catch (error) {
      if (controller.signal.aborted || requestId.current !== id) return;
      if (error instanceof MapillarySearchError) {
        setCoverageState(error.kind === "unconfigured" ? "unconfigured" : error.kind === "auth" ? "auth" : "error");
        setMessage(error.message);
      } else {
        setCoverageState("error");
        setMessage("Street imagery could not be retrieved. Check your network connection and retry.");
      }
    }
  }, [center]);

  useEffect(() => {
    const initialSearch = window.setTimeout(() => { void searchCoverage(center); }, 0);
    return () => {
      if (initialSearch !== undefined) window.clearTimeout(initialSearch);
      request.current?.abort();
    };
    // A route visit performs one bounded lookup for its initial active context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeCenter = useCallback((coordinates: [number, number], source: "map" | "manual" | "pune" | "actual") => {
    const changed = Math.abs(coordinates[0] - center[0]) > 0.0001 || Math.abs(coordinates[1] - center[1]) > 0.0001;
    if (changed) {
      requestId.current++;
      request.current?.abort();
      setImages([]);
      setSelectedId(undefined);
      setActiveImageId(undefined);
      setCoverageState("idle");
      setMessage("");
    }
    setCenter(coordinates);
    setCoordinateInput(coordinateText(coordinates));
    setFocusSource(source);
  }, [center]);

  const applyCoordinateInput = () => {
    const match = coordinateInput.split(",").map((part) => Number(part.trim()));
    if (match.length !== 2 || !match.every(Number.isFinite) || match[0] < -90 || match[0] > 90 || match[1] < -180 || match[1] > 180) {
      setMessage("Enter coordinates as latitude, longitude (for example: 18.52040, 73.85670).");
      setCoverageState("error");
      return;
    }
    changeCenter([match[1], match[0]], "manual");
  };

  const handleMapCenterChange = useCallback((coordinates: [number, number]) => {
    const moved = Math.abs(coordinates[0] - center[0]) > 0.0001 || Math.abs(coordinates[1] - center[1]) > 0.0001;
    if (!moved) return;
    requestId.current++;
    request.current?.abort();
    setImages([]);
    setSelectedId(undefined);
    setActiveImageId(undefined);
    setCoverageState("idle");
    setMessage("");
    setCenter(coordinates);
    setCoordinateInput(coordinateText(coordinates));
    setFocusSource("map");
  }, [center]);

  const selectImage = (imageId: string) => {
    setSelectedId(imageId);
    setActiveImageId(imageId);
  };

  const actualCoordinates = location?.coordinates;
  const locationDescription = focusSource === "actual" && location
    ? `Actual browser location · ±${Math.round(location.accuracy)} m accuracy · ${new Date(location.timestamp).toLocaleString()}`
    : focusSource === "pune" ? "Pune, Maharashtra · default search location" : focusSource === "manual" ? "User-entered search coordinates" : "Current map center · search area can be refreshed";
  const statusLabel = coverageState === "unconfigured" ? "PROVIDER NOT CONFIGURED" : coverageState === "loading" ? "SEARCHING MAPILLARY" : coverageState === "auth" ? "AUTHENTICATION REQUIRED" : coverageState === "error" ? "PROVIDER ERROR" : coverageState === "empty" ? "NO IMAGERY RETURNED" : coverageState === "success" ? `${images.length} PROVIDER IMAGE${images.length === 1 ? "" : "S"}` : "READY TO SEARCH";

  return <main className="street-page street-page-live">
    <AtlasNav />
    <header className="explorer-header street-live-header">
      <div><p>STREET-LEVEL EVIDENCE · MAPILLARY</p><h1>Inspect local context</h1></div>
      <span><i />{statusLabel}</span>
    </header>

    <section className="street-workspace">
      <div className="street-column street-map-column">
        <div className="street-location-controls">
          <label htmlFor="street-coordinates">SEARCH COORDINATES · LATITUDE, LONGITUDE</label>
          <div className="street-coordinate-form">
            <input id="street-coordinates" value={coordinateInput} onChange={(event) => setCoordinateInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applyCoordinateInput(); }} aria-label="Search coordinates as latitude, longitude" />
            <button onClick={applyCoordinateInput} aria-label="Go to entered coordinates"><MapPin size={15} /> Go</button>
          </div>
          <div className="street-location-actions">
            <button onClick={() => void searchCoverage(center)} disabled={coverageState === "loading"}><Search size={14} /> {coverageState === "loading" ? "SEARCHING…" : "SEARCH THIS AREA"}</button>
            {location && <button onClick={() => changeCenter(location.coordinates, "actual")}><Crosshair size={14} /> USE CURRENT LOCATION</button>}
            <button onClick={() => changeCenter(PUNE, "pune")}>BACK TO PUNE</button>
          </div>
          <small>{locationDescription}</small>
        </div>

        <div className="street-map-frame">
          <StreetImageryMap center={center} actualLocation={actualCoordinates} images={images} selectedId={selectedId} onCenterChange={handleMapCenterChange} onSelect={selectImage} />
          <span className="street-map-legend"><i /> Search center{location && <><b /> Actual device location</>}</span>
        </div>

        <section className="street-results" aria-label="Street imagery search results">
          <div className="street-section-heading"><div><p>PROVIDER RESULTS</p><h2>{coverageState === "empty" ? "No images in this search area" : images.length ? `${images.length} images near this location` : "Imagery coverage"}</h2></div><button onClick={() => void searchCoverage(center)} disabled={coverageState === "loading"} aria-label="Refresh imagery coverage"><RefreshCw size={15} /></button></div>
          {coverageState === "loading" && <p className="street-state-message" role="status">Searching an approximately 1 km × 1 km area around {coordinateText(center)}…</p>}
          {(coverageState === "empty" || coverageState === "error" || coverageState === "auth" || coverageState === "unconfigured") && <p className={`street-state-message ${coverageState === "error" || coverageState === "auth" ? "is-error" : ""}`} role={coverageState === "error" || coverageState === "auth" ? "alert" : "status"}>{coverageState === "empty" ? "Mapillary returned no images for this area. Move the map or enter another location, then search again; no imagery from another city is substituted." : message || (coverageState === "unconfigured" ? TOKEN_SETUP_MESSAGE : "")}</p>}
          {coverageState === "idle" && <p className="street-state-message">Move the map or enter a location, then search for Mapillary coverage.</p>}
          {images.length > 0 && <div className="street-result-list">{images.map((image) => <button key={image.id} className={`street-result-card ${selectedId === image.id ? "active" : ""}`} onClick={() => selectImage(image.id)} aria-pressed={selectedId === image.id}>
            {image.thumbnailUrl ? <Image src={image.thumbnailUrl} width={82} height={58} unoptimized alt={`Mapillary image ${image.id}`} /> : <span className="street-result-thumb"><MapPin size={18} /></span>}
            <span className="street-result-copy"><b>{image.id}</b><small>{coordinateText(image.coordinates)} · {formatCaptureDate(image.capturedAt)}</small><small>{image.compassAngle === undefined ? "Heading not supplied" : `${Math.round(image.compassAngle)}° heading`}{image.cameraType ? ` · ${image.cameraType}` : ""}{image.sequenceId ? ` · Sequence ${image.sequenceId}` : ""}</small></span>
          </button>)}</div>}
        </section>
      </div>

      <div className="street-column street-view-column">
        <div className="street-view-heading"><div><p>STREET-LEVEL VIEWER</p><h2>{selectedId ? `Image ${activeImageId ?? selectedId}` : "Select an imagery point"}</h2></div><span>{selectedId ? "PROVIDER IMAGE" : "WAITING FOR SELECTION"}</span></div>
        <div className="street-view-frame">
          {selectedId && config.mapillaryAccessToken ? <MapillaryViewer key={selectedId} accessToken={config.mapillaryAccessToken} imageId={selectedId} onLoaded={setActiveImageId} onFailure={() => setMessage("The selected image ID was returned by Mapillary, but the viewer could not load it. Choose another result or retry coverage.")} /> : <div className="street-demo-fallback">
            <div className="pano-sky" /><div className="pano-buildings" /><div className="pano-road" />
            <span>DEMO PANORAMA — NOT VERIFIED AT THIS LOCATION</span>
            <p>{coverageState === "unconfigured" ? "A Mapillary browser token is required to load genuine street-level images." : selectedId ? "This synthetic placeholder is not a substitute for the selected provider image." : "Search for imagery, then select a returned Mapillary image to open its real capture."}</p>
          </div>}
        </div>
        <div className="street-image-details">
          <p>SELECTED IMAGE · PROVIDER METADATA</p>
          {selectedId && images.find((image) => image.id === selectedId) ? (() => {
            const image = images.find((candidate) => candidate.id === selectedId)!;
            return <dl><dt>IMAGE ID</dt><dd>{activeImageId ?? image.id}</dd><dt>COORDINATES</dt><dd>{coordinateText(image.coordinates)}</dd><dt>CAPTURED</dt><dd>{formatCaptureDate(image.capturedAt)}</dd><dt>HEADING</dt><dd>{image.compassAngle === undefined ? "Not supplied" : `${image.compassAngle.toFixed(1)}°`}</dd><dt>CAMERA</dt><dd>{image.cameraType ?? "Not supplied"}</dd><dt>SEQUENCE</dt><dd>{image.sequenceId ?? "Not supplied"}</dd></dl>;
          })() : <p className="street-no-selection">Metadata appears here after you select an actual Mapillary result. Search results and captures are not part of GeoAI aerial-image detection.</p>}
          {selectedId && <a className="street-provider-link" href={`https://www.mapillary.com/app/?pKey=${encodeURIComponent(activeImageId ?? selectedId)}`} target="_blank" rel="noreferrer">Open image on Mapillary <ArrowUpRight size={14} /></a>}
          {message && selectedId && <p className="street-view-error" role="alert">{message}</p>}
        </div>
      </div>
    </section>

    <footer className="explorer-footer street-live-footer">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · Street-level imagery © <a href="https://www.mapillary.com/terms" target="_blank" rel="noreferrer">Mapillary</a> · aerial GeoAI results are a separate capability</footer>
  </main>;
}
