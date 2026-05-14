import path from "node:path";
import fs from "node:fs";
import { screen } from "electron";
import {
  DISPLAY_IDS,
  normalizeDisplayId,
  normalizeDisplayMappingKeys,
} from "../shared/displayIds.js";

export { DISPLAY_IDS };

const FALLBACK_WIDTH = 1920;
const FALLBACK_HEIGHT = 1080;

function readDisplayMapping(userDataPath) {
  const filePath = path.join(userDataPath, "display-mapping.json");
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return normalizeDisplayMappingKeys(parsed);
    }
  } catch (_err) {
    /* ignore */
  }
  return {};
}

function getPrimaryDisplayId() {
  return screen.getPrimaryDisplay().id;
}

function listOutputDisplays() {
  const primaryId = getPrimaryDisplayId();
  return screen.getAllDisplays().filter(function (display) {
    return display.id !== primaryId;
  });
}

function getScreenForDisplayId(displayId, mapping) {
  const displays = screen.getAllDisplays();
  const outputDisplays = listOutputDisplays();
  if (!outputDisplays.length) {
    return null;
  }
  const primaryId = getPrimaryDisplayId();
  const key = normalizeDisplayId(displayId);
  const mappedIndex = Number(mapping[key]);
  if (Number.isInteger(mappedIndex) && displays[mappedIndex]) {
    const mapped = displays[mappedIndex];
    if (mapped.id !== primaryId) {
      return mapped;
    }
  }
  const slotIndex = DISPLAY_IDS.indexOf(key);
  const fallbackIndex = slotIndex >= 0 ? slotIndex : 0;
  return (
    outputDisplays[fallbackIndex] ||
    outputDisplays[outputDisplays.length - 1]
  );
}

function serializeBounds(bounds) {
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}

function buildFallbackLayout(displayId) {
  return {
    displayId: String(displayId),
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

function serializeDisplayLayout(displayId, targetScreen) {
  if (!targetScreen) {
    return buildFallbackLayout(displayId);
  }
  const bounds = targetScreen.bounds;
  const workArea = targetScreen.workArea;
  return {
    displayId: String(displayId),
    width: bounds.width,
    height: bounds.height,
    scaleFactor: targetScreen.scaleFactor,
    bounds: serializeBounds(bounds),
    workArea: serializeBounds(workArea),
    available: true,
  };
}

export function listDisplayLayouts(userDataPath) {
  const mapping = readDisplayMapping(userDataPath);
  const outputDisplays = listOutputDisplays();
  return DISPLAY_IDS.map(function (displayId) {
    if (!outputDisplays.length) {
      return buildFallbackLayout(displayId);
    }
    const targetScreen = getScreenForDisplayId(displayId, mapping);
    return serializeDisplayLayout(displayId, targetScreen);
  });
}

export { getScreenForDisplayId, readDisplayMapping };
