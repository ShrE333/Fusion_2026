import type { GeoGeometry } from "@/types/geo";

function position(value: unknown): value is number[] {
  return Array.isArray(value) && value.length >= 2 &&
    value.every(v => typeof v === "number" && Number.isFinite(v)) &&
    Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}
function line(value: unknown): boolean {
  return Array.isArray(value) && value.length >= 2 && value.every(position);
}
function ring(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 4 || !value.every(position)) return false;
  const first = value[0], last = value[value.length - 1];
  return first.length === last.length && first.every((v: number, i: number) => v === last[i]);
}
function polygon(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(ring);
}
export function isGeoGeometry(value: unknown): value is GeoGeometry {
  if (!value || typeof value !== "object") return false;
  const g = value as { type?: unknown; coordinates?: unknown };
  const c = g.coordinates;
  switch (g.type) {
    case "Point": return position(c);
    case "LineString": return line(c);
    case "Polygon": return polygon(c);
    case "MultiPoint": return Array.isArray(c) && c.length > 0 && c.every(position);
    case "MultiLineString": return Array.isArray(c) && c.length > 0 && c.every(line);
    case "MultiPolygon": return Array.isArray(c) && c.length > 0 && c.every(polygon);
    default: return false;
  }
}
