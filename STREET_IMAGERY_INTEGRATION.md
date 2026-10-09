# Street-level imagery integration

The current `/street-view` experience is a locally generated, explicitly unverified demo panorama. It does not look up or display a real capture.

Before integrating a provider, obtain an authorized browser/server credential, use the provider's coverage/image lookup API for the requested coordinate, retain the verified image ID and capture provenance, show required provider attribution, and render a clear no-coverage state. Never present a generated fallback as a real street-level image. Mapillary access configuration alone is insufficient; a working lookup and verified image ID are required.
