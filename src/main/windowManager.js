/**
 * 컨트롤·디스플레이 BrowserWindow 생성·배치·종료.
 * 논리 displayId(1~6)를 OS 모니터에 매핑하고, role 쿼리로 같은 렌더러를 역할별로 로드합니다.
 */
"use strict";

const path = require("path");
const fs = require("fs");
const { BrowserWindow, screen } = require("electron");

const DISPLAY_IDS = ["1", "2", "3", "4", "5", "6"];
const PRELOAD_PATH = path.join(__dirname, "preload.js");

/** userData/display-mapping.json — displayId → screen.getAllDisplays() 인덱스 */
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

/** 매핑 파일이 없으면 displayId 1→첫 모니터, 2→둘째… 순으로 붙입니다 */
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

/** 렌더러 베이스 URL에 role·displayId 쿼리를 붙입니다 */
function buildRoleUrl(origin, role, displayId) {
  const url = new URL(origin);
  url.searchParams.set("role", role);
  if (displayId) {
    url.searchParams.set("displayId", displayId);
  }
  return url.toString();
}

/**
 * @param {object} options
 * @param {string} options.userDataPath
 * @param {() => string} options.getOrigin
 * @param {string} options.syncWsUrl
 * @param {boolean} [options.displayFullscreen]
 */
function createWindowManager(options) {
  const windows = {
    control: null,
    displays: new Map(),
  };
  const userDataPath = options.userDataPath;
  const getOrigin = options.getOrigin;
  const syncWsUrl = options.syncWsUrl;
  const displayFullscreen = options.displayFullscreen !== false;

  /** 모든 창 공통: preload·격리·동기화 URL 인자 */
  function getWebPreferences() {
    return {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [`--lighting-sync-ws-url=${syncWsUrl}`],
    };
  }

  /** 주 모니터에 편집 UI — ?role=control */
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

  /** 지정 displayId 모니터에 출력 전용 창 — ?role=display&displayId=N */
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

  /** 연결 모니터 수와 6 중 작은 만큼 displayId 1부터 창 생성 */
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

  /** 모니터 구성이 바뀐 뒤 디스플레이 창만 다시 띄울 때 (IPC) */
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

  /** 앱 종료 시 컨트롤·디스플레이 전부 정리 */
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
