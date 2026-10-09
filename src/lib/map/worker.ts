import { setWorkerUrl, getVersion } from "maplibre-gl";

/** Call before constructing every map; avoid Turbopack's module-worker URL rewriting. */
export function configureMapLibreWorker() {
  setWorkerUrl(`/vendor/maplibre-gl/maplibre-gl-worker.mjs?v=${encodeURIComponent(getVersion())}`);
}
