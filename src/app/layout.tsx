import type { Metadata } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import "./world.css";
import "./world-refine.css";
import "./premium-v2.css";
import "./explorer.css";
export const metadata: Metadata = { title: "GeoSathi Atlas", description: "Cartographic intelligence workstation" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
