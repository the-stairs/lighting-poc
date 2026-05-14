import path from "node:path";
import fs from "node:fs";
import { screen } from "electron";
import { DISPLAY_IDS, normalizeDisplayId } from "../shared/displayIds.js";

export { DISPLAY_IDS };

const MAPPING_FILENAME = "display-mapping.json";
const FALLBACK_WIDTH = 1920;
const FALLBACK_HEIGHT = 1080;

const POSITION_LABELS = {
  top_lower: "상단(하측)",
  top_upper: "상단(상측)",
  left: "좌",
  right: "우",
  front: "정면",
  rear: "후면",
};

function mappingFilePath(userDataPath) {
  return path.join(userDataPath, MAPPING_FILENAME);
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

function isValidMappingIndex(displays, primaryId, index) {
  if (index < 0 || index >= displays.length) {
    return false;
  }
  return displays[index].id !== primaryId;
}

function buildDefaultDisplayMapping() {
  const displays = screen.getAllDisplays();
  const primaryId = getPrimaryDisplayId();
  const mapping = {};
  DISPLAY_IDS.forEach(function (id) {
    mapping[id] = null;
  });
  let slot = 0;
  for (let i = 0; i < displays.length && slot < DISPLAY_IDS.length; i += 1) {
    if (displays[i].id === primaryId) {
      continue;
    }
    mapping[DISPLAY_IDS[slot]] = i;
    slot += 1;
  }
  return mapping;
}

function sanitizeDisplayMapping(parsed) {
  const displays = screen.getAllDisplays();
  const primaryId = getPrimaryDisplayId();
  const out = {};
  for (let i = 0; i < DISPLAY_IDS.length; i += 1) {
    const id = DISPLAY_IDS[i];
    if (!Object.prototype.hasOwnProperty.call(parsed, id)) {
      out[id] = null;
      continue;
    }
    const raw = parsed[id];
    if (raw === null) {
      out[id] = null;
      continue;
    }
    const index = Number(raw);
    if (!Number.isInteger(index)) {
      out[id] = null;
      continue;
    }
    if (!isValidMappingIndex(displays, primaryId, index)) {
      out[id] = null;
      continue;
    }
    out[id] = index;
  }
  return out;
}

function hadInvalidMappingValues(parsed, sanitized) {
  for (let i = 0; i < DISPLAY_IDS.length; i += 1) {
    const id = DISPLAY_IDS[i];
    if (!Object.prototype.hasOwnProperty.call(parsed, id)) {
      continue;
    }
    if (parsed[id] === null) {
      continue;
    }
    if (!Number.isInteger(sanitized[id])) {
      return true;
    }
  }
  return false;
}

function writeDisplayMappingFile(filePath, mapping) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const body = JSON.stringify(mapping, null, 2) + "\n";
  fs.writeFileSync(filePath, body, "utf8");
}

function loadParsedMappingFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch (_err) {
    return null;
  }
}

function createAndReturnDefaultMapping(filePath) {
  const defaults = buildDefaultDisplayMapping();
  writeDisplayMappingFile(filePath, defaults);
  return defaults;
}

function readDisplayMapping(userDataPath) {
  const filePath = mappingFilePath(userDataPath);
  const parsed = loadParsedMappingFile(filePath);
  if (parsed == null) {
    return createAndReturnDefaultMapping(filePath);
  }
  const sanitized = sanitizeDisplayMapping(parsed);
  if (hadInvalidMappingValues(parsed, sanitized)) {
    return createAndReturnDefaultMapping(filePath);
  }
  return sanitized;
}

function getScreenForDisplayId(displayId, mapping) {
  const displays = screen.getAllDisplays();
  const primaryId = getPrimaryDisplayId();
  const key = normalizeDisplayId(displayId);
  const mappedIndex = mapping[key];
  if (!Number.isInteger(mappedIndex)) {
    return null;
  }
  if (!isValidMappingIndex(displays, primaryId, mappedIndex)) {
    return null;
  }
  return displays[mappedIndex];
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

function mergeMappingPayload(payload) {
  const out = {};
  DISPLAY_IDS.forEach(function (id) {
    if (!payload || !Object.prototype.hasOwnProperty.call(payload, id)) {
      out[id] = null;
      return;
    }
    const raw = payload[id];
    if (raw === null || raw === undefined || raw === "") {
      out[id] = null;
      return;
    }
    out[id] = Number(raw);
  });
  return out;
}

function validateOneToOneMapping(mapping) {
  const displays = screen.getAllDisplays();
  const primaryId = getPrimaryDisplayId();
  const seen = new Set();
  for (let i = 0; i < DISPLAY_IDS.length; i += 1) {
    const id = DISPLAY_IDS[i];
    const v = mapping[id];
    if (v === null || v === undefined) {
      continue;
    }
    if (!Number.isInteger(v)) {
      return { ok: false, reason: "매핑 값은 정수 인덱스 또는 비어 있어야 합니다." };
    }
    if (!isValidMappingIndex(displays, primaryId, v)) {
      return { ok: false, reason: "주 모니터이거나 없는 디스플레이 인덱스입니다." };
    }
    if (seen.has(v)) {
      return { ok: false, reason: "한 모니터는 한 포지션에만 연결할 수 있습니다." };
    }
    seen.add(v);
  }
  return { ok: true };
}

export function saveDisplayMapping(userDataPath, payload) {
  const merged = mergeMappingPayload(payload);
  const validation = validateOneToOneMapping(merged);
  if (!validation.ok) {
    return validation;
  }
  const sanitized = sanitizeDisplayMapping(merged);
  const filePath = mappingFilePath(userDataPath);
  writeDisplayMappingFile(filePath, sanitized);
  return { ok: true };
}

function buildCandidateRow(display, index, primaryId) {
  const b = display.bounds;
  const summary = `${b.width}×${b.height} @ (${b.x}, ${b.y})`;
  const rawLabel = display.label != null ? String(display.label).trim() : "";
  const label = rawLabel || `디스플레이 ${index + 1}`;
  return {
    index,
    isPrimary: display.id === primaryId,
    summary,
    label,
  };
}

export function getMappingEditorState(userDataPath) {
  const displays = screen.getAllDisplays();
  const primaryId = getPrimaryDisplayId();
  const mapping = readDisplayMapping(userDataPath);
  const candidates = displays.map(function (d, i) {
    return buildCandidateRow(d, i, primaryId);
  });
  const positions = DISPLAY_IDS.map(function (id) {
    return { id, label: POSITION_LABELS[id] || id };
  });
  return { positions, candidates, mapping };
}

export { getScreenForDisplayId, readDisplayMapping };
