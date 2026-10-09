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

export async function POST(request: Request) {
  const baseUrl = process.env.SKYCLIP_BASE_URL?.replace(/\/+$/, "");
  const token = process.env.SKYCLIP_SERVICE_TOKEN;

  if (!baseUrl || !token) {
    return NextResponse.json(
      { error: "SkyCLIP server configuration is missing." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    query?: unknown;
    bbox?: unknown;
  };

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (query.length < 3 || query.length > 1000) {
    return NextResponse.json(
      { error: "Query must be between 3 and 1000 characters." },
      { status: 422 },
    );
  }

  const payload: Record<string, unknown> = { query, top_k: 5 };
  if (
    Array.isArray(body.bbox) &&
    body.bbox.length === 4 &&
    body.bbox.every((value) => typeof value === "number")
  ) {
    payload.bbox = body.bbox;
  }

  try {
    const upstream = await fetch(`${baseUrl}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(180_000),
    });

    const raw = (await upstream.json().catch(() => null)) as
      | { results?: Candidate[] }
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

    const results = candidates.map((candidate, index) => {
      const [minLon, minLat, maxLon, maxLat] = candidate.bbox;
      const geometry = {
        type: "Polygon" as const,
        coordinates: [
          [
            [minLon, minLat],
            [maxLon, minLat],
            [maxLon, maxLat],
            [minLon, maxLat],
            [minLon, minLat],
          ],
        ],
      };

      return {
        id: candidate.tile_id,
        kind: "search" as const,
        title: `SkyCLIP imagery candidate ${index + 1}`,
        geometry,
        source: candidate.source || "SkyCLIP imagery index",
        status: "candidate",
        score: candidate.similarity,
        evidence:
          "Image-text similarity candidate; GIS verification pending.",
        bounds: candidate.bbox,
        imageTileId: candidate.tile_id,
        imageCapturedAt: candidate.acquired_at || undefined,
        groundedObjects: [
          {
            label: query,
            boundingBox: [0, 0, 1, 1] as [
              number,
              number,
              number,
              number,
            ],
            matchScore: candidate.similarity,
          },
        ],
        osmFeatures: [],
        relationships: [],
      };
    });

    return NextResponse.json(
      {
        query,
        intent: {
          visualTargets: [query],
          osmFeatureTypes: [],
          spatialPredicates: [],
          scope: "SkyCLIP indexed imagery",
        },
        results,
        export: {
          type: "FeatureCollection",
          features: results.map((result) => ({
            type: "Feature",
            properties: {
              id: result.id,
              title: result.title,
              source: result.source,
              status: result.status,
              similarity: result.score,
              imageTileId: result.imageTileId,
            },
            geometry: result.geometry,
          })),
          metadata: {
            query,
            mode: "backend",
            generatedAt: new Date().toISOString(),
          },
        },
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
