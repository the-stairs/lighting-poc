/* p5.js sketch and WebGL shader-based light rendering */
import "./supabase.js";
import p5 from "p5";

let p5Sketch;
let p5Canvas;
let glShader;

const urlParams = new URLSearchParams(window.location.search);
const appConfig = {
  role: urlParams.get("role") === "display" ? "display" : "control",
  displayId: urlParams.get("displayId") || null,
};
window.appConfig = appConfig;
document.body.classList.add(
  appConfig.role === "display" ? "role-display" : "role-control"
);

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

const TYPE_LIGHT = "LIGHT";
const TYPE_FILTER = "FILTER";
const TYPE_SOLID = "SOLID";

function normalizeLayerType(value) {
  const s = String(value || "")
    .trim()
    .toUpperCase();
  if (s === TYPE_LIGHT || s === TYPE_FILTER || s === TYPE_SOLID) return s;
  return null;
}

function normalizeBlendMode(value) {
  if (Number.isFinite(value)) {
    const v = value | 0;
    if (v === BLEND_ADD || v === BLEND_OVER || v === BLEND_MULTIPLY) return v;
  }
  const s = String(value || "")
    .trim()
    .toUpperCase();
  if (!s) return null;
  if (s === "ADD" || s === "BLEND_ADD") return BLEND_ADD;
  if (s === "OVER" || s === "BLEND_OVER") return BLEND_OVER;
  if (s === "MULTIPLY" || s === "BLEND_MULTIPLY") return BLEND_MULTIPLY;
  return null;
}

function typeToBlendMode(type) {
  if (type === TYPE_SOLID) return BLEND_OVER;
  if (type === TYPE_FILTER) return BLEND_MULTIPLY;
  return BLEND_ADD;
}

function isBlockerType(type) {
  return type === TYPE_FILTER || type === TYPE_SOLID;
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
  creationType: TYPE_LIGHT,
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

const displayState = {
  backgroundColor: "#000000",
  creationShape: "circle",
  creationType: TYPE_LIGHT,
  exposure: 1.2,
  falloffC: 2.0,
  colorSpace: 1,
  lights: [],
};

function getRenderState() {
  return appConfig.role === "display" ? displayState : appState;
}

const REALTIME_CHANNEL_NAME = "poc-light-sync";
const REALTIME_EVENT = "message";
const SYNC_DEBOUNCE_MS = 280;
let realtimeChannel = null;
let syncToDisplayTimeout = null;

/** 컨트롤러에서 디스플레이별로 기억해 둔 상태 (targetId -> snapshot) */
const displayStateMap = {};

function getDisplayTargetId() {
  const el = document.getElementById("displaySelect");
  return el ? el.value || "1" : "1";
}

function broadcastSnapshotToTarget(snapshot, targetId) {
  if (appConfig.role !== "control" || !realtimeChannel) return;
  displayStateMap[targetId] = snapshot;
  realtimeChannel
    .send({
      type: "broadcast",
      event: REALTIME_EVENT,
      payload: { type: "LIVE_STATE", targetId: targetId, payload: snapshot },
    })
    .catch(function (err) {
      console.warn("[realtime] broadcast failed", err);
    });
}

function broadcastState() {
  if (appConfig.role !== "control") return;
  const client = window.supabaseClient;
  if (!client) return;
  const targetId = getDisplayTargetId();
  const payload = serializePreset();
  broadcastSnapshotToTarget(payload, targetId);
}

function scheduleSyncToDisplay() {
  if (appConfig.role !== "control") return;
  if (syncToDisplayTimeout) clearTimeout(syncToDisplayTimeout);
  syncToDisplayTimeout = setTimeout(function () {
    syncToDisplayTimeout = null;
    broadcastState();
  }, SYNC_DEBOUNCE_MS);
}

function getDefaultPreset() {
  return {
    version: 1,
    backgroundColor: "#000000",
    creationShape: "circle",
    exposure: 1.2,
    falloffC: 2.0,
    colorSpace: 1,
    lights: [],
  };
}

function setEditTarget(targetId) {
  if (appConfig.role !== "control") return;
  const id = (targetId && String(targetId).trim()) || "all";
  const preset = displayStateMap[id] || getDefaultPreset();
  applyPresetToState(appState, preset);
  emitSelectionChange();
  dispatchLightsChanged();
}

function initRealtime() {
  const client = window.supabaseClient;
  if (!client) return;

  realtimeChannel = client.channel(REALTIME_CHANNEL_NAME);

  realtimeChannel.on("broadcast", { event: REALTIME_EVENT }, function (event) {
    const body = event && event.payload;
    if (!body || typeof body.type !== "string") return;

    if (appConfig.role === "control" && body.type === "REQUEST_LIVE") {
      const targetId = body.targetId || "all";
      const snap = serializePreset();
      displayStateMap[targetId] = snap;
      realtimeChannel
        .send({
          type: "broadcast",
          event: REALTIME_EVENT,
          payload: { type: "LIVE_STATE", targetId: targetId, payload: snap },
        })
        .catch(function (e) {
          console.warn("[realtime] send failed", e);
        });
      return;
    }

    if (appConfig.role === "display" && body.type === "LIVE_STATE") {
      const targetId = body.targetId;
      if (
        targetId !== "all" &&
        String(targetId) !== String(appConfig.displayId)
      )
        return;
      applyPresetToState(displayState, body.payload || {});
    }
  });

  realtimeChannel.subscribe(function (status) {
    if (status === "SUBSCRIBED" && appConfig.role === "display") {
      realtimeChannel
        .send({
          type: "broadcast",
          event: REALTIME_EVENT,
          payload: {
            type: "REQUEST_LIVE",
            targetId: appConfig.displayId || "all",
          },
        })
        .catch(function () {});
    }
  });
}

function initP5Sketch() {
  new p5((p) => {
    p5Sketch = p;

    p.preload = function () {
      glShader = p.loadShader("/shader.vert", "/shader.frag");
    };

    p.setup = function () {
      const container = document.getElementById("canvas-container");
      const w = container ? container.clientWidth : 800;
      const h = window.innerHeight;
      p5Canvas = p.createCanvas(w, h, p.WEBGL);
      p5Canvas.parent("canvas-container");
      p.pixelDensity(1);
      p.noStroke();

      initRealtime();

      dispatchEvent(new Event("app:ready"));
    };

    p.windowResized = function () {
      const container = document.getElementById("canvas-container");
      const w = container ? container.clientWidth : 800;
      const h = window.innerHeight;
      p.resizeCanvas(w, h);
      dispatchEvent(
        new CustomEvent("app:canvasResized", { detail: { width: w, height: h } })
      );
    };

    p.draw = function () {
      p.background(0);
      p.shader(glShader);
      uploadUniforms();
      p.rectMode(p.CENTER);
      p.rect(0, 0, p.width, p.height);
      p.resetShader();

      if (appConfig.role === "control") {
        updateHoverState();
        if (appState.previewMode) return;

        const selected = getSelectedLight();
        const hovered =
          appState.hoveredIdx >= 0 && appState.hoveredIdx < appState.lights.length
            ? appState.lights[appState.hoveredIdx]
            : null;
        if (selected || hovered) {
          p.push();
          p.resetMatrix();
          p.translate(-p.width / 2, -p.height / 2, 0);
          p.noFill();

          if (selected) {
            if (isBlockerType(selected.type)) {
              p.noStroke();
              p.fill(255, 15);
              drawHighlightShape(selected);
              p.noFill();
            }
            p.stroke(0);
            p.strokeWeight(3.5);
            drawHighlightShape(selected);
            p.stroke(255);
            p.strokeWeight(1.5);
            drawHighlightShape(selected);
            drawBlockerDash(selected);
          }

          if (hovered && (!selected || hovered.id !== selected.id)) {
            p.stroke(0, 100);
            p.strokeWeight(2.5);
            drawHighlightShape(hovered);
            p.stroke(255, 200);
            p.strokeWeight(1.5);
            drawHighlightShape(hovered);
            drawBlockerDash(hovered);
          }
          p.pop();
        }
      }
    };

    p.mousePressed = function () {
      if (appConfig.role === "display") return;
      if (isPointerOverPanel()) return;
      if (!isMouseOnCanvas()) return;

      const idx = hitTest(p5Sketch.mouseX, p5Sketch.mouseY);
      if (idx !== -1) {
        const light = appState.lights[idx];
        appState.selectedLightId = light.id;
        appState.dragging = true;
        appState.dragOffset.x = p5Sketch.mouseX - light.x;
        appState.dragOffset.y = p5Sketch.mouseY - light.y;
        emitSelectionChange();
        dispatchLightsChanged();
        scheduleSyncToDisplay();
      } else {
        const light = createLightAt(
          p5Sketch.mouseX,
          p5Sketch.mouseY,
          appState.creationShape,
          appState.creationType
        );
        appState.lights.push(light);
        appState.selectedLightId = light.id;
        appState.dragging = true;
        appState.dragOffset.x = 0;
        appState.dragOffset.y = 0;
        emitSelectionChange();
        dispatchLightsChanged();
        scheduleSyncToDisplay();
      }
    };

    p.mouseDragged = function () {
      if (appConfig.role === "display") return;
      if (isPointerOverPanel()) return;
      if (!appState.dragging) return;
      const selected = getSelectedLight();
      if (!selected) return;
      selected.x = p5Sketch.mouseX - appState.dragOffset.x;
      selected.y = p5Sketch.mouseY - appState.dragOffset.y;
      scheduleSyncToDisplay();
    };

    p.mouseReleased = function () {
      if (appConfig.role === "display") return;
      if (isPointerOverPanel()) return;
      appState.dragging = false;
    };

    p.doubleClicked = function () {
      if (appConfig.role === "display") return;
      if (isPointerOverPanel()) return;
      if (!isMouseOnCanvas()) return;
      const idx = hitTest(p5Sketch.mouseX, p5Sketch.mouseY);
      if (idx === -1) return;
      const removed = appState.lights.splice(idx, 1)[0];
      if (!removed) return;
      if (appState.selectedLightId === removed.id) {
        appState.selectedLightId = null;
        emitSelectionChange();
      }
      dispatchLightsChanged();
      scheduleSyncToDisplay();
    };

    p.mouseMoved = function () {
      if (appConfig.role === "display") return;
      updateHoverState();
    };
  });
}

function drawHighlightShape(light) {
  if (!light || !p5Sketch) return;
  if (light.shape === "circle") {
    const sx = Number(light.sizeX) || 1;
    const sy = Number(light.sizeY) || 1;
    const rx = Math.max(1, (light.radius || 0) * sx);
    const ry = Math.max(1, (light.radius || 0) * sy);
    if (Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001) {
      p5Sketch.push();
      p5Sketch.translate(light.x, light.y);
      p5Sketch.rotate(light.rotation || 0);
      p5Sketch.ellipse(0, 0, rx * 2, ry * 2);
      p5Sketch.pop();
    } else {
      p5Sketch.circle(light.x, light.y, (light.radius || 0) * 2);
    }
  } else {
    p5Sketch.rectMode(p5Sketch.CENTER);
    p5Sketch.rect(light.x, light.y, light.width, light.height, 4);
  }
}

function drawBlockerDash(light) {
  if (!light || !isBlockerType(light.type) || !p5Sketch) return;
  const ctx = p5Sketch.drawingContext;
  if (!ctx || typeof ctx.setLineDash !== "function") return;
  ctx.setLineDash([5, 5]);
  p5Sketch.stroke(255);
  p5Sketch.strokeWeight(1.25);
  drawHighlightShape(light);
  ctx.setLineDash([]);
}

// ============ Input/Interaction ============
function isMouseOnCanvas() {
  if (!p5Sketch) return false;
  return (
    p5Sketch.mouseX >= 0 &&
    p5Sketch.mouseX <= p5Sketch.width &&
    p5Sketch.mouseY >= 0 &&
    p5Sketch.mouseY <= p5Sketch.height
  );
}

function isPointerOverPanel() {
  if (!p5Sketch || document.body.classList.contains("panel-hidden")) return false;
  const panel = document.getElementById("control-panel");
  if (!panel) return false;
  const canvasEl = p5Canvas && p5Canvas.elt;
  if (!canvasEl) return false;

  const c = canvasEl.getBoundingClientRect();
  const clientX = c.left + p5Sketch.mouseX;
  const clientY = c.top + p5Sketch.mouseY;
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
    if (l.shape === "circle") {
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
        const d = Math.hypot(x - l.x, y - l.y);
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
  appState.hoveredIdx = p5Sketch ? hitTest(p5Sketch.mouseX, p5Sketch.mouseY) : -1;
}

// ============ Lights ============
function createLightAt(x, y, shape, layerType = TYPE_LIGHT) {
  const id = "light-" + Math.random().toString(36).slice(2, 10);
  const baseColor = "#ffffff";
  const type = normalizeLayerType(layerType) || TYPE_LIGHT;
  const common = {
    id,
    x,
    y,
    color: baseColor, // sRGB hex
    colorRawLinear: hexToLinearRgb(baseColor),
    colorTintLinear: hexToTintLinearRgb(baseColor),
    _colorHexCache: baseColor,
    type,
    blendMode: typeToBlendMode(type),
    intensity: 400, // 0..INTENSITY_MAX (HDR)
    feather: 150, // px
    falloffK: 1.5,
    opacity: 1.0,
    rotation: 0.0,
  };
  applyFilterDefaultBlack(common, type);
  if (shape === "rect") {
    return {
      ...common,
      shape: "rect",
      width: 220,
      height: 160,
    };
  }
  return {
    ...common,
    shape: "circle",
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

function isDefaultWhiteHex(hex) {
  const s = String(hex || "")
    .trim()
    .toLowerCase();
  return s === "#fff" || s === "#ffffff";
}

function applyFilterDefaultBlack(light, nextType) {
  if (!light) return;
  if (nextType !== TYPE_FILTER) return;
  if (!isDefaultWhiteHex(light.color)) return;
  light.color = "#000000";
  light.colorRawLinear = hexToLinearRgb(light.color);
  light.colorTintLinear = hexToTintLinearRgb(light.color);
  light._colorHexCache = light.color;
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
  const nextShape =
    light.shape === "rect" || light.shape === "circle" ? light.shape : "circle";
  if (light.shape !== nextShape) {
    light.shape = nextShape;
  }
  if (light.shape === "rect") {
    if (!Number.isFinite(light.width)) light.width = 220;
    if (!Number.isFinite(light.height)) light.height = 160;
  } else {
    if (!Number.isFinite(light.radius)) light.radius = 150;
    if (!Number.isFinite(light.sizeX)) light.sizeX = 1.0;
    if (!Number.isFinite(light.sizeY)) light.sizeY = 1.0;
  }
  const nextType = normalizeLayerType(light.type) || TYPE_LIGHT;
  if (light.type !== nextType) {
    light.type = nextType;
  }
  const desiredBlend = typeToBlendMode(light.type);
  if (light.blendMode !== desiredBlend) light.blendMode = desiredBlend;
}

// ======== Uniform upload ========
function uploadUniforms() {
  if (!p5Sketch || !glShader) return;
  const state = getRenderState();
  glShader.setUniform("u_resolution", [p5Sketch.width, p5Sketch.height]);

  // background linear color
  const bgLin = hexToLinearRgb(state.backgroundColor);
  glShader.setUniform("u_bgColorLinear", [bgLin.r, bgLin.g, bgLin.b]);

  // globals
  glShader.setUniform("u_exposure", state.exposure);
  glShader.setUniform("u_falloffC", state.falloffC);
  glShader.setUniform("u_colorSpace", state.colorSpace);

  // compress active lights into uniform arrays
  const lights = state.lights;
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
    const shape = l.shape || "circle";
    const isStretched =
      shape === "circle" &&
      (Math.abs(sx - 1.0) > 0.001 || Math.abs(sy - 1.0) > 0.001);
    typeArr[i] = shape === "rect" ? 1 : isStretched ? 2 : 0;
    // match gl_FragCoord (bottom-left origin)
    posArr[i * 2 + 0] = l.x;
    posArr[i * 2 + 1] = p5Sketch.height - l.y;
    rawColorArr[i * 3 + 0] = l.colorRawLinear.r;
    rawColorArr[i * 3 + 1] = l.colorRawLinear.g;
    rawColorArr[i * 3 + 2] = l.colorRawLinear.b;
    tintColorArr[i * 3 + 0] = l.colorTintLinear.r;
    tintColorArr[i * 3 + 1] = l.colorTintLinear.g;
    tintColorArr[i * 3 + 2] = l.colorTintLinear.b;
    intensityArr[i] = p5Sketch.constrain(l.intensity ?? 0, 0, INTENSITY_MAX);
    let sizePx = 0;
    let minHalfSize = 0;
    if (shape === "circle") {
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
    const t = p5Sketch.constrain((l.feather ?? 150) / FEATHER_UI_MAX, 0, 1);
    const perceptual = Math.pow(t, 2.2);
    const featherPx = perceptual * Math.min(FEATHER_PX_CAP, sizePx);
    const capByInward = (minHalfSize * 0.9) / Math.max(IN_RATIO, 1e-6);
    const MAX_SPILL = minHalfSize * 0.4; // tuning point
    const capByOutward = MAX_SPILL / Math.max(OUT_RATIO, 1e-6);
    featherArr[i] = Math.min(featherPx, capByInward, capByOutward);
    falloffArr[i] = p5Sketch.constrain(l.falloffK ?? 1.5, 0.1, 8);
    rotationArr[i] = l.rotation ?? 0.0;
    opacityArr[i] = p5Sketch.constrain(l.opacity ?? 1.0, 0, 1);
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
  scheduleSyncToDisplay();
}

function setCreationShape(shape) {
  if (shape === "rect") appState.creationShape = "rect";
  else appState.creationShape = "circle";
  scheduleSyncToDisplay();
}

function setCreationType(type) {
  const next = normalizeLayerType(type) || TYPE_LIGHT;
  appState.creationType = next;
  scheduleSyncToDisplay();
}

function setExposure(v) {
  appState.exposure = Math.max(0.1, Math.min(5, v));
  scheduleSyncToDisplay();
}

function setFalloffC(v) {
  appState.falloffC = clamp(v, 0.2, 6.0, 2.0);
  scheduleSyncToDisplay();
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
  if (typeof props.x === "number") l.x = props.x;
  if (typeof props.y === "number") l.y = props.y;
  if (l.shape === "circle") {
    if (typeof props.radius === "number") l.radius = Math.max(1, props.radius);
    if (typeof props.sizeX === "number")
      l.sizeX = p5Sketch ? p5Sketch.constrain(props.sizeX, 0.1, 5) : props.sizeX;
    if (typeof props.sizeY === "number")
      l.sizeY = p5Sketch ? p5Sketch.constrain(props.sizeY, 0.1, 5) : props.sizeY;
  } else {
    if (typeof props.width === "number") l.width = Math.max(1, props.width);
    if (typeof props.height === "number") l.height = Math.max(1, props.height);
  }
  if (typeof props.intensity === "number")
    l.intensity = p5Sketch ? p5Sketch.constrain(props.intensity, 0, INTENSITY_MAX) : props.intensity;
  if (typeof props.feather === "number") l.feather = Math.max(0, props.feather);
  if (typeof props.falloffK === "number")
    l.falloffK = p5Sketch ? p5Sketch.constrain(props.falloffK, 0.1, 8) : props.falloffK;
  if (typeof props.rotation === "number") l.rotation = props.rotation;
  if (typeof props.opacity === "number") {
    l.opacity = p5Sketch ? p5Sketch.constrain(props.opacity, 0, 1) : props.opacity;
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
  if (typeof props.type === "string") {
    const prevType = l.type;
    const nextType = normalizeLayerType(props.type) || TYPE_LIGHT;
    l.type = nextType;
    l.blendMode = typeToBlendMode(nextType);
    applyFilterDefaultBlack(l, nextType);
    if (prevType !== l.type) {
      emitSelectionChange();
      dispatchLightsChanged();
    }
  } else if (props.blendMode != null) {
    const normalizedBlend = normalizeBlendMode(props.blendMode);
    if (normalizedBlend != null) {
      const inferredType = resolveLayerType({ blendMode: normalizedBlend });
      l.type = inferredType;
      l.blendMode = typeToBlendMode(inferredType);
    }
  }
  scheduleSyncToDisplay();
}

function emitSelectionChange() {
  const l = getSelectedLight();
  const detail = l ? { ...l } : null;
  dispatchEvent(new CustomEvent("app:selected", { detail }));
}

function getState() {
  return { ...appState };
}

function addLayerAtCenter(type) {
  if (!p5Sketch) return;
  const cx = Math.round(p5Sketch.width / 2);
  const cy = Math.round(p5Sketch.height / 2);
  const light = createLightAt(cx, cy, appState.creationShape, type);
  appState.lights.push(light);
  appState.selectedLightId = light.id;
  emitSelectionChange();
  dispatchLightsChanged();
  scheduleSyncToDisplay();
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
  scheduleSyncToDisplay();
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
  scheduleSyncToDisplay();
}

function sendToBackById(id) {
  const idx = appState.lights.findIndex((l) => l.id === id);
  if (idx === -1) return;
  const [item] = appState.lights.splice(idx, 1);
  appState.lights.unshift(item);
  dispatchLightsChanged();
  scheduleSyncToDisplay();
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
  scheduleSyncToDisplay();
  if (appState.selectedLightId) emitSelectionChange();
}

// ============ Preset (Export/Import) ============
function clamp(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

function resolveLayerType(raw) {
  const direct = normalizeLayerType(raw.type);
  if (direct) return direct;
  const mode = normalizeBlendMode(
    raw.blendMode != null ? raw.blendMode : raw.mode
  );
  if (mode === BLEND_OVER) return TYPE_SOLID;
  if (mode === BLEND_MULTIPLY) return TYPE_FILTER;
  if (mode === BLEND_ADD) return TYPE_LIGHT;
  if (raw.role === "blocker") return TYPE_FILTER;
  if (raw.role === "light") return TYPE_LIGHT;
  return TYPE_LIGHT;
}

function resolveShape(raw) {
  const shape = String(raw.shape || "")
    .trim()
    .toLowerCase();
  if (shape === "rect" || shape === "circle") return shape;
  if (shape === "ellipse") return "circle";
  const type = String(raw.type || "")
    .trim()
    .toLowerCase();
  if (type === "rect" || type === "circle") return type;
  if (type === "ellipse") return "circle";
  return "circle";
}

function sanitizeLight(raw) {
  if (!raw || typeof raw !== "object") return null;

  const shape = resolveShape(raw);
  const isLegacyEllipse = raw.type === "ellipse";
  const id =
    typeof raw.id === "string" && raw.id.length > 0
      ? raw.id
      : "light-" + Math.random().toString(36).slice(2, 10);

  const layerType = resolveLayerType(raw);
  const canvasW = Math.max(1, (p5Sketch && p5Sketch.width) || 1);
  const canvasH = Math.max(1, (p5Sketch && p5Sketch.height) || 1);
  const maxRectW = Math.max(10, canvasW * 2);
  const maxRectH = Math.max(10, canvasH * 2);
  const maxRadius = Math.max(
    10,
    Math.sqrt(canvasW * canvasW + canvasH * canvasH)
  );
  const base = {
    id,
    shape,
    x: clamp(raw.x, 0, canvasW, canvasW / 2),
    y: clamp(raw.y, 0, canvasH, canvasH / 2),
    color: safeHex(raw.color, "#ffffff"),
    intensity: clamp(raw.intensity, 0, INTENSITY_MAX, 400),
    feather: clamp(raw.feather, 0, FEATHER_UI_MAX, 150),
    falloffK: clamp(raw.falloffK, 0.1, 8, 1.5),
    opacity: clamp(raw.opacity, 0, 1, 1),
    rotation: clamp(raw.rotation, -Math.PI, Math.PI, 0),
    type: layerType,
    blendMode: typeToBlendMode(layerType),
  };

  if (shape === "rect") {
    base.width = clamp(raw.width, 10, maxRectW, 220);
    base.height = clamp(raw.height, 10, maxRectH, 160);
  } else {
    const fallbackRadius = clamp(raw.radius, 10, maxRadius, 150);
    const legacyRadius = clamp(raw.baseSize, 10, maxRadius, fallbackRadius);
    base.radius = isLegacyEllipse ? legacyRadius : fallbackRadius;
    base.sizeX = clamp(raw.sizeX, 0.1, 5, 1);
    base.sizeY = clamp(raw.sizeY, 0.1, 5, 1);
  }

  applyFilterDefaultBlack(base, layerType);
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
      const normalizedType =
        normalizeLayerType(l.type) ||
        resolveLayerType({ blendMode: l.blendMode, role: l.role });
      const normalizedShape = resolveShape(l);
      const normalizedBlend = typeToBlendMode(normalizedType);
      const out = {
        id: l.id,
        type: normalizedType,
        shape: normalizedShape,
        x: l.x,
        y: l.y,
        color: l.color,
        intensity: l.intensity,
        feather: l.feather,
        falloffK: l.falloffK,
        opacity: l.opacity,
        rotation: l.rotation,
        blendMode: normalizedBlend,
      };
      if (normalizedShape === "rect") {
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

function applyPresetToState(targetState, preset) {
  if (!preset || typeof preset !== "object") return false;

  targetState.backgroundColor =
    typeof preset.backgroundColor === "string"
      ? preset.backgroundColor
      : targetState.backgroundColor;

  targetState.creationShape =
    preset.creationShape === "rect" ? "rect" : "circle";
  targetState.exposure = clamp(preset.exposure, 0.1, 5, targetState.exposure);
  targetState.falloffC = clamp(preset.falloffC, 0.2, 6.0, targetState.falloffC);
  targetState.colorSpace = preset.colorSpace === 0 ? 0 : 1;

  const src = Array.isArray(preset.lights) ? preset.lights : [];
  const sanitized = [];
  for (let i = 0; i < Math.min(src.length, U_MAX_LIGHTS); i++) {
    const l = sanitizeLight(src[i]);
    if (l) sanitized.push(l);
  }
  targetState.lights = sanitized;

  if (targetState === appState) {
    const selectedId =
      typeof preset.selectedLightId === "string"
        ? preset.selectedLightId
        : null;
    appState.selectedLightId =
      selectedId && appState.lights.some((l) => l.id === selectedId)
        ? selectedId
        : null;
    appState.dragging = false;
    emitSelectionChange();
    dispatchLightsChanged();
  }
  return true;
}

function exportPresetData(exportOptions) {
  if (exportOptions && exportOptions.applyToAllDisplays) {
    const displays = {};
    ["1", "2", "3", "4", "5", "6"].forEach((id) => {
      displays[id] = displayStateMap[id] || getDefaultPreset();
    });
    return { version: 1, scope: "all", displays: displays };
  }
  return serializePreset();
}

function resetDisplayToDefault(id) {
  const def = getDefaultPreset();
  displayStateMap[id] = def;
  broadcastSnapshotToTarget(def, id);
}

function resetCurrentDisplayToDefault() {
  const def = getDefaultPreset();
  applyPresetToState(appState, def);
  const currentId = getDisplayTargetId();
  displayStateMap[currentId] = def;
  broadcastSnapshotToTarget(def, currentId);
}

function resetAllDisplaysToDefault() {
  ["1", "2", "3", "4", "5", "6"].forEach((id) => resetDisplayToDefault(id));
  const currentId = getDisplayTargetId();
  applyPresetToState(
    appState,
    displayStateMap[currentId] || getDefaultPreset()
  );
}

function applyPreset(preset, options) {
  const isAllFormat =
    preset &&
    preset.scope === "all" &&
    preset.displays &&
    typeof preset.displays === "object";
  const applyToAll = options && options.applyToAllDisplays;

  if (applyToAll && isAllFormat) {
    resetAllDisplaysToDefault();
    ["1", "2", "3", "4", "5", "6"].forEach((id) => {
      const p = preset.displays[id];
      if (p && typeof p === "object") {
        displayStateMap[id] = p;
        broadcastSnapshotToTarget(p, id);
      }
    });
    const currentId = getDisplayTargetId();
    applyPresetToState(
      appState,
      displayStateMap[currentId] || getDefaultPreset()
    );
    return true;
  }

  if (!applyToAll && isAllFormat) {
    resetCurrentDisplayToDefault();
    const currentId = getDisplayTargetId();
    const p = preset.displays[currentId];
    if (p && typeof p === "object") {
      applyPresetToState(appState, p);
      displayStateMap[currentId] = p;
      broadcastSnapshotToTarget(p, currentId);
      return true;
    }
    return true;
  }

  if (applyToAll) {
    resetAllDisplaysToDefault();
  } else {
    resetCurrentDisplayToDefault();
  }
  const ok = applyPresetToState(appState, preset);
  if (!ok) return false;
  if (applyToAll) {
    const snapshot = serializePreset();
    ["1", "2", "3", "4", "5", "6"].forEach((id) => {
      broadcastSnapshotToTarget(snapshot, id);
    });
  } else {
    scheduleSyncToDisplay();
  }
  return true;
}

// p5 인스턴스 모드로 스케치 시작
initP5Sketch();

// expose API
window.app = {
  setBackgroundColor,
  setCreationShape,
  setCreationType,
  setExposure,
  setFalloffC,
  setPreviewMode,
  updateSelectedLight,
  getSelectedLight,
  getState,
  addLayerAtCenter,
  deleteSelectedLight,
  clearSelection,
  selectLightById,
  bringToFrontById,
  sendToBackById,
  reorderLightsById,
  setEditTarget,
  exportPreset: (exportOptions) => exportPresetData(exportOptions),
  importPreset: (presetObj, importOptions) =>
    applyPreset(presetObj, importOptions),
};
