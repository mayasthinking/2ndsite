import { BRUSH_TYPES } from "./effect-model.js?v=15";

const STEP = 360 / BRUSH_TYPES.length;

const BRUSH_ICONS = {
  HB: "icon-pencil",
  "2B": "icon-pencil-line",
  "2H": "icon-pen-line",
  charcoal: "icon-brush",
  cpencil: "icon-pen",
  crayon: "icon-paintbrush-tool",
  spray: "icon-spray-can",
  marker: "icon-highlighter",
};

export function strokeSvg(name) {
  const icon = BRUSH_ICONS[name] || BRUSH_ICONS.HB;
  return `<svg class="lucide-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#${icon}"></use></svg>`;
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
