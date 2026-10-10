"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScanSearch, X } from "lucide-react";
import { DEFAULT_INTERVAL_SECONDS, queueDelayMs, retryAfterMs } from "@/lib/street-inference-queue";

type DetectionResult = {
  imageId: string;
  overlayBase64: string;
  classes: Array<{ label: string; percent: number }>;
  inferenceMs: number | null;
  note: string;
};
type AnalysisStatus = {
  imageId: string;
  kind: "loading" | "error" | "cooldown";
  message?: string;
  retryAt?: number;
};

/** Sequential analysis of Mapillary image IDs; NOT 3D-registered segmentation or video FPS. */
export function StreetSegmentationOverlay({ imageId }: { imageId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [live, setLive] = useState(true);
  const [intervalS, setIntervalS] = useState(DEFAULT_INTERVAL_SECONDS);
  const [inFlight, setInFlight] = useState(false);
  const [status, setStatus] = useState<AnalysisStatus | null>(null);
  const [cached, setCached] = useState<Record<string, DetectionResult>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [manualId, setManualId] = useState<string | null>(null);
  const [cycle, setCycle] = useState(0);

  const activeController = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const latestFrameId = useRef(imageId);
  const lastStarted = useRef(0);
  const cooldownUntil = useRef(0);
  const rateLimitHits = useRef(0);

  useEffect(() => { latestFrameId.current = imageId; }, [imageId]);
  useEffect(() => () => { activeController.current?.abort(); }, []);
  useEffect(() => { if (!enabled || !live) activeController.current?.abort(); }, [enabled, live]);

  const analyze = useCallback(async (targetId: string) => {
    if (busy.current || !targetId || Date.now() < cooldownUntil.current) return;
    busy.current = true;
    lastStarted.current = Date.now();
    const controller = new AbortController();
    activeController.current = controller;
    setInFlight(true);
    setStatus({ imageId: targetId, kind: "loading" });
    const timeout = window.setTimeout(() => controller.abort(), 59_000);
    try {
      const response = await fetch("/api/street-detection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId: targetId }),
        signal: controller.signal,
      });
      const body: unknown = await response.json().catch(() => null);
      const payload: Partial<DetectionResult> & { error?: string } = body && typeof body === "object" ? body as Partial<DetectionResult> & { error?: string } : {};
      if (response.status === 429) {
        rateLimitHits.current += 1;
        const fallback = Math.min(300_000, 30_000 * 2 ** Math.min(4, rateLimitHits.current - 1));
        const wait = retryAfterMs(response.headers.get("Retry-After"), Date.now(), fallback);
        cooldownUntil.current = Date.now() + wait;
        if (!controller.signal.aborted && latestFrameId.current === targetId) {
          setStatus({ imageId: targetId, kind: "cooldown", message: "Provider rate limit reached. Live AI will retry after the cooldown.", retryAt: cooldownUntil.current });
        }
        return;
      }
      if (!response.ok) {
        const message = typeof payload.error === "string" ? payload.error : `Analysis unavailable (HTTP ${response.status}).`;
        setFailed(old => ({ ...old, [targetId]: message }));
        if (!controller.signal.aborted && latestFrameId.current === targetId) setStatus({ imageId: targetId, kind: "error", message });
        return;
      }
      if (payload.imageId !== targetId || typeof payload.overlayBase64 !== "string" || !payload.overlayBase64 ||
          !Array.isArray(payload.classes) || !payload.classes.every(item => typeof item?.label === "string" && typeof item.percent === "number" && Number.isFinite(item.percent))) {
        throw new Error("Segmentation service returned an unexpected result.");
      }
      const result = payload as DetectionResult;
      rateLimitHits.current = 0;
      if (!controller.signal.aborted) {
        // Small in-session cache prevents re-analyzing the same Mapillary image ID.
        setCached(previous => {
          const next = { ...previous, [targetId]: result };
          const ids = Object.keys(next);
          for (const id of ids.slice(0, Math.max(0, ids.length - 6))) delete next[id];
          return next;
        });
        if (latestFrameId.current === targetId) setStatus(null);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : "Image analysis failed.";
        setFailed(old => ({ ...old, [targetId]: message }));
        if (latestFrameId.current === targetId) setStatus({ imageId: targetId, kind: "error", message });
      }
    } finally {
      window.clearTimeout(timeout);
      if (activeController.current === controller) activeController.current = null;
      busy.current = false;
      setInFlight(false);
      setCycle(current => current + 1);
    }
  }, []);

  const targetId = enabled ? (live ? imageId : (manualId === imageId ? manualId : null)) : null;
  const cachedResult = cached[imageId];
  const failure = failed[imageId];
  const shownStatus = status?.imageId === imageId ? status : null;

  useEffect(() => {
    if (!targetId || inFlight || cached[targetId] || failed[targetId]) return;
    const delay = queueDelayMs(Date.now(), lastStarted.current, cooldownUntil.current, intervalS);
    const timer = window.setTimeout(() => { void analyze(targetId); }, delay);
    return () => window.clearTimeout(timer);
  }, [targetId, inFlight, cached, failed, intervalS, cycle, analyze]);

  const retry = () => {
    setFailed(old => {
      const next = { ...old };
      delete next[imageId];
      return next;
    });
    setManualId(imageId);
    setCycle(c => c + 1);
  };

  return <div className="geosathi-ai-wrap">
    <button type="button" className={`geosathi-ai-toggle ${enabled ? "is-on" : ""}`}
      aria-pressed={enabled} aria-label={enabled ? "Turn off AI detection" : "Turn on queued AI detection"}
      onClick={() => setEnabled(value => !value)}>
      <ScanSearch size={14} /> AI Detection <span>{enabled ? "ON" : "OFF"}</span>
    </button>
    {enabled && <div className="geosathi-ai-inspector" role="region" aria-label="Queued Mapillary Mask2Former analysis">
      <div className="geosathi-ai-head">
        <b>Live AI · Mask2Former</b>
        <button type="button" onClick={() => setEnabled(false)} aria-label="Close AI analysis"><X size={15}/></button>
      </div>
      <label className="geosathi-queue-check"><input type="checkbox" checked={live} onChange={event => { setLive(event.target.checked); setManualId(null); }} /> Follow Mapillary images</label>
      <label className="geosathi-queue-rate">Minimum gap: {intervalS} seconds
        <input aria-label="Minimum inference gap" type="range" min="10" max="30" step="5" value={intervalS} onChange={event => setIntervalS(Number(event.target.value))} />
      </label>
      {!live && <button type="button" className="geosathi-queue-retry" onClick={retry} disabled={inFlight}>Analyze selected image</button>}
      {cachedResult ? <>
        <Image unoptimized width={1024} height={768} className="geosathi-ai-overlay-image" src={`data:image/png;base64,${cachedResult.overlayBase64}`} alt="2D semantic segmentation of selected Mapillary photo" />
        <div className="geosathi-ai-classes">{cachedResult.classes.slice(0, 8).map((item, index) => <span key={`${item.label}-${index}`}>{item.label}: {item.percent.toFixed(1)}%</span>)}</div>
        <p className="geosathi-ai-note">Cached result · Image {imageId} · 2D segmentation, not 3D-aligned geometry.</p>
      </> : <>
        {shownStatus?.kind === "loading" ? <p role="status">Analyzing image {imageId}…</p>
          : shownStatus?.kind === "cooldown" ? <p role="status">{shownStatus.message} Retry after {new Date(shownStatus.retryAt || 0).toLocaleTimeString()}.</p>
          : failure ? <><p role="alert" className="geosathi-ai-error">{failure}</p><button type="button" className="geosathi-queue-retry" onClick={retry} disabled={inFlight}>Retry this image</button></>
          : live ? <p role="status">{inFlight ? "Finishing previous image; newest frame is queued…" : "Waiting for a stable frame / inference slot…"}</p>
          : <p>Follow mode paused. Analyze this image manually.</p>}
      </>}
      <p className="geosathi-ai-note">One image at a time · no duplicate requests for cached frames. Mapillary playback itself remains independent.</p>
    </div>}
  </div>;
}
