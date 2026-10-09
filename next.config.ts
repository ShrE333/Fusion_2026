import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  devIndicators: false,
  async headers() {
    return [{
      source: "/vendor/maplibre-gl/:asset",
      headers: [
        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    }];
  },
};
export default nextConfig;
