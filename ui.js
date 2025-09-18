/* Panel UI bindings and events */

function $(sel) {
  return document.querySelector(sel);
}

document.addEventListener("DOMContentLoaded", () => {
  const togglePanelBtn = $("#togglePanelBtn");
  const bgBlack = $("#bg-black");
  const bgGray = $("#bg-gray");
  const bgColor = $("#bgColor");

  const blendingSlider = $("#blendingSlider");
  const blendingValue = $("#blendingValue");
  const exposureSlider = $("#exposureSlider");
  const exposureValue = $("#exposureValue");

  const noSel = $("#no-selection");
  const controls = $("#light-controls");

  const circleSizeGroup = $("#circle-size");
  const rectSizeGroup = $("#rect-size");

  const sizeSlider = $("#sizeSlider");
  const sizeValue = $("#sizeValue");
  const widthSlider = $("#widthSlider");
  const widthValue = $("#widthValue");
  const heightSlider = $("#heightSlider");
  const heightValue = $("#heightValue");
  const brightnessSlider = $("#brightnessSlider");
  const brightnessValue = $("#brightnessValue");
  const softnessSlider = $("#softnessSlider");
  const softnessValue = $("#softnessValue");
  const falloffSlider = $("#falloffSlider");
  const falloffValue = $("#falloffValue");
  const lightColor = $("#lightColor");
  const deleteLightBtn = $("#deleteLightBtn");

  // shape radios
  const shapeRadios = document.querySelectorAll('input[name="shape"]');

  function ensureAppReady(cb) {
    if (window.app) {
      cb();
      return;
    }
    window.addEventListener("app:ready", () => cb(), { once: true });
  }

  ensureAppReady(() => {
    // Background controls
    bgBlack.addEventListener("click", () => {
      bgColor.value = "#000000";
      window.app.setBackgroundColor("#000000");
    });
    bgGray.addEventListener("click", () => {
      bgColor.value = "#808080";
      window.app.setBackgroundColor("#808080");
    });
    bgColor.addEventListener("input", (e) => {
      window.app.setBackgroundColor(e.target.value);
    });

    // Shape selection for creation
    shapeRadios.forEach((r) =>
      r.addEventListener("change", (e) => {
        if (e.target.checked) window.app.setCreationShape(e.target.value);
      })
    );

    // Blending strength
    blendingSlider.addEventListener("input", (e) => {
      const val = Number(e.target.value);
      blendingValue.textContent = `${val}%`;
      window.app.setBlendingStrength(val);
    });

    // Exposure
    exposureSlider.addEventListener("input", (e) => {
      const v = Number(e.target.value);
      exposureValue.textContent = v.toFixed(2);
      if (window.app && typeof window.app.setExposure === "function") {
        window.app.setExposure(v);
      }
    });

    // Selected light controls
    function setControlsEnabled(enabled) {
      controls.setAttribute("aria-disabled", enabled ? "false" : "true");
      [
        sizeSlider,
        widthSlider,
        heightSlider,
        brightnessSlider,
        softnessSlider,
        lightColor,
        deleteLightBtn,
      ].forEach((el) => {
        if (el) el.disabled = !enabled;
      });
      noSel.style.display = enabled ? "none" : "block";
    }

    function updateVisibilityByType(light) {
      if (!light) {
        circleSizeGroup.style.display = ""; // .row -> display:flex (CSS)
        rectSizeGroup.style.display = "none";
        return;
      }
      if (light.type === "circle") {
        circleSizeGroup.style.display = ""; // show circle controls
        rectSizeGroup.style.display = "none"; // hide rect controls
      } else {
        circleSizeGroup.style.display = "none"; // hide circle controls
        rectSizeGroup.style.display = "flex"; // force show (override #rect-size{display:none})
      }
    }

    // Reflect selection to panel
    window.addEventListener("app:selected", (e) => {
      const light = e.detail;
      const enabled = !!light;
      setControlsEnabled(enabled);
      updateVisibilityByType(light);
      if (!light) return;

      if (light.type === "circle") {
        sizeSlider.value = Math.round(light.radius);
        sizeValue.textContent = sizeSlider.value;
      } else {
        widthSlider.value = Math.round(light.width);
        widthValue.textContent = widthSlider.value;
        heightSlider.value = Math.round(light.height);
        heightValue.textContent = heightSlider.value;
      }
      // reflect intensity back to UI slider using inverse gamma mapping
      const it =
        Math.max(0, Math.min(2000, Number(light.intensity) || 0)) / 2000;
      const uiVal = Math.round(Math.pow(it, 1.0 / 2.2) * 2000);
      brightnessSlider.value = uiVal;
      brightnessValue.textContent = uiVal;
      softnessSlider.value = Math.round(light.feather || 150);
      softnessValue.textContent = `${softnessSlider.value}`;
      lightColor.value = light.color;
      falloffSlider.value = (light.falloffK || 1.5).toFixed(1);
      falloffValue.textContent = `${falloffSlider.value}`;
    });

    // Inputs -> selected light
    sizeSlider.addEventListener("input", (e) => {
      const v = Number(e.target.value);
      sizeValue.textContent = v;
      window.app.updateSelectedLight({ radius: v });
    });
    widthSlider.addEventListener("input", (e) => {
      const v = Number(e.target.value);
      widthValue.textContent = v;
      window.app.updateSelectedLight({ width: v });
    });
    heightSlider.addEventListener("input", (e) => {
      const v = Number(e.target.value);
      heightValue.textContent = v;
      window.app.updateSelectedLight({ height: v });
    });
    brightnessSlider.addEventListener("input", (e) => {
      const ui = Math.max(0, Math.min(2000, Number(e.target.value)));
      brightnessValue.textContent = ui;
      const t = ui / 2000; // 0..1
      const intensity = Math.pow(t || 0, 2.2) * 2000;
      window.app.updateSelectedLight({ intensity });
    });
    softnessSlider.addEventListener("input", (e) => {
      const v = Number(e.target.value);
      softnessValue.textContent = `${v}`;
      window.app.updateSelectedLight({ feather: v });
    });
    falloffSlider.addEventListener("input", (e) => {
      const v = Number(e.target.value);
      falloffValue.textContent = `${v}`;
      window.app.updateSelectedLight({ falloffK: v });
    });
    lightColor.addEventListener("input", (e) => {
      window.app.updateSelectedLight({ color: e.target.value });
    });

    // Delete selected
    deleteLightBtn.addEventListener("click", () => {
      window.app.deleteSelectedLight();
    });

    // initialize labels
    blendingSlider.dispatchEvent(new Event("input", { bubbles: true }));
    exposureSlider.dispatchEvent(new Event("input", { bubbles: true }));
    setControlsEnabled(false);
    updateVisibilityByType(null);
  });

  // Panel toggle button and hotkey
  function updateToggleButtonLabel() {
    const hidden = document.body.classList.contains("panel-hidden");
    if (togglePanelBtn)
      togglePanelBtn.textContent = hidden ? "패널 표시 (P)" : "패널 숨기기 (P)";
  }
  function hidePanelAndClearSelection() {
    document.body.classList.add("panel-hidden");
    updateToggleButtonLabel();
    if (window.app && typeof window.app.clearSelection === "function") {
      window.app.clearSelection();
    }
  }
  if (togglePanelBtn) {
    togglePanelBtn.addEventListener("click", () => {
      const willHide = !document.body.classList.contains("panel-hidden");
      document.body.classList.toggle("panel-hidden");
      updateToggleButtonLabel();
      if (
        willHide &&
        window.app &&
        typeof window.app.clearSelection === "function"
      ) {
        window.app.clearSelection();
      }
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() !== "p") return;
    const tag = (e.target && e.target.tagName) || "";
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return; // avoid while typing
    const willHide = !document.body.classList.contains("panel-hidden");
    document.body.classList.toggle("panel-hidden");
    updateToggleButtonLabel();
    if (
      willHide &&
      window.app &&
      typeof window.app.clearSelection === "function"
    ) {
      window.app.clearSelection();
    }
  });
  updateToggleButtonLabel();
});
