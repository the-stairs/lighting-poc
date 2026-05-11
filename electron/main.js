"use strict";

const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const { startEmbeddedRelay, getRelayWsUrl } = require("./relayHost");
const { createStaticServer } = require("./staticServer");
const { createWindowManager } = require("./windowManager");

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173";
const IS_DEV = process.env.ELECTRON_DEV === "1";

let relayServer = null;
let staticServer = null;
let windowManager = null;
let rendererOrigin = "";
let isQuitting = false;

function setSyncEnv(syncWsUrl) {
  process.env.LIGHTING_SYNC_WS_URL = syncWsUrl;
}

async function resolveRendererOrigin() {
  if (IS_DEV) {
    return DEV_SERVER_URL;
  }
  const distDir = path.join(__dirname, "..", "dist");
  staticServer = await createStaticServer(distDir);
  return staticServer.origin;
}

async function startRelay() {
  relayServer = await startEmbeddedRelay({ host: "127.0.0.1", port: 8787 });
  return getRelayWsUrl(relayServer);
}

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

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

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

app.on("activate", function () {
  if (BrowserWindow.getAllWindows().length === 0 && windowManager) {
    windowManager.createControlWindow();
    windowManager.openAllDisplays();
  }
});
