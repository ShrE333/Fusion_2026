"""Download a small georeferenced imagery grid for a GeoSathi prototype.

Default source: Esri World Imagery public tiled service. Use only in accordance
with Esri/source-provider terms and keep attribution in the demo.
"""
import argparse
import json
import math
import urllib.request
from pathlib import Path

DEFAULT_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"

def lonlat_to_tile(lon, lat, z):
    lat = max(min(lat, 85.05112878), -85.05112878)
    n = 2 ** z
    x = int((lon + 180.0) / 360.0 * n)
    lat_r = math.radians(lat)
    y = int((1.0 - math.asinh(math.tan(lat_r)) / math.pi) / 2.0 * n)
    return x, y

def tile_bounds(x, y, z):
    n = 2 ** z
    min_lon = x / n * 360.0 - 180.0
    max_lon = (x + 1) / n * 360.0 - 180.0
    max_lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    min_lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    return [min_lon, min_lat, max_lon, max_lat]

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--lat", type=float, required=True)
    p.add_argument("--lon", type=float, required=True)
    p.add_argument("--zoom", type=int, default=17)
    p.add_argument("--grid", type=int, default=5, help="odd grid size, e.g. 5 = 25 tiles")
    p.add_argument("--image-root", default="/data/images")
    p.add_argument("--manifest", default="/data/tiles.json")
    p.add_argument("--url-template", default=DEFAULT_URL)
    args = p.parse_args()

    if args.grid < 1 or args.grid % 2 == 0:
        raise SystemExit("--grid must be an odd positive integer")
    if not (-90 <= args.lat <= 90 and -180 <= args.lon <= 180):
        raise SystemExit("Invalid latitude/longitude")

    root = Path(args.image_root)
    root.mkdir(parents=True, exist_ok=True)
    manifest_path = Path(args.manifest)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)

    cx, cy = lonlat_to_tile(args.lon, args.lat, args.zoom)
    half = args.grid // 2
    items = []

    for dy in range(-half, half + 1):
        for dx in range(-half, half + 1):
            x, y, z = cx + dx, cy + dy, args.zoom
            tile_id = f"z{z}_x{x}_y{y}"
            filename = tile_id + ".jpg"
            dest = root / filename
            url = args.url_template.format(z=z, y=y, x=x)

            req = urllib.request.Request(
                url,
                headers={"User-Agent": "GeoSathi-Fusion-2026-prototype/1.0"},
            )
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
                ctype = r.headers.get("Content-Type", "")
            if not data:
                raise RuntimeError(f"Empty tile: {url}")
            dest.write_bytes(data)

            items.append({
                "tile_id": tile_id,
                "file": filename,
                "bbox": tile_bounds(x, y, z),
                "source": "Esri World Imagery (prototype demo; attribution required)",
                "acquired_at": None,
            })
            print(f"Downloaded {tile_id} ({len(data)//1024} KB, {ctype})")

    manifest_path.write_text(json.dumps(items, indent=2), encoding="utf-8")
    print(f"READY: {len(items)} tiles")
    print(f"IMAGES: {root}")
    print(f"MANIFEST: {manifest_path}")
    print("Attribution: Esri World Imagery and its underlying imagery providers.")

if __name__ == "__main__":
    main()
