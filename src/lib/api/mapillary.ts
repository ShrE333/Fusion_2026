export type MapillaryImage = {
  id: string;
  coordinates: [number, number];
  capturedAt?: number;
  compassAngle?: number;
  cameraType?: string;
  thumbnailUrl?: string;
  sequenceId?: string;
};

export type MapillarySearchFailureKind = "auth" | "provider" | "network" | "unconfigured";

export class MapillarySearchError extends Error {
  constructor(message: string, readonly kind: MapillarySearchFailureKind) {
    super(message);
    this.name = "MapillarySearchError";
  }
}

// A roughly 1 km square and at most 40 images keep each request local and bounded.
export const MAPILLARY_SEARCH_HALF_EXTENT_METERS = 500;
export const MAPILLARY_SEARCH_LIMIT = 40;

type GraphImage = {
  id?: unknown;
  computed_geometry?: { type?: unknown; coordinates?: unknown };
  captured_at?: unknown;
  compass_angle?: unknown;
  computed_compass_angle?: unknown;
  camera_type?: unknown;
  thumb_256_url?: unknown;
  sequence?: { id?: unknown } | string;
};

function isValidCoordinatePair(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2 &&
    typeof value[0] === "number" && Number.isFinite(value[0]) && value[0] >= -180 && value[0] <= 180 &&
    typeof value[1] === "number" && Number.isFinite(value[1]) && value[1] >= -90 && value[1] <= 90;
}

export async function searchMapillaryImages(
  coordinates: [number, number],
  signal: AbortSignal,
): Promise<MapillaryImage[]> {
  const [longitude, latitude] = coordinates;
  const params = new URLSearchParams({
    lat: String(latitude), lon: String(longitude),
  });

  let response: Response;
  try {
    response = await fetch(`/api/mapillary/images?${params}`, { signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new MapillarySearchError("Mapillary could not be reached. Check your connection and try again.", "network");
  }

  if (response.status === 401 || response.status === 403) {
    throw new MapillarySearchError("Mapillary lookup authorization failed. Check the server provider configuration.", "auth");
  }
  if (!response.ok) {
    const error = await response.json().catch(()=>null) as {error?:string;kind?:MapillarySearchFailureKind}|null;
    if(error?.kind==="unconfigured")throw new MapillarySearchError("Mapillary lookup is not configured on the server.","unconfigured");
    if(response.status===429)throw new MapillarySearchError("Mapillary lookup rate limit reached. Retry shortly.","provider");
    if(response.status===504)throw new MapillarySearchError("Mapillary lookup timed out. Retry shortly.","network");
    throw new MapillarySearchError(`Mapillary image search failed (HTTP ${response.status}). Try again shortly.`, "provider");
  }

  let payload: { data?: unknown };
  try {
    payload = await response.json() as { data?: unknown };
  } catch {
    throw new MapillarySearchError("Mapillary returned an unreadable response. Try again shortly.", "provider");
  }
  if (!Array.isArray(payload.data)) {
    throw new MapillarySearchError("Mapillary returned an unexpected image-search response.", "provider");
  }

  return normalizeMapillaryImages(payload.data);
}

export function normalizeMapillaryImages(data:unknown[]):MapillaryImage[] {
  return data.slice(0,MAPILLARY_SEARCH_LIMIT).flatMap((raw: unknown) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as GraphImage;
    const point = item.computed_geometry;
    if (typeof item.id !== "string" || !point || point.type !== "Point" || !isValidCoordinatePair(point.coordinates)) return [];
    const sequenceId = typeof item.sequence === "string" ? item.sequence : typeof item.sequence?.id === "string" ? item.sequence.id : undefined;
    return [{
      id: item.id,
      coordinates: [point.coordinates[0], point.coordinates[1]] as [number, number],
      capturedAt: typeof item.captured_at === "number" && Number.isFinite(item.captured_at) ? item.captured_at : undefined,
      compassAngle: typeof item.computed_compass_angle === "number" && Number.isFinite(item.computed_compass_angle) ? item.computed_compass_angle : typeof item.compass_angle === "number" && Number.isFinite(item.compass_angle) ? item.compass_angle : undefined,
      cameraType: typeof item.camera_type === "string" ? item.camera_type : undefined,
      thumbnailUrl: typeof item.thumb_256_url === "string" ? item.thumb_256_url : undefined,
      sequenceId,
    }];
  });
}
