export const config={
  osmTileUrl:process.env.NEXT_PUBLIC_OSM_TILE_URL||"https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  apiBaseUrl:process.env.NEXT_PUBLIC_API_BASE_URL||"/api/skyclip",
  demoMode:process.env.NEXT_PUBLIC_DEMO_MODE==="true",
  discoveryMode:(process.env.NEXT_PUBLIC_DISCOVERY_MODE==="demo"?"demo":"api") as "demo"|"api",
  mapTilerApiKey:process.env.NEXT_PUBLIC_MAPTILER_API_KEY||"",
  mapillaryAccessToken:process.env.NEXT_PUBLIC_MAPILLARY_ACCESS_TOKEN||"",
};
