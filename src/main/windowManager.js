/**
 * 컨트롤·디스플레이 BrowserWindow 생성·배치·종료.
 * 논리 displayId(top_lower, top_upper, left, right, front, rear)를 OS 모니터에 매핑하고,
 * role 쿼리로 같은 렌더러를 역할별로 로드합니다.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, screen } from "electron";
import { normalizeDisplayId } from "../shared/displayIds.js";
import {
  DISPLAY_IDS,
  getScreenForDisplayId,
  readDisplayMapping,
} from "./displayLayout.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRELOAD_PATH = path.join(__dirname, "preload.js");

const PRESET_EXPORT_SCRIPT =
  "(function(){try{if(!window.app||typeof window.app.exportPreset!=='function')return '';return JSON.stringify(window.app.exportPreset({applyToAllDisplays:true}),null,2);}catch(e){return '';}})()";

function getPrimaryDisplayId() {
  return screen.getPrimaryDisplay().id;
}

function listOutputDisplays() {
  const primaryId = getPrimaryDisplayId();
  return screen.getAllDisplays().filter(function (display) {
    return display.id !== primaryId;
  });
}

function buildDefaultPresetSavePath() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(
    d.getHours()
  )}${pad(d.getMinutes())}`;
  const name = `lighting-preset_${stamp}.json`;
  try {
    return path.join(app.getPath("documents"), name);
  } catch (_e) {
    return name;
  }
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
export function createWindowManager(options) {
  const windows = {
    control: null,
    displays: new Map(),
  };
  /** @type {null | (() => Promise<boolean>)} */
  let runControlSavePresetAs = null;
  let skipControlCloseDialog = false;
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

    async function writePresetToPath(filePath) {
      const json = await win.webContents.executeJavaScript(PRESET_EXPORT_SCRIPT);
      if (!json) {
        return false;
      }
      await fs.writeFile(filePath, json, "utf8");
      return true;
    }

    async function persistPresetExportOrAlert(filePath) {
      try {
        const ok = await writePresetToPath(filePath);
        if (!ok) {
          dialog.showErrorBox(
            "저장 실패",
            "프리셋을 가져오지 못했습니다. 잠시 후 다시 시도하세요."
          );
          return false;
        }
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        dialog.showErrorBox("저장 실패", msg);
        return false;
      }
      return true;
    }

    async function trySavePresetFlow() {
      const saveResult = await dialog.showSaveDialog(win, {
        title: "프리셋 저장",
        defaultPath: buildDefaultPresetSavePath(),
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (saveResult.canceled || !saveResult.filePath) {
        return false;
      }
      return persistPresetExportOrAlert(saveResult.filePath);
    }

    runControlSavePresetAs = trySavePresetFlow;

    let controlCloseDialogPending = false;
    win.on("close", function (event) {
      if (skipControlCloseDialog || win.isDestroyed()) {
        return;
      }
      if (controlCloseDialogPending) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      controlCloseDialogPending = true;
      dialog
        .showMessageBox(win, {
          type: "question",
          buttons: ["저장 후 종료", "저장 없이 종료", "취소"],
          defaultId: 2,
          cancelId: 2,
          title: "앱 종료",
          message: "컨트롤러 창을 닫으면 앱이 종료됩니다.",
          detail: "편집 중인 프리셋을 파일로 저장할까요?",
        })
        .then(async function (choice) {
          if (choice.response === 2) {
            return;
          }
          if (choice.response === 0) {
            const saved = await trySavePresetFlow();
            if (!saved) {
              return;
            }
          }
          skipControlCloseDialog = true;
          app.quit();
        })
        .finally(function () {
          controlCloseDialogPending = false;
        });
    });
    win.on("closed", function () {
      runControlSavePresetAs = null;
      windows.control = null;
    });
    windows.control = win;
    return win;
  }

  /** 지정 displayId 모니터에 출력 전용 창 — ?role=display&displayId=포지션키 */
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

  /** 주 모니터를 제외한 연결 모니터 수와 6 중 작은 만큼 논리 displayId 순으로 창 생성 */
  function openAllDisplays() {
    const outputDisplays = listOutputDisplays();
    const maxDisplays = Math.min(DISPLAY_IDS.length, outputDisplays.length);
    for (let i = 0; i < maxDisplays; i += 1) {
      const displayId = DISPLAY_IDS[i];
      if (!windows.displays.has(displayId)) {
        createDisplayWindow(displayId);
      }
    }
  }

  /** 모든 디스플레이 창 닫기 */
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

  /** 디스플레이 창 전체화면 토글 */
  function toggleDisplayFullscreen(displayId) {
    const key = normalizeDisplayId(displayId);
    const win = windows.displays.get(key);
    if (!win || win.isDestroyed()) {
      return false;
    }
    win.setFullScreen(!win.isFullScreen());
    return win.isFullScreen();
  }

  /** 앱 종료 시 컨트롤·디스플레이 전부 정리 */
  function closeAll() {
    skipControlCloseDialog = true;
    closeAllDisplays();
    if (windows.control && !windows.control.isDestroyed()) {
      windows.control.destroy();
    }
    windows.control = null;
  }

  async function savePresetAs() {
    if (!runControlSavePresetAs) {
      return false;
    }
    return runControlSavePresetAs();
  }

  return {
    createControlWindow,
    openAllDisplays,
    closeAllDisplays,
    relaunchDisplays,
    toggleDisplayFullscreen,
    closeAll,
    savePresetAs,
  };
}

export { DISPLAY_IDS } from "./displayLayout.js";
