/* p5.js sketch and WebGL shader-based light rendering */

let p5Canvas;
let glShader;

const U_MAX_LIGHTS = 64;
const INTENSITY_MAX = 2000; // HDR scale per spec
const FEATHER_UI_MAX = 800;
const FEATHER_PX_CAP = 800;

const appState = {
  backgroundColor: "#000000", // sRGB hex
  creationShape: "circle", // 'circle' | 'rect' | 'ellipse'
  exposure: 1.2,
  colorSpace: 1, // 0: linear input, 1: sRGB input (palette)
  lights: [],
  selectedLightId: null,
  dragOffset: { x: 0, y: 0 },
  dragging: false,
};

function preload() {
  // load vertex/fragment shaders
  glShader = loadShader("shader.vert", "shader.frag");
}

function setup() {
  const container = document.getElementById("canvas-container");
  const w = container.clientWidth;
  const h = window.innerHeight;
  p5Canvas = createCanvas(w, h, WEBGL);
  p5Canvas.parent("canvas-container");
  pixelDensity(1);
  noStroke();

  dispatchEvent(new Event("app:ready"));
}

function windowResized() {
  const container = document.getElementById("canvas-container");
  const w = container.clientWidth;
  const h = window.innerHeight;
  resizeCanvas(w, h);
}

function draw() {
  // Clear previous frame to avoid overlay (2D stroke) ghosting
  background(0);
  // Use shader to render full-screen quad
  shader(glShader);
  uploadUniforms();
  // draw rect covering entire canvas; set (0,0) origin center in WEBGL, so use -w/2, -h/2
  rectMode(CENTER);
  // Ensure full coverage
  rect(0, 0, width, height);
  resetShader();

  // selection highlight overlay (in pixel-top-left space)
  const selected = getSelectedLight();
  if (selected) {
    push();
    // map top-left (0,0) to WEBGL coordinates
    resetMatrix();
    translate(-width / 2, -height / 2, 0);
    noFill();
    stroke(255);
    strokeWeight(1.5);
    if (selected.type === "circle") {
      circle(selected.x, selected.y, selected.radius * 2);
    } else if (selected.type === "ellipse") {
      const rx = Math.max(
        1,
        (selected.baseSize || 150) * (selected.sizeX || 1)
      );
      const ry = Math.max(
        1,
        (selected.baseSize || 150) * (selected.sizeY || 1)
      );
      ellipse(selected.x, selected.y, rx * 2, ry * 2);
    } else {
      rectMode(CENTER);
      rect(selected.x, selected.y, selected.width, selected.height, 4);
    }
    pop();
  }
}

// ============ Input/Interaction ============
function mousePressed() {
  if (isPointerOverPanel()) return;
  if (!isMouseOnCanvas()) return;

  // Try select topmost light under cursor
  const idx = hitTest(mouseX, mouseY);
  if (idx !== -1) {
    const light = appState.lights[idx];
    appState.selectedLightId = light.id;
    appState.dragging = true;
    appState.dragOffset.x = mouseX - light.x;
    appState.dragOffset.y = mouseY - light.y;
    emitSelectionChange();
  } else {
    // create new light
    const light = createLightAt(mouseX, mouseY, appState.creationShape);
    appState.lights.push(light);
    appState.selectedLightId = light.id;
    appState.dragging = true;
    appState.dragOffset.x = 0;
    appState.dragOffset.y = 0;
    emitSelectionChange();
  }
}

function mouseDragged() {
  if (isPointerOverPanel()) return;
  if (!appState.dragging) return;
  const selected = getSelectedLight();
  if (!selected) return;
  selected.x = mouseX - appState.dragOffset.x;
  selected.y = mouseY - appState.dragOffset.y;
}

function mouseReleased() {
  if (isPointerOverPanel()) return;
  appState.dragging = false;
}

// Delete by double click on a light
function doubleClicked() {
  if (isPointerOverPanel()) return;
  if (!isMouseOnCanvas()) return;
  const idx = hitTest(mouseX, mouseY);
  if (idx === -1) return;
  const removed = appState.lights.splice(idx, 1)[0];
  if (!removed) return;
  if (appState.selectedLightId === removed.id) {
    appState.selectedLightId = null;
    emitSelectionChange();
  }
}

function isMouseOnCanvas() {
  return mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height;
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

function hitTest(x, y) {
  for (let i = appState.lights.length - 1; i >= 0; i--) {
    const l = appState.lights[i];
    if (l.type === "circle") {
      const d = dist(x, y, l.x, l.y);
      if (d <= l.radius) return i;
    } else if (l.type === "ellipse") {
      const rx = Math.max(1, (l.baseSize || 150) * (l.sizeX || 1));
      const ry = Math.max(1, (l.baseSize || 150) * (l.sizeY || 1));
      const dx = (x - l.x) / rx;
      const dy = (y - l.y) / ry;
      if (dx * dx + dy * dy <= 1.0) return i;
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
      opacity: 1.0,
      rotation: 0.0,
    };
  }
  if (type === "ellipse") {
    return {
      id,
      type: "ellipse",
      x,
      y,
      baseSize: 150,
      sizeX: 1.2,
      sizeY: 0.8,
      color: "#ffffff",
      colorLinear: hexToLinearRgb("#ffffff"),
      intensity: 400,
      feather: 150,
      falloffK: 1.5,
      opacity: 1.0,
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
    opacity: 1.0,
    rotation: 0.0,
  };
}

function getSelectedLight() {
  const id = appState.selectedLightId;
  if (!id) return null;
  return appState.lights.find((l) => l.id === id) || null;
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
function uploadUniforms() {
  // resolution
  glShader.setUniform("u_resolution", [width, height]);

  // background linear color
  const bgLin = hexToLinearRgb(appState.backgroundColor);
  glShader.setUniform("u_bgColorLinear", [bgLin.r, bgLin.g, bgLin.b]);

  // globals
  glShader.setUniform("u_exposure", appState.exposure);
  glShader.setUniform("u_colorSpace", appState.colorSpace);

  // compress active lights into uniform arrays
  const lights = appState.lights;
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
  const opacityArr = new Float32Array(U_MAX_LIGHTS);

  for (let i = 0; i < count; i++) {
    const l = lights[i];
    ensureLightCaches(l);
    typeArr[i] = l.type === "rect" ? 1 : l.type === "ellipse" ? 2 : 0;
    // match gl_FragCoord (bottom-left origin)
    posArr[i * 2 + 0] = l.x;
    posArr[i * 2 + 1] = height - l.y;
    colorArr[i * 3 + 0] = l.colorLinear.r;
    colorArr[i * 3 + 1] = l.colorLinear.g;
    colorArr[i * 3 + 2] = l.colorLinear.b;
    intensityArr[i] = constrain(l.intensity ?? 0, 0, INTENSITY_MAX);
    let sizePx = 0;
    if (l.type === "circle") {
      sizePx = Math.max(0, l.radius || 0);
      rectSizeArr[i * 2 + 0] = (l.radius || 1) * 2;
      rectSizeArr[i * 2 + 1] = (l.radius || 1) * 2;
    } else if (l.type === "ellipse") {
      const base = Math.max(1, l.baseSize || 150);
      const sx = constrain(l.sizeX ?? 1.0, 0.1, 5);
      const sy = constrain(l.sizeY ?? 1.0, 0.1, 5);
      const rx = base * sx;
      const ry = base * sy;
      sizePx = Math.max(rx, ry);
      rectSizeArr[i * 2 + 0] = rx * 2;
      rectSizeArr[i * 2 + 1] = ry * 2;
    } else {
      sizePx = Math.max(0, Math.max(l.width || 0, l.height || 0) * 0.5);
      rectSizeArr[i * 2 + 0] = Math.max(1, l.width || 1);
      rectSizeArr[i * 2 + 1] = Math.max(1, l.height || 1);
    }
    sizeArr[i] = sizePx;
    const t = constrain((l.feather ?? 150) / FEATHER_UI_MAX, 0, 1);
    const perceptual = Math.pow(t, 2.2);
    const featherPx = perceptual * Math.min(FEATHER_PX_CAP, sizePx);
    featherArr[i] = featherPx;
    falloffArr[i] = constrain(l.falloffK ?? 1.5, 0.1, 8);
    rotationArr[i] = l.rotation ?? 0.0;
    opacityArr[i] = constrain(l.opacity ?? 1.0, 0, 1);
  }
  console.log("[opacityArr]", Array.from(opacityArr.slice(0, count)));

  glShader.setUniform("u_lightType", typeArr);
  glShader.setUniform("u_lightPos", posArr);
  glShader.setUniform("u_lightColorLinear", colorArr);
  glShader.setUniform("u_lightIntensity", intensityArr);
  glShader.setUniform("u_lightSize", sizeArr);
  glShader.setUniform("u_lightFeather", featherArr);
  glShader.setUniform("u_lightRectSize", rectSizeArr);
  glShader.setUniform("u_lightFalloffK", falloffArr);
  glShader.setUniform("u_lightRotation", rotationArr);
  glShader.setUniform("u_lightOpacity", opacityArr);
}

// ============ Public API for UI ============
function setBackgroundColor(hex) {
  appState.backgroundColor = hex;
}

function setCreationShape(shape) {
  if (shape === "rect") appState.creationShape = "rect";
  else if (shape === "ellipse") appState.creationShape = "ellipse";
  else appState.creationShape = "circle";
}

function setExposure(v) {
  appState.exposure = Math.max(0.1, Math.min(5, v));
}

function updateSelectedLight(props) {
  const l = getSelectedLight();
  if (!l) return;
  if (l.type === "circle") {
    if (typeof props.radius === "number") l.radius = Math.max(1, props.radius);
  } else if (l.type === "ellipse") {
    if (typeof props.baseSize === "number")
      l.baseSize = Math.max(10, props.baseSize);
    if (typeof props.sizeX === "number")
      l.sizeX = constrain(props.sizeX, 0.1, 5);
    if (typeof props.sizeY === "number")
      l.sizeY = constrain(props.sizeY, 0.1, 5);
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
  if (typeof props.opacity === "number") {
    l.opacity = constrain(props.opacity, 0, 1);
    console.log("[opacity] selected=", l.id, "opacity=", l.opacity);
  }
  if (typeof props.color === "string") {
    l.color = props.color;
    l.colorLinear = hexToLinearRgb(props.color);
  }
}

function emitSelectionChange() {
  const l = getSelectedLight();
  const detail = l ? { ...l } : null;
  dispatchEvent(new CustomEvent("app:selected", { detail }));
}

function getState() {
  return { ...appState };
}

function deleteSelectedLight() {
  const id = appState.selectedLightId;
  if (!id) return;
  const idx = appState.lights.findIndex((l) => l.id === id);
  if (idx === -1) return;
  appState.lights.splice(idx, 1);
  appState.selectedLightId = null;
  appState.dragging = false;
  emitSelectionChange();
}

function clearSelection() {
  if (!appState.selectedLightId) return;
  appState.selectedLightId = null;
  appState.dragging = false;
  emitSelectionChange();
}

// ============ Preset (Export/Import) ============
function clamp(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

function sanitizeLight(raw) {
  if (!raw || typeof raw !== "object") return null;

  const type =
    raw.type === "rect"
      ? "rect"
      : raw.type === "ellipse"
      ? "ellipse"
      : "circle";
  const id =
    typeof raw.id === "string" && raw.id.length > 0
      ? raw.id
      : "light-" + Math.random().toString(36).slice(2, 10);

  const base = {
    id,
    type,
    x: clamp(raw.x, 0, width, width / 2),
    y: clamp(raw.y, 0, height, height / 2),
    color: typeof raw.color === "string" ? raw.color : "#ffffff",
    intensity: clamp(raw.intensity, 0, INTENSITY_MAX, 400),
    feather: clamp(raw.feather, 0, FEATHER_UI_MAX, 150),
    falloffK: clamp(raw.falloffK, 0.1, 8, 1.5),
    opacity: clamp(raw.opacity, 0, 1, 1),
    rotation: clamp(raw.rotation, -Math.PI, Math.PI, 0),
  };

  if (type === "rect") {
    base.width = clamp(raw.width, 10, 1600, 220);
    base.height = clamp(raw.height, 10, 1200, 160);
  } else if (type === "ellipse") {
    base.baseSize = clamp(raw.baseSize, 10, 1200, 150);
    base.sizeX = clamp(raw.sizeX, 0.1, 5, 1);
    base.sizeY = clamp(raw.sizeY, 0.1, 5, 1);
  } else {
    base.radius = clamp(raw.radius, 10, 1200, 150);
  }

  base.colorLinear = hexToLinearRgb(base.color);
  return base;
}

function serializePreset() {
  const s = appState;
  return {
    version: 1,
    backgroundColor: s.backgroundColor,
    creationShape: s.creationShape,
    exposure: s.exposure,
    colorSpace: s.colorSpace,
    lights: (s.lights || []).map((l) => {
      const out = {
        id: l.id,
        type: l.type,
        x: l.x,
        y: l.y,
        color: l.color,
        intensity: l.intensity,
        feather: l.feather,
        falloffK: l.falloffK,
        opacity: l.opacity,
        rotation: l.rotation,
      };
      if (l.type === "rect") {
        out.width = l.width;
        out.height = l.height;
      } else if (l.type === "ellipse") {
        out.baseSize = l.baseSize;
        out.sizeX = l.sizeX;
        out.sizeY = l.sizeY;
      } else {
        out.radius = l.radius;
      }
      return out;
    }),
  };
}

function applyPreset(preset) {
  if (!preset || typeof preset !== "object") return false;

  appState.backgroundColor =
    typeof preset.backgroundColor === "string"
      ? preset.backgroundColor
      : appState.backgroundColor;

  appState.creationShape =
    preset.creationShape === "rect"
      ? "rect"
      : preset.creationShape === "ellipse"
      ? "ellipse"
      : "circle";
  appState.exposure = clamp(preset.exposure, 0.1, 5, appState.exposure);
  appState.colorSpace = preset.colorSpace === 0 ? 0 : 1;

  const src = Array.isArray(preset.lights) ? preset.lights : [];
  const sanitized = [];
  for (let i = 0; i < Math.min(src.length, U_MAX_LIGHTS); i++) {
    const l = sanitizeLight(src[i]);
    if (l) sanitized.push(l);
  }
  appState.lights = sanitized;

  const selectedId =
    typeof preset.selectedLightId === "string" ? preset.selectedLightId : null;
  appState.selectedLightId =
    selectedId && appState.lights.some((l) => l.id === selectedId)
      ? selectedId
      : null;

  appState.dragging = false;
  emitSelectionChange();
  return true;
}

// expose API
window.app = {
  setBackgroundColor,
  setCreationShape,
  setExposure,
  updateSelectedLight,
  getSelectedLight,
  getState,
  deleteSelectedLight,
  clearSelection,
  exportPreset: () => serializePreset(),
  importPreset: (presetObj) => applyPreset(presetObj),
};
