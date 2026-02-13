import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

const canvas = document.getElementById("canvas");
const fileInput = document.getElementById("file-input");
const dropOverlay = document.getElementById("drop-overlay");
const loadingEl = document.getElementById("loading");
const errorEl = document.getElementById("error");
const statusEl = document.getElementById("status");

let scene, camera, renderer, controls, currentModel;
let textureBlobUrls = [];

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x18181b);

  camera = new THREE.PerspectiveCamera(
    50,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    1000
  );
  camera.position.set(2, 2, 2);

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

function centerAndScale(model) {
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  let maxDim = Math.max(size.x, size.y, size.z);

  if (!Number.isFinite(maxDim) || maxDim <= 0) {
    maxDim = 1;
    console.warn("[FBX Viewer] Bounding box degenerate or invalid (e.g. geo coords?). Using default scale.");
  }
  if (maxDim > 1e10) {
    console.warn("[FBX Viewer] Model very large (e.g. geographic coordinates?). Scaling down.");
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
    else if (textureMap.has((name.replace(/-/g, "_")))) resolved = textureMap.get(name.replace(/-/g, "_"));
    else if (textureMap.has(name.replace(/_/g, "-"))) resolved = textureMap.get(name.replace(/_/g, "-"));
    else {
      const base = name.replace(/\.[^.]+$/i, "").toLowerCase();
      const baseNorm = base.replace(/-/g, "_");
      if (byBaseName.has(base)) resolved = byBaseName.get(base);
      else if (byBaseName.has(baseNorm)) resolved = byBaseName.get(baseNorm);
      else if (byBaseName.has(base.replace(/_/g, "-"))) resolved = byBaseName.get(base.replace(/_/g, "-"));
    }
    if (resolved) {
      console.log("[FBX Viewer] Texture resolved:", raw, "-> (selected file)");
      return resolved;
    }
    if (/\.(jpg|jpeg|png|tga|bmp|tif|tiff)$/i.test(name)) {
      console.log("[FBX Viewer] Texture not in selection, using placeholder:", raw);
      return PLACEHOLDER_TEXTURE;
    }
    return originalResolve(url);
  };
  return new FBXLoader(manager);
}

async function loadFBX(fbxUrl, textureMap = new Map()) {
  showLoading(true);
  showError(null);
  setStatus("Loading…");

  const loader = createLoaderWithTextureMap(textureMap);

  try {
    const object = await loader.loadAsync(fbxUrl);

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
    centerAndScale(object);
    scene.add(object);

    setStatus("Model loaded");
  } catch (err) {
    const msg = err?.message || String(err);
    console.error("[FBX Viewer] Load failed:", msg);
    console.error(err);
    if (err?.stack) console.error(err.stack);
    showError(msg);
    setStatus("Load failed: " + msg);
  } finally {
    showLoading(false);
  }
}

function getFbxAndTextures(files) {
  const list = Array.from(files || []);
  const fbx = list.find((f) => /\.fbx$/i.test(f.name));
  const textures = list.filter((f) => f !== fbx);
  return { fbx, textureFiles: textures };
}

function onFileSelected(e) {
  const files = e.target.files;
  if (!files?.length) return;
  for (const url of textureBlobUrls) URL.revokeObjectURL(url);
  textureBlobUrls = [];
  const { fbx, textureFiles } = getFbxAndTextures(files);
  if (!fbx) {
    showError("No .fbx file in selection");
    fileInput.value = "";
    return;
  }
  console.log("[FBX Viewer] Opening:", fbx.name, "+", textureFiles.length, "texture(s)");
  const fbxUrl = URL.createObjectURL(fbx);
  const textureMap = buildTextureMap(textureFiles);
  loadFBX(fbxUrl, textureMap).finally(() => URL.revokeObjectURL(fbxUrl));
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
    const { fbx, textureFiles } = getFbxAndTextures(files);
    if (!fbx) {
      showError("No .fbx file in drop");
      return;
    }
    console.log("[FBX Viewer] Dropped:", fbx.name, "+", textureFiles.length, "texture(s)");
    const fbxUrl = URL.createObjectURL(fbx);
    const textureMap = buildTextureMap(textureFiles);
    loadFBX(fbxUrl, textureMap).finally(() => URL.revokeObjectURL(fbxUrl));
  };

  document.body.addEventListener("dragover", onDrag);
  document.body.addEventListener("dragleave", onDragLeave);
  document.body.addEventListener("drop", onDrop);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

init();
