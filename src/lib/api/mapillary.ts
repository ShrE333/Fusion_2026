export type MapillaryImage = {
  id: string;
  coordinates: [number, number];
  capturedAt?: number;
  compassAngle?: number;
  cameraType?: string;
  thumbnailUrl?: string;
  sequenceId?: string;
};

export type MapillarySearchFailureKind = "auth" | "provider" | "network";

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
  accessToken: string,
  signal: AbortSignal,
): Promise<MapillaryImage[]> {
  const [longitude, latitude] = coordinates;
  const latitudeDelta = MAPILLARY_SEARCH_HALF_EXTENT_METERS / 111_320;
  const longitudeDelta = MAPILLARY_SEARCH_HALF_EXTENT_METERS / (111_320 * Math.cos(latitude * Math.PI / 180));
  const params = new URLSearchParams({
    fields: "id,computed_geometry,captured_at,compass_angle,computed_compass_angle,camera_type,thumb_256_url,sequence",
    bbox: [longitude - longitudeDelta, latitude - latitudeDelta, longitude + longitudeDelta, latitude + latitudeDelta].join(","),
    limit: MAPILLARY_SEARCH_LIMIT.toString(),
  });

  let response: Response;
  try {
    response = await fetch(`https://graph.mapillary.com/images?${params}`, {
      headers: { Authorization: `OAuth ${accessToken}` },
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new MapillarySearchError("Mapillary could not be reached. Check your connection and try again.", "network");
  }

  if (response.status === 401 || response.status === 403) {
    throw new MapillarySearchError("Mapillary rejected the access token. Check that the browser token is valid and enabled for this app.", "auth");
  }
  if (!response.ok) {
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

  return payload.data.flatMap((raw: unknown) => {
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
