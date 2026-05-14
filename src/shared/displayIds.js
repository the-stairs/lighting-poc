export const DISPLAY_IDS = [
  "top_lower",
  "top_upper",
  "left",
  "right",
  "front",
  "rear",
];

export const DEFAULT_DISPLAY_ID = "top_lower";

export const LEGACY_NUMERIC_DISPLAY_IDS = {
  "1": "top_lower",
  "2": "top_upper",
  "3": "left",
  "4": "right",
  "5": "front",
  "6": "rear",
};

export function normalizeDisplayId(raw) {
  const s = raw == null ? "" : String(raw).trim();
  if (!s) {
    return DEFAULT_DISPLAY_ID;
  }
  if (DISPLAY_IDS.includes(s)) {
    return s;
  }
  const n = Number(s);
  if (Number.isInteger(n) && n >= 1 && n <= 6) {
    return LEGACY_NUMERIC_DISPLAY_IDS[String(n)] || DEFAULT_DISPLAY_ID;
  }
  return DEFAULT_DISPLAY_ID;
}

export function normalizeDisplayMappingKeys(raw) {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const nk = normalizeDisplayId(k);
    if (out[nk] == null) {
      out[nk] = v;
    }
  }
  return out;
}
