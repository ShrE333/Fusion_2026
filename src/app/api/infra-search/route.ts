import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Candidate = {
  tile_id: string;
  bbox: [number, number, number, number];
  source?: string;
  acquired_at?: string | null;
  similarity: number;
};

type InfraRequest = {
  query_id?: unknown;
  query?: unknown;
  location?: {
    lat?: unknown;
    lon?: unknown;
  };
};

export async function POST(request: Request) {
  const baseUrl = process.env.SKYCLIP_BASE_URL?.replace(/\/+$/, "");
  const token = process.env.SKYCLIP_SERVICE_TOKEN;

  if (!baseUrl || !token) {
    return NextResponse.json(
      { error: "SkyCLIP server configuration is missing." },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as InfraRequest;
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const queryId = typeof body.query_id === "string" ? body.query_id : "";
  const lat = Number(body.location?.lat);
  const lon = Number(body.location?.lon);

  if (query.length < 3 || query.length > 1000) {
    return NextResponse.json(
      { error: "Query must be between 3 and 1000 characters." },
      { status: 422 },
    );
  }

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return NextResponse.json(
      { error: "A valid {lat, lon} location is required." },
      { status: 422 },
    );
  }

  // Roughly a 2.2 km north/south search radius.
  // Longitude span is adjusted for latitude.
  const latSpan = 0.02;
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.2);
  const lonSpan = latSpan / cosLat;

  const bbox: [number, number, number, number] = [
    Math.max(-180, lon - lonSpan),
    Math.max(-90, lat - latSpan),
    Math.min(180, lon + lonSpan),
    Math.min(90, lat + latSpan),
  ];

  try {
    const upstream = await fetch(`${baseUrl}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        top_k: 5,
        bbox,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(180_000),
    });

    const raw = (await upstream.json().catch(() => null)) as
      | { model?: string; results?: Candidate[]; note?: string }
      | null;

    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: "SkyCLIP request failed.",
          upstreamStatus: upstream.status,
        },
        { status: 502 },
      );
    }

    const candidates = Array.isArray(raw?.results) ? raw.results : [];
    const results = candidates.map((candidate) => {
      const [minLon, minLat, maxLon, maxLat] = candidate.bbox;
      return {
        tile_id: candidate.tile_id,
        bbox: candidate.bbox,
        center: {
          lat: (minLat + maxLat) / 2,
          lon: (minLon + maxLon) / 2,
        },
        source: candidate.source || "SkyCLIP imagery index",
        acquired_at: candidate.acquired_at ?? null,
        similarity: candidate.similarity,
      };
    });

    return NextResponse.json(
      {
        query_id: queryId,
        query,
        location: { lat, lon },
        search_bbox: bbox,
        model: raw?.model || "SkyCLIP ViT-B/32",
        status: results.length ? "candidate_matches" : "no_indexed_match",
        results,
        note:
          "SkyCLIP image-text similarity candidates only; GIS verification pending.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "SkyCLIP service is unreachable.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 },
    );
  }
}
