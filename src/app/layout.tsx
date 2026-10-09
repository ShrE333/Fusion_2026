import type { Metadata } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "mapillary-js/dist/mapillary.css";
import "./globals.css";
import "./world.css";
import "./world-refine.css";
import "./premium-v2.css";
import "./map-focus.css";
import "./explorer.css";
import "./street-view.css";
import { LocationProvider } from "@/components/shell/location-context";
export const metadata: Metadata = { title: "GeoSathi Atlas", description: "Cartographic intelligence workstation" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><LocationProvider>{children}</LocationProvider></body></html>; }
