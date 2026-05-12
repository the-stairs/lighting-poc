import { spawn } from "node:child_process";
import electron from "electron";

function createElectronEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function runElectron() {
  const child = spawn(electron, ["."], {
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
