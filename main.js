/* p5.js sketch and WebGL shader-based light rendering */

let p5Canvas;
let glShader;

const U_MAX_LIGHTS = 64;
const INTENSITY_MAX = 2000; // HDR scale per spec
const FEATHER_UI_MAX = 800;
const FEATHER_PX_CAP = 800;
const OUT_RATIO = 0.15;
const IN_RATIO = 1.0 - OUT_RATIO;
const DEBUG_LOGS = false;
// 0: ADD, 1: OVER, 2: MULTIPLY
const BLEND_ADD = 0;
const BLEND_OVER = 1;
const BLEND_MULTIPLY = 2;

function normalizeRole(role) {
  return role === "blocker" ? "blocker" : "light";
}

function isDefaultWhiteHex(hex) {
  const s = safeHex(hex, "#ffffff");
  if (s.length === 4) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return `#${r}${r}${g}${g}${b}${b}` === "#ffffff";
  }
  return s === "#ffffff";
}

function roleToBlendMode(role) {
  return role === "blocker" ? BLEND_MULTIPLY : BLEND_ADD;
}

function applyRoleToLight(light, role) {
  const nextRole = normalizeRole(role);
  light.role = nextRole;
  light.blendMode = roleToBlendMode(nextRole);
  if (nextRole === "blocker" && isDefaultWhiteHex(light.color)) {
    light.color = "#000000";
    light.colorRawLinear = hexToLinearRgb(light.color);
    light.colorTintLinear = hexToTintLinearRgb(light.color);
    light._colorHexCache = light.color;
  }
}

function dispatchLightsChanged() {
  dispatchEvent(
    new CustomEvent("app:lightsChanged", {
      detail: {
        lights: appState.lights.map((l) => ({ ...l })),
        selectedLightId: appState.selectedLightId,
      },
    })
  );
}

const appState = {
  backgroundColor: "#000000", // sRGB hex
  creationShape: "circle", // 'circle' | 'rect'
  exposure: 1.2,
  falloffC: 2.0,
  colorSpace: 1, // 0: linear input, 1: sRGB input (palette)
  lights: [],
  selectedLightId: null,
  dragOffset: { x: 0, y: 0 },
  dragging: false,
  hoveredIdx: -1,
  previewMode: false,
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

  updateHoverState();
  if (appState.previewMode) return;

  // selection/hover overlay (in pixel-top-left space)
  const selected = getSelectedLight();
  const hovered =
    appState.hoveredIdx >= 0 && appState.hoveredIdx < appState.lights.length
      ? appState.lights[appState.hoveredIdx]
      : null;
  if (selected || hovered) {
    push();
    // map top-left (0,0) to WEBGL coordinates
    resetMatrix();
    translate(-width / 2, -height / 2, 0);
    noFill();

    if (selected) {
      if (selected.role === "blocker") {
        noStroke();
        fill(255, 15);
        drawHighlightShape(selected);
        noFill();
      }
      stroke(0);
      strokeWeight(3.5);
      drawHighlightShape(selected);
      stroke(255);
      strokeWeight(1.5);
      drawHighlightShape(selected);
      drawBlockerDash(selected);
    }

    if (hovered && (!selected || hovered.id !== selected.id)) {
      stroke(0, 100);
      strokeWeight(2.5);
      drawHighlightShape(hovered);
      stroke(255, 200);
      strokeWeight(1.5);
      drawHighlightShape(hovered);
      drawBlockerDash(hovered);
    }
    pop();
  }
}

function drawHighlightShape(light) {
  if (!light) return;
  if (light.type === "circle") {
    const sx = Number(light.sizeX) || 1;
    const sy = Number(light.sizeY) || 1;
    const rx = Math.max(1, (light.radius || 0) * sx);
    const ry = Math.max(1, (light.radius || 0) * sy);
    if (Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001) {
      push();
      translate(light.x, light.y);
      rotate(light.rotation || 0);
      ellipse(0, 0, rx * 2, ry * 2);
      pop();
    } else {
      circle(light.x, light.y, (light.radius || 0) * 2);
    }
  } else {
    rectMode(CENTER);
    rect(light.x, light.y, light.width, light.height, 4);
  }
}

function drawBlockerDash(light) {
  if (!light || light.role !== "blocker") return;
  const ctx = drawingContext;
  if (!ctx || typeof ctx.setLineDash !== "function") return;
  ctx.setLineDash([5, 5]);
  stroke(255);
  strokeWeight(1.25);
  drawHighlightShape(light);
  ctx.setLineDash([]);
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
    dispatchLightsChanged();
  } else {
    // create new light
    const light = createLightAt(mouseX, mouseY, appState.creationShape);
    appState.lights.push(light);
    appState.selectedLightId = light.id;
    appState.dragging = true;
    appState.dragOffset.x = 0;
    appState.dragOffset.y = 0;
    emitSelectionChange();
    dispatchLightsChanged();
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

function mouseMoved() {
  updateHoverState();
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
  dispatchLightsChanged();
}

function isMouseOnCanvas() {
  return mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height;
}

function isPointerOverPanel() {
  if (document.body.classList.contains("panel-hidden")) return false;
  const panel = document.getElementById("control-panel");
  if (!panel) return false;
  const canvasEl = p5Canvas && p5Canvas.elt;
  if (!canvasEl) return false;

  const c = canvasEl.getBoundingClientRect();
  const clientX = c.left + mouseX;
  const clientY = c.top + mouseY;
  const r = panel.getBoundingClientRect();
  return (
    clientX >= r.left &&
    clientX <= r.right &&
    clientY >= r.top &&
    clientY <= r.bottom
  );
}

function hitTest(x, y) {
  for (let i = appState.lights.length - 1; i >= 0; i--) {
    const l = appState.lights[i];
    if (l.type === "circle") {
      const sx = Number(l.sizeX) || 1;
      const sy = Number(l.sizeY) || 1;
      const rx = Math.max(1, (l.radius || 0) * sx);
      const ry = Math.max(1, (l.radius || 0) * sy);
      if (Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001) {
        const dx = x - l.x;
        const dy = y - l.y;
        const rot = -(l.rotation || 0);
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        const px = dx * c - dy * s;
        const py = dx * s + dy * c;
        const nx = px / rx;
        const ny = py / ry;
        if (nx * nx + ny * ny <= 1.0) return i;
      } else {
        const d = dist(x, y, l.x, l.y);
        if (d <= l.radius) return i;
      }
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

function updateHoverState() {
  if (appState.previewMode) {
    appState.hoveredIdx = -1;
    return;
  }
  if (appState.dragging || isPointerOverPanel() || !isMouseOnCanvas()) {
    appState.hoveredIdx = -1;
    return;
  }
  appState.hoveredIdx = hitTest(mouseX, mouseY);
}

// ============ Lights ============
function createLightAt(x, y, type) {
  const id = "light-" + Math.random().toString(36).slice(2, 10);
  const baseColor = "#ffffff";
  const role = "light";
  const common = {
    id,
    x,
    y,
    color: baseColor, // sRGB hex
    colorRawLinear: hexToLinearRgb(baseColor),
    colorTintLinear: hexToTintLinearRgb(baseColor),
    _colorHexCache: baseColor,
    role,
    blendMode: roleToBlendMode(role),
    intensity: 400, // 0..INTENSITY_MAX (HDR)
    feather: 150, // px
    falloffK: 1.5,
    opacity: 1.0,
    rotation: 0.0,
  };
  if (type === "rect") {
    return {
      ...common,
      type: "rect",
      width: 220,
      height: 160,
    };
  }
  return {
    ...common,
    type: "circle",
    radius: 150,
    sizeX: 1.0,
    sizeY: 1.0,
  };
}

function getSelectedLight() {
  const id = appState.selectedLightId;
  if (!id) return null;
  return appState.lights.find((l) => l.id === id) || null;
}

// ======== Color helpers (sRGB -> Linear) ========
// Manual check: intensity=400 with #101010 / #808080 / #ff0000 keeps brightness, hue changes only.
function safeHex(hex, fallback = "#ffffff") {
  const s = String(hex || "")
    .trim()
    .toLowerCase();
  const ok = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(s);
  return ok ? s : fallback;
}

function hexToRgb01(hex) {
  const h = safeHex(hex).replace("#", "");
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

function hexToTintLinearRgb(hex) {
  const { r, g, b } = hexToRgb01(hex);
  const linR = srgbToLinear01(r);
  const linG = srgbToLinear01(g);
  const linB = srgbToLinear01(b);
  const maxC = Math.max(linR, linG, linB);
  const minC = Math.min(linR, linG, linB);
  if (maxC < 0.001) return { r: 0, g: 0, b: 0 };
  const chromaRatio = (maxC - minC) / maxC;
  const t0 = 0.02;
  const t1 = 0.08;
  const u = Math.max(0, Math.min(1, (chromaRatio - t0) / (t1 - t0)));
  const t = u * u * (3 - 2 * u); // smoothstep
  const normR = linR / maxC;
  const normG = linG / maxC;
  const normB = linB / maxC;
  return {
    r: 1 + (normR - 1) * t,
    g: 1 + (normG - 1) * t,
    b: 1 + (normB - 1) * t,
  };
}

function ensureLightCaches(light) {
  const hex = light.color || "#ffffff";
  if (light._colorHexCache !== hex) {
    light.colorRawLinear = hexToLinearRgb(hex);
    light.colorTintLinear = hexToTintLinearRgb(hex);
    light._colorHexCache = hex;
  }
  if (!light.colorRawLinear) light.colorRawLinear = hexToLinearRgb(hex);
  if (!light.colorTintLinear) light.colorTintLinear = hexToTintLinearRgb(hex);
  if (light.role !== "light" && light.role !== "blocker") {
    light.role = "light";
  }
  const desiredBlend = roleToBlendMode(light.role);
  if (light.blendMode !== desiredBlend) light.blendMode = desiredBlend;
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
  glShader.setUniform("u_falloffC", appState.falloffC);
  glShader.setUniform("u_colorSpace", appState.colorSpace);

  // compress active lights into uniform arrays
  const lights = appState.lights;
  const count = Math.min(lights.length, U_MAX_LIGHTS);
  glShader.setUniform("u_numLights", count);

  const typeArr = new Int32Array(U_MAX_LIGHTS);
  const posArr = new Float32Array(U_MAX_LIGHTS * 2);
  const rawColorArr = new Float32Array(U_MAX_LIGHTS * 3);
  const tintColorArr = new Float32Array(U_MAX_LIGHTS * 3);
  const intensityArr = new Float32Array(U_MAX_LIGHTS);
  const sizeArr = new Float32Array(U_MAX_LIGHTS);
  const featherArr = new Float32Array(U_MAX_LIGHTS);
  const rectSizeArr = new Float32Array(U_MAX_LIGHTS * 2);
  const falloffArr = new Float32Array(U_MAX_LIGHTS);
  const rotationArr = new Float32Array(U_MAX_LIGHTS);
  const opacityArr = new Float32Array(U_MAX_LIGHTS);
  const blendModeArr = new Int32Array(U_MAX_LIGHTS);

  for (let i = 0; i < count; i++) {
    const l = lights[i];
    ensureLightCaches(l);
    const sx = Number(l.sizeX) || 1.0;
    const sy = Number(l.sizeY) || 1.0;
    const isStretched =
      l.type === "circle" &&
      (Math.abs(sx - 1.0) > 0.001 || Math.abs(sy - 1.0) > 0.001);
    typeArr[i] = l.type === "rect" ? 1 : isStretched ? 2 : 0;
    // match gl_FragCoord (bottom-left origin)
    posArr[i * 2 + 0] = l.x;
    posArr[i * 2 + 1] = height - l.y;
    rawColorArr[i * 3 + 0] = l.colorRawLinear.r;
    rawColorArr[i * 3 + 1] = l.colorRawLinear.g;
    rawColorArr[i * 3 + 2] = l.colorRawLinear.b;
    tintColorArr[i * 3 + 0] = l.colorTintLinear.r;
    tintColorArr[i * 3 + 1] = l.colorTintLinear.g;
    tintColorArr[i * 3 + 2] = l.colorTintLinear.b;
    intensityArr[i] = constrain(l.intensity ?? 0, 0, INTENSITY_MAX);
    let sizePx = 0;
    let minHalfSize = 0;
    if (l.type === "circle") {
      const rx = Math.max(1, (l.radius || 0) * sx);
      const ry = Math.max(1, (l.radius || 0) * sy);
      sizePx = Math.max(rx, ry);
      minHalfSize = Math.min(rx, ry);
      rectSizeArr[i * 2 + 0] = rx * 2;
      rectSizeArr[i * 2 + 1] = ry * 2;
    } else {
      sizePx = Math.max(0, Math.max(l.width || 0, l.height || 0) * 0.5);
      minHalfSize = Math.min((l.width || 0) * 0.5, (l.height || 0) * 0.5);
      rectSizeArr[i * 2 + 0] = Math.max(1, l.width || 1);
      rectSizeArr[i * 2 + 1] = Math.max(1, l.height || 1);
    }
    sizeArr[i] = sizePx;
    const t = constrain((l.feather ?? 150) / FEATHER_UI_MAX, 0, 1);
    const perceptual = Math.pow(t, 2.2);
    const featherPx = perceptual * Math.min(FEATHER_PX_CAP, sizePx);
    const capByInward = (minHalfSize * 0.9) / Math.max(IN_RATIO, 1e-6);
    const MAX_SPILL = minHalfSize * 0.4; // tuning point
    const capByOutward = MAX_SPILL / Math.max(OUT_RATIO, 1e-6);
    featherArr[i] = Math.min(featherPx, capByInward, capByOutward);
    falloffArr[i] = constrain(l.falloffK ?? 1.5, 0.1, 8);
    rotationArr[i] = l.rotation ?? 0.0;
    opacityArr[i] = constrain(l.opacity ?? 1.0, 0, 1);
    blendModeArr[i] = l.blendMode | 0;
  }
  if (DEBUG_LOGS) {
    console.log("[opacityArr]", Array.from(opacityArr.slice(0, count)));
  }

  glShader.setUniform("u_lightType", typeArr);
  glShader.setUniform("u_lightPos", posArr);
  glShader.setUniform("u_lightColorRawLinear", rawColorArr);
  glShader.setUniform("u_lightTintLinear", tintColorArr);
  glShader.setUniform("u_lightIntensity", intensityArr);
  glShader.setUniform("u_lightSize", sizeArr);
  glShader.setUniform("u_lightFeather", featherArr);
  glShader.setUniform("u_lightRectSize", rectSizeArr);
  glShader.setUniform("u_lightFalloffK", falloffArr);
  glShader.setUniform("u_lightRotation", rotationArr);
  glShader.setUniform("u_lightOpacity", opacityArr);
  glShader.setUniform("u_lightBlendMode", blendModeArr);
  glShader.setUniform("u_outRatio", OUT_RATIO);
}

// Checklist:
// - Feather up reduces "shrink" and preserves presence.
// - Extreme feather does not collapse into a dot (double-cap).
// - OUT_RATIO change stays in sync (JS uniform + shader).

// ============ Public API for UI ============
function setBackgroundColor(hex) {
  appState.backgroundColor = hex;
}

function setCreationShape(shape) {
  if (shape === "rect") appState.creationShape = "rect";
  else appState.creationShape = "circle";
}

function setExposure(v) {
  appState.exposure = Math.max(0.1, Math.min(5, v));
}

function setFalloffC(v) {
  appState.falloffC = clamp(v, 0.2, 6.0, 2.0);
}

function setPreviewMode(enabled) {
  appState.previewMode = !!enabled;
  if (appState.previewMode) {
    appState.hoveredIdx = -1;
  }
}

function updateSelectedLight(props) {
  const l = getSelectedLight();
  if (!l) return;
  if (l.type === "circle") {
    if (typeof props.radius === "number") l.radius = Math.max(1, props.radius);
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
    if (DEBUG_LOGS) {
      console.log("[opacity] selected=", l.id, "opacity=", l.opacity);
    }
  }
  if (typeof props.color === "string") {
    l.color = props.color;
    l.colorRawLinear = hexToLinearRgb(props.color);
    l.colorTintLinear = hexToTintLinearRgb(props.color);
    l._colorHexCache = props.color;
  }
  if (typeof props.role === "string") {
    const prevRole = l.role;
    applyRoleToLight(l, props.role);
    if (prevRole !== l.role) {
      emitSelectionChange();
      dispatchLightsChanged();
    }
  } else if (typeof props.blendMode === "number") {
    l.blendMode = props.blendMode | 0;
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
  appState.hoveredIdx = -1;
  appState.selectedLightId = null;
  appState.dragging = false;
  emitSelectionChange();
  dispatchLightsChanged();
}

function clearSelection() {
  if (!appState.selectedLightId) return;
  appState.selectedLightId = null;
  appState.dragging = false;
  emitSelectionChange();
}

function selectLightById(id) {
  if (typeof id !== "string") return;
  const exists = appState.lights.some((l) => l.id === id);
  if (!exists) return;
  appState.selectedLightId = id;
  emitSelectionChange();
  dispatchLightsChanged();
}

function bringToFrontById(id) {
  const idx = appState.lights.findIndex((l) => l.id === id);
  if (idx === -1) return;
  const [item] = appState.lights.splice(idx, 1);
  appState.lights.push(item);
  dispatchLightsChanged();
}

function sendToBackById(id) {
  const idx = appState.lights.findIndex((l) => l.id === id);
  if (idx === -1) return;
  const [item] = appState.lights.splice(idx, 1);
  appState.lights.unshift(item);
  dispatchLightsChanged();
}

function reorderLightsById(dragId, targetId, place = "before") {
  if (dragId === targetId) return;
  const dragIdx = appState.lights.findIndex((l) => l.id === dragId);
  const targetIdx = appState.lights.findIndex((l) => l.id === targetId);
  if (dragIdx === -1 || targetIdx === -1) return;
  const [item] = appState.lights.splice(dragIdx, 1);
  const adjustedTargetIdx = targetIdx > dragIdx ? targetIdx - 1 : targetIdx;
  const insertIdx =
    place === "after" ? adjustedTargetIdx + 1 : adjustedTargetIdx;
  appState.lights.splice(insertIdx, 0, item);
  dispatchLightsChanged();
  if (appState.selectedLightId) emitSelectionChange();
}

// ============ Preset (Export/Import) ============
function clamp(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

function sanitizeLight(raw) {
  if (!raw || typeof raw !== "object") return null;

  const isLegacyEllipse = raw.type === "ellipse";
  const type = raw.type === "rect" ? "rect" : "circle";
  const id =
    typeof raw.id === "string" && raw.id.length > 0
      ? raw.id
      : "light-" + Math.random().toString(36).slice(2, 10);

  const role = normalizeRole(raw.role);
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
    role,
    blendMode: roleToBlendMode(role),
  };

  if (type === "rect") {
    base.width = clamp(raw.width, 10, 1600, 220);
    base.height = clamp(raw.height, 10, 1200, 160);
  } else {
    const fallbackRadius = clamp(raw.radius, 10, 1200, 150);
    const legacyRadius = clamp(raw.baseSize, 10, 1200, fallbackRadius);
    base.radius = isLegacyEllipse ? legacyRadius : fallbackRadius;
    base.sizeX = clamp(raw.sizeX, 0.1, 5, 1);
    base.sizeY = clamp(raw.sizeY, 0.1, 5, 1);
  }

  if (role === "blocker" && isDefaultWhiteHex(base.color)) {
    base.color = "#000000";
  }
  base.colorRawLinear = hexToLinearRgb(base.color);
  base.colorTintLinear = hexToTintLinearRgb(base.color);
  base._colorHexCache = base.color;
  return base;
}

function serializePreset() {
  const s = appState;
  return {
    version: 1,
    backgroundColor: s.backgroundColor,
    creationShape: s.creationShape,
    exposure: s.exposure,
    falloffC: s.falloffC,
    colorSpace: s.colorSpace,
    lights: (s.lights || []).map((l) => {
      const out = {
        id: l.id,
        type: l.type,
        role: l.role === "blocker" ? "blocker" : "light",
        x: l.x,
        y: l.y,
        color: l.color,
        intensity: l.intensity,
        feather: l.feather,
        falloffK: l.falloffK,
        opacity: l.opacity,
        rotation: l.rotation,
        blendMode: l.blendMode ?? BLEND_ADD,
      };
      if (l.type === "rect") {
        out.width = l.width;
        out.height = l.height;
      } else {
        out.radius = l.radius;
        out.sizeX = l.sizeX ?? 1;
        out.sizeY = l.sizeY ?? 1;
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

  appState.creationShape = preset.creationShape === "rect" ? "rect" : "circle";
  appState.exposure = clamp(preset.exposure, 0.1, 5, appState.exposure);
  appState.falloffC = clamp(preset.falloffC, 0.2, 6.0, appState.falloffC);
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
  dispatchLightsChanged();
  return true;
}

// expose API
window.app = {
  setBackgroundColor,
  setCreationShape,
  setExposure,
  setFalloffC,
  setPreviewMode,
  updateSelectedLight,
  getSelectedLight,
  getState,
  deleteSelectedLight,
  clearSelection,
  selectLightById,
  bringToFrontById,
  sendToBackById,
  reorderLightsById,
  exportPreset: () => serializePreset(),
  importPreset: (presetObj) => applyPreset(presetObj),
};
