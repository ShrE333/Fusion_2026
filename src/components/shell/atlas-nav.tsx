"use client";

import Link from "next/link";
import { Compass, Eye, Layers3, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";

const destinations = [
  { href: "/", label: "Discover", icon: Sparkles },
  { href: "/layers", label: "Layers", icon: Layers3 },
  { href: "/street-view", label: "Street View", icon: Eye },
];

export function AtlasNav() {
  const pathname = usePathname();
  return <nav className="world-rail" aria-label="Atlas navigation"><div className="brand-mark"><Compass size={21}/></div><strong>GEOSATHI<br/>ATLAS</strong>{destinations.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? "active" : ""} aria-label={label}><Icon size={18}/><span>{label.toUpperCase()}</span></Link>)}</nav>;
}
