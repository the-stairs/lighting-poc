"use strict";

const path = require("path");
const fs = require("fs");
const { BrowserWindow, screen } = require("electron");

const DISPLAY_IDS = ["1", "2", "3", "4", "5", "6"];
const PRELOAD_PATH = path.join(__dirname, "preload.js");

function readDisplayMapping(userDataPath) {
  const filePath = path.join(userDataPath, "display-mapping.json");
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (_err) {
    /* ignore */
  }
  return {};
}

function getScreenForDisplayId(displayId, mapping) {
  const displays = screen.getAllDisplays();
  if (!displays.length) {
    return null;
  }
  const mappedIndex = Number(mapping[displayId]);
  if (Number.isInteger(mappedIndex) && displays[mappedIndex]) {
    return displays[mappedIndex];
  }
  const fallbackIndex = Math.max(0, Number(displayId) - 1);
  return displays[fallbackIndex] || displays[displays.length - 1];
}

function buildRoleUrl(origin, role, displayId) {
  const url = new URL(origin);
  url.searchParams.set("role", role);
  if (displayId) {
    url.searchParams.set("displayId", displayId);
  }
  return url.toString();
}

function createWindowManager(options) {
  const windows = {
    control: null,
    displays: new Map(),
  };
  const userDataPath = options.userDataPath;
  const getOrigin = options.getOrigin;
  const syncWsUrl = options.syncWsUrl;
  const displayFullscreen = options.displayFullscreen !== false;

  function getWebPreferences() {
    return {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [`--lighting-sync-ws-url=${syncWsUrl}`],
    };
  }

  function createControlWindow() {
    const primary = screen.getPrimaryDisplay();
    const bounds = primary.workArea;
    const win = new BrowserWindow({
      width: Math.min(1440, bounds.width),
      height: Math.min(900, bounds.height),
      x: bounds.x + 40,
      y: bounds.y + 40,
      show: false,
      webPreferences: getWebPreferences(),
    });
    win.loadURL(buildRoleUrl(getOrigin(), "control"));
    win.once("ready-to-show", function () {
      win.show();
    });
    win.on("closed", function () {
      windows.control = null;
    });
    windows.control = win;
    return win;
  }

  function createDisplayWindow(displayId) {
    const mapping = readDisplayMapping(userDataPath);
    const targetScreen = getScreenForDisplayId(displayId, mapping);
    if (!targetScreen) {
      return null;
    }
    const bounds = targetScreen.bounds;
    const win = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      frame: false,
      autoHideMenuBar: true,
      show: false,
      webPreferences: getWebPreferences(),
    });
    win.loadURL(buildRoleUrl(getOrigin(), "display", displayId));
    win.once("ready-to-show", function () {
      if (displayFullscreen) {
        win.setFullScreen(true);
      } else {
        win.show();
      }
    });
    win.on("closed", function () {
      windows.displays.delete(displayId);
    });
    windows.displays.set(displayId, win);
    return win;
  }

  function openAllDisplays() {
    const displays = screen.getAllDisplays();
    const maxDisplays = Math.min(DISPLAY_IDS.length, displays.length);
    for (let i = 0; i < maxDisplays; i += 1) {
      const displayId = DISPLAY_IDS[i];
      if (!windows.displays.has(displayId)) {
        createDisplayWindow(displayId);
      }
    }
  }

  function closeAllDisplays() {
    for (const win of windows.displays.values()) {
      if (!win.isDestroyed()) {
        win.destroy();
      }
    }
    windows.displays.clear();
  }

  function relaunchDisplays() {
    closeAllDisplays();
    openAllDisplays();
  }

  function toggleDisplayFullscreen(displayId) {
    const win = windows.displays.get(String(displayId));
    if (!win || win.isDestroyed()) {
      return false;
    }
    win.setFullScreen(!win.isFullScreen());
    return win.isFullScreen();
  }

  function closeAll() {
    closeAllDisplays();
    if (windows.control && !windows.control.isDestroyed()) {
      windows.control.destroy();
    }
    windows.control = null;
  }

  return {
    createControlWindow,
    openAllDisplays,
    closeAllDisplays,
    relaunchDisplays,
    toggleDisplayFullscreen,
    closeAll,
  };
}

module.exports = {
  DISPLAY_IDS,
  createWindowManager,
};
