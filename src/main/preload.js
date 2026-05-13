import { contextBridge, ipcRenderer } from "electron";

function readSyncWsUrl() {
  const fromEnv = process.env.LIGHTING_SYNC_WS_URL;
  if (fromEnv) {
    return fromEnv;
  }
  const arg = process.argv.find(function (value) {
    return value.startsWith("--lighting-sync-ws-url=");
  });
  if (!arg) {
    return "";
  }
  return arg.slice("--lighting-sync-ws-url=".length);
}

contextBridge.exposeInMainWorld("SYNC_WS_URL", readSyncWsUrl());
contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  listDisplayLayouts: function () {
    return ipcRenderer.invoke("displays:listLayouts");
  },
  onDisplayLayoutsChanged: function (callback) {
    if (typeof callback !== "function") {
      return function () {};
    }
    const listener = function () {
      callback();
    };
    ipcRenderer.on("displays:layoutsChanged", listener);
    return function () {
      ipcRenderer.removeListener("displays:layoutsChanged", listener);
    };
  },
  relaunchDisplays: function () {
    return ipcRenderer.invoke("displays:relaunch");
  },
  toggleDisplayFullscreen: function (displayId) {
    return ipcRenderer.invoke("displays:toggleFullscreen", displayId);
  },
});
