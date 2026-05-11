"use strict";

const { spawn } = require("child_process");

function createElectronEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function runElectron() {
  const child = spawn(require("electron"), ["."], {
    env: createElectronEnv(),
    stdio: "inherit",
    windowsHide: false,
  });
  child.on("exit", function (code, signal) {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

runElectron();
