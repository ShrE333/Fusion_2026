GeoSathi real-imagery demo helper

Extract directly into D:\fusion_2026_starter and replace/merge folders.

Adds:
  apps/vlm/scripts/download_imagery_grid.py

After redeploy:
  python scripts/download_imagery_grid.py --lat 12.9716 --lon 77.5946 --zoom 17 --grid 5
  python scripts/build_index.py /data/tiles.json

This default source is Esri World Imagery. Keep attribution and use the source
only in accordance with its applicable service/data terms. For the final
submission, prefer the team's licensed/approved imagery source.
