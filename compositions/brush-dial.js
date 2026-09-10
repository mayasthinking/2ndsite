import { BRUSH_TYPES } from "./effect-model.js?v=17";

const DEG_PER_PX = 0.72;
const VISIBLE = 34;

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
  const step = 360 / n;
  const snapped = ((Math.round(-turn / step) % n) + n) % n;
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

export function mountArcDial({ host, items, value, onChange, ariaLabel = "dial" }) {
  if (!host || !items?.length) return null;

  const ids = items.map((item) => String(item.id));
  const step = 360 / ids.length;
  const indexOf = (id) => {
    const index = ids.indexOf(String(id));
    return index >= 0 ? index : 0;
  };
  const fromTurn = (turn) => {
    const n = ids.length;
    const snapped = ((Math.round(-turn / step) % n) + n) % n;
    return ids[snapped];
  };

  let current = ids.includes(String(value)) ? String(value) : ids[0];
  let turn = -indexOf(current) * step;
  host.classList.add("brush-arc");
  host.replaceChildren();

  const face = document.createElement("div");
  face.className = "brush-arc-face";
  face.tabIndex = 0;
  face.setAttribute("role", "slider");
  face.setAttribute("aria-label", ariaLabel);
  face.setAttribute("aria-valuemin", "0");
  face.setAttribute("aria-valuemax", String(ids.length - 1));

  const ring = document.createElement("div");
  ring.className = "brush-arc-ring";
  ring.setAttribute("aria-hidden", "true");

  const hashes = document.createElement("div");
  hashes.className = "brush-arc-hashes";
  hashes.setAttribute("aria-hidden", "true");
  for (let deg = 0; deg < 360; deg += 2) {
    const hash = document.createElement("span");
    hash.className = `brush-arc-hash${deg % 10 === 0 ? " is-major" : ""}`;
    hash.style.setProperty("--ang", `${deg}deg`);
    hashes.append(hash);
  }

  const track = document.createElement("div");
  track.className = "brush-arc-track";
  track.setAttribute("role", "listbox");
  track.setAttribute("aria-label", ariaLabel);

  const pointer = document.createElement("div");
  pointer.className = "brush-arc-pointer";
  pointer.setAttribute("aria-hidden", "true");

  for (const [index, item] of items.entries()) {
    const tick = document.createElement("button");
    tick.type = "button";
    tick.className = "brush-arc-tick";
    tick.dataset.choice = String(item.id);
    tick.dataset.brush = String(item.id);
    tick.dataset.index = String(index);
    tick.setAttribute("role", "option");
    tick.setAttribute("aria-label", item.label);
    tick.tabIndex = -1;
    const spoke = document.createElement("span");
    spoke.className = "brush-arc-spoke";
    const mark = document.createElement("span");
    mark.className = "brush-arc-mark";
    if (item.icon) {
      mark.innerHTML = `<svg class="brush-ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#${item.icon}"></use></svg>`;
    }
    const label = document.createElement("span");
    label.className = "brush-arc-label";
    label.textContent = item.label;
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

  function applyTurn(nextTurn, emit) {
    turn = nextTurn;
    const id = fromTurn(turn);
    const index = indexOf(id);
    const label = items[index]?.label || id;
    hashes.style.setProperty("--turn", `${turn}deg`);
    face.setAttribute("aria-valuenow", String(index));
    face.setAttribute("aria-valuetext", label);
    for (const tick of track.querySelectorAll(".brush-arc-tick")) {
      const on = tick.dataset.choice === id;
      const ang = Number(tick.dataset.index) * step + turn;
      const away = fromApex(ang);
      tick.classList.toggle("is-active", on);
      tick.classList.toggle("is-far", away > VISIBLE);
      tick.setAttribute("aria-selected", on ? "true" : "false");
      tick.style.setProperty("--ang", `${ang}deg`);
      tick.style.setProperty("--from", String(away));
    }
    if (emit && id !== current) {
      current = id;
      onChange?.(current);
    } else {
      current = id;
    }
  }

  function commit(id, emit) {
    const next = ids.includes(String(id)) ? String(id) : ids[0];
    applyTurn(-indexOf(next) * step, emit);
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
    const bySwipe = dx * DEG_PER_PX;
    const byArc = Math.abs(dAngle) > Math.abs(bySwipe) ? dAngle : bySwipe;
    applyTurn(dragStartTurn + byArc, true);
  });
  const endDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    face.classList.remove("is-dragging");
    if (!dragged) {
      const tick = event.target instanceof Element ? event.target.closest(".brush-arc-tick") : null;
      if (tick?.dataset.choice) {
        commit(tick.dataset.choice, true);
        return;
      }
    }
    commit(fromTurn(turn), true);
  };
  face.addEventListener("pointerup", endDrag);
  face.addEventListener("pointercancel", endDrag);

  face.addEventListener("keydown", (event) => {
    const index = indexOf(current);
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      commit(ids[(index + 1) % ids.length], true);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      commit(ids[(index - 1 + ids.length) % ids.length], true);
    } else if (event.key === "Home") {
      event.preventDefault();
      commit(ids[0], true);
    } else if (event.key === "End") {
      event.preventDefault();
      commit(ids[ids.length - 1], true);
    }
  });

  commit(current, false);

  return {
    setValue(nextValue) {
      const next = String(nextValue);
      if (!ids.includes(next) || next === current) return;
      commit(next, false);
    },
    getValue() {
      return current;
    },
    focus() {
      face.focus({ preventScroll: true });
    },
  };
}

export function mountBrushDial({ host, value, onChange }) {
  return mountArcDial({
    host,
    items: BRUSH_TYPES.map((name) => ({
      id: name,
      label: name.toLowerCase(),
      icon: ICONS[name],
    })),
    value,
    ariaLabel: "brush",
    onChange,
  });
}
