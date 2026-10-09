import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const upstream = process.env.GEOSATHI_API_BASE_URL;
const timeoutMs = 8_000;
const resources = new Set(["health", "features", "osm", "incidents"]);
const osmLayers = new Set(["buildings", "roads", "places"]);

const numberInRange = (value: string | null, minimum: number, maximum: number) => {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
};

function upstreamPath(resource: string, request: NextRequest) {
  if (resource === "health") return "/health";
  if (resource === "incidents") return "/incidents";
  const params = new URLSearchParams();
  const west = numberInRange(request.nextUrl.searchParams.get("west"), -180, 180);
  const east = numberInRange(request.nextUrl.searchParams.get("east"), -180, 180);
  const south = numberInRange(request.nextUrl.searchParams.get("south"), -90, 90);
  const north = numberInRange(request.nextUrl.searchParams.get("north"), -90, 90);
  const limit = numberInRange(request.nextUrl.searchParams.get("limit"), 1, 2000);
  if (west === null || east === null || south === null || north === null || limit === null) return null;
  if (west !== undefined) params.set("west", String(west));
  if (east !== undefined) params.set("east", String(east));
  if (south !== undefined) params.set("south", String(south));
  if (north !== undefined) params.set("north", String(north));
  if (limit !== undefined) params.set("limit", String(Math.floor(limit)));
  if (resource === "osm") {
    const layer = request.nextUrl.searchParams.get("layer") ?? "buildings";
    if (!osmLayers.has(layer)) return null;
    params.set("layer", layer);
  }
  const path = resource === "osm" ? "/api/v1/osm" : "/api/v1/features";
  return `${path}${params.size ? `?${params}` : ""}`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  if (!resources.has(resource)) return NextResponse.json({ error: "Unsupported GeoSathi resource." }, { status: 404 });
  if (!upstream) return NextResponse.json({ error: "GeoSathi backend is not configured on this deployment." }, { status: 503 });
  const path = upstreamPath(resource, request);
  if (!path) return NextResponse.json({ error: "Invalid GeoSathi request parameters." }, { status: 400 });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${upstream.replace(/\/$/, "")}${path}`, { signal: controller.signal, cache: "no-store", headers: { Accept: "application/json" } });
    const body = await response.text();
    let data: unknown;
    try { data = body ? JSON.parse(body) : null; } catch { return NextResponse.json({ error: "GeoSathi backend returned malformed JSON." }, { status: 502 }); }
    if (!response.ok) return NextResponse.json({ error: "GeoSathi backend request failed.", upstreamStatus: response.status }, { status: response.status >= 400 && response.status < 600 ? response.status : 502 });
    return NextResponse.json(data, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.name === "AbortError" ? "GeoSathi backend request timed out." : "GeoSathi backend is unavailable." }, { status: 503 });
  } finally { clearTimeout(timeout); }
}
