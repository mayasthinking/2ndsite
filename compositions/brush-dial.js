import { BRUSH_TYPES } from "./effect-model.js?v=15";

const STEP = 32;
const CYCLE = STEP * BRUSH_TYPES.length;
const DEG_PER_PX = 0.28;
const VISIBLE = 60;

const ICONS = {
  HB: "icon-brush-hb",
  "2B": "icon-brush-2b",
  "2H": "icon-brush-2h",
  charcoal: "icon-brush-charcoal",
  cpencil: "icon-brush-cpencil",
  crayon: "icon-brush-crayon",
  spray: "icon-brush-spray",
  marker: "icon-brush-marker",
};

export function textureName(name) {
  return ICONS[name] || ICONS.HB;
}

export function strokeSvg(name) {
  const type = BRUSH_TYPES.includes(name) ? name : "HB";
  return `<svg class="brush-ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#${ICONS[type]}"></use></svg>`;
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

export function brushFromTurn(turn, types = BRUSH_TYPES) {
  const n = types.length;
  const snapped = ((Math.round(-turn / STEP) % n) + n) % n;
  return types[snapped];
}

function norm360(deg) {
  let a = deg % CYCLE;
  if (a < 0) a += CYCLE;
  return a;
}

function fromApex(deg) {
  const a = norm360(deg);
  return Math.min(a, CYCLE - a);
}

export function mountBrushDial({ host, value, onChange }) {
  if (!host) return null;

  let current = BRUSH_TYPES.includes(value) ? value : "HB";
  let turn = -brushIndex(current) * STEP;
  host.classList.add("brush-arc");
  host.replaceChildren();

  const face = document.createElement("div");
  face.className = "brush-arc-face";
  face.tabIndex = 0;
  face.setAttribute("role", "slider");
  face.setAttribute("aria-label", "brush");
  face.setAttribute("aria-valuemin", "0");
  face.setAttribute("aria-valuemax", String(BRUSH_TYPES.length - 1));

  const ring = document.createElement("div");
  ring.className = "brush-arc-ring";
  ring.setAttribute("aria-hidden", "true");

  const hashes = document.createElement("div");
  hashes.className = "brush-arc-hashes";
  hashes.setAttribute("aria-hidden", "true");
  // Every fifth mark is a brush stop; minor marks only indicate motion.
  for (let index = 0; index < BRUSH_TYPES.length * 5; index++) {
    const hash = document.createElement("span");
    hash.className = `brush-arc-hash${index % 5 === 0 ? " is-major" : ""}`;
    hash.dataset.angle = String(index * STEP / 5);
    hashes.append(hash);
  }

  const track = document.createElement("div");
  track.className = "brush-arc-track";
  track.setAttribute("role", "listbox");
  track.setAttribute("aria-label", "brushes");

  const pointer = document.createElement("div");
  pointer.className = "brush-arc-pointer";
  pointer.setAttribute("aria-hidden", "true");

  for (const [index, name] of BRUSH_TYPES.entries()) {
    const tick = document.createElement("button");
    tick.type = "button";
    tick.className = "brush-arc-tick";
    tick.dataset.brush = name;
    tick.dataset.index = String(index);
    tick.setAttribute("role", "option");
    tick.setAttribute("aria-label", name.toLowerCase());
    tick.tabIndex = -1;
    const spoke = document.createElement("span");
    spoke.className = "brush-arc-spoke";
    const mark = document.createElement("span");
    mark.className = "brush-arc-mark";
    paintBrushMark(mark, name);
    const label = document.createElement("span");
    label.className = "brush-arc-label";
    label.textContent = name.toLowerCase();
    spoke.append(mark, label);
    tick.append(spoke);
    track.append(tick);
  }

  face.append(ring, hashes, track, pointer);
  host.append(face);

  function angleAt(event) {
    const box = face.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + (Number.parseFloat(getComputedStyle(host).getPropertyValue("--cy")) || box.height);
    return {
      deg: (Math.atan2(event.clientY - cy, event.clientX - cx) * 180) / Math.PI,
      dist: Math.hypot(event.clientX - cx, event.clientY - cy),
    };
  }

  function applyTurn(nextTurn, emit, updateSelection = true) {
    turn = nextTurn;
    const name = brushFromTurn(turn);
    const index = brushIndex(name);
    const radius = parseFloat(host.style.getPropertyValue("--radius")) || 140;
    const iconRadius = parseFloat(host.style.getPropertyValue("--icon-r")) || 120;
    const height = parseFloat(host.style.height) || 120;
    // Fade labels before their full height reaches the compact panel's edge.
    const visible = Math.min(VISIBLE, Math.acos(Math.max(-1, Math.min(1, (radius - height + 32) / iconRadius))) * 180 / Math.PI);
    for (const hash of hashes.children) {
      const angle = ((Number(hash.dataset.angle) + turn + CYCLE / 2) % CYCLE + CYCLE) % CYCLE - CYCLE / 2;
      hash.style.setProperty("--ang", `${angle}deg`);
      hash.hidden = Math.abs(angle) > VISIBLE;
      hash.style.opacity = String(Math.max(0, Math.min(1, (VISIBLE - Math.abs(angle)) / 10)));
    }
    face.setAttribute("aria-valuenow", String(index));
    face.setAttribute("aria-valuetext", name.toLowerCase());
    for (const tick of track.querySelectorAll(".brush-arc-tick")) {
      const on = tick.dataset.brush === name;
      const ang = ((Number(tick.dataset.index) * STEP + turn + CYCLE / 2) % CYCLE + CYCLE) % CYCLE - CYCLE / 2;
      const away = fromApex(ang);
      tick.classList.toggle("is-active", on);
      tick.classList.toggle("is-far", away > visible);
      tick.setAttribute("aria-selected", on ? "true" : "false");
      tick.style.setProperty("--ang", `${ang}deg`);
      tick.style.setProperty("--from", String(away));
      tick.style.opacity = String(Math.max(0, Math.min(1, (visible - away) / 8)));
    }
    if (!updateSelection) return;
    if (emit && name !== current) {
      current = name;
      onChange?.(current);
    } else {
      current = name;
    }
  }

  let animation = 0;
  let wheelTimer = 0;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  function stopMotion() {
    cancelAnimationFrame(animation);
    animation = 0;
    clearTimeout(wheelTimer);
  }

  function commit(name, emit, animate = true) {
    stopMotion();
    const next = BRUSH_TYPES.includes(name) ? name : "HB";
    const base = -brushIndex(next) * STEP;
    // Use the closest equivalent angle, including across the last/first brush.
    const target = base + Math.round((turn - base) / CYCLE) * CYCLE;
    const start = turn;
    const changed = next !== current;
    current = next;
    if (!animate || reducedMotion.matches || Math.abs(target - start) < 0.01) {
      applyTurn(target, false);
    } else {
      const started = performance.now();
      const frame = now => {
        if (!host.isConnected) { animation = 0; return; }
        const progress = Math.min(1, (now - started) / 260);
        const ease = 1 - Math.pow(1 - progress, 3);
        applyTurn(start + (target - start) * ease, false, false);
        animation = progress < 1 ? requestAnimationFrame(frame) : 0;
      };
      animation = requestAnimationFrame(frame);
    }
    if (emit && changed) onChange?.(next);
  }

  let dragging = false;
  let dragged = false;
  let dragStartX = 0;
  let dragStartTurn = 0;
  let dragStartAngle = 0;
  let pressedBrush = null;

  face.addEventListener("pointerdown", (event) => {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    stopMotion();
    pressedBrush = event.target.closest(".brush-arc-tick")?.dataset.brush;
    face.focus({ preventScroll: true });
    dragging = true;
    dragged = false;
    dragStartX = event.clientX;
    dragStartTurn = turn;
    dragStartAngle = angleAt(event).deg;
    face.classList.add("is-dragging");
    try {
      face.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  });
  face.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const next = angleAt(event);
    const dx = event.clientX - dragStartX;
    const dAngle = next.deg - dragStartAngle;
    if (Math.abs(dx) > 6 || Math.abs(dAngle) > 4) dragged = true;
    // One consistent mapping avoids jumps between swipe and arc sensitivities.
    applyTurn(dragStartTurn + dx * DEG_PER_PX, true);
  });
  const endDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    face.classList.remove("is-dragging");
    if (!dragged) {
      const tick = event.target instanceof Element ? event.target.closest(".brush-arc-tick") : null;
      if (pressedBrush || tick?.dataset.brush) {
        commit(pressedBrush || tick.dataset.brush, true);
        return;
      }
    }
    commit(brushFromTurn(turn), true);
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

  face.addEventListener("wheel", event => {
    if (event.ctrlKey || dragging) return;
    event.preventDefault();
    event.stopPropagation();
    stopMotion();
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? face.clientWidth : 1;
    applyTurn(turn - Math.max(-60, Math.min(60, delta * unit)) * 0.18, true);
    wheelTimer = setTimeout(() => commit(brushFromTurn(turn), true), 140);
  }, { passive: false });

  commit(current, false, false);

  return {
    layout() { applyTurn(turn, false, false); },
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
