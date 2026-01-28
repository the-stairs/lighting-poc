/* Panel UI bindings and events */

function $(sel) {
  return document.querySelector(sel);
}

document.addEventListener("DOMContentLoaded", () => {
  const togglePanelBtn = $("#togglePanelBtn");
  const bgBlack = $("#bg-black");
  const bgGray = $("#bg-gray");
  const bgColor = $("#bgColor");

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
  const opacitySlider = $("#opacitySlider");
  const opacityValue = $("#opacityValue");
  const opacityDebug = $("#opacityDebug");
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

    // Exposure
    exposureSlider.addEventListener("input", (e) => {
      const v = Number(e.target.value);
      exposureValue.textContent = v.toFixed(2);
      if (window.app && typeof window.app.setExposure === "function") {
        window.app.setExposure(v);
      }
    });

    // Selected light controls
    function clamp01(value, fallback = 1) {
      const v = Number(value);
      if (!Number.isFinite(v)) return fallback;
      return Math.max(0, Math.min(1, v));
    }

    function setControlsEnabled(enabled) {
      controls.setAttribute("aria-disabled", enabled ? "false" : "true");
      [
        sizeSlider,
        widthSlider,
        heightSlider,
        brightnessSlider,
        opacitySlider,
        softnessSlider,
        lightColor,
        deleteLightBtn,
      ].forEach((el) => {
        if (el) el.disabled = !enabled;
      });
      noSel.style.display = enabled ? "none" : "block";
      if (!enabled && opacityDebug) {
        opacityDebug.textContent = "selected light opacity = --";
      }
    }

    function formatFeatherLabel(uiValue, light) {
      const ui = Number(uiValue);
      if (!Number.isFinite(ui))
        return { text: "--px", title: "feather ui=-- => applied=--px (cap=--)" };
      if (!light)
        return { text: `${Math.round(ui)}px`, title: `feather ui=${ui} => applied=--px (cap=--)` };
      const cap =
        light.type === "circle"
          ? Math.max(0, light.radius || 0)
          : Math.max(0, Math.max(light.width || 0, light.height || 0) * 0.5);
      const t = clamp01(ui / 800, 0);
      const perceptual = Math.pow(t, 2.2);
      const applied = perceptual * Math.min(800, cap);
      return {
        text: `${Math.round(applied)}px`,
        title: `feather ui=${Math.round(ui)} => applied=${Math.round(
          applied
        )}px (cap=${Math.round(cap)})`,
      };
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
      const op = clamp01(light.opacity, 1);
      opacitySlider.value = op.toFixed(2);
      opacityValue.textContent = op.toFixed(2);
      if (opacityDebug) {
        opacityDebug.textContent = `selected light opacity = ${op.toFixed(2)}`;
      }
      softnessSlider.value = Math.round(light.feather || 150);
      const featherLabel = formatFeatherLabel(softnessSlider.value, light);
      softnessValue.textContent = featherLabel.text;
      softnessValue.title = featherLabel.title;
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
    opacitySlider.addEventListener("input", (e) => {
      const op = clamp01(e.target.value, 1);
      opacitySlider.value = op.toFixed(2);
      opacityValue.textContent = op.toFixed(2);
      window.app.updateSelectedLight({ opacity: op });
      if (opacityDebug) {
        opacityDebug.textContent = `selected light opacity = ${op.toFixed(2)}`;
      }
      console.log(`selected light opacity = ${op.toFixed(2)}`);
    });
    softnessSlider.addEventListener("input", (e) => {
      const v = Number(e.target.value);
      const featherLabel = formatFeatherLabel(v, window.app.getSelectedLight());
      softnessValue.textContent = featherLabel.text;
      softnessValue.title = featherLabel.title;
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

  // ===== 패널 위 입력을 p5로 보내지 않기: 버블 단계에서 전파 차단 =====
  const panelEl = document.getElementById("control-panel");
  if (panelEl) {
    const bubbleBlock = [
      "pointerdown",
      "pointerup",
      "pointermove",
      "pointercancel",
      "mousedown",
      "mouseup",
      "mousemove",
      "click",
      "dblclick",
      "touchstart",
      "touchend",
      "touchmove",
      "touchcancel",
      "contextmenu",
    ];
    bubbleBlock.forEach((type) => {
      panelEl.addEventListener(
        type,
        (e) => {
          if (document.body.classList.contains("panel-hidden")) return;
          e.stopPropagation();
        },
        false
      );
    });
    panelEl.addEventListener(
      "wheel",
      (e) => {
        if (document.body.classList.contains("panel-hidden")) return;
        e.stopPropagation();
      },
      { capture: false, passive: true }
    );
  }
  updateToggleButtonLabel();
});
