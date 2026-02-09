/* p5.js sketch and WebGL shader-based light rendering */

let p5Canvas;
let glShader;

const U_MAX_LIGHTS = 64;
const INTENSITY_MAX = 2000; // HDR scale per spec
const VIRTUAL_W = 1920;
const VIRTUAL_H = 1080;

const urlParams = new URLSearchParams(window.location.search);
const appConfig = {
  role:
    (urlParams.get("role") || "control").toLowerCase() === "display"
      ? "display"
      : "control",
  displayId: urlParams.get("displayId"),
};
window.appConfig = appConfig;
document.body.classList.add(
  appConfig.role === "display" ? "role-display" : "role-control"
);

function createDefaultState() {
  return {
    backgroundColor: "#000000", // sRGB hex
    creationShape: "circle", // 'circle' | 'rect'
    blendingStrength: 1.0, // 0..2 (UI에서 0..2로 매핑 예정, 현재는 0..1 입력 허용)
    exposure: 1.2,
    colorSpace: 1, // 0: linear input, 1: sRGB input (palette)
    lights: [],
  };
}

function createUiState() {
  return {
    selectedLightId: null,
    dragOffset: { x: 0, y: 0 },
    dragging: false,
  };
}

const draftState = createDefaultState();
const liveBaseState = createDefaultState();
const liveOverridesMap = {};
let liveOverrideState = null;
let uiState = createUiState();
let editTargetId = "all";

const syncChannel = new BroadcastChannel("poc-light-sync");

function getSnapshotData(state) {
  return {
    backgroundColor: state.backgroundColor,
    blendingStrength: state.blendingStrength,
    exposure: state.exposure,
    colorSpace: state.colorSpace,
    creationShape: state.creationShape,
    lights: state.lights.map((l) => ({
      id: l.id,
      type: l.type,
      x: l.x,
      y: l.y,
      radius: l.radius,
      width: l.width,
      height: l.height,
      color: l.color,
      intensity: l.intensity,
      feather: l.feather,
      falloffK: l.falloffK,
      rotation: l.rotation,
    })),
  };
}

function numOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function applySnapshotToState(target, data) {
  if (!data || typeof data !== "object") return;
  target.backgroundColor =
    typeof data.backgroundColor === "string"
      ? data.backgroundColor
      : target.backgroundColor;
  target.blendingStrength = numOr(
    data.blendingStrength,
    target.blendingStrength
  );
  target.exposure = numOr(data.exposure, target.exposure);
  target.colorSpace = numOr(data.colorSpace, target.colorSpace);
  target.creationShape = data.creationShape === "rect" ? "rect" : "circle";
  target.lights = Array.isArray(data.lights)
    ? data.lights.map((l) => ({
        id: l.id || "light-" + Math.random().toString(36).slice(2, 10),
        type: l.type === "rect" ? "rect" : "circle",
        x: numOr(l.x, 0),
        y: numOr(l.y, 0),
        radius: numOr(l.radius, 150),
        width: numOr(l.width, 220),
        height: numOr(l.height, 160),
        color: typeof l.color === "string" ? l.color : "#ffffff",
        colorLinear: null,
        intensity: numOr(l.intensity, 400),
        feather: numOr(l.feather, 150),
        falloffK: numOr(l.falloffK, 1.5),
        rotation: numOr(l.rotation, 0.0),
      }))
    : [];
}

function getRenderState() {
  if (appConfig.role === "display") {
    return mergeSnapshotIntoState(liveBaseState, liveOverrideState);
  }
  return draftState;
}

function getCanvasHostEl() {
  if (appConfig.role === "control") {
    return document.getElementById("preview-frame");
  }
  return document.getElementById("canvas-container");
}

function getCanvasBounds() {
  const el = getCanvasHostEl();
  if (!el) return { w: 1, h: 1 };
  const rect = el.getBoundingClientRect();
  return { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
}

function getViewportTransform() {
  const { w, h } = getCanvasBounds();
  const scale = Math.min(w / VIRTUAL_W, h / VIRTUAL_H);
  const offsetX = (w - VIRTUAL_W * scale) / 2;
  const offsetY = (h - VIRTUAL_H * scale) / 2;
  return { scale, offsetX, offsetY };
}

function virtualToScreen(x, y) {
  const { scale, offsetX, offsetY } = getViewportTransform();
  return { sx: x * scale + offsetX, sy: y * scale + offsetY };
}

function screenToVirtual(x, y) {
  const { scale, offsetX, offsetY } = getViewportTransform();
  return { vx: (x - offsetX) / scale, vy: (y - offsetY) / scale };
}

function resetUiState() {
  uiState = createUiState();
  emitSelectionChange();
}

function mergeSnapshotIntoState(baseState, overrideSnap) {
  const lights =
    overrideSnap && overrideSnap.lights
      ? overrideSnap.lights
      : baseState.lights;
  return {
    backgroundColor:
      overrideSnap && typeof overrideSnap.backgroundColor === "string"
        ? overrideSnap.backgroundColor
        : baseState.backgroundColor,
    blendingStrength: numOr(
      overrideSnap ? overrideSnap.blendingStrength : undefined,
      baseState.blendingStrength
    ),
    exposure: numOr(
      overrideSnap ? overrideSnap.exposure : undefined,
      baseState.exposure
    ),
    colorSpace: numOr(
      overrideSnap ? overrideSnap.colorSpace : undefined,
      baseState.colorSpace
    ),
    creationShape:
      overrideSnap && overrideSnap.creationShape === "rect"
        ? "rect"
        : overrideSnap && overrideSnap.creationShape === "circle"
        ? "circle"
        : baseState.creationShape,
    lights,
  };
}

function mergeSnapshots(baseSnap, overrideSnap) {
  return {
    backgroundColor:
      overrideSnap && typeof overrideSnap.backgroundColor === "string"
        ? overrideSnap.backgroundColor
        : baseSnap.backgroundColor,
    blendingStrength: numOr(
      overrideSnap ? overrideSnap.blendingStrength : undefined,
      baseSnap.blendingStrength
    ),
    exposure: numOr(
      overrideSnap ? overrideSnap.exposure : undefined,
      baseSnap.exposure
    ),
    colorSpace: numOr(
      overrideSnap ? overrideSnap.colorSpace : undefined,
      baseSnap.colorSpace
    ),
    creationShape:
      overrideSnap && overrideSnap.creationShape === "rect"
        ? "rect"
        : overrideSnap && overrideSnap.creationShape === "circle"
        ? "circle"
        : baseSnap.creationShape,
    lights:
      overrideSnap && Array.isArray(overrideSnap.lights)
        ? overrideSnap.lights
        : baseSnap.lights,
  };
}

function applyDraftFromTarget(targetId) {
  const baseSnap = getSnapshotData(liveBaseState);
  const overrideSnap = targetId !== "all" ? liveOverridesMap[targetId] : null;
  const mergedSnap = mergeSnapshots(baseSnap, overrideSnap);
  applySnapshotToState(draftState, mergedSnap);
  resetUiState();
  dispatchEvent(new Event("app:statechanged"));
}

function setEditTarget(targetId) {
  const next =
    typeof targetId === "string" && targetId.trim() ? targetId : "all";
  editTargetId = next;
  applyDraftFromTarget(editTargetId);
}

function getEditTarget() {
  return editTargetId;
}

function applyLive() {
  if (appConfig.role !== "control") return;
  const snapshot = getSnapshotData(draftState);
  if (editTargetId === "all") {
    applySnapshotToState(liveBaseState, snapshot);
    syncChannel.postMessage({ type: "LIVE_BASE_SET", payload: snapshot });
  } else {
    liveOverridesMap[editTargetId] = snapshot;
    syncChannel.postMessage({
      type: "LIVE_OVERRIDE_SET",
      targetId: editTargetId,
      payload: snapshot,
    });
  }
  resetUiState();
  dispatchEvent(new Event("app:statechanged"));
}

function revertDraft() {
  if (appConfig.role !== "control") return;
  applyDraftFromTarget(editTargetId);
}

function clearOverride() {
  if (appConfig.role !== "control") return;
  if (editTargetId === "all") return;
  if (liveOverridesMap[editTargetId]) {
    delete liveOverridesMap[editTargetId];
  }
  syncChannel.postMessage({
    type: "LIVE_OVERRIDE_CLEAR",
    targetId: editTargetId,
  });
  applyDraftFromTarget(editTargetId);
}

syncChannel.addEventListener("message", (event) => {
  const data = event && event.data;
  if (!data || typeof data.type !== "string") return;
  if (appConfig.role === "control" && data.type === "REQUEST_LIVE") {
    syncChannel.postMessage({
      type: "LIVE_BASE_SET",
      payload: getSnapshotData(liveBaseState),
    });
    if (data.targetId && liveOverridesMap[data.targetId]) {
      syncChannel.postMessage({
        type: "LIVE_OVERRIDE_SET",
        targetId: data.targetId,
        payload: liveOverridesMap[data.targetId],
      });
    }
    return;
  }
  if (appConfig.role === "display" && data.type === "LIVE_BASE_SET") {
    applySnapshotToState(liveBaseState, data.payload);
    resetUiState();
    return;
  }
  if (appConfig.role === "display" && data.type === "LIVE_OVERRIDE_SET") {
    if (
      data.targetId &&
      String(data.targetId) === String(appConfig.displayId)
    ) {
      liveOverrideState = data.payload || null;
      resetUiState();
    }
    return;
  }
  if (appConfig.role === "display" && data.type === "LIVE_OVERRIDE_CLEAR") {
    if (
      data.targetId &&
      String(data.targetId) === String(appConfig.displayId)
    ) {
      liveOverrideState = null;
      resetUiState();
    }
  }
});

function preload() {
  // load vertex/fragment shaders
  glShader = loadShader("shader.vert", "shader.frag");
}

function setup() {
  const container = getCanvasHostEl();
  if (!container) return;
  const { w, h } = getCanvasBounds();
  p5Canvas = createCanvas(w, h, WEBGL);
  p5Canvas.parent(container);
  pixelDensity(1);
  noStroke();

  dispatchEvent(new Event("app:ready"));

  if (appConfig.role === "control") {
    document.addEventListener("keydown", (e) => {
      if (!e.shiftKey) return;
      const tag = (e.target && e.target.tagName) || "";
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      const key = e.key.toLowerCase();
      if (key === "a") {
        applyLive();
      } else if (key === "r") {
        revertDraft();
      }
    });
  }
  if (appConfig.role === "display") {
    syncChannel.postMessage({
      type: "REQUEST_LIVE",
      targetId: appConfig.displayId,
    });
  }
}

function windowResized() {
  const { w, h } = getCanvasBounds();
  resizeCanvas(w, h);
}

function draw() {
  const renderState = getRenderState();
  // Clear previous frame to avoid overlay (2D stroke) ghosting
  background(0);
  // Use shader to render full-screen quad
  shader(glShader);
  uploadUniforms(renderState);
  // draw rect covering entire canvas; set (0,0) origin center in WEBGL, so use -w/2, -h/2
  rectMode(CENTER);
  // Ensure full coverage
  rect(0, 0, width, height);
  resetShader();

  if (appConfig.role !== "display") {
    // selection highlight overlay (in pixel-top-left space)
    const selected = getSelectedLight(draftState);
    if (selected) {
      const { scale } = getViewportTransform();
      const { sx, sy } = virtualToScreen(selected.x, selected.y);
      push();
      // map top-left (0,0) to WEBGL coordinates
      resetMatrix();
      translate(-width / 2, -height / 2, 0);
      noFill();
      stroke(255);
      strokeWeight(1.5);
      if (selected.type === "circle") {
        circle(sx, sy, selected.radius * 2 * scale);
      } else {
        rectMode(CENTER);
        rect(sx, sy, selected.width * scale, selected.height * scale, 4);
      }
      pop();
    }
  }
}

// ============ Input/Interaction ============
function mousePressed() {
  if (appConfig.role === "display") return;
  if (isPointerOverPanel()) return;
  if (!isMouseOnCanvas()) return;
  const { vx, vy } = screenToVirtual(mouseX, mouseY);

  // Try select topmost light under cursor
  const idx = hitTest(draftState, vx, vy);
  if (idx !== -1) {
    const light = draftState.lights[idx];
    uiState.selectedLightId = light.id;
    uiState.dragging = true;
    uiState.dragOffset.x = vx - light.x;
    uiState.dragOffset.y = vy - light.y;
    emitSelectionChange();
  } else {
    // create new light
    const light = createLightAt(vx, vy, draftState.creationShape);
    draftState.lights.push(light);
    uiState.selectedLightId = light.id;
    uiState.dragging = true;
    uiState.dragOffset.x = 0;
    uiState.dragOffset.y = 0;
    emitSelectionChange();
  }
}

function mouseDragged() {
  if (appConfig.role === "display") return;
  if (isPointerOverPanel()) return;
  if (!uiState.dragging) return;
  const selected = getSelectedLight(draftState);
  if (!selected) return;
  const { vx, vy } = screenToVirtual(mouseX, mouseY);
  selected.x = vx - uiState.dragOffset.x;
  selected.y = vy - uiState.dragOffset.y;
}

function mouseReleased() {
  if (appConfig.role === "display") return;
  if (isPointerOverPanel()) return;
  uiState.dragging = false;
}

// Delete by double click on a light
function doubleClicked() {
  if (appConfig.role === "display") return;
  if (isPointerOverPanel()) return;
  if (!isMouseOnCanvas()) return;
  const { vx, vy } = screenToVirtual(mouseX, mouseY);
  const idx = hitTest(draftState, vx, vy);
  if (idx === -1) return;
  const removed = draftState.lights.splice(idx, 1)[0];
  if (!removed) return;
  if (uiState.selectedLightId === removed.id) {
    uiState.selectedLightId = null;
    emitSelectionChange();
  }
}

function isMouseOnCanvas() {
  const { scale, offsetX, offsetY } = getViewportTransform();
  const viewW = VIRTUAL_W * scale;
  const viewH = VIRTUAL_H * scale;
  return (
    mouseX >= offsetX &&
    mouseX <= offsetX + viewW &&
    mouseY >= offsetY &&
    mouseY <= offsetY + viewH
  );
}

function isPointerOverPanel() {
  const x =
    typeof winMouseX === "number"
      ? winMouseX
      : window.event && typeof window.event.clientX === "number"
      ? window.event.clientX
      : 0;
  const y =
    typeof winMouseY === "number"
      ? winMouseY
      : window.event && typeof window.event.clientY === "number"
      ? window.event.clientY
      : 0;
  const el = document.elementFromPoint(x, y);
  return !!(el && el.closest && el.closest("#control-panel"));
}

function hitTest(state, x, y) {
  for (let i = state.lights.length - 1; i >= 0; i--) {
    const l = state.lights[i];
    if (l.type === "circle") {
      const d = dist(x, y, l.x, l.y);
      if (d <= l.radius) return i;
    } else {
      const halfW = l.width / 2;
      const halfH = l.height / 2;
      if (
        x >= l.x - halfW &&
        x <= l.x + halfW &&
        y >= l.y - halfH &&
        y <= l.y + halfH
      ) {
        return i;
      }
    }
  }
  return -1;
}

// ============ Lights ============
function createLightAt(x, y, type) {
  const id = "light-" + Math.random().toString(36).slice(2, 10);
  if (type === "rect") {
    return {
      id,
      type: "rect",
      x,
      y,
      width: 220,
      height: 160,
      color: "#ffffff", // sRGB hex
      colorLinear: hexToLinearRgb("#ffffff"),
      intensity: 400, // 0..INTENSITY_MAX (HDR)
      feather: 150, // px
      falloffK: 1.5,
      rotation: 0.0,
    };
  }
  return {
    id,
    type: "circle",
    x,
    y,
    radius: 150,
    color: "#ffffff",
    colorLinear: hexToLinearRgb("#ffffff"),
    intensity: 400,
    feather: 150,
    falloffK: 1.5,
    rotation: 0.0,
  };
}

function getSelectedLight(state = draftState) {
  const id = uiState.selectedLightId;
  if (!id) return null;
  return state.lights.find((l) => l.id === id) || null;
}

// ======== Color helpers (sRGB -> Linear) ========
function hexToRgb01(hex) {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const intVal = parseInt(full, 16);
  const r = ((intVal >> 16) & 255) / 255;
  const g = ((intVal >> 8) & 255) / 255;
  const b = (intVal & 255) / 255;
  return { r, g, b };
}
function srgbToLinear01(v) {
  // simple gamma 2.2 approximation per spec
  return Math.pow(v, 2.2);
}
function hexToLinearRgb(hex) {
  const { r, g, b } = hexToRgb01(hex);
  return { r: srgbToLinear01(r), g: srgbToLinear01(g), b: srgbToLinear01(b) };
}

function ensureLightCaches(light) {
  // refresh linear cache if missing or color changed
  if (!light.colorLinear || typeof light.colorLinear.r !== "number") {
    light.colorLinear = hexToLinearRgb(light.color || "#ffffff");
  }
}

// ======== Uniform upload ========
function uploadUniforms(state) {
  const { scale } = getViewportTransform();
  // resolution
  glShader.setUniform("u_resolution", [width, height]);

  // background linear color
  const bgLin = hexToLinearRgb(state.backgroundColor);
  glShader.setUniform("u_bgColorLinear", [bgLin.r, bgLin.g, bgLin.b]);

  // globals
  glShader.setUniform("u_exposure", state.exposure);
  glShader.setUniform(
    "u_blendStrength",
    constrain(state.blendingStrength, 0, 2)
  );
  glShader.setUniform("u_colorSpace", state.colorSpace);

  // compress active lights into uniform arrays
  const lights = state.lights;
  const count = Math.min(lights.length, U_MAX_LIGHTS);
  glShader.setUniform("u_numLights", count);

  const typeArr = new Int32Array(U_MAX_LIGHTS);
  const posArr = new Float32Array(U_MAX_LIGHTS * 2);
  const colorArr = new Float32Array(U_MAX_LIGHTS * 3);
  const intensityArr = new Float32Array(U_MAX_LIGHTS);
  const sizeArr = new Float32Array(U_MAX_LIGHTS);
  const featherArr = new Float32Array(U_MAX_LIGHTS);
  const rectSizeArr = new Float32Array(U_MAX_LIGHTS * 2);
  const falloffArr = new Float32Array(U_MAX_LIGHTS);
  const rotationArr = new Float32Array(U_MAX_LIGHTS);

  for (let i = 0; i < count; i++) {
    const l = lights[i];
    ensureLightCaches(l);
    const { sx, sy } = virtualToScreen(l.x, l.y);
    const radiusScreen = Math.max(0, (l.radius || 0) * scale);
    const widthScreen = Math.max(1, (l.width || 1) * scale);
    const heightScreen = Math.max(1, (l.height || 1) * scale);
    typeArr[i] = l.type === "rect" ? 1 : 0;
    // match gl_FragCoord (bottom-left origin)
    posArr[i * 2 + 0] = sx;
    posArr[i * 2 + 1] = height - sy;
    colorArr[i * 3 + 0] = l.colorLinear.r;
    colorArr[i * 3 + 1] = l.colorLinear.g;
    colorArr[i * 3 + 2] = l.colorLinear.b;
    intensityArr[i] = constrain(l.intensity ?? 0, 0, INTENSITY_MAX);
    sizeArr[i] =
      l.type === "circle"
        ? radiusScreen
        : Math.max(0, Math.max(widthScreen, heightScreen) * 0.5);
    rectSizeArr[i * 2 + 0] =
      l.type === "rect" ? widthScreen : radiusScreen ? radiusScreen * 2 : 2;
    rectSizeArr[i * 2 + 1] =
      l.type === "rect" ? heightScreen : radiusScreen ? radiusScreen * 2 : 2;
    featherArr[i] = Math.max(0, (l.feather ?? 150) * scale);
    falloffArr[i] = constrain(l.falloffK ?? 1.5, 0.1, 8);
    rotationArr[i] = l.rotation ?? 0.0;
  }

  glShader.setUniform("u_lightType", typeArr);
  glShader.setUniform("u_lightPos", posArr);
  glShader.setUniform("u_lightColorLinear", colorArr);
  glShader.setUniform("u_lightIntensity", intensityArr);
  glShader.setUniform("u_lightSize", sizeArr);
  glShader.setUniform("u_lightFeather", featherArr);
  glShader.setUniform("u_lightRectSize", rectSizeArr);
  glShader.setUniform("u_lightFalloffK", falloffArr);
  glShader.setUniform("u_lightRotation", rotationArr);
}

// ============ Public API for UI ============
function setBackgroundColor(hex) {
  draftState.backgroundColor = hex;
}

function setCreationShape(shape) {
  draftState.creationShape = shape === "rect" ? "rect" : "circle";
}

function setBlendingStrength(value) {
  // accepts 0..2 or 0..200 (UI percent)
  if (value > 2) draftState.blendingStrength = constrain(value / 100, 0, 2);
  else draftState.blendingStrength = constrain(value, 0, 2);
}

function setExposure(v) {
  draftState.exposure = Math.max(0.1, Math.min(5, v));
}

function updateSelectedLight(props) {
  const l = getSelectedLight(draftState);
  if (!l) return;
  if (l.type === "circle") {
    if (typeof props.radius === "number") l.radius = Math.max(1, props.radius);
  } else {
    if (typeof props.width === "number") l.width = Math.max(1, props.width);
    if (typeof props.height === "number") l.height = Math.max(1, props.height);
  }
  if (typeof props.intensity === "number")
    l.intensity = constrain(props.intensity, 0, INTENSITY_MAX);
  if (typeof props.feather === "number") l.feather = Math.max(0, props.feather);
  if (typeof props.falloffK === "number")
    l.falloffK = constrain(props.falloffK, 0.1, 8);
  if (typeof props.rotation === "number") l.rotation = props.rotation;
  if (typeof props.color === "string") {
    l.color = props.color;
    l.colorLinear = hexToLinearRgb(props.color);
  }
}

function emitSelectionChange() {
  if (appConfig.role !== "control") return;
  const l = getSelectedLight(draftState);
  const detail = l ? { ...l } : null;
  dispatchEvent(new CustomEvent("app:selected", { detail }));
}

function getState() {
  if (appConfig.role === "display") {
    const merged = mergeSnapshotIntoState(liveBaseState, liveOverrideState);
    return JSON.parse(JSON.stringify(getSnapshotData(merged)));
  }
  return JSON.parse(JSON.stringify(getSnapshotData(draftState)));
}

function deleteSelectedLight() {
  const id = uiState.selectedLightId;
  if (!id) return;
  const idx = draftState.lights.findIndex((l) => l.id === id);
  if (idx === -1) return;
  draftState.lights.splice(idx, 1);
  uiState.selectedLightId = null;
  uiState.dragging = false;
  emitSelectionChange();
}

function clearSelection() {
  if (!uiState.selectedLightId) return;
  uiState.selectedLightId = null;
  uiState.dragging = false;
  emitSelectionChange();
}

// expose API
window.app = {
  setBackgroundColor,
  setCreationShape,
  setBlendingStrength,
  setExposure,
  updateSelectedLight,
  getSelectedLight,
  getState,
  deleteSelectedLight,
  clearSelection,
  applyLive,
  revertDraft,
  clearOverride,
  setEditTarget,
  getEditTarget,
};
