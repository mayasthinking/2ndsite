import { BRUSH_TYPES } from "./effect-model.js?v=15";

const STEP = 360 / BRUSH_TYPES.length;
const DEG_PER_PX = 0.48;
const VISIBLE = 78;

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
  let a = deg % 360;
  if (a < 0) a += 360;
  return a;
}

function fromApex(deg) {
  const a = norm360(deg);
  return Math.min(a, 360 - a);
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
  for (let deg = -90; deg <= 90; deg += 3) {
    const hash = document.createElement("span");
    hash.className = `brush-arc-hash${deg % 15 === 0 ? " is-major" : ""}`;
    hash.style.setProperty("--ang", `${deg}deg`);
    hashes.append(hash);
  }

  const track = document.createElement("div");
  track.className = "brush-arc-track";
  track.setAttribute("role", "listbox");
  track.setAttribute("aria-label", "brushes");

  const pointer = document.createElement("div");
  pointer.className = "brush-arc-pointer";
  pointer.setAttribute("aria-hidden", "true");

  const readout = document.createElement("div");
  readout.className = "brush-arc-readout";
  const readName = document.createElement("span");
  readName.className = "brush-arc-readout-name";
  readout.append(readName);

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
    spoke.append(mark);
    tick.append(spoke);
    track.append(tick);
  }

  face.append(ring, hashes, track, pointer, readout);
  host.append(face);

  function angleAt(event) {
    const box = face.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height;
    return {
      deg: (Math.atan2(event.clientY - cy, event.clientX - cx) * 180) / Math.PI,
      dist: Math.hypot(event.clientX - cx, event.clientY - cy),
    };
  }

  function applyTurn(nextTurn, emit) {
    turn = nextTurn;
    const name = brushFromTurn(turn);
    const index = brushIndex(name);
    hashes.style.setProperty("--turn", `${turn}deg`);
    face.setAttribute("aria-valuenow", String(index));
    face.setAttribute("aria-valuetext", name.toLowerCase());
    readName.textContent = name.toLowerCase();
    for (const tick of track.querySelectorAll(".brush-arc-tick")) {
      const on = tick.dataset.brush === name;
      const ang = Number(tick.dataset.index) * STEP + turn;
      const away = fromApex(ang);
      tick.classList.toggle("is-active", on);
      tick.classList.toggle("is-far", away > VISIBLE);
      tick.setAttribute("aria-selected", on ? "true" : "false");
      tick.style.setProperty("--ang", `${ang}deg`);
      tick.style.setProperty("--from", String(away));
    }
    if (emit && name !== current) {
      current = name;
      onChange?.(current);
    } else {
      current = name;
    }
  }

  function commit(name, emit) {
    const next = BRUSH_TYPES.includes(name) ? name : "HB";
    applyTurn(-brushIndex(next) * STEP, emit);
  }

  let dragging = false;
  let dragged = false;
  let dragStartX = 0;
  let dragStartTurn = 0;
  let dragStartAngle = 0;

  face.addEventListener("pointerdown", (event) => {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
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
    const byArc = next.dist > 40 ? dAngle : dx * DEG_PER_PX;
    applyTurn(dragStartTurn + byArc, true);
  });
  const endDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    face.classList.remove("is-dragging");
    if (!dragged) {
      const tick = event.target instanceof Element ? event.target.closest(".brush-arc-tick") : null;
      if (tick?.dataset.brush) {
        commit(tick.dataset.brush, true);
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
