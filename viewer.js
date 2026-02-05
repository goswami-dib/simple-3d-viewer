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
const loader = new FBXLoader();

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
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = maxDim > 0 ? 2 / maxDim : 1;

  model.position.sub(center);
  model.scale.multiplyScalar(scale);
}

async function loadFBX(urlOrBlob) {
  showLoading(true);
  showError(null);
  setStatus("Loading…");

  try {
    const object = await loader.loadAsync(urlOrBlob);

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

function onFileSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  console.log("[FBX Viewer] Opening file:", file.name, file.size, "bytes");
  const url = URL.createObjectURL(file);
  loadFBX(url).finally(() => URL.revokeObjectURL(url));
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
    const file = e.dataTransfer?.files?.[0];
    if (file && file.name.toLowerCase().endsWith(".fbx")) {
      console.log("[FBX Viewer] Dropped file:", file.name, file.size, "bytes");
      const url = URL.createObjectURL(file);
      loadFBX(url).finally(() => URL.revokeObjectURL(url));
    } else {
      showError("Please drop an .fbx file");
    }
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
