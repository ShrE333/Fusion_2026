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
  location?: { lat?: unknown; lon?: unknown };
};

type GisLayer = "buildings" | "roads" | "places";
type GeoFeature = {
  id?: string | number;
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
};
type GeoCollection = { type?: string; features?: GeoFeature[] };

const GIS_KEYWORDS: Record<GisLayer, string[]> = {
  buildings: [
    "building", "buildings", "house", "houses", "structure", "structures",
    "इमारत", "इमारतें", "भवन", "बिल्डिंग", "इमारती", "बांधकाम",
  ],
  roads: [
    "road", "roads", "street", "streets", "highway", "highways", "route",
    "सड़क", "सड़क", "सड़कें", "रास्ता", "रास्ते", "रस्ता", "रस्ते", "महामार्ग",
  ],
  places: [
    "place", "places", "poi", "point of interest", "hospital", "school",
    "temple", "restaurant", "shop", "market",
    "स्थान", "जगह", "अस्पताल", "स्कूल", "मंदिर", "दुकान", "बाज़ार",
    "ठिकाण", "ठिकाणे", "रुग्णालय", "शाळा", "दुकान", "बाजार",
  ],
};

function detectGisLayer(query: string): GisLayer | null {
  const normalized = query.toLocaleLowerCase();
  for (const layer of ["buildings", "roads", "places"] as GisLayer[]) {
    if (GIS_KEYWORDS[layer].some((keyword) => normalized.includes(keyword))) return layer;
  }
  return null;
}

function coordinatePairs(value: unknown, pairs: Array<[number, number]>): void {
  if (!Array.isArray(value)) return;
  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  ) {
    pairs.push([value[0], value[1]]);
    return;
  }
  for (const child of value) coordinatePairs(child, pairs);
}

function featureBounds(feature: GeoFeature): [number, number, number, number] | null {
  const pairs: Array<[number, number]> = [];
  coordinatePairs(feature.geometry?.coordinates, pairs);
  if (!pairs.length) return null;
  let minLon = pairs[0][0], maxLon = pairs[0][0], minLat = pairs[0][1], maxLat = pairs[0][1];
  for (const [lon, lat] of pairs) {
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  }
  return [minLon, minLat, maxLon, maxLat];
}

function featureName(feature: GeoFeature, layer: GisLayer, index: number): string {
  const props = feature.properties || {};
  const values = [props.name, props["name:en"], props.amenity, props.highway, props.building, props.place];
  const value = values.find((item) => typeof item === "string" && item.trim());
  return typeof value === "string" ? value : `${layer} ${index + 1}`;
}

export async function POST(request: Request) {
  const skyclipBaseUrl = process.env.SKYCLIP_BASE_URL?.replace(/\/+$/, "");
  const gisBaseUrl = process.env.GEOSATHI_API_BASE_URL?.replace(/\/+$/, "");
  const token = process.env.SKYCLIP_SERVICE_TOKEN;

  if (!token) {
    return NextResponse.json({ error: "Infrastructure-search authentication is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as InfraRequest;
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const queryId = typeof body.query_id === "string" ? body.query_id : "";
  const lat = Number(body.location?.lat);
  const lon = Number(body.location?.lon);

  if (query.length < 3 || query.length > 1000) {
    return NextResponse.json({ error: "Query must be between 3 and 1000 characters." }, { status: 422 });
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: "A valid {lat, lon} location is required." }, { status: 422 });
  }

  const latSpan = 0.02;
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.2);
  const lonSpan = latSpan / cosLat;
  const bbox: [number, number, number, number] = [
    Math.max(-180, lon - lonSpan), Math.max(-90, lat - latSpan),
    Math.min(180, lon + lonSpan), Math.min(90, lat + latSpan),
  ];
  const [west, south, east, north] = bbox;

  const gisLayer = detectGisLayer(query);
  let gisAttempted = false;
  let gisError: string | null = null;

  if (gisLayer && gisBaseUrl) {
    gisAttempted = true;
    try {
      const params = new URLSearchParams({
        layer: gisLayer, west: String(west), south: String(south),
        east: String(east), north: String(north), limit: "100",
      });
      const gisResponse = await fetch(`${gisBaseUrl}/api/v1/osm?${params}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      const gisRaw = (await gisResponse.json().catch(() => null)) as GeoCollection | null;
      if (!gisResponse.ok) {
        gisError = `GeoSathi GIS returned HTTP ${gisResponse.status}`;
      } else if (gisRaw?.type === "FeatureCollection" && Array.isArray(gisRaw.features)) {
        const results = gisRaw.features
          .map((feature, index) => {
            const fb = featureBounds(feature);
            if (!fb) return null;
            const [minLon, minLat, maxLon, maxLat] = fb;
            const center = { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
            const distance2 = Math.pow(center.lat - lat, 2) + Math.pow(center.lon - lon, 2);
            return {
              id: feature.id ?? feature.properties?.osm_id ?? feature.properties?.id ?? `gis-${gisLayer}-${index + 1}`,
              kind: "gis_feature",
              gis_verified: true,
              gis_layer: gisLayer,
              name: featureName(feature, gisLayer, index),
              bbox: fb,
              center,
              source: "OpenStreetMap via GeoSathi/PostGIS",
              similarity: null,
              properties: feature.properties || {},
              _distance2: distance2,
            };
          })
          .filter((value): value is NonNullable<typeof value> => value !== null)
          .sort((a, b) => a._distance2 - b._distance2)
          .slice(0, 5)
          .map(({ _distance2, ...value }) => value);

        if (results.length) {
          return NextResponse.json({
            query_id: queryId, query, location: { lat, lon }, search_bbox: bbox,
            model: "GeoSathi PostGIS/OSM", status: "gis_matches",
            gis_verified: true, gis_layer: gisLayer, results,
            note: "GIS-backed OpenStreetMap features returned through the GeoSathi/PostGIS service.",
          }, { headers: { "Cache-Control": "no-store" } });
        }
      }
    } catch (error) {
      gisError = error instanceof Error ? error.message : "Unknown GIS error";
    }
  }

  if (!skyclipBaseUrl) {
    return NextResponse.json({
      error: "No GIS match was available and SkyCLIP fallback is not configured.",
      gis_attempted: gisAttempted, gis_layer: gisLayer, gis_error: gisError,
    }, { status: 503 });
  }

  try {
    const upstream = await fetch(`${skyclipBaseUrl}/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, top_k: 5, bbox }),
      cache: "no-store",
      signal: AbortSignal.timeout(180_000),
    });
    const raw = (await upstream.json().catch(() => null)) as { model?: string; results?: Candidate[] } | null;
    if (!upstream.ok) {
      return NextResponse.json({
        error: "SkyCLIP request failed.", upstreamStatus: upstream.status,
        gis_attempted: gisAttempted, gis_layer: gisLayer, gis_error: gisError,
      }, { status: 502 });
    }
    const candidates = Array.isArray(raw?.results) ? raw.results : [];
    const results = candidates.map((candidate) => {
      const [minLon, minLat, maxLon, maxLat] = candidate.bbox;
      return {
        tile_id: candidate.tile_id, kind: "imagery_candidate", gis_verified: false,
        bbox: candidate.bbox,
        center: { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 },
        source: candidate.source || "SkyCLIP imagery index",
        acquired_at: candidate.acquired_at ?? null,
        similarity: candidate.similarity,
      };
    });
    return NextResponse.json({
      query_id: queryId, query, location: { lat, lon }, search_bbox: bbox,
      model: raw?.model || "SkyCLIP ViT-B/32",
      status: results.length ? "candidate_matches" : "no_indexed_match",
      gis_verified: false, gis_attempted: gisAttempted, gis_layer: gisLayer, gis_error: gisError,
      results,
      note: "No GeoSathi GIS feature was returned for this query; SkyCLIP image-text similarity candidates are shown instead.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: "SkyCLIP service is unreachable.",
      detail: error instanceof Error ? error.message : "Unknown error",
      gis_attempted: gisAttempted, gis_layer: gisLayer, gis_error: gisError,
    }, { status: 502 });
  }
}
