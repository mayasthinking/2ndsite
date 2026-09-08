import { BRUSH_TYPES } from "./effect-model.js?v=15";

const STEP = 360 / BRUSH_TYPES.length;

export function strokeSvg(name) {
  const box = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" aria-hidden="true"';
  const strokes = {
    HB: `<svg ${box}><path d="M5 23c6-6 10-4 22-16" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>`,
    "2B": `<svg ${box}><path d="M4 23c7-8 11-3 24-16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity=".9"/></svg>`,
    "2H": `<svg ${box}><path d="M6 22 26 10" stroke="currentColor" stroke-width=".75" stroke-linecap="round" opacity=".72"/></svg>`,
    charcoal: `<svg ${box}><path d="M5 22c5-5 8-2 14-9 3-3 6-5 9-7" stroke="currentColor" stroke-width="2.45" stroke-linecap="round" opacity=".52"/><path d="M7 24c5-6 9-3 16-11" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" opacity=".38"/><circle cx="11" cy="18" r=".65" fill="currentColor" opacity=".34"/><circle cx="17" cy="13" r=".5" fill="currentColor" opacity=".3"/><circle cx="22" cy="10" r=".55" fill="currentColor" opacity=".28"/></svg>`,
    cpencil: `<svg ${box}><path d="M6 22 26 10" stroke="currentColor" stroke-width=".95" stroke-linecap="round"/><path d="M8 21.15 24.2 11.1" stroke="currentColor" stroke-width=".35" opacity=".32"/></svg>`,
    crayon: `<svg ${box}><path d="M4 22c4-3 7-8 12-9 5-1 7 2 13-6" stroke="currentColor" stroke-width="3.05" stroke-linecap="round" opacity=".84"/></svg>`,
    spray: `<svg ${box}><circle cx="8" cy="21" r="1.15" fill="currentColor" opacity=".32"/><circle cx="12.2" cy="16.4" r=".7" fill="currentColor" opacity=".5"/><circle cx="15.6" cy="18.8" r="1.05" fill="currentColor" opacity=".28"/><circle cx="18" cy="13.2" r=".85" fill="currentColor" opacity=".42"/><circle cx="21.4" cy="16" r=".55" fill="currentColor" opacity=".36"/><circle cx="23.8" cy="10.6" r="1.2" fill="currentColor" opacity=".3"/><circle cx="26.2" cy="13.8" r=".5" fill="currentColor" opacity=".4"/><circle cx="14.4" cy="12.4" r=".4" fill="currentColor" opacity=".26"/></svg>`,
    marker: `<svg ${box}><path d="M7 21 25 11" stroke="currentColor" stroke-width="3.55" stroke-linecap="round"/></svg>`,
  };
  return strokes[name] || strokes.HB;
}

export function paintBrushMark(el, name) {
  if (!el) return;
  const type = BRUSH_TYPES.includes(name) ? name : "HB";
  el.dataset.brush = type;
  el.innerHTML = strokeSvg(type);
}

export function brushIndex(name) {
  const index = BRUSH_TYPES.indexOf(name);
  return index >= 0 ? index : 0;
}

export function angleFromPoint(x, y, cx, cy) {
  return ((Math.atan2(y - cy, x - cx) * 180) / Math.PI + 360) % 360;
}

export function brushFromAngle(deg, types = BRUSH_TYPES) {
  const n = types.length;
  const adjusted = (deg + 90 + 360) % 360;
  return types[Math.round(adjusted / (360 / n)) % n];
}

export function mountBrushDial({ host, value, onChange }) {
  if (!host) return null;

  let current = BRUSH_TYPES.includes(value) ? value : "HB";
  host.classList.add("brush-dial");
  host.replaceChildren();

  const face = document.createElement("div");
  face.className = "brush-dial-face";
  face.tabIndex = 0;
  face.setAttribute("role", "slider");
  face.setAttribute("aria-label", "brush");
  face.setAttribute("aria-valuemin", "0");
  face.setAttribute("aria-valuemax", String(BRUSH_TYPES.length - 1));

  const ring = document.createElement("div");
  ring.className = "brush-dial-ring";
  ring.setAttribute("aria-hidden", "true");

  const needle = document.createElement("div");
  needle.className = "brush-dial-needle";
  needle.setAttribute("aria-hidden", "true");

  const ticks = document.createElement("div");
  ticks.className = "brush-dial-ticks";
  ticks.setAttribute("role", "listbox");
  ticks.setAttribute("aria-label", "brushes");

  const hub = document.createElement("div");
  hub.className = "brush-dial-hub";
  const hubMark = document.createElement("span");
  hubMark.className = "brush-dial-hub-mark";
  const hubName = document.createElement("span");
  hubName.className = "brush-dial-hub-name";
  hub.append(hubMark, hubName);

  for (const [index, name] of BRUSH_TYPES.entries()) {
    const tick = document.createElement("button");
    tick.type = "button";
    tick.className = "brush-dial-tick";
    tick.dataset.brush = name;
    tick.setAttribute("role", "option");
    tick.setAttribute("aria-label", name.toLowerCase());
    tick.tabIndex = -1;
    tick.style.setProperty("--tick", `${index * STEP}deg`);
    const mark = document.createElement("span");
    mark.className = "brush-dial-tick-mark";
    mark.setAttribute("aria-hidden", "true");
    paintBrushMark(mark, name);
    const label = document.createElement("span");
    label.className = "brush-dial-tick-name";
    label.textContent = name.toLowerCase();
    tick.append(mark, label);
    tick.addEventListener("click", (event) => {
      event.preventDefault();
      commit(name, true);
    });
    ticks.append(tick);
  }

  face.append(ring, needle, ticks, hub);
  host.append(face);

  function commit(name, emit) {
    const next = BRUSH_TYPES.includes(name) ? name : "HB";
    const changed = next !== current;
    current = next;
    const index = brushIndex(current);
    face.style.setProperty("--angle", `${index * STEP}deg`);
    face.setAttribute("aria-valuenow", String(index));
    face.setAttribute("aria-valuetext", current.toLowerCase());
    hubName.textContent = current.toLowerCase();
    paintBrushMark(hubMark, current);
    for (const tick of ticks.querySelectorAll(".brush-dial-tick")) {
      const on = tick.dataset.brush === current;
      tick.classList.toggle("is-active", on);
      tick.setAttribute("aria-selected", on ? "true" : "false");
    }
    if (emit && changed) onChange?.(current);
  }

  function pickFromEvent(event) {
    const rect = face.getBoundingClientRect();
    const name = brushFromAngle(angleFromPoint(event.clientX, event.clientY, rect.left + rect.width / 2, rect.top + rect.height / 2));
    commit(name, true);
  }

  let dragging = false;
  face.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".brush-dial-tick")) return;
    event.preventDefault();
    dragging = true;
    try {
      face.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    pickFromEvent(event);
  });
  face.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    pickFromEvent(event);
  });
  const endDrag = () => {
    dragging = false;
  };
  face.addEventListener("pointerup", endDrag);
  face.addEventListener("pointercancel", endDrag);

  face.addEventListener("keydown", (event) => {
    const index = brushIndex(current);
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      commit(BRUSH_TYPES[(index + 1) % BRUSH_TYPES.length], true);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      commit(BRUSH_TYPES[(index - 1 + BRUSH_TYPES.length) % BRUSH_TYPES.length], true);
    } else if (event.key === "Home") {
      event.preventDefault();
      commit(BRUSH_TYPES[0], true);
    } else if (event.key === "End") {
      event.preventDefault();
      commit(BRUSH_TYPES[BRUSH_TYPES.length - 1], true);
    }
  });

  commit(current, false);

  return {
    setValue(nextValue) {
      if (!BRUSH_TYPES.includes(nextValue) || nextValue === current) return;
      commit(nextValue, false);
    },
    getValue() {
      return current;
    },
    focus() {
      face.focus({ preventScroll: true });
    },
  };
}
