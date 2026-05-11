(function () {
  const params = new URLSearchParams(window.location.search);
  const role = params.get("role");
  const nav = document.getElementById("nav-page");
  const app = document.getElementById("app-page");
  const isElectron = Boolean(window.electronAPI && window.electronAPI.isElectron);
  if (role === "control" || role === "display" || isElectron) {
    if (nav) nav.hidden = true;
    if (app) app.hidden = false;
  } else {
    if (nav) nav.hidden = false;
    if (app) app.hidden = true;
  }
})();
