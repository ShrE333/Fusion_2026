"use client";

import { useEffect, useRef, useState } from "react";
import type { Viewer, ViewerImageEvent } from "mapillary-js";

type Props = {
  accessToken: string;
  imageId: string;
  onLoaded: (imageId: string) => void;
  onFailure: () => void;
};

export function MapillaryViewer({ accessToken, imageId, onLoaded, onFailure }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onLoaded, onFailure });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => { callbacks.current = { onLoaded, onFailure }; }, [onLoaded, onFailure]);

  useEffect(() => {
    let viewer: Viewer | undefined;
    let disposed = false;
    let loaded = false;
    let timeout: number | undefined;
    let imageHandler: ((event: ViewerImageEvent) => void) | undefined;
    const host = container.current;
    if (!host) return;

    setStatus("loading");
    timeout = window.setTimeout(() => {
      if (disposed || loaded) return;
      setStatus("error");
      callbacks.current.onFailure();
    }, 25000);

    void import("mapillary-js").then(({ Viewer: MapillaryViewerClass }) => {
      if (disposed || !host.isConnected || host.clientWidth === 0 || host.clientHeight === 0) return;
      // Register before requesting the initial image so the initial image event
      // cannot race the listener installation performed after construction.
      viewer = new MapillaryViewerClass({ accessToken, container: host, trackResize: true });
      const markLoaded = (activeImageId: string) => {
        if (disposed) return;
        loaded = true;
        if (timeout !== undefined) window.clearTimeout(timeout);
        setStatus("ready");
        callbacks.current.onLoaded(activeImageId);
      };
      imageHandler = (event) => markLoaded(event.image.id);
      viewer.on("image", imageHandler);
      void viewer.moveTo(imageId).then(() => markLoaded(imageId)).catch(() => {
        if (disposed) return;
        if (timeout !== undefined) window.clearTimeout(timeout);
        setStatus("error");
        callbacks.current.onFailure();
      });
    }).catch(() => {
      if (disposed) return;
      if (timeout !== undefined) window.clearTimeout(timeout);
      setStatus("error");
      callbacks.current.onFailure();
    });

    return () => {
      disposed = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
      if (viewer && imageHandler) viewer.off("image", imageHandler);
      viewer?.remove();
    };
  }, [accessToken, imageId]);

  return <div className="mapillary-viewer-wrap">
    <div ref={container} className="mapillary-viewer" aria-label="Mapillary street-level imagery viewer" />
    {status === "loading" && <div className="street-viewer-state" role="status">Loading verified Mapillary image…</div>}
    {status === "error" && <div className="street-viewer-state street-viewer-error" role="alert">This Mapillary image could not be loaded. Choose another returned image or refresh coverage.</div>}
  </div>;
}
