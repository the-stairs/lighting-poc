/**
 * Electron 메인 프로세스 엔트리.
 * 내장 릴레이 기동 → 렌더러 URL 결정 → 컨트롤·디스플레이 창 생성 순으로 앱을 올립니다.
 */
"use strict";

const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const { startEmbeddedRelay, getRelayWsUrl } = require("./relayHost");
const { createStaticServer } = require("./staticServer");
const { createWindowManager } = require("./windowManager");

// 개발: Vite dev server. 프로덕션: dist 정적 서버 origin.
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173";
const IS_DEV = process.env.ELECTRON_DEV === "1";

let relayServer = null;
let staticServer = null;
let windowManager = null;
let rendererOrigin = "";
let isQuitting = false;

/** preload·자식 프로세스가 읽는 동기화 WebSocket URL 환경 변수 */
function setSyncEnv(syncWsUrl) {
  process.env.LIGHTING_SYNC_WS_URL = syncWsUrl;
}

/** 각 BrowserWindow가 로드할 렌더러 베이스 URL */
async function resolveRendererOrigin() {
  if (IS_DEV) {
    return DEV_SERVER_URL;
  }
  const distDir = path.join(__dirname, "..", "..", "dist");
  staticServer = await createStaticServer(distDir);
  return staticServer.origin;
}

/** 컨트롤·디스플레이 창이 공유하는 로컬 WebSocket 릴레이 */
async function startRelay() {
  relayServer = await startEmbeddedRelay({ host: "127.0.0.1", port: 8787 });
  return getRelayWsUrl(relayServer);
}

/** 렌더러 preload → 메인 IPC (디스플레이 재시작·전체화면) */
function registerIpcHandlers() {
  ipcMain.handle("displays:relaunch", function () {
    if (!windowManager) {
      return false;
    }
    windowManager.relaunchDisplays();
    return true;
  });
  ipcMain.handle("displays:toggleFullscreen", function (_event, displayId) {
    if (!windowManager) {
      return false;
    }
    return windowManager.toggleDisplayFullscreen(displayId);
  });
}

/** 릴레이·렌더러 준비 후 컨트롤 1개와 연결된 모니터 수만큼 디스플레이 창 */
async function createAppWindows() {
  const syncWsUrl = await startRelay();
  setSyncEnv(syncWsUrl);
  rendererOrigin = await resolveRendererOrigin();
  windowManager = createWindowManager({
    userDataPath: app.getPath("userData"),
    getOrigin: function () {
      return rendererOrigin;
    },
    syncWsUrl,
    displayFullscreen: true,
  });
  windowManager.createControlWindow();
  windowManager.openAllDisplays();
}

/** 종료 시 창·정적 서버·릴레이를 순서대로 정리 */
async function shutdown() {
  if (windowManager) {
    windowManager.closeAll();
    windowManager = null;
  }
  if (staticServer) {
    await staticServer.close();
    staticServer = null;
  }
  if (relayServer) {
    await relayServer.close();
    relayServer = null;
  }
}

app.whenReady().then(async function () {
  registerIpcHandlers();
  await createAppWindows();
});

// Windows/Linux: 모든 창이 닫히면 앱 종료. macOS는 독 아이콘 유지.
app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// quit 직전에 서버·창을 닫고 나서 실제 종료 (비동기 shutdown 1회만)
app.on("before-quit", function (event) {
  if (isQuitting) {
    return;
  }
  event.preventDefault();
  isQuitting = true;
  shutdown()
    .catch(function () {
      /* ignore */
    })
    .finally(function () {
      app.quit();
    });
});

// macOS: 독에서 앱을 다시 열면 창이 없을 때만 재생성
app.on("activate", function () {
  if (BrowserWindow.getAllWindows().length === 0 && windowManager) {
    windowManager.createControlWindow();
    windowManager.openAllDisplays();
  }
});
