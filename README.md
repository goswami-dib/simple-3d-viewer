# FBX Viewer

A simple web-based FBX file viewer built with Three.js. Load `.fbx` models via file picker or drag & drop, then orbit, pan, and zoom with the mouse.

## Run locally

Serve the project over HTTP (required for module loading). From the project directory:

**Using Python (no Node.js needed):**

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000) in your browser.

**Alternatively**, if you have Node.js: `npx serve .` then open http://localhost:3000.

## Usage

- **Open FBX** — Click “Open FBX (+ textures)” and choose your `.fbx` file plus any companion textures (e.g. `.jpg`) in the same folder. Select multiple files (Shift/Cmd+click) so the loader can find textures referenced by the FBX.
- **Drag & drop** — Drop the `.fbx` and its texture file(s) onto the page together.
- **Orbit** — Left-drag to rotate the camera.
- **Pan** — Right-drag (or two-finger drag) to pan.
- **Zoom** — Scroll to zoom in/out.

## Requirements

- Modern browser with WebGL support.
- FBX files: ASCII FBX 7.0+ or Binary FBX 6400+ (as supported by Three.js FBXLoader).

## Tech

- [Three.js](https://threejs.org/) (r160) — 3D rendering
- FBXLoader — load FBX models
- OrbitControls — camera interaction

No build step; uses ES modules and CDN for Three.js.

## Seeing error logs

If a model fails to load, the status bar shows **Load failed:** plus the error message. To see full details and stack traces:

1. **Open Developer Tools**  
   - **macOS:** `Cmd + Option + J` (Chrome/Edge) or `Cmd + Option + I` then open the **Console** tab (Safari).  
   - **Windows/Linux:** `F12` or `Ctrl + Shift + J`, then the **Console** tab.

2. **Reload the page**, then try loading your FBX again.

3. In the **Console**, look for lines starting with `[FBX Viewer]` and any red error messages. Those contain the exact error and stack trace.

Common causes of load failure: unsupported FBX version, binary vs ASCII format issues, or corrupt/incomplete files. The console message will usually indicate the reason.
