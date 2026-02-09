(function () {
  const params = new URLSearchParams(window.location.search);
  const role = params.get("role");
  const nav = document.getElementById("nav-page");
  const app = document.getElementById("app-page");
  if (role === "control" || role === "display") {
    if (nav) nav.hidden = true;
    if (app) app.hidden = false;
  } else {
    if (nav) nav.hidden = false;
    if (app) app.hidden = true;
  }
})();
