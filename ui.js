/* Panel UI bindings and events */

function $(sel) {
  return document.querySelector(sel);
}

document.addEventListener("DOMContentLoaded", () => {
  const togglePanelBtn = $("#togglePanelBtn");
  const toggleDockBtn = $("#toggleDockBtn");
  const resetAllDisplaysBtn = $("#resetAllDisplaysBtn");
  const panelDockState = $("#panelDockState");
  const bgBlack = $("#bg-black");
  const bgWhite = $("#bg-white");
  const bgGray = $("#bg-gray");
  const bgColor = $("#bgColor");

  const exposureSlider = $("#exposureSlider");
  const exposureValue = $("#exposureValue");
  const exposureMinus = $("#exposureMinus");
  const exposurePlus = $("#exposurePlus");
  const falloffCSlider = $("#falloffCSlider");
  const falloffCValue = $("#falloffCValue");

  const noSel = $("#no-selection");
  const controls = $("#light-controls");
  const selectedType = $("#selectedType");

  const circleSizeGroup = $("#circle-size");
  const rectSizeGroup = $("#rect-size");
  const ellipseControls = $("#ellipse-controls");

  const sizeSlider = $("#sizeSlider");
  const sizeValue = $("#sizeValue");
  const sizeMinus = $("#sizeMinus");
  const sizePlus = $("#sizePlus");
  const sizeXSlider = $("#sizeXSlider");
  const sizeXValue = $("#sizeXValue");
  const sizeYSlider = $("#sizeYSlider");
  const sizeYValue = $("#sizeYValue");
  const makeCircleByXBtn = $("#makeCircleByXBtn");
  const makeCircleByYBtn = $("#makeCircleByYBtn");
  const widthSlider = $("#widthSlider");
  const widthValue = $("#widthValue");
  const widthMinus = $("#widthMinus");
  const widthPlus = $("#widthPlus");
  const heightSlider = $("#heightSlider");
  const heightValue = $("#heightValue");
  const heightMinus = $("#heightMinus");
  const heightPlus = $("#heightPlus");
  const brightnessSlider = $("#brightnessSlider");
  const brightnessValue = $("#brightnessValue");
  const brightnessMinus = $("#brightnessMinus");
  const brightnessPlus = $("#brightnessPlus");
  const opacitySlider = $("#opacitySlider");
  const opacityValue = $("#opacityValue");
  const opacityMinus = $("#opacityMinus");
  const opacityPlus = $("#opacityPlus");
  const opacityDebug = $("#opacityDebug");
  const softnessSlider = $("#softnessSlider");
  const softnessValue = $("#softnessValue");
  const softnessMinus = $("#softnessMinus");
  const softnessPlus = $("#softnessPlus");
  const falloffSlider = $("#falloffSlider");
  const falloffValue = $("#falloffValue");
  const falloffMinus = $("#falloffMinus");
  const falloffPlus = $("#falloffPlus");
  const falloffHint = $("#falloffHint");
  const blockerColorHint = $("#blockerColorHint");
  const timerStartInput = $("#timerStart");
  const timerDurationInput = $("#timerDuration");
  const falloffCMinus = $("#falloffCMinus");
  const falloffCPlus = $("#falloffCPlus");
  const lightColor = $("#lightColor");
  const lightColorR = $("#lightColorR");
  const lightColorG = $("#lightColorG");
  const lightColorB = $("#lightColorB");
  const deleteLightBtn = $("#deleteLightBtn");
  const fitCanvasBtn = $("#fitCanvasBtn");
  const exportBtn = $("#exportPresetBtn");
  const presetFileName = $("#presetFileName");
  const importBtn = $("#importPresetBtn");
  const importFile = $("#importPresetFile");
  const btnBringToFront = $("#btnBringToFront");
  const btnSendToBack = $("#btnSendToBack");
  const layerList = $("#layerList");
  const addLightBtn = $("#addLightBtn");
  const addFilterBtn = $("#addFilterBtn");
  const addSolidBtn = $("#addSolidBtn");
  const opacityLabel = $("#opacityLabel");

  const displaySelect = $("#displaySelect");
  const modeEditBtn = $("#modeEditBtn");
  const modeShootBtn = $("#modeShootBtn");
  const shootStartBtn = $("#shootStartBtn");
  const shootControls = document.querySelector(".shoot-controls");
  const shootModeHint = document.getElementById("shootModeHint");
  const canvasContainer = document.getElementById("canvas-container");
  let selectionIndicator = null;

  function syncModeButtons(mode) {
    if (modeEditBtn) {
      modeEditBtn.classList.toggle("active", mode === "edit");
    }
    if (modeShootBtn) {
      modeShootBtn.classList.toggle("active", mode === "shoot");
    }
  }

  function applyModeToUi(mode) {
    syncModeButtons(mode);
    const body = document.body;
    if (!body) return;
    const isShoot = mode === "shoot";
    if (isShoot) {
      body.classList.add("panel-hidden");
    } else {
      body.classList.remove("panel-hidden");
    }
    if (shootStartBtn) {
      shootStartBtn.disabled = !isShoot;
    }
    if (shootModeHint) {
      shootModeHint.style.display = isShoot ? "block" : "none";
      if (isShoot) {
        shootModeHint.textContent =
          '촬영 모드입니다. 상단의 "촬영 시작(F5)" 버튼이나 F5 키로 타이머를 시작하세요.';
      }
    }
  }

  // shape radios
  const shapeRadios = document.querySelectorAll('input[name="shape"]');

  if (displaySelect) {
    displaySelect.addEventListener("change", () => {
      const targetId = displaySelect.value || "all";
      dispatchEvent(
        new CustomEvent("app:displayTargetChanged", { detail: { targetId } })
      );
      if (window.app && typeof window.app.setEditTarget === "function") {
        window.app.setEditTarget(targetId);
      }
    });
  }

  function ensureAppReady(cb) {
    if (window.app) {
      cb();
      return;
    }
    window.addEventListener("app:ready", () => cb(), { once: true });
  }

  ensureAppReady(() => {
    if (canvasContainer && !selectionIndicator) {
      const el = document.createElement("div");
      el.className = "selection-indicator";
      el.textContent = "✔";
      el.setAttribute("aria-hidden", "true");
      canvasContainer.appendChild(el);
      selectionIndicator = el;
    }
    function setSliderBounds(slider, { min, max, step }) {
      if (!slider) return;
      if (min != null) slider.min = String(min);
      if (max != null) slider.max = String(max);
      if (step != null) slider.step = String(step);
    }

    function syncSizeBoundsByCanvas(canvasW, canvasH) {
      const w = Math.max(1, Number(canvasW) || 1);
      const h = Math.max(1, Number(canvasH) || 1);
      const rectMaxW = Math.max(10, w * 2);
      const rectMaxH = Math.max(10, h * 2);
      const diag = Math.sqrt(w * w + h * h);
      const radiusMax = Math.max(10, diag);

      setSliderBounds(widthSlider, { min: 10, max: rectMaxW, step: 1 });
      setSliderBounds(heightSlider, { min: 10, max: rectMaxH, step: 1 });
      setSliderBounds(sizeSlider, { min: 10, max: radiusMax, step: 1 });
    }

    function syncFalloffCFromState() {
      if (!falloffCSlider || !falloffCValue || !window.app) return;
      const state = window.app.getState && window.app.getState();
      const v = Number(state && state.falloffC);
      if (!Number.isFinite(v)) return;
      falloffCSlider.value = v.toFixed(1);
      falloffCValue.textContent = v.toFixed(1);
    }
    function makeDefaultPresetFilename() {
      return `lighting-preset_${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.json`;
    }

    function sanitizeFilename(raw) {
      const name = String(raw ?? "").trim();
      if (!name) return ""; // 빈칸이면 디폴트 fallback

      // Windows/브라우저에서 문제 되는 문자들 제거/치환
      const safe = name
        .replace(/[/\\?%*:|"<>]/g, "-")
        .replace(/\s+/g, " ")
        .replace(/[. ]+$/g, ""); // 끝에 점/공백 제거

      return safe;
    }

    function stepSlider(sliderEl, delta, stepOverride, multiplier = 1) {
      if (!sliderEl) return;
      const cur = Number(sliderEl.value);
      if (!Number.isFinite(cur)) return;
      const stepValue = (stepOverride ?? Number(sliderEl.step || "")) || 1;
      const lo = sliderEl.min !== "" ? Number(sliderEl.min) : -Infinity;
      const hi = sliderEl.max !== "" ? Number(sliderEl.max) : Infinity;
      const decimals = String(stepValue).includes(".")
        ? String(stepValue).split(".")[1].length
        : 0;
      const scale = Math.pow(10, decimals);
      const curI = Math.round(cur * scale);
      const stepI = Math.round(stepValue * scale);
      const nextI = curI + delta * stepI * multiplier;
      const loI = Number.isFinite(lo) ? Math.round(lo * scale) : -Infinity;
      const hiI = Number.isFinite(hi) ? Math.round(hi * scale) : Infinity;
      const clampedI = Math.max(loI, Math.min(hiI, nextI));
      const next = clampedI / scale;
      sliderEl.value = decimals > 0 ? next.toFixed(decimals) : String(next);
      sliderEl.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function bindStepButtons({ minusBtn, plusBtn, slider, step = 1 }) {
      if (!slider) return;
      slider.step = String(step);
      const handleClick = (dir) => (e) => {
        const mult = e && e.shiftKey ? 10 : 1;
        stepSlider(slider, dir, step, mult);
      };
      if (minusBtn) minusBtn.addEventListener("click", handleClick(-1));
      if (plusBtn) plusBtn.addEventListener("click", handleClick(1));

      const hold = (btn, dir) => {
        if (!btn) return;
        let t = null;
        let i = null;
        const stop = () => {
          if (t) clearTimeout(t);
          if (i) clearInterval(i);
          t = null;
          i = null;
          window.removeEventListener("pointerup", stop, true);
          window.removeEventListener("pointercancel", stop, true);
        };
        const start = (e) => {
          const mult = e && e.shiftKey ? 10 : 1;
          stepSlider(slider, dir, step, mult);
          t = setTimeout(() => {
            i = setInterval(() => stepSlider(slider, dir, step, mult), 60);
          }, 250);
          window.addEventListener("pointerup", stop, true);
          window.addEventListener("pointercancel", stop, true);
        };
        btn.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          start(e);
        });
        btn.addEventListener("pointerup", stop);
        btn.addEventListener("pointercancel", stop);
        btn.addEventListener("pointerleave", stop);
      };

      hold(minusBtn, -1);
      hold(plusBtn, 1);
    }

    function enableOutputNumberEdit(outputEl, sliderEl, opts = {}) {
      if (!outputEl || !sliderEl) return;

      const getDecimalsFromStep = () => {
        const s = String(sliderEl.step || "");
        return s.includes(".") ? s.split(".")[1].length : 0;
      };

      const clamp = (v) => {
        const lo = sliderEl.min !== "" ? Number(sliderEl.min) : -Infinity;
        const hi = sliderEl.max !== "" ? Number(sliderEl.max) : Infinity;
        return Math.max(lo, Math.min(hi, v));
      };

      const snapToStep = (v) => {
        const step = Number(sliderEl.step || "");
        if (!Number.isFinite(step) || step <= 0) return v;
        const stepDecimals = getDecimalsFromStep();
        const decimals = Math.max(opts.decimals ?? 0, stepDecimals);
        const scale = Math.pow(10, decimals);
        const lo = sliderEl.min !== "" ? Number(sliderEl.min) : 0;
        const base = Number.isFinite(lo) ? lo : 0;
        const vI = Math.round(v * scale);
        const baseI = Math.round(base * scale);
        const stepI = Math.max(1, Math.round(step * scale));
        const snappedI = baseI + Math.round((vI - baseI) / stepI) * stepI;
        return snappedI / scale;
      };

      const commit = (input) => {
        const raw = Number(input.value);
        if (!Number.isFinite(raw)) return;
        const decimals = opts.decimals ?? getDecimalsFromStep();
        let next = clamp(raw);
        next = snapToStep(next);
        next = clamp(next);
        sliderEl.value =
          decimals > 0 ? next.toFixed(decimals) : String(Math.round(next));
        sliderEl.dispatchEvent(new Event("input", { bubbles: true }));
      };

      outputEl.style.cursor = "pointer";
      outputEl.title =
        (outputEl.title ? `${outputEl.title}\n` : "") +
        "더블클릭해서 직접 입력";

      outputEl.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (sliderEl.disabled) return;
        if (outputEl.dataset.editing === "1") return;
        outputEl.dataset.editing = "1";

        const decimals = opts.decimals ?? getDecimalsFromStep();
        const input = document.createElement("input");
        input.type = "number";
        input.className = "inline-number overlay-number";
        input.min = sliderEl.min ?? "";
        input.max = sliderEl.max ?? "";
        input.step = sliderEl.step ?? "1";
        input.value = Number(sliderEl.value).toFixed(decimals);

        document.body.appendChild(input);

        const positionOverlay = () => {
          const rect = outputEl.getBoundingClientRect();
          input.style.position = "fixed";
          input.style.left = `${rect.left}px`;
          input.style.top = `${rect.top}px`;
          input.style.width = `${rect.width}px`;
          input.style.height = `${rect.height}px`;
          input.style.zIndex = "999999";
        };

        positionOverlay();
        outputEl.style.visibility = "hidden";

        let finished = false;
        const cleanup = (apply) => {
          if (finished) return;
          finished = true;
          window.removeEventListener("scroll", positionOverlay, true);
          window.removeEventListener("resize", positionOverlay);
          if (apply) commit(input);
          input.remove();
          outputEl.style.visibility = "";
          delete outputEl.dataset.editing;
        };

        window.addEventListener("scroll", positionOverlay, true);
        window.addEventListener("resize", positionOverlay);

        ["pointerdown", "mousedown", "click", "dblclick"].forEach((t) => {
          input.addEventListener(t, (ev) => ev.stopPropagation());
        });

        input.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") cleanup(true);
          if (ev.key === "Escape") cleanup(false);
        });
        input.addEventListener("blur", () => cleanup(true), { once: true });

        input.focus();
        input.select();
      });
    }

    // Preset: Export (always all displays)
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        if (!window.app || typeof window.app.exportPreset !== "function") {
          alert("앱이 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
          return;
        }
        const preset = window.app.exportPreset({
          applyToAllDisplays: true,
        });
        const json = JSON.stringify(preset, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const rawName = presetFileName ? presetFileName.value : "";
        const userTyped = String(rawName ?? "").trim().length > 0;
        let filename = sanitizeFilename(rawName);

        // ✅ 빈칸이면 디폴트 파일명
        if (!filename) {
          if (userTyped) {
            console.warn("Invalid filename. Falling back to default.");
          }
          filename = makeDefaultPresetFilename();
        }
        // ✅ 확장자 자동 보정
        if (!filename.toLowerCase().endsWith(".json")) filename += ".json";

        const a = document.createElement("a");
        a.href = url;
        a.download = filename;

        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
    }

    if (presetFileName && exportBtn) {
      presetFileName.addEventListener("keydown", (e) => {
        if (e.key === "Enter") exportBtn.click();
      });
    }

    // Preset: Import (open file picker, always all displays)
    if (importBtn && importFile) {
      importBtn.addEventListener("click", () => importFile.click());
      importFile.addEventListener("change", async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        try {
          const text = await file.text();
          const obj = JSON.parse(text);
          const ok = window.app.importPreset(obj, {
            applyToAllDisplays: true,
          });
          if (!ok) alert("프리셋 형식이 올바르지 않습니다.");
          syncFalloffCFromState();
        } catch (err) {
          console.error(err);
          alert("프리셋을 불러오지 못했습니다. JSON 형식인지 확인하세요.");
        } finally {
          e.target.value = "";
        }
      });
    }

    // Background controls
    if (bgBlack) {
      bgBlack.addEventListener("click", () => {
        if (bgColor) bgColor.value = "#000000";
        window.app.setBackgroundColor("#000000");
      });
    }
    if (bgWhite) {
      bgWhite.addEventListener("click", () => {
        if (bgColor) bgColor.value = "#ffffff";
        window.app.setBackgroundColor("#ffffff");
      });
    }
    if (bgGray) {
      bgGray.addEventListener("click", () => {
        if (bgColor) bgColor.value = "#808080";
        window.app.setBackgroundColor("#808080");
      });
    }
    if (bgColor) {
      bgColor.addEventListener("input", (e) => {
        window.app.setBackgroundColor(e.target.value);
      });
    }

    // Shape selection for creation
    shapeRadios.forEach((r) =>
      r.addEventListener("change", (e) => {
        if (e.target.checked) window.app.setCreationShape(e.target.value);
      })
    );

    function addLayerOfType(type) {
      if (!window.app || typeof window.app.addLayerAtCenter !== "function")
        return;
      if (typeof window.app.setCreationType === "function") {
        window.app.setCreationType(type);
      }
      window.app.addLayerAtCenter(type);
    }

    if (addLightBtn) {
      addLightBtn.addEventListener("click", () => addLayerOfType("LIGHT"));
    }
    if (addFilterBtn) {
      addFilterBtn.addEventListener("click", () => addLayerOfType("FILTER"));
    }
    if (addSolidBtn) {
      addSolidBtn.addEventListener("click", () => addLayerOfType("SOLID"));
    }

    // Exposure
    if (exposureSlider) {
      exposureSlider.addEventListener("input", (e) => {
        const v = Number(e.target.value);
        if (exposureValue) exposureValue.textContent = v.toFixed(2);
        if (window.app && typeof window.app.setExposure === "function") {
          window.app.setExposure(v);
        }
      });
    }
    if (falloffCSlider) {
      falloffCSlider.addEventListener("input", (e) => {
        const v = Number(e.target.value);
        if (falloffCValue) falloffCValue.textContent = v.toFixed(1);
        if (window.app && typeof window.app.setFalloffC === "function") {
          window.app.setFalloffC(v);
        }
      });
    }

    bindStepButtons({
      minusBtn: exposureMinus,
      plusBtn: exposurePlus,
      slider: exposureSlider,
      step: 0.01,
    });

    bindStepButtons({
      minusBtn: falloffCMinus,
      plusBtn: falloffCPlus,
      slider: falloffCSlider,
      step: 0.1,
    });

    // Selected light controls
    function clamp01(value, fallback = 1) {
      const v = Number(value);
      if (!Number.isFinite(v)) return fallback;
      return Math.max(0, Math.min(1, v));
    }

    function setControlsEnabled(enabled) {
      const state = window.app && window.app.getState && window.app.getState();
      const forceOff = state && state.mode === "shoot";
      const finalEnabled = enabled && !forceOff;
      if (controls) {
        controls.setAttribute("aria-disabled", finalEnabled ? "false" : "true");
      }
      [
        selectedType,
        sizeMinus,
        sizeSlider,
        sizePlus,
        sizeXSlider,
        sizeYSlider,
        makeCircleByXBtn,
        makeCircleByYBtn,
        widthMinus,
        widthSlider,
        widthPlus,
        heightMinus,
        heightSlider,
        heightPlus,
        brightnessMinus,
        brightnessSlider,
        brightnessPlus,
        opacityMinus,
        opacitySlider,
        opacityPlus,
        softnessMinus,
        softnessSlider,
        softnessPlus,
        falloffMinus,
        falloffSlider,
        falloffPlus,
        timerStartInput,
        timerDurationInput,
        lightColor,
        lightColorR,
        lightColorG,
        lightColorB,
        deleteLightBtn,
        fitCanvasBtn,
        btnBringToFront,
        btnSendToBack,
      ].forEach((el) => {
        if (el) el.disabled = !finalEnabled;
      });
      if (noSel) noSel.style.display = finalEnabled ? "none" : "block";
      if (!finalEnabled && opacityDebug) {
        opacityDebug.textContent = "selected light opacity = --";
      }
      if (!finalEnabled && falloffHint) {
        falloffHint.style.display = "none";
      }
      if (!finalEnabled && blockerColorHint) {
        blockerColorHint.style.display = "none";
      }
    }

    function hexToRgb(hex) {
      const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
      if (!m) return null;
      const intVal = parseInt(m[1], 16);
      return {
        r: (intVal >> 16) & 255,
        g: (intVal >> 8) & 255,
        b: intVal & 255,
      };
    }

    function rgbToHex(r, g, b) {
      const toByte = (v) => {
        const n = Math.max(0, Math.min(255, Number(v) || 0));
        return n.toString(16).padStart(2, "0");
      };
      return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
    }

    function formatFeatherLabel(uiValue, light) {
      const ui = Number(uiValue);
      if (!Number.isFinite(ui))
        return {
          text: "--px",
          title: "feather ui=-- => applied=--px (cap=--)",
        };
      if (!light)
        return {
          text: `${Math.round(ui)}px`,
          title: `feather ui=${ui} => applied=--px (cap=--)`,
        };
      const cap =
        light.shape === "circle"
          ? Math.max(
              0,
              (light.radius || 0) * Math.max(light.sizeX || 1, light.sizeY || 1)
            )
          : Math.max(0, Math.max(light.width || 0, light.height || 0) * 0.5);
      const FEATHER_UI_MAX = 1600;
      const FEATHER_MAX_MULTIPLIER = 3.5;
      const t = clamp01(ui / FEATHER_UI_MAX, 0);
      const perceptual = Math.pow(t, 1.0);
      let applied = perceptual * Math.min(FEATHER_UI_MAX, cap);
      if (t >= 0.85) {
        applied = Math.max(applied, perceptual * cap * FEATHER_MAX_MULTIPLIER);
      }
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
        if (ellipseControls) ellipseControls.style.display = "none";
        return;
      }
      if (light.shape === "circle") {
        circleSizeGroup.style.display = ""; // show circle controls
        rectSizeGroup.style.display = "none"; // hide rect controls
        if (ellipseControls) ellipseControls.style.display = "flex";
      } else {
        circleSizeGroup.style.display = "none"; // hide circle controls
        rectSizeGroup.style.display = "flex"; // force show (override #rect-size{display:none})
        if (ellipseControls) ellipseControls.style.display = "none";
      }
    }

    function updateFalloffHint(light, featherUiValue) {
      if (!falloffHint) return;
      if (!light) {
        falloffHint.style.display = "none";
        return;
      }
      const featherUi = Number(featherUiValue);
      falloffHint.style.display = featherUi === 0 ? "block" : "none";
    }

    function normalizeLayerType(type) {
      const s = String(type || "")
        .trim()
        .toUpperCase();
      if (s === "FILTER" || s === "SOLID" || s === "LIGHT") return s;
      return "LIGHT";
    }

    function updateTypeUi(layerType) {
      const t = normalizeLayerType(layerType);
      if (opacityLabel) {
        if (t === "FILTER") {
          opacityLabel.textContent = "Strength";
          opacityLabel.title =
            "Filter에서 흰색은 투과 100%에 가까워 효과가 거의 없을 수 있어요.\n흰 판이 필요하면 Solid를 사용하세요.";
        } else if (t === "SOLID") {
          opacityLabel.textContent = "Opacity";
          opacityLabel.title = "";
        } else {
          opacityLabel.textContent = "Intensity";
          opacityLabel.title = "";
        }
      }
      if (blockerColorHint) {
        blockerColorHint.style.display = t === "FILTER" ? "block" : "none";
      }
    }

    let dragId = null;

    function renderLayerList(lights, selectedId) {
      if (!layerList) return;
      layerList.innerHTML = "";
      if (!Array.isArray(lights) || lights.length === 0) {
        const empty = document.createElement("div");
        empty.className = "muted small";
        empty.textContent = "레이어 없음";
        layerList.appendChild(empty);
        return;
      }

      for (let i = lights.length - 1; i >= 0; i--) {
        const light = lights[i];
        const row = document.createElement("div");
        row.className = "layer-row";
        row.dataset.id = light.id;
        row.draggable = true;
        if (selectedId && light.id === selectedId) {
          row.classList.add("selected");
        }

        const label = document.createElement("div");
        label.className = "layer-label";
        const layerType = normalizeLayerType(light.type);
        const shape = light.shape === "rect" ? "Rect" : "Circle";
        const titleText = `${layerType} / ${shape} / ${light.id || ""}`;
        row.title = titleText;
        label.title = titleText;
        const typeBadge = document.createElement("span");
        typeBadge.className = "layer-badge layer-badge-type";
        typeBadge.textContent = layerType;
        if (layerType === "SOLID") {
          typeBadge.title = "Solid · Over";
        } else if (layerType === "FILTER") {
          typeBadge.title = "Filter · Multiply";
        } else {
          typeBadge.title = "Light · Add";
        }
        const shapeBadge = document.createElement("span");
        shapeBadge.className = "layer-badge layer-badge-shape";
        shapeBadge.textContent = light.shape === "rect" ? "□" : "○";
        shapeBadge.title = light.shape === "rect" ? "Rect" : "Circle";
        const idText = document.createElement("span");
        const shortId = light.id ? light.id.slice(-4) : "";
        idText.textContent = shortId ? `#${shortId}` : "";
        label.appendChild(typeBadge);
        label.appendChild(shapeBadge);
        label.appendChild(idText);

        const vis = document.createElement("button");
        vis.type = "button";
        vis.className = "layer-visibility";
        const isHidden =
          typeof light.opacity === "number" && light.opacity <= 0.01;
        vis.textContent = "👁";
        if (isHidden) {
          vis.classList.add("is-hidden");
          vis.title = "보이기";
        } else {
          vis.title = "숨기기";
        }

        vis.addEventListener("pointerdown", (e) => e.stopPropagation());
        vis.addEventListener("mousedown", (e) => e.stopPropagation());
        vis.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!window.app) return;
          if (typeof window.app.selectLightById === "function" && light.id) {
            window.app.selectLightById(light.id);
          }
          if (typeof window.app.updateSelectedLight === "function") {
            window.app.updateSelectedLight({ toggleVisibility: true });
          }
        });

        const del = document.createElement("button");
        del.type = "button";
        del.className = "layer-delete";
        del.dataset.action = "delete";
        del.textContent = "🗑";
        del.title = "삭제";

        del.addEventListener("pointerdown", (e) => e.stopPropagation());
        del.addEventListener("mousedown", (e) => e.stopPropagation());
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          if (window.app && typeof window.app.selectLightById === "function") {
            window.app.selectLightById(light.id);
          }
          if (
            window.app &&
            typeof window.app.deleteSelectedLight === "function"
          ) {
            window.app.deleteSelectedLight();
          }
        });

        row.addEventListener("click", () => {
          if (window.app && typeof window.app.selectLightById === "function") {
            window.app.selectLightById(light.id);
          }
        });

        row.addEventListener("dragstart", (e) => {
          dragId = light.id;
          row.classList.add("dragging");
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", dragId);
          }
        });

        row.addEventListener("dragend", () => {
          dragId = null;
          row.classList.remove("dragging");
          row.classList.remove("drag-over");
        });

        row.addEventListener("dragover", (e) => {
          if (!dragId) return;
          e.preventDefault();
          row.classList.add("drag-over");
        });

        row.addEventListener("dragleave", () => {
          row.classList.remove("drag-over");
        });

        row.addEventListener("drop", (e) => {
          e.preventDefault();
          row.classList.remove("drag-over");
          const targetId = light.id;
          if (!dragId || !targetId || dragId === targetId) return;
          if (
            window.app &&
            typeof window.app.reorderLightsById === "function"
          ) {
            const rect = row.getBoundingClientRect();
            const placeUi =
              e.clientY < rect.top + rect.height / 2 ? "before" : "after";
            // UI list is rendered in reverse (top = last in array), so invert before/after.
            const placeForArray = placeUi === "before" ? "after" : "before";
            window.app.reorderLightsById(dragId, targetId, placeForArray);
          }
          dragId = null;
        });

        row.appendChild(label);
        row.appendChild(vis);
        row.appendChild(del);
        layerList.appendChild(row);
      }
    }

    function hideSelectionIndicator() {
      if (!selectionIndicator) return;
      selectionIndicator.style.display = "none";
    }

    function updateSelectionIndicator(light) {
      if (!selectionIndicator || !canvasContainer) return;
      if (!light) {
        hideSelectionIndicator();
        return;
      }
      if (document.body.classList.contains("role-display")) {
        hideSelectionIndicator();
        return;
      }
      const state =
        window.app && typeof window.app.getState === "function"
          ? window.app.getState()
          : null;
      if (!state || state.mode !== "edit" || state.shootPlaying) {
        hideSelectionIndicator();
        return;
      }
      selectionIndicator.style.display = "flex";
      selectionIndicator.style.left = `${light.x}px`;
      selectionIndicator.style.top = `${light.y}px`;
    }

    // Reflect selection to panel
    window.addEventListener("app:selected", (e) => {
      const light = e.detail;
      const enabled = !!light;
      setControlsEnabled(enabled);
      updateVisibilityByType(light);
      updateSelectionIndicator(light);
      if (!light) {
        const state = window.app.getState && window.app.getState();
        if (state) renderLayerList(state.lights, state.selectedLightId);
        return;
      }
      if (selectedType) {
        selectedType.value = normalizeLayerType(light.type);
      }
      updateTypeUi(light.type);
      if (typeof window.app.setCreationType === "function") {
        window.app.setCreationType(light.type);
      }

      if (light.shape === "circle") {
        sizeSlider.value = Math.round(light.radius);
        sizeValue.textContent = sizeSlider.value;
        const sx = Number(light.sizeX) || 1;
        const sy = Number(light.sizeY) || 1;
        if (sizeXSlider) sizeXSlider.value = sx.toFixed(2);
        if (sizeXValue) sizeXValue.textContent = sx.toFixed(2);
        if (sizeYSlider) sizeYSlider.value = sy.toFixed(2);
        if (sizeYValue) sizeYValue.textContent = sy.toFixed(2);
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
      const rgb = hexToRgb(light.color);
      if (rgb) {
        if (lightColorR) lightColorR.value = String(rgb.r);
        if (lightColorG) lightColorG.value = String(rgb.g);
        if (lightColorB) lightColorB.value = String(rgb.b);
      }
      updateTypeUi(light.type);
      falloffSlider.value = (light.falloffK || 1.5).toFixed(1);
      falloffValue.textContent = `${falloffSlider.value}`;
      updateFalloffHint(light, softnessSlider.value);
      if (timerStartInput) {
        const s = Number.isFinite(light.startSec) ? light.startSec : 0;
        timerStartInput.value = String(s);
      }
      if (timerDurationInput) {
        const d = Number.isFinite(light.durationSec) ? light.durationSec : 1;
        timerDurationInput.value = String(d);
      }
      const state = window.app.getState && window.app.getState();
      if (state) renderLayerList(state.lights, state.selectedLightId);
    });

    // Inputs -> selected light
    if (sizeSlider) {
      sizeSlider.addEventListener("input", (e) => {
        const v = Number(e.target.value);
        if (sizeValue) sizeValue.textContent = v;
        const l = window.app.getSelectedLight();
        if (!l) return;
        if (l.shape === "circle") {
          window.app.updateSelectedLight({ radius: v });
        }
      });
    }
    if (sizeXSlider) {
      sizeXSlider.addEventListener("input", (e) => {
        const v = Math.max(0.1, Math.min(3, Number(e.target.value)));
        if (sizeXValue) sizeXValue.textContent = v.toFixed(2);
        const l = window.app.getSelectedLight();
        if (!l || l.shape !== "circle") return;
        window.app.updateSelectedLight({ sizeX: v });
      });
    }
    if (sizeYSlider) {
      sizeYSlider.addEventListener("input", (e) => {
        const v = Math.max(0.1, Math.min(3, Number(e.target.value)));
        if (sizeYValue) sizeYValue.textContent = v.toFixed(2);
        const l = window.app.getSelectedLight();
        if (!l || l.shape !== "circle") return;
        window.app.updateSelectedLight({ sizeY: v });
      });
    }
    if (makeCircleByXBtn) {
      makeCircleByXBtn.addEventListener("click", () => {
        const l = window.app.getSelectedLight();
        if (!l || l.shape !== "circle") return;
        const sx = Number(l.sizeX) || 1;
        window.app.updateSelectedLight({ sizeY: sx });
        if (sizeYSlider) sizeYSlider.value = sx.toFixed(2);
        if (sizeYValue) sizeYValue.textContent = sx.toFixed(2);
      });
    }
    if (makeCircleByYBtn) {
      makeCircleByYBtn.addEventListener("click", () => {
        const l = window.app.getSelectedLight();
        if (!l || l.shape !== "circle") return;
        const sy = Number(l.sizeY) || 1;
        window.app.updateSelectedLight({ sizeX: sy });
        if (sizeXSlider) sizeXSlider.value = sy.toFixed(2);
        if (sizeXValue) sizeXValue.textContent = sy.toFixed(2);
      });
    }
    if (widthSlider) {
      widthSlider.addEventListener("input", (e) => {
        const v = Number(e.target.value);
        if (widthValue) widthValue.textContent = v;
        window.app.updateSelectedLight({ width: v });
      });
    }
    if (heightSlider) {
      heightSlider.addEventListener("input", (e) => {
        const v = Number(e.target.value);
        if (heightValue) heightValue.textContent = v;
        window.app.updateSelectedLight({ height: v });
      });
    }
    if (brightnessSlider) {
      brightnessSlider.addEventListener("input", (e) => {
        const ui = Math.max(0, Math.min(2000, Number(e.target.value)));
        if (brightnessValue) brightnessValue.textContent = ui;
        const t = ui / 2000; // 0..1
        const intensity = Math.pow(t || 0, 2.2) * 2000;
        window.app.updateSelectedLight({ intensity });
      });
    }
    if (opacitySlider) {
      opacitySlider.addEventListener("input", (e) => {
        const op = clamp01(e.target.value, 1);
        opacitySlider.value = op.toFixed(2);
        if (opacityValue) opacityValue.textContent = op.toFixed(2);
        window.app.updateSelectedLight({ opacity: op });
        if (opacityDebug) {
          opacityDebug.textContent = `selected light opacity = ${op.toFixed(
            2
          )}`;
        }
      });
    }
    if (softnessSlider) {
      softnessSlider.addEventListener("input", (e) => {
        const v = Number(e.target.value);
        const featherLabel = formatFeatherLabel(
          v,
          window.app.getSelectedLight()
        );
        if (softnessValue) softnessValue.textContent = featherLabel.text;
        if (softnessValue) softnessValue.title = featherLabel.title;
        window.app.updateSelectedLight({ feather: v });
        updateFalloffHint(window.app.getSelectedLight(), v);
      });
    }
    if (falloffSlider) {
      falloffSlider.addEventListener("input", (e) => {
        const v = Number(e.target.value);
        if (falloffValue) falloffValue.textContent = v.toFixed(1);
        window.app.updateSelectedLight({ falloffK: v });
      });
    }
    if (lightColor) {
      lightColor.addEventListener("input", (e) => {
        const hex = e.target.value;
        window.app.updateSelectedLight({ color: hex });
        const rgb = hexToRgb(hex);
        if (rgb) {
          if (lightColorR) lightColorR.value = String(rgb.r);
          if (lightColorG) lightColorG.value = String(rgb.g);
          if (lightColorB) lightColorB.value = String(rgb.b);
        }
      });
    }
    const bindRgbInput = (el, channel) => {
      if (!el) return;
      el.addEventListener("input", () => {
        const r = lightColorR ? Number(lightColorR.value) : 0;
        const g = lightColorG ? Number(lightColorG.value) : 0;
        const b = lightColorB ? Number(lightColorB.value) : 0;
        const hex = rgbToHex(r, g, b);
        if (lightColor) lightColor.value = hex;
        window.app.updateSelectedLight({ color: hex });
      });
    };
    bindRgbInput(lightColorR, "r");
    bindRgbInput(lightColorG, "g");
    bindRgbInput(lightColorB, "b");
    if (timerStartInput) {
      timerStartInput.addEventListener("input", (e) => {
        const v = Number(e.target.value);
        if (!Number.isFinite(v)) return;
        window.app.updateSelectedLight({ startSec: v });
      });
    }
    if (timerDurationInput) {
      timerDurationInput.addEventListener("input", (e) => {
        const v = Number(e.target.value);
        if (!Number.isFinite(v)) return;
        window.app.updateSelectedLight({ durationSec: v });
      });
    }

    if (modeEditBtn) {
      modeEditBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!window.app || typeof window.app.setMode !== "function") return;
        window.app.setMode("edit");
        applyModeToUi("edit");
      });
    }
    if (modeShootBtn) {
      modeShootBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!window.app || typeof window.app.setMode !== "function") return;
        window.app.setMode("shoot");
        applyModeToUi("shoot");
      });
    }
    if (shootStartBtn) {
      shootStartBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!window.app || typeof window.app.triggerShoot !== "function")
          return;
        window.app.triggerShoot();
        if (shootModeHint) {
          shootModeHint.textContent =
            "촬영이 진행 중입니다. 타이머가 끝날 때까지 기다려 주세요.";
        }
      });
    }

    function fitSelectedToCanvas() {
      const l = window.app.getSelectedLight && window.app.getSelectedLight();
      if (!l) return;
      const canvasW =
        document.getElementById("canvas-container")?.clientWidth ||
        window.innerWidth;
      const canvasH = window.innerHeight;
      const cx = Math.round(canvasW / 2);
      const cy = Math.round(canvasH / 2);

      if (l.shape === "rect") {
        window.app.updateSelectedLight({
          x: cx,
          y: cy,
          width: canvasW,
          height: canvasH,
        });
        if (widthSlider) widthSlider.value = String(Math.round(canvasW));
        if (heightSlider) heightSlider.value = String(Math.round(canvasH));
        if (widthValue) widthValue.textContent = String(Math.round(canvasW));
        if (heightValue) heightValue.textContent = String(Math.round(canvasH));
      } else {
        const r = Math.ceil(
          Math.sqrt(canvasW * canvasW + canvasH * canvasH) / 2
        );
        window.app.updateSelectedLight({
          x: cx,
          y: cy,
          radius: r,
          sizeX: 1.0,
          sizeY: 1.0,
          rotation: 0.0,
        });
        if (sizeSlider) sizeSlider.value = String(r);
        if (sizeValue) sizeValue.textContent = String(r);
      }
    }

    if (fitCanvasBtn) {
      fitCanvasBtn.addEventListener("click", () => {
        fitSelectedToCanvas();
      });
    }

    if (selectedType) {
      selectedType.addEventListener("change", (e) => {
        const type = normalizeLayerType(e.target.value);
        if (typeof window.app.setCreationType === "function") {
          window.app.setCreationType(type);
        }
        window.app.updateSelectedLight({ type });
        updateTypeUi(type);
        const updated =
          window.app.getSelectedLight && window.app.getSelectedLight();
        if (updated && lightColor) {
          lightColor.value = updated.color || "#ffffff";
        }
      });
    }

    bindStepButtons({
      minusBtn: sizeMinus,
      plusBtn: sizePlus,
      slider: sizeSlider,
      step: 1,
    });
    bindStepButtons({
      minusBtn: widthMinus,
      plusBtn: widthPlus,
      slider: widthSlider,
      step: 1,
    });
    bindStepButtons({
      minusBtn: heightMinus,
      plusBtn: heightPlus,
      slider: heightSlider,
      step: 1,
    });
    bindStepButtons({
      minusBtn: brightnessMinus,
      plusBtn: brightnessPlus,
      slider: brightnessSlider,
      step: 1,
    });
    bindStepButtons({
      minusBtn: opacityMinus,
      plusBtn: opacityPlus,
      slider: opacitySlider,
      step: 0.01,
    });
    bindStepButtons({
      minusBtn: softnessMinus,
      plusBtn: softnessPlus,
      slider: softnessSlider,
      step: 10,
    });
    bindStepButtons({
      minusBtn: falloffMinus,
      plusBtn: falloffPlus,
      slider: falloffSlider,
      step: 0.1,
    });

    // Delete selected
    if (deleteLightBtn) {
      deleteLightBtn.addEventListener("click", () => {
        window.app.deleteSelectedLight();
      });
    }

    if (btnBringToFront) {
      btnBringToFront.addEventListener("click", () => {
        const l = window.app.getSelectedLight && window.app.getSelectedLight();
        if (!l) return;
        if (typeof window.app.bringToFrontById === "function") {
          window.app.bringToFrontById(l.id);
        }
      });
    }

    if (btnSendToBack) {
      btnSendToBack.addEventListener("click", () => {
        const l = window.app.getSelectedLight && window.app.getSelectedLight();
        if (!l) return;
        if (typeof window.app.sendToBackById === "function") {
          window.app.sendToBackById(l.id);
        }
      });
    }

    window.addEventListener("app:modeChanged", (e) => {
      const detail = (e && e.detail) || {};
      const mode = detail.mode === "shoot" ? "shoot" : "edit";
      applyModeToUi(mode);
      if (
        window.app &&
        typeof window.app.getSelectedLight === "function" &&
        selectionIndicator
      ) {
        const current = window.app.getSelectedLight();
        updateSelectionIndicator(current);
      }
    });

    window.addEventListener("app:lightsChanged", (e) => {
      const detail = (e && e.detail) || {};
      renderLayerList(detail.lights || [], detail.selectedLightId || null);
      if (
        window.app &&
        typeof window.app.getSelectedLight === "function" &&
        selectionIndicator
      ) {
        const current = window.app.getSelectedLight();
        updateSelectionIndicator(current);
      }
    });

    // initialize labels
    if (exposureSlider) {
      exposureSlider.dispatchEvent(new Event("input", { bubbles: true }));
    }
    syncSizeBoundsByCanvas(
      document.getElementById("canvas-container")?.clientWidth,
      window.innerHeight
    );
    window.addEventListener("app:canvasResized", (e) => {
      const d = e.detail || {};
      syncSizeBoundsByCanvas(d.width, d.height);
    });
    syncFalloffCFromState();
    setControlsEnabled(false);
    updateVisibilityByType(null);
    const initialState = window.app.getState && window.app.getState();
    if (initialState) {
      renderLayerList(initialState.lights, initialState.selectedLightId);
      if (initialState.mode) {
        applyModeToUi(initialState.mode);
      }
    }

    if (shootControls) {
      ["pointerdown", "pointerup", "click", "mousedown", "mouseup"].forEach(
        (type) => {
          shootControls.addEventListener(
            type,
            (e) => {
              e.stopPropagation();
            },
            false
          );
        }
      );
    }

    // Output → direct number input (safe ones, exclude softnessValue)
    enableOutputNumberEdit(exposureValue, exposureSlider, { decimals: 2 });
    enableOutputNumberEdit(falloffCValue, falloffCSlider, { decimals: 1 });
    enableOutputNumberEdit(sizeValue, sizeSlider, { decimals: 0 });
    enableOutputNumberEdit(widthValue, widthSlider, { decimals: 0 });
    enableOutputNumberEdit(heightValue, heightSlider, { decimals: 0 });
    enableOutputNumberEdit(brightnessValue, brightnessSlider, { decimals: 0 });
    enableOutputNumberEdit(opacityValue, opacitySlider, { decimals: 2 });
    enableOutputNumberEdit(falloffValue, falloffSlider, { decimals: 1 });
    enableOutputNumberEdit(sizeXValue, sizeXSlider, { decimals: 2 });
    enableOutputNumberEdit(sizeYValue, sizeYSlider, { decimals: 2 });
  });

  // Panel toggle button and hotkey
  function updateToggleButtonLabel() {
    const hidden = document.body.classList.contains("panel-hidden");
    if (togglePanelBtn)
      togglePanelBtn.textContent = hidden ? "패널 표시 (P)" : "패널 숨기기 (P)";
  }
  function updateDockButtonLabel() {
    const isRight = document.body.classList.contains("panel-right");
    if (toggleDockBtn)
      toggleDockBtn.textContent = isRight
        ? "왼쪽으로 이동 (D)"
        : "오른쪽으로 이동 (D)";
    if (panelDockState)
      panelDockState.textContent = isRight ? "현재: 오른쪽" : "현재: 왼쪽";
  }
  function togglePanelDock() {
    document.body.classList.toggle("panel-right");
    updateDockButtonLabel();
  }
  function syncPreviewMode(hidden) {
    if (window.app && typeof window.app.setPreviewMode === "function") {
      window.app.setPreviewMode(hidden);
    }
  }
  if (togglePanelBtn) {
    togglePanelBtn.addEventListener("click", () => {
      const willHide = !document.body.classList.contains("panel-hidden");
      document.body.classList.toggle("panel-hidden");
      updateToggleButtonLabel();
      syncPreviewMode(willHide);
      if (
        willHide &&
        window.app &&
        typeof window.app.clearSelection === "function"
      ) {
        window.app.clearSelection();
      }
    });
  }
  if (resetAllDisplaysBtn) {
    resetAllDisplaysBtn.addEventListener("click", () => {
      if (
        window.app &&
        typeof window.app.resetAllDisplaysToDefault === "function"
      ) {
        window.app.resetAllDisplaysToDefault();
      }
    });
  }
  if (toggleDockBtn) {
    toggleDockBtn.addEventListener("click", () => {
      togglePanelDock();
    });
  }
  document.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    const tag = (e.target && e.target.tagName) || "";
    const isFormTag = ["INPUT", "TEXTAREA", "SELECT"].includes(tag);
    const isFunctionKey = key === "f3" || key === "f4" || key === "f5";
    if (isFormTag && !isFunctionKey) return; // 입력 중에는 일반 키만 무시, F3/F4/F5는 항상 동작
    if (key === "d") {
      e.preventDefault();
      togglePanelDock();
      return;
    }
    if (key === "p") {
      e.preventDefault();
      const willHide = !document.body.classList.contains("panel-hidden");
      document.body.classList.toggle("panel-hidden");
      updateToggleButtonLabel();
      syncPreviewMode(willHide);
      if (
        willHide &&
        window.app &&
        typeof window.app.clearSelection === "function"
      ) {
        window.app.clearSelection();
      }
      return;
    }
    if (key === "f3") {
      e.preventDefault();
      if (!window.app || typeof window.app.setMode !== "function") return;
      window.app.setMode("edit");
      applyModeToUi("edit");
      return;
    }
    if (key === "f4") {
      e.preventDefault();
      if (!window.app || typeof window.app.setMode !== "function") return;
      window.app.setMode("shoot");
      applyModeToUi("shoot");
      return;
    }
    if (key === "f5") {
      e.preventDefault();
      if (!window.app || typeof window.app.triggerShoot !== "function") return;
      window.app.triggerShoot();
      if (shootModeHint) {
        shootModeHint.textContent =
          "촬영이 진행 중입니다. 타이머가 끝날 때까지 기다려 주세요.";
      }
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
  updateDockButtonLabel();
});
