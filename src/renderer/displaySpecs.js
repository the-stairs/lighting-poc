import {
  DEFAULT_DISPLAY_ID,
  DISPLAY_IDS,
} from "../shared/displayIds.js";

const FALLBACK_WIDTH = 1920;
const FALLBACK_HEIGHT = 1080;

let layoutCache = new Map();
let layoutsLoaded = false;

function buildFallbackLayout(displayId) {
  return {
    displayId: String(displayId || DEFAULT_DISPLAY_ID),
    width: FALLBACK_WIDTH,
    height: FALLBACK_HEIGHT,
    scaleFactor: 1,
    bounds: {
      x: 0,
      y: 0,
      width: FALLBACK_WIDTH,
      height: FALLBACK_HEIGHT,
    },
    workArea: {
      x: 0,
      y: 0,
      width: FALLBACK_WIDTH,
      height: FALLBACK_HEIGHT,
    },
    available: false,
  };
}

function readBrowserFallbackLayout(displayId) {
  const width = Math.max(1, window.innerWidth || FALLBACK_WIDTH);
  const height = Math.max(1, window.innerHeight || FALLBACK_HEIGHT);
  return {
    displayId: String(displayId || DEFAULT_DISPLAY_ID),
    width,
    height,
    scaleFactor: window.devicePixelRatio || 1,
    bounds: { x: 0, y: 0, width, height },
    workArea: { x: 0, y: 0, width, height },
    available: false,
  };
}

function cacheLayouts(layouts) {
  layoutCache = new Map();
  (layouts || []).forEach(function (layout) {
    if (!layout || !layout.displayId) {
      return;
    }
    layoutCache.set(String(layout.displayId), layout);
  });
  layoutsLoaded = true;
}

function fetchLayoutsFromElectron() {
  const api = window.electronAPI;
  if (!api || typeof api.listDisplayLayouts !== "function") {
    return Promise.resolve(null);
  }
  return api.listDisplayLayouts();
}

export async function loadDisplayLayouts() {
  const layouts = await fetchLayoutsFromElectron();
  if (Array.isArray(layouts) && layouts.length) {
    cacheLayouts(layouts);
    return layouts;
  }
  if (!layoutsLoaded) {
    cacheLayouts(
      DISPLAY_IDS.map(function (displayId) {
        return readBrowserFallbackLayout(displayId);
      })
    );
  }
  return Array.from(layoutCache.values());
}

export function getDisplayLayout(displayId) {
  const key = String(displayId || DEFAULT_DISPLAY_ID);
  const cached = layoutCache.get(key);
  if (cached) {
    return cached;
  }
  if (typeof window !== "undefined") {
    return readBrowserFallbackLayout(key);
  }
  return buildFallbackLayout(key);
}

export function getFixedEditCanvasSize(layout) {
  const width = Math.max(
    1,
    Math.round(Number(layout?.width) || FALLBACK_WIDTH)
  );
  const height = Math.max(
    1,
    Math.round(Number(layout?.height) || FALLBACK_HEIGHT)
  );
  return { width, height };
}

export function computeFitPresentationSize(editW, editH, containerW, containerH) {
  const ew = Math.max(1, Number(editW) || 1);
  const eh = Math.max(1, Number(editH) || 1);
  const aspect = ew / eh;
  const maxW = Math.max(1, Number(containerW) || 1);
  const maxH = Math.max(1, Number(containerH) || 1);
  let width = maxW;
  let height = Math.round(width / aspect);
  if (height > maxH) {
    height = maxH;
    width = Math.round(height * aspect);
  }
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

export function subscribeDisplayLayoutChanges(callback) {
  const api = window.electronAPI;
  if (!api || typeof api.onDisplayLayoutsChanged !== "function") {
    return function () {};
  }
  return api.onDisplayLayoutsChanged(callback);
}
