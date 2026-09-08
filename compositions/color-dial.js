import { parseColor, oklchToHex, hexToRgb, rgbToHex } from "./color.js";

export const PIGMENTS = [
  { hex: "#c45450", name: "alizarin" },
  { hex: "#c45a2a", name: "sienna" },
  { hex: "#d4a24a", name: "ochre" },
  { hex: "#5f7a3a", name: "sap" },
  { hex: "#2f6f6a", name: "viridian" },
  { hex: "#3a6fa0", name: "cerulean" },
  { hex: "#3d4580", name: "ultramarine" },
  { hex: "#5a4a62", name: "mauve" },
  { hex: "#3f3c3a", name: "ink" },
  { hex: "#f0e6d4", name: "cream" },
];

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function assign(target, next) {
  target.l = next.l;
  target.c = next.c;
  target.h = next.h;
}

function hsvToRgb(h, s, v) {
  const hue = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function rgbToHsv(r, g, b) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hsvToHex(hsv) {
  return rgbToHex(hsvToRgb(hsv.h, hsv.s, hsv.v));
}

function hueHex(h) {
  return rgbToHex(hsvToRgb(h, 1, 1));
}

export function mountColorSquare({ host, input, value, onChange, swatches = false }) {
  if (!host) return null;

  const oklch = { ...(parseColor(value) || parseColor("#8b2f32")) };
  const startRgb = hexToRgb(oklchToHex(oklch)) || { r: 139, g: 47, b: 50 };
  const hsv = rgbToHsv(startRgb.r, startRgb.g, startRgb.b);

  host.classList.add("color-square");
  if (swatches) host.classList.add("has-swatches");
  host.replaceChildren();

  const map = document.createElement("div");
  map.className = "color-square-map";
  map.tabIndex = 0;
  map.setAttribute("role", "slider");
  map.setAttribute("aria-label", "color");

  const thumb = document.createElement("span");
  thumb.className = "color-square-thumb";
  thumb.setAttribute("aria-hidden", "true");
  map.append(thumb);

  const hue = document.createElement("input");
  hue.type = "range";
  hue.className = "color-square-hue";
  hue.min = "0";
  hue.max = "360";
  hue.step = "1";
  hue.setAttribute("aria-label", "hue");

  const hexField = input || document.createElement("input");
  if (!input) {
    hexField.type = "text";
    hexField.className = "color-square-hex";
    hexField.maxLength = 7;
    hexField.autocomplete = "off";
    hexField.spellcheck = false;
    hexField.setAttribute("aria-label", "hex");
  } else {
    hexField.classList.add("color-square-hex");
  }

  let swatchRow = null;
  if (swatches) {
    swatchRow = document.createElement("div");
    swatchRow.className = "color-swatches";
    swatchRow.setAttribute("role", "listbox");
    swatchRow.setAttribute("aria-label", "pigments");
    for (const pigment of PIGMENTS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "color-swatch";
      button.style.background = pigment.hex;
      button.dataset.hex = pigment.hex;
      button.setAttribute("aria-label", pigment.name);
      button.setAttribute("role", "option");
      button.addEventListener("click", () => {
        const next = parseColor(pigment.hex);
        if (!next) return;
        applyHsvFromColor(next);
        commit(true);
      });
      swatchRow.append(button);
    }
    host.append(swatchRow);
  }
  host.append(map, hue);
  if (!input) host.append(hexField);

  function currentHex() {
    return oklchToHex(oklch);
  }

  function applyHsvFromColor(next) {
    assign(oklch, next);
    const rgb = hexToRgb(oklchToHex(oklch));
    if (!rgb) return;
    const nextHsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    if (nextHsv.s > 0.01 && nextHsv.v > 0.01) hsv.h = nextHsv.h;
    hsv.s = nextHsv.s;
    hsv.v = nextHsv.v;
  }

  function commit(emit) {
    const hex = hsvToHex(hsv);
    const next = parseColor(hex);
    if (next) assign(oklch, next);
    const shown = currentHex();
    if (hexField && document.activeElement !== hexField && hexField.value.toLowerCase() !== shown) {
      hexField.value = shown;
    }
    if (input && input !== hexField && input.value.toLowerCase() !== shown) input.value = shown;
    map.style.setProperty("--hue", hueHex(hsv.h));
    map.style.setProperty("--pick", shown);
    thumb.style.left = `${hsv.s * 100}%`;
    thumb.style.top = `${(1 - hsv.v) * 100}%`;
    hue.value = String(Math.round(hsv.h));
    swatchRow?.querySelectorAll(".color-swatch").forEach((button) => {
      const on = button.dataset.hex.toLowerCase() === shown.toLowerCase();
      button.classList.toggle("is-active", on);
      button.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (emit) onChange?.({ ...oklch });
  }

  function applyFromPoint(event) {
    const rect = map.getBoundingClientRect();
    hsv.s = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    hsv.v = clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1);
    commit(true);
  }

  let dragging = false;
  map.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    dragging = true;
    try {
      map.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    applyFromPoint(event);
  });
  map.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    applyFromPoint(event);
  });
  const endDrag = () => {
    dragging = false;
  };
  map.addEventListener("pointerup", endDrag);
  map.addEventListener("pointercancel", endDrag);

  map.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 0.08 : 0.02;
    if (event.key === "ArrowLeft") hsv.s = clamp(hsv.s - step, 0, 1);
    else if (event.key === "ArrowRight") hsv.s = clamp(hsv.s + step, 0, 1);
    else if (event.key === "ArrowDown") hsv.v = clamp(hsv.v - step, 0, 1);
    else if (event.key === "ArrowUp") hsv.v = clamp(hsv.v + step, 0, 1);
    else return;
    event.preventDefault();
    commit(true);
  });

  hue.addEventListener("input", () => {
    hsv.h = Number(hue.value);
    commit(true);
  });

  hexField.addEventListener("change", () => {
    const next = parseColor(hexField.value);
    if (!next) {
      hexField.value = currentHex();
      return;
    }
    applyHsvFromColor(next);
    hexField.value = currentHex();
    commit(true);
  });
  hexField.addEventListener("keydown", (event) => {
    if (event.key === "Enter") hexField.blur();
  });
  hexField.addEventListener("pointerdown", (event) => event.stopPropagation());

  commit(false);

  return {
    setValue(nextValue) {
      const next = parseColor(nextValue);
      if (!next) return;
      if (oklchToHex(next) === currentHex()) return;
      applyHsvFromColor(next);
      commit(false);
    },
  };
}

export const mountPigmentPicker = mountColorSquare;
