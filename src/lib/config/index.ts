export const config = {
  osmTileUrl: process.env.NEXT_PUBLIC_OSM_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || "",
  demoMode: process.env.NEXT_PUBLIC_DEMO_MODE !== "false",
};
