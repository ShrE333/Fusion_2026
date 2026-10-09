"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type CapturedLocation = {
  coordinates: [number, number];
  accuracy: number;
  timestamp: number;
};

type LocationContextValue = {
  location: CapturedLocation | undefined;
  setLocation: (location: CapturedLocation) => void;
  clearLocation: () => void;
};

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<CapturedLocation>();
  const value = useMemo(() => ({ location, setLocation, clearLocation: () => setLocation(undefined) }), [location]);
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useAtlasLocation() {
  const context = useContext(LocationContext);
  if (!context) throw new Error("useAtlasLocation must be used within LocationProvider.");
  return context;
}
