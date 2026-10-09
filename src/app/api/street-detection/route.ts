/**
 * GeoSathi same-origin proxy for Mask2Former on Mapillary frames.
 * Image identity is resolved with our own Mapillary token: clients cannot submit arbitrary image URLs.
 * The Cloud Run service lives in teammate's road-hazard-2 branch.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_SEGMENTOR = "https://geosathi-segmentation-api-883668519860.asia-south1.run.app";
const json = (value: unknown, status = 200) => NextResponse.json(value, {
  status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});
const validId = (x: unknown): x is string => typeof x === "string" && /^\d{5,30}$/.test(x);
const allowedImageOrigin = (raw: string) => {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password &&
      (url.hostname === "fbcdn.net" || url.hostname.endsWith(".fbcdn.net") ||
       url.hostname === "mapillary.com" || url.hostname.endsWith(".mapillary.com"));
  } catch { return false; }
};

export async function GET() {
  return json({
    feature: "GeoSathi Mask2Former street-scene segmentation",
    configured: Boolean(process.env.MAPILLARY_ACCESS_TOKEN && (process.env.SEGMENTATION_API_URL || DEFAULT_SEGMENTOR)),
    endpoint: "POST /api/street-detection",
  });
}

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") || "0");
  if (length > 4096) return json({ error: "Request too large." }, 413);
  let payload: unknown;
  try { payload = await request.json(); } catch { return json({ error: "Expected JSON." }, 400); }
  const id = (payload as { imageId?: unknown } | null)?.imageId;
  if (!validId(id)) return json({ error: "A valid numeric Mapillary image ID is required." }, 422);

  const token = process.env.MAPILLARY_ACCESS_TOKEN;
  if (!token) return json({ error: "Mapillary lookup is not configured. Set MAPILLARY_ACCESS_TOKEN on Vercel." }, 503);
  const api = process.env.SEGMENTATION_API_URL || DEFAULT_SEGMENTOR;
  let apiOrigin: URL;
  try {
    apiOrigin = new URL(api);
    if (apiOrigin.protocol !== "https:" || apiOrigin.username || apiOrigin.password || apiOrigin.search || apiOrigin.hash) throw new Error("invalid");
  } catch { return json({ error: "SEGMENTATION_API_URL must be an HTTPS service URL." }, 503); }

  try {
    const metadata = await fetch(`https://graph.mapillary.com/${id}?fields=id,thumb_1024_url`, {
      headers: { Authorization: `OAuth ${token}`, Accept: "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.any([request.signal, AbortSignal.timeout(12000)]),
    });
    if (metadata.status === 401 || metadata.status === 403) return json({ error: "Mapillary authentication rejected the server token." }, 502);
    if (!metadata.ok) return json({ error: `Mapillary image metadata unavailable (HTTP ${metadata.status}).` }, 502);
    const imageInfo = await metadata.json() as { id?: unknown; thumb_1024_url?: unknown };
    if (String(imageInfo.id) !== id || typeof imageInfo.thumb_1024_url !== "string" || !allowedImageOrigin(imageInfo.thumb_1024_url)) {
      return json({ error: "Mapillary did not return a usable trusted frame URL." }, 502);
    }
    const photo = await fetch(imageInfo.thumb_1024_url, {
      cache: "no-store", redirect: "error", signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
    });
    const imageType = (photo.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!photo.ok || !["image/jpeg", "image/png", "image/webp"].includes(imageType)) {
      return json({ error: "The selected Mapillary image is unavailable." }, 502);
    }
    const advertisedBytes = Number(photo.headers.get("content-length") || "0");
    if (advertisedBytes > 5_000_000) return json({ error: "Mapillary frame exceeds processing limit." }, 413);
    const bytes = await photo.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 5_000_000) return json({ error: "Invalid Mapillary frame size." }, 413);

    const data = new FormData();
    const ext = imageType === "image/png" ? "png" : imageType === "image/webp" ? "webp" : "jpg";
    data.append("file", new Blob([bytes], { type: imageType }), `mapillary-${id}.${ext}`);
    const response = await fetch(`${apiOrigin.toString().replace(/\/$/, "")}/segment`, {
      method: "POST", body: data, cache: "no-store", redirect: "error", signal: AbortSignal.any([request.signal, AbortSignal.timeout(55_000)]),
    });
    if (!response.ok) return json({ error: response.status === 503 ? "Mask2Former is warming up or unavailable; retry shortly." : `Segmentation provider returned HTTP ${response.status}.` }, 502);
    const advertised = Number(response.headers.get("content-length") || "0");
    if (advertised > 4_000_000) return json({ error: "Segmentation response exceeds Vercel's size limit." }, 502);
    const body = await response.text();
    if (body.length > 4_000_000) return json({ error: "Segmentation response exceeds Vercel's size limit." }, 502);
    const result = JSON.parse(body) as {
      model?: unknown; overlay_png_base64?: unknown; inference_ms?: unknown;
      classes?: Array<{ class_id?: unknown; label?: unknown; pixel_percentage?: unknown }>;
    };
    const overlay = result.overlay_png_base64;
    if (typeof overlay !== "string" || !overlay.length || overlay.length > 3_600_000 || !/^[A-Za-z0-9+/=]+$/.test(overlay)) {
      return json({ error: "Segmentation provider returned an invalid overlay." }, 502);
    }
    const classes = (Array.isArray(result.classes) ? result.classes : []).slice(0, 65).flatMap(item => {
      if (typeof item.label !== "string" || item.label.length > 100 || typeof item.pixel_percentage !== "number" || !Number.isFinite(item.pixel_percentage)) return [];
      return [{ label: item.label, percent: Math.max(0, Math.min(100, item.pixel_percentage)) }];
    });
    return json({
      imageId: id, model: "Mask2Former · Mapillary Vistas", overlayBase64: overlay,
      classes, inferenceMs: typeof result.inference_ms === "number" ? result.inference_ms : null,
      note: "2D segmentation of one Mapillary frame. This overlay is not anchored to 3D world geometry.",
    });
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return json({ error: timeout ? "Image analysis timed out. Retry after the model starts." : "Street detection provider could not be reached." }, timeout ? 504 : 502);
  }
}
