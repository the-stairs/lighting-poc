/* p5.js sketch and WebGL shader-based light rendering */

let p5Canvas;
let glShader;

const U_MAX_LIGHTS = 64;
const INTENSITY_MAX = 2000; // HDR scale per spec

const appState = {
  backgroundColor: "#000000", // sRGB hex
  creationShape: "circle", // 'circle' | 'rect'
  blendingStrength: 1.0, // 0..2 (UI에서 0..2로 매핑 예정, 현재는 0..1 입력 허용)
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
    } else {
      rectMode(CENTER);
      rect(selected.x, selected.y, selected.width, selected.height, 4);
    }
    pop();
  }
}

// ============ Input/Interaction ============
function mousePressed() {
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
  if (!appState.dragging) return;
  const selected = getSelectedLight();
  if (!selected) return;
  selected.x = mouseX - appState.dragOffset.x;
  selected.y = mouseY - appState.dragOffset.y;
}

function mouseReleased() {
  appState.dragging = false;
}

// Delete by double click on a light
function doubleClicked() {
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

function hitTest(x, y) {
  for (let i = appState.lights.length - 1; i >= 0; i--) {
    const l = appState.lights[i];
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
  glShader.setUniform(
    "u_blendStrength",
    constrain(appState.blendingStrength, 0, 2)
  );
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

  for (let i = 0; i < count; i++) {
    const l = lights[i];
    ensureLightCaches(l);
    typeArr[i] = l.type === "rect" ? 1 : 0;
    // match gl_FragCoord (bottom-left origin)
    posArr[i * 2 + 0] = l.x;
    posArr[i * 2 + 1] = height - l.y;
    colorArr[i * 3 + 0] = l.colorLinear.r;
    colorArr[i * 3 + 1] = l.colorLinear.g;
    colorArr[i * 3 + 2] = l.colorLinear.b;
    intensityArr[i] = constrain(l.intensity ?? 0, 0, INTENSITY_MAX);
    sizeArr[i] =
      l.type === "circle"
        ? Math.max(0, l.radius || 0)
        : Math.max(0, Math.max(l.width || 0, l.height || 0) * 0.5);
    rectSizeArr[i * 2 + 0] =
      l.type === "rect"
        ? Math.max(1, l.width || 1)
        : l.radius
        ? l.radius * 2
        : 2;
    rectSizeArr[i * 2 + 1] =
      l.type === "rect"
        ? Math.max(1, l.height || 1)
        : l.radius
        ? l.radius * 2
        : 2;
    featherArr[i] = Math.max(0, l.feather ?? 150);
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
  appState.backgroundColor = hex;
}

function setCreationShape(shape) {
  appState.creationShape = shape === "rect" ? "rect" : "circle";
}

function setBlendingStrength(value) {
  // accepts 0..2 or 0..200 (UI percent)
  if (value > 2) appState.blendingStrength = constrain(value / 100, 0, 2);
  else appState.blendingStrength = constrain(value, 0, 2);
}

function setExposure(v) {
  appState.exposure = Math.max(0.1, Math.min(5, v));
}

function updateSelectedLight(props) {
  const l = getSelectedLight();
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
};
