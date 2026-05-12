import { app, dialog } from "electron";
import electronUpdater from "electron-updater";

const autoUpdater = electronUpdater.autoUpdater;

function logUpdate(message) {
  console.log("[update]", message);
}

function confirmInstall() {
  const choice = dialog.showMessageBoxSync({
    type: "info",
    buttons: ["재시작", "나중에"],
    defaultId: 0,
    message: "새 버전이 준비되었습니다. 지금 재시작할까요?",
  });
  if (choice === 0) {
    autoUpdater.quitAndInstall();
  }
}

function bindUpdaterEvents() {
  autoUpdater.on("update-available", function (info) {
    logUpdate("available " + info.version);
  });
  autoUpdater.on("update-downloaded", confirmInstall);
  autoUpdater.on("error", function (err) {
    logUpdate(String(err && err.message ? err.message : err));
  });
}

export function initAutoUpdater() {
  if (!app.isPackaged) {
    return;
  }
  autoUpdater.autoDownload = true;
  bindUpdaterEvents();
  autoUpdater.checkForUpdates().catch(function (err) {
    logUpdate(String(err && err.message ? err.message : err));
  });
}
