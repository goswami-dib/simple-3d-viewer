import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const canvas = document.getElementById("canvas");
const fileInput = document.getElementById("file-input");
const dropOverlay = document.getElementById("drop-overlay");
const loadingEl = document.getElementById("loading");
const errorEl = document.getElementById("error");
const statusEl = document.getElementById("status");
const geoModeEl = document.getElementById("geo-mode");
const axisMappingEl = document.getElementById("axis-mapping");
const mapContainerEl = document.getElementById("map-container");

let scene, camera, renderer, controls, currentModel;
let textureBlobUrls = [];
let geoBounds = null;

const METERS_PER_DEG_LAT = 111320;
function metersPerDegLon(latDeg) {
  return 111320 * Math.cos((latDeg * Math.PI) / 180);
}

function getOriginFromBbox(bbox, axisMapping) {
  const lonAxis = axisMapping.lon;
  const latAxis = axisMapping.lat;
  const heightAxis = axisMapping.height;
  const min = bbox.min;
  const max = bbox.max;
  return {
    lon: 0.5 * (min.getComponent(lonAxis) + max.getComponent(lonAxis)),
    lat: 0.5 * (min.getComponent(latAxis) + max.getComponent(latAxis)),
    height: 0.5 * (min.getComponent(heightAxis) + max.getComponent(heightAxis)),
  };
}

function projectVertexToLocalENU(x, y, z, origin, axisMapping, verticalExaggeration = 1) {
  const lon = axisMapping.lon === 0 ? x : axisMapping.lon === 1 ? y : z;
  const lat = axisMapping.lat === 0 ? x : axisMapping.lat === 1 ? y : z;
  const height = axisMapping.height === 0 ? x : axisMapping.height === 1 ? y : z;
  const { lon: lon0, lat: lat0, height: h0 } = origin;
  const east = (lon - lon0) * metersPerDegLon(lat0);
  const north = (lat - lat0) * METERS_PER_DEG_LAT;
  const up = (height - h0) * verticalExaggeration;
  return { east, north, up };
}

function restoreOriginalPositions(model) {
  model.traverse((child) => {
    if (!child.geometry?.attributes?.position) return;
    const stored = child.geometry.userData.originalPositions;
    if (!stored) return;
    const pos = child.geometry.attributes.position;
    pos.array.set(stored);
    pos.needsUpdate = true;
    child.geometry.computeBoundingSphere();
    child.geometry.computeBoundingBox();
  });
}

function applyGeoProjection(model, axisMapping, verticalExaggeration = 1) {
  model.traverse((child) => {
    if (!child.geometry?.attributes?.position) return;
    const pos = child.geometry.attributes.position;
    if (!child.geometry.userData.originalPositions) {
      child.geometry.userData.originalPositions = new Float32Array(pos.array);
    }
  });
  const bbox = new THREE.Box3().setFromObject(model);
  const origin = getOriginFromBbox(bbox, axisMapping);
  geoBounds = {
    minLon: bbox.min.getComponent(axisMapping.lon),
    maxLon: bbox.max.getComponent(axisMapping.lon),
    minLat: bbox.min.getComponent(axisMapping.lat),
    maxLat: bbox.max.getComponent(axisMapping.lat),
  };
  model.traverse((child) => {
    if (!child.geometry?.attributes?.position) return;
    const pos = child.geometry.attributes.position;
    const count = pos.count;
    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const { east, north, up } = projectVertexToLocalENU(x, y, z, origin, axisMapping, verticalExaggeration);
      const flipZScale = document.getElementById("flip-z-scale")?.checked === true;
      const flipVertical = document.getElementById("flip-vertical")?.checked === true;
      let yVal = flipZScale ? -up : up;
      if (flipVertical) yVal = -yVal;
      pos.setXYZ(i, east, yVal, north);
    }
    pos.needsUpdate = true;
    child.geometry.computeBoundingSphere();
    child.geometry.computeBoundingBox();
  });
  if (mapContainerEl && window.L && leafletMap) updateMapBounds();
  console.log("[Geo Viewer] Projected to local ENU. Origin (lon, lat, height):", origin, "Z scale:", verticalExaggeration);
}

function getAxisMappingFromSelect() {
  const v = axisMappingEl?.value ?? "1,0,2";
  const [lon, lat, height] = v.split(",").map(Number);
  return { lon, lat, height };
}

function getVerticalExaggeration() {
  const el = document.getElementById("vertical-exaggeration");
  if (!el) return 10;
  const n = Number(el.value);
  return Number.isFinite(n) && n > 0 ? Math.max(0.1, n) : 10;
}

function reapplyGeoFromAxes() {
  if (!currentModel) return;
  const geoOn = geoModeEl != null && geoModeEl.checked === true;
  if (!geoOn) return;
  if (typeof currentModel.traverse !== "function") return;
  let hasStored = false;
  currentModel.traverse((child) => {
    if (child.geometry?.userData?.originalPositions) hasStored = true;
  });
  if (!hasStored) return;
  restoreOriginalPositions(currentModel);
  const vertExag = getVerticalExaggeration();
  applyGeoProjection(currentModel, getAxisMappingFromSelect(), vertExag);
  centerAndScale(currentModel);
}

function onGeoModeChange() {
  if (!currentModel || typeof currentModel.traverse !== "function") return;
  let hasStored = false;
  currentModel.traverse((child) => {
    if (child.geometry?.userData?.originalPositions) hasStored = true;
  });
  const geoOn = geoModeEl != null && geoModeEl.checked === true;
  if (hasStored) {
    restoreOriginalPositions(currentModel);
    if (geoOn) {
      applyGeoProjection(currentModel, getAxisMappingFromSelect(), getVerticalExaggeration());
    }
  } else if (geoOn) {
    applyGeoProjection(currentModel, getAxisMappingFromSelect(), getVerticalExaggeration());
  }
  centerAndScale(currentModel);
}

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x18181b);

  camera = new THREE.PerspectiveCamera(
    50,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    10000
  );
  camera.position.set(100, 100, 100);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = true;

  const ambient = new THREE.AmbientLight(0x404060, 0.6);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 0.8);
  key.position.set(3, 5, 4);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xa0b0ff, 0.3);
  fill.position.set(-2, 1, -2);
  scene.add(fill);

  window.addEventListener("resize", onResize);
  fileInput.addEventListener("change", onFileSelected);
  if (geoModeEl) geoModeEl.addEventListener("change", onGeoModeChange);
  const flipVerticalEl = document.getElementById("flip-vertical");
  if (flipVerticalEl) flipVerticalEl.addEventListener("change", reapplyGeoFromAxes);
  const flipZScaleEl = document.getElementById("flip-z-scale");
  if (flipZScaleEl) flipZScaleEl.addEventListener("change", reapplyGeoFromAxes);
  if (axisMappingEl) axisMappingEl.addEventListener("change", reapplyGeoFromAxes);
  const vertExagEl = document.getElementById("vertical-exaggeration");
  const applyZScaleBtn = document.getElementById("apply-z-scale");
  function onVerticalExaggerationChange() {
    requestAnimationFrame(() => reapplyGeoFromAxes());
  }
  if (vertExagEl) {
    vertExagEl.addEventListener("change", onVerticalExaggerationChange);
    vertExagEl.addEventListener("input", onVerticalExaggerationChange);
    vertExagEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onVerticalExaggerationChange();
      }
    });
  }
  if (applyZScaleBtn) applyZScaleBtn.addEventListener("click", () => reapplyGeoFromAxes());
  const resetViewBtn = document.getElementById("reset-view");
  if (resetViewBtn) resetViewBtn.addEventListener("click", resetView);
  setupDropZone();

  animate();
}

function onResize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function showLoading(show) {
  loadingEl.classList.toggle("hidden", !show);
}

function showError(message) {
  if (message) {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
  } else {
    errorEl.classList.add("hidden");
  }
}

function setStatus(text) {
  statusEl.textContent = text;
}

function resetView() {
  if (!camera || !controls) return;
  controls.target.set(0, 0, 0);
  camera.position.set(2.5, 2.5, 2.5);
  controls.update();
}

function centerAndScale(model) {
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  let maxDim = Math.max(size.x, size.y, size.z);

  if (!Number.isFinite(maxDim) || maxDim <= 0) {
    maxDim = 1;
    console.warn("[Geo Viewer] Bounding box degenerate. Using default scale.");
  }
  const scale = 2 / maxDim;

  model.position.sub(center);
  model.scale.multiplyScalar(scale);
}

function buildTextureMap(files) {
  const imageExt = /\.(jpg|jpeg|png|tga|bmp|tif|tiff)$/i;
  const map = new Map();
  const byBaseName = new Map();
  for (const file of files) {
    if (!imageExt.test(file.name)) continue;
    const url = URL.createObjectURL(file);
    textureBlobUrls.push(url);
    const name = file.name;
    const base = name.replace(/\.[^.]+$/i, "");
    map.set(name, url);
    map.set(name.toLowerCase(), url);
    byBaseName.set(base.toLowerCase(), url);
    byBaseName.set(base.replace(/_/g, "-").toLowerCase(), url);
    byBaseName.set(base.replace(/-/g, "_").toLowerCase(), url);
    const ext = (name.match(/\.[^.]+$/i) || [""])[0];
    const altBase = base.replace(/_/g, "-");
    if (altBase !== base) map.set(altBase + ext, url);
    const altBase2 = base.replace(/-/g, "_");
    if (altBase2 !== base) map.set(altBase2 + ext, url);
  }
  return { map, byBaseName };
}

const PLACEHOLDER_TEXTURE =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="#888"/></svg>'
  );

function createLoaderWithTextureMap(textureMapOrPair) {
  const textureMap = textureMapOrPair?.map ?? textureMapOrPair ?? new Map();
  const byBaseName = textureMapOrPair?.byBaseName ?? new Map();
  const manager = new THREE.LoadingManager();
  const originalResolve = manager.resolveURL.bind(manager);
  manager.resolveURL = function (url) {
    const raw = url;
    const name = url.split(/[/\\]/).pop();
    let resolved = null;
    if (textureMap.has(name)) resolved = textureMap.get(name);
    else if (textureMap.has(name.toLowerCase())) resolved = textureMap.get(name.toLowerCase());
    else if (textureMap.has(name.replace(/-/g, "_"))) resolved = textureMap.get(name.replace(/-/g, "_"));
    else if (textureMap.has(name.replace(/_/g, "-"))) resolved = textureMap.get(name.replace(/_/g, "-"));
    else {
      const base = name.replace(/\.[^.]+$/i, "").toLowerCase();
      const baseNorm = base.replace(/-/g, "_");
      if (byBaseName.has(base)) resolved = byBaseName.get(base);
      else if (byBaseName.has(baseNorm)) resolved = byBaseName.get(baseNorm);
      else if (byBaseName.has(base.replace(/_/g, "-"))) resolved = byBaseName.get(base.replace(/_/g, "-"));
    }
    if (resolved) {
      console.log("[Geo Viewer] Texture resolved:", raw);
      return resolved;
    }
    if (/\.(jpg|jpeg|png|tga|bmp|tif|tiff)$/i.test(name)) {
      console.log("[Geo Viewer] Texture placeholder:", raw);
      return PLACEHOLDER_TEXTURE;
    }
    return originalResolve(url);
  };
  return { manager, textureResolver: manager };
}

function createFBXLoader(textureMapOrPair) {
  const { manager } = createLoaderWithTextureMap(textureMapOrPair);
  return new FBXLoader(manager);
}

function createGLTFLoader(textureMapOrPair) {
  const { manager } = createLoaderWithTextureMap(textureMapOrPair);
  return new GLTFLoader(manager);
}

function onModelLoaded(object) {
  if (currentModel) {
    scene.remove(currentModel);
    currentModel.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
  currentModel = object;
  const useGeo = geoModeEl != null && geoModeEl.checked === true;
  if (useGeo) {
    const axisMapping = getAxisMappingFromSelect();
    const vertExag = getVerticalExaggeration();
    applyGeoProjection(object, axisMapping, vertExag);
  } else {
    geoBounds = null;
  }
  centerAndScale(object);
  scene.add(object);
  setStatus("Model loaded");
}

async function loadFBX(fbxUrl, textureMap) {
  const loader = createFBXLoader(textureMap);
  const object = await loader.loadAsync(fbxUrl);
  return object;
}

async function loadGLTF(gltfUrl, textureMap) {
  const loader = createGLTFLoader(textureMap);
  const gltf = await loader.loadAsync(gltfUrl);
  return gltf.scene;
}

async function loadFile(url, file, textureMap) {
  const name = (file && file.name) || url || "";
  if (/\.glb$/i.test(name) || /\.gltf$/i.test(name)) {
    return loadGLTF(url, textureMap);
  }
  if (/\.fbx$/i.test(name)) {
    return loadFBX(url, textureMap);
  }
  throw new Error("Unsupported format. Use .fbx, .glb, or .gltf.");
}

async function loadModel(url, file, textureMap = { map: new Map(), byBaseName: new Map() }) {
  showLoading(true);
  showError(null);
  setStatus("Loading…");

  try {
    const object = await loadFile(url, file, textureMap);
    onModelLoaded(object);
  } catch (err) {
    const msg = err?.message || String(err);
    console.error("[Geo Viewer] Load failed:", msg);
    console.error(err);
    if (err?.stack) console.error(err.stack);
    showError(msg);
    setStatus("Load failed: " + msg);
  } finally {
    showLoading(false);
  }
}

function getModelAndTextures(files) {
  const list = Array.from(files || []);
  const modelFile = list.find((f) => /\.(fbx|glb|gltf)$/i.test(f.name));
  const textures = list.filter((f) => f !== modelFile);
  return { modelFile, textureFiles: textures };
}

function onFileSelected(e) {
  const files = e.target.files;
  if (!files?.length) return;
  for (const url of textureBlobUrls) URL.revokeObjectURL(url);
  textureBlobUrls = [];
  const { modelFile, textureFiles } = getModelAndTextures(files);
  if (!modelFile) {
    showError("No .fbx, .glb, or .gltf file in selection");
    fileInput.value = "";
    return;
  }
  console.log("[Geo Viewer] Opening:", modelFile.name, "+", textureFiles.length, "texture(s)");
  const url = URL.createObjectURL(modelFile);
  const textureMap = buildTextureMap(textureFiles);
  loadModel(url, modelFile, textureMap).finally(() => URL.revokeObjectURL(url));
  fileInput.value = "";
}

function setupDropZone() {
  const onDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropOverlay.classList.add("active");
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropOverlay.classList.remove("active");
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropOverlay.classList.remove("active");
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    for (const url of textureBlobUrls) URL.revokeObjectURL(url);
    textureBlobUrls = [];
    const { modelFile, textureFiles } = getModelAndTextures(files);
    if (!modelFile) {
      showError("No .fbx, .glb, or .gltf in drop");
      return;
    }
    console.log("[Geo Viewer] Dropped:", modelFile.name, "+", textureFiles.length, "texture(s)");
    const url = URL.createObjectURL(modelFile);
    const textureMap = buildTextureMap(textureFiles);
    loadModel(url, modelFile, textureMap).finally(() => URL.revokeObjectURL(url));
  };

  document.body.addEventListener("dragover", onDrag);
  document.body.addEventListener("dragleave", onDragLeave);
  document.body.addEventListener("drop", onDrop);
}

let leafletMap = null;
function initMap() {
  if (!mapContainerEl || !window.L) return;
  leafletMap = window.L.map(mapContainerEl).setView([0, 0], 2);
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OSM",
  }).addTo(leafletMap);
  if (geoBounds) updateMapBounds();
}

function updateMapBounds() {
  if (!leafletMap || !geoBounds) return;
  const { minLon, maxLon, minLat, maxLat } = geoBounds;
  leafletMap.fitBounds([
    [minLat, minLon],
    [maxLat, maxLon],
  ], { padding: [20, 20], maxZoom: 16 });
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

init();
if (mapContainerEl) {
  const leafletCss = document.createElement("link");
  leafletCss.rel = "stylesheet";
  leafletCss.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(leafletCss);
  const leafletScript = document.createElement("script");
  leafletScript.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  leafletScript.onload = initMap;
  document.head.appendChild(leafletScript);
}
