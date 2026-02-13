# Geo Viewer — FBX / GLB / GLTF

A web-based **geo viewer** for 3D models with **WGS84 (lat/lon)** coordinates. Load FBX, GLB, or GLTF (e.g. from Agisoft Metashape or other geospatial tools); the viewer projects coordinates to a local tangent plane so the model displays correctly instead of as a distorted line.

## Run locally

Serve over HTTP (required for modules). From the project directory:

**Python (no Node.js needed):**

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

**Alternatively:** `npx serve .` then http://localhost:3000.

## Usage

- **Open model** — Click “Open model (+ textures)” and select a **.fbx**, **.glb**, or **.gltf** file, plus any companion textures (e.g. .jpg). You can select multiple files (Shift/Cmd+click).
- **Drag & drop** — Drop the model file and its texture file(s) onto the page.
- **WGS84 → local** — With “WGS84 → local” checked (default), vertex coordinates are treated as longitude, latitude, and height (degrees / meters) and projected to a local East–North–Up (ENU) frame so the model appears at the correct scale and shape.
- **Axis mapping** — If the model doesn’t look right, use the **Axes** dropdown. It defines which model axis is longitude, which is latitude, and which is height (e.g. “X=lon, Y=lat, Z=height” for Metashape-style exports).
- **Map** — A small map in the bottom-right shows the model’s geographic extent (after a WGS84 model is loaded).
- **Orbit / Pan / Zoom** — Left-drag to rotate, right-drag to pan, scroll to zoom.

## Supported formats

- **FBX** — With optional companion textures (.jpg, .png, etc.). Geometry is assumed to be in WGS84 when “WGS84 → local” is on.
- **GLB / GLTF** — Same geo projection; useful for glTF/glb exports from geospatial pipelines.

## Requirements

- Modern browser with WebGL.
- FBX: ASCII 7.0+ or Binary 6400+ (Three.js FBXLoader).
- Models in **WGS84**: longitude and latitude in degrees, height in meters (or same units). Axis order depends on the export; use the axis dropdown if the result looks wrong.

## Tech

- [Three.js](https://threejs.org/) — 3D rendering, FBXLoader, GLTFLoader
- OrbitControls — camera
- [Leaflet](https://leafletjs.com/) — small map for model extent (loaded from CDN)

No build step; ES modules + CDN.

## Error logs

Open Developer Tools → **Console** (e.g. `Cmd + Option + J` on macOS). Messages prefixed with `[Geo Viewer]` show load and projection details. On load failure, the status bar shows “Load failed:” plus the error.

## Agisoft Metashape

- Export the model in **WGS84** (lat/lon) if you want to use “WGS84 → local” in this viewer.
- If the model appears as a thin line or wrong shape, try another **Axes** option (e.g. “X=lon, Z=lat, Y=height” or “Z=lon, Y=lat, X=height”) to match how Metashape wrote the axes.
- Include the exported texture files in the same selection (or drop) so textures load.
