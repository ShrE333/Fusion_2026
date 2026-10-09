"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ScanSearch, X } from "lucide-react";

type DetectionResult = {
  imageId: string;
  overlayBase64: string;
  classes: Array<{ label: string; percent: number }>;
  inferenceMs: number | null;
  note: string;
};

/** A deliberately 2D frame annotation WITHIN the real Mapillary 3D viewer.
 * A fixed image overlay cannot stay registered to freely navigated 3D geometry.
 */
export function StreetSegmentationOverlay({ imageId }: { imageId: string }) {
  const [enabled, setEnabled] = useState(false);

  return <div className="geosathi-ai-wrap">
    <button type="button" className={`geosathi-ai-toggle ${enabled ? "is-on" : ""}`}
      aria-pressed={enabled} aria-label={enabled ? "Turn off AI detection" : "Turn on AI detection"}
      onClick={() => setEnabled(current => !current)}>
      <ScanSearch size={14} /> AI Detection <span>{enabled ? "ON" : "OFF"}</span>
    </button>
    {enabled && <div className="geosathi-ai-inspector" role="region" aria-label="Mask2Former semantic segmentation of current Mapillary frame">
      <div className="geosathi-ai-head"><b>Mask2Former · Street scene</b><button type="button" onClick={() => setEnabled(false)} aria-label="Close AI detection"><X size={15} /></button></div>
      {imageId ? <FrameAnalysis key={imageId} imageId={imageId} /> : <p role="status">Select a Mapillary image to analyze.</p>}
    </div>}
  </div>;
}

type AnalysisState = { status: "loading" } | { status: "error"; error: string } | { status: "success"; result: DetectionResult };

/** Only this request-bound panel remounts on image changes or ON/OFF.
 * The Mapillary viewer remains mounted and keeps its navigation state.
 */
function FrameAnalysis({ imageId }: { imageId: string }) {
  const [state, setState] = useState<AnalysisState>({ status: "loading" });
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/street-detection", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageId }), signal: abort.signal,
    }).then(async response => {
      const payload = await response.json() as DetectionResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || `Image analysis failed (HTTP ${response.status}).`);
      if (payload.imageId !== imageId || typeof payload.overlayBase64 !== "string" || !payload.overlayBase64 ||
          !Array.isArray(payload.classes) || !payload.classes.every(item => typeof item?.label === "string" && typeof item.percent === "number" && Number.isFinite(item.percent))) {
        throw new Error("Unexpected segmentation response.");
      }
      if (!abort.signal.aborted) setState({ status: "success", result: payload });
    }).catch(error => {
      if (!abort.signal.aborted) setState({ status: "error", error: error instanceof Error ? error.message : "Segmentation failed." });
    });
    return () => abort.abort();
  }, [imageId]);
  if (state.status === "loading") return <p role="status">Analyzing current Mapillary image… Cold starts may take up to a minute.</p>;
  if (state.status === "error") return <p className="geosathi-ai-error" role="alert">{state.error}</p>;
  const { result } = state;
  return <>
        {/* 2D original-frame segmentation: NOT a 3D-aligned projection. */}
        <Image unoptimized width={1024} height={768} className="geosathi-ai-overlay-image" src={`data:image/png;base64,${result.overlayBase64}`} alt="Semantic segmentation overlay for the selected street image" />
        <div className="geosathi-ai-classes">{result.classes.slice(0, 8).map((item,i)=><span key={`${item.label}-${i}`}>{item.label}: {item.percent.toFixed(1)}%</span>)}</div>
        <p className="geosathi-ai-note">2D AI analysis of image {result.imageId}, not a 3D-anchored mask. Navigate to another image to reanalyze.</p>
      </>;
}
