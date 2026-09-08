import { parseColor, oklchToHex, mixOklch } from "./color.js";

const PAPER = parseColor("#faf9f6");
const SHADE = parseColor("#302822");
const WARM = parseColor("#d2602a");
const COOL = parseColor("#6e8eba");
const GOLD = parseColor("#c49646");
const SLATE = parseColor("#565c76");
const CHAR = parseColor("#463e3a");
const DUST = parseColor("#a8845c");
const ROSE = parseColor("#c45450");
const CANVAS_SCALE = 2.8;

const BRUSH_PRESETS = {
  HB: {
    type: "default",
    weight: 0.46,
    scatter: 0.78,
    sharpness: 0.26,
    grain: 1.05,
    opacity: 196,
    spacing: 0.09,
    pressure: { curve: [0.12, 0.28], min_max: [1.16, 0.86] },
  },
  "2B": {
    type: "default",
    weight: 0.4,
    scatter: 0.86,
    sharpness: 0.4,
    grain: 1.02,
    opacity: 194,
    spacing: 0.09,
    pressure: { curve: [0.1, 0.34], min_max: [1.14, 0.86] },
  },
  "2H": {
    type: "default",
    weight: 0.2,
    scatter: 0.6,
    sharpness: 0.3,
    grain: 0.75,
    opacity: 120,
    spacing: 0.1,
    pressure: { curve: [0.15, 0.2], min_max: [1.1, 0.9] },
  },
  charcoal: {
    type: "default",
    weight: 0.35,
    scatter: 1.5,
    sharpness: 0.68,
    grain: 2,
    opacity: 120,
    spacing: 0.03,
    pressure: { curve: [0.15, 0.4], min_max: [1.1, 0.95] },
  },
  cpencil: {
    type: "default",
    weight: 0.35,
    scatter: 0.55,
    sharpness: 0.8,
    grain: 0.7,
    opacity: 75,
    spacing: 0.1,
    pressure: { curve: [0.15, 0.2], min_max: [0.95, 1.1] },
  },
  crayon: {
    type: "default",
    weight: 0.55,
    scatter: 0.38,
    sharpness: 0.4,
    grain: 1.1,
    opacity: 168,
    spacing: 0.085,
    pressure: [1.08, 0.86],
    rotate: "natural",
    noise: 0.65,
  },
  spray: {
    type: "spray",
    weight: 0.2,
    scatter: 6,
    sharpness: 15,
    grain: 40,
    opacity: 90,
    spacing: 0.5,
    pressure: { curve: [0.2, 0.35], min_max: [0.7, 1] },
  },
  marker: {
    type: "marker",
    weight: 2,
    scatter: 0.2,
    opacity: 1,
    spacing: 0.03,
    pressure: { curve: [0.35, 0.25], min_max: [1.2, 0.85] },
  },
};

const TYPE_FILL = {
  spray: { texture: 1.8, bleed: 0.82, border: 0.42, irregularity: 1.45, scatter: true, line: 1.7 },
  marker: { texture: 0.12, bleed: 0.2, border: 1.8, irregularity: 0.35, scatter: false, line: 2.1 },
  charcoal: { texture: 1.7, bleed: 0.48, border: 0.72, irregularity: 1.25, scatter: true, line: 1.45 },
  cpencil: { texture: 0.78, bleed: 0.34, border: 1.45, irregularity: 0.7, scatter: false, line: 1.15 },
  crayon: { texture: 1.55, bleed: 0.26, border: 1.12, irregularity: 1.2, scatter: true, line: 1.7 },
  "2B": { texture: 1.5, bleed: 0.98, border: 1.12, irregularity: 1.28, line: 1.22 },
  "2H": { texture: 0.42, bleed: 0.38, border: 1.55, irregularity: 0.62, scatter: false, line: 0.85 },
  HB: { texture: 1.42, bleed: 0.72, border: 1.4, irregularity: 1.32, line: 1.22 },
};

const TYPE_MASS = {
  crayon: { precision: 0.28, strength: 0.94, gradient: 0.42, maxSpan: 520, minOpacity: 40 },
  charcoal: { precision: 0.2, strength: 0.88, gradient: 0.5, maxSpan: 520, minOpacity: 40 },
  cpencil: { precision: 0.52, strength: 0.72, gradient: 0.18, maxSpan: 460, minOpacity: 48 },
  spray: { precision: 0.16, strength: 0.82, gradient: 0.58, maxSpan: 540, minOpacity: 36 },
};

let current = window.__effects || null;
let patched = false;
let originals = null;
let lastFill = null;

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function amp(value, low, high) {
  return lerp(low, high, clamp(Number(value) || 0.5, 0, 1));
}

function mixAmt(value, whenLow, whenHigh) {
  const d = (clamp(Number(value) || 0.5, 0, 1) - 0.5) * 2;
  return d < 0 ? -d * whenLow : d * whenHigh;
}

function hueShift(ok, turns) {
  let h = ok.h + turns * 48;
  h = ((h % 360) + 360) % 360;
  return { ...ok, h };
}

function saturate(ok, amount) {
  return { ...ok, c: Math.max(0, ok.c * amount) };
}

function typeBias(e) {
  return TYPE_FILL[e?.brushType] || TYPE_FILL.HB;
}

function isDry(e) {
  return Boolean(TYPE_MASS[e?.brushType]);
}

function beginMass(span) {
  const e = current;
  const spec = TYPE_MASS[e?.brushType];
  if (!spec || !lastFill || !originals?.mass) return false;
  if (span > spec.maxSpan) return false;
  if ((lastFill.opacity || 0) < spec.minOpacity) return false;
  try {
    originals.mass(e.brushType, lastFill.color, {
      precision: spec.precision * amp(e.brushSharpness, 0.7, 1.25),
      strength: spec.strength * amp(e.brushWeight, 0.72, 1.12),
      gradient: spec.gradient,
      outline: false,
    });
    return true;
  } catch {
    originals.fill?.(lastFill.color, lastFill.opacity);
    return false;
  }
}

function endMass(used) {
  if (used) originals.noMass?.();
}

function styleColor(color, e) {
  let ok = parseColor(color) || parseColor("#8b2f32");
  if (window.__photoPaint) {
    ok = saturate(ok, amp(e.density, 1.05, 1.28));
    const pigment = parseColor(e.color);
    if (pigment) ok = mixOklch(ok, pigment, amp(e.intimacy, 0.04, 0.18));
    return oklchToHex(ok);
  }
  const pigment = parseColor(e.color);
  if (pigment) ok = mixOklch(ok, pigment, amp(e.pigment, 0.22, 0.88));

  ok = mixOklch(ok, PAPER, mixAmt(e.luminosity, 0, 0.28));
  ok = mixOklch(ok, SHADE, mixAmt(e.luminosity, 0.18, 0));
  ok = mixOklch(ok, PAPER, mixAmt(e.transparency, 0, 0.16));
  ok = mixOklch(ok, PAPER, mixAmt(e.vulnerability, 0, 0.14));
  ok = mixOklch(ok, PAPER, mixAmt(e.dreaminess, 0, 0.1));
  ok = mixOklch(ok, WARM, mixAmt(e.warmth, 0, 0.18));
  ok = mixOklch(ok, COOL, mixAmt(e.warmth, 0.12, 0));
  ok = mixOklch(ok, GOLD, mixAmt(e.valence, 0, 0.12));
  ok = mixOklch(ok, SLATE, mixAmt(e.valence, 0.08, 0));
  ok = mixOklch(ok, CHAR, mixAmt(e.eventImminence, 0, 0.1));
  ok = mixOklch(ok, DUST, mixAmt(e.nostalgia, 0, 0.08));
  ok = hueShift(ok, e.uncanniness - 0.5);
  ok = saturate(ok, amp(e.psychologicalSpecificity, 0.78, 1.38) * amp(e.pigment, 0.9, 1.22));
  ok = saturate(ok, amp(e.density, 0.9, 1.16));
  if ((ok.c || 0) < 0.06 && (ROSE.c || 0) > 0) {
    ok = { ...ok, c: Math.max(ok.c || 0, ROSE.c * 0.45) };
  }
  return oklchToHex(ok);
}

function styleOpacity(opacity, e) {
  let next = Number(opacity);
  if (!Number.isFinite(next)) next = 80;
  if (window.__photoPaint) {
    next *= amp(e.brushWeight, 0.92, 1.22);
    next *= amp(e.density, 0.94, 1.22);
    return clamp(next, 48, 228);
  }
  next *= amp(e.transparency, 1.45, 0.52);
  next *= amp(e.density, 0.62, 1.38);
  next *= amp(e.pigment, 0.7, 1.32);
  next *= amp(e.vulnerability, 1.12, 0.72);
  next *= amp(e.dreaminess, 1.08, 0.78);
  next *= amp(e.eventImminence, 0.88, 1.18);
  next *= amp(e.luminosity, 1.12, 0.86);
  next *= amp(e.brushWeight, 0.9, 1.32);
  if (TYPE_MASS[e.brushType]) next *= 0.78;
  else next *= 1.18;
  if (e.brushType === "marker") next *= 1.2;
  return clamp(next, 24, 228);
}

function styleBleed(strength, e) {
  let next = Number(strength);
  if (!Number.isFinite(next)) next = 0.45;
  next *= amp(e.bleed, 0.22, 1.45);
  next *= amp(e.edgeSoftness, 0.42, 1.42);
  next *= amp(e.dreaminess, 0.82, 1.32);
  next *= amp(e.temporalAmbiguity, 0.86, 1.28);
  next *= amp(e.stillness, 1.12, 0.74);
  next *= amp(e.brushWeight, 0.62, 1.38);
  next *= amp(e.brushSharpness, 1.28, 0.58);
  next *= typeBias(e).bleed;
  return clamp(next, 0, 1);
}

function styleTexture(texture, border, e) {
  let t = Number(texture);
  let b = Number(border);
  if (!Number.isFinite(t)) t = 0.4;
  if (!Number.isFinite(b)) b = 0.26;
  t *= amp(e.granulation, 0.4, 2.05);
  t *= amp(e.brushGrain, 0.5, 2.1);
  t *= amp(e.brushScatter, 0.82, 1.42);
  t *= amp(e.density, 0.82, 1.34);
  t *= amp(e.nostalgia, 0.94, 1.2);
  t *= typeBias(e).texture;
  b *= amp(e.edgeSoftness, 1.22, 0.58);
  b *= amp(e.brushSharpness, 0.62, 1.38);
  b *= amp(e.brushWeight, 0.92, 1.28);
  b *= amp(e.stillness, 0.86, 1.14);
  b *= typeBias(e).border;
  return [clamp(t, 0.14, 1), clamp(b, 0.12, 1)];
}

function point(x, y, e) {
  const cx = typeof window.width === "number" ? window.width / 2 : 400;
  const cy = typeof window.height === "number" ? window.height / 2 : 400;
  let scale = 1;
  scale *= amp(e.composition, 0.58, 1.48);
  scale *= amp(e.openness, 1.16, 0.78);
  scale *= amp(e.intimacy, 0.86, 1.2);
  scale *= amp(e.grandeur, 0.88, 1.24);
  scale *= amp(e.spatialDepth, 1.08, 0.9);
  const reach = (typeof window.width === "number" ? window.width : 720) / 2;
  const dx = amp(e.placeX, -reach, reach);
  const dy = amp(e.placeY, reach, -reach);
  return {
    x: cx + (x - cx) * scale + dx,
    y: cy + (y - cy) * scale + dy,
  };
}

function radius(r, e) {
  if (window.__photoPaint) return r;
  return r * amp(e.composition, 0.84, 1.14) * amp(e.grandeur, 0.9, 1.16);
}

function irregularity(value, e) {
  let next = Number(value);
  if (!Number.isFinite(next)) next = 0.44;
  next *= amp(e.stillness, 1.32, 0.34);
  next *= amp(e.arousal, 0.78, 1.38);
  next *= amp(e.dreaminess, 0.88, 1.22);
  next *= amp(e.brushScatter, 0.62, 1.52);
  next *= typeBias(e).irregularity;
  return clamp(next, 0.08, 1);
}

function applyStudioBrushes() {
  const brush = window.brush;
  const e = current;
  if (!brush?.add || !e) return;
  const w = amp(e.brushWeight, 0.7, 1.62);
  const sc = amp(e.brushScatter, 0.58, 1.58);
  const g = amp(e.brushGrain, 0.68, 1.72);
  const sp = amp(e.brushSpacing, 0.55, 1.55);
  const sh = amp(e.brushSharpness, 0.52, 1.48);
  for (const [name, base] of Object.entries(BRUSH_PRESETS)) {
    const params = {
      type: base.type || "default",
      weight: base.weight * CANVAS_SCALE * w,
      scatter: base.scatter * CANVAS_SCALE * sc,
      spacing: base.spacing * CANVAS_SCALE * sp,
      opacity: base.opacity,
      pressure: base.pressure,
    };
    if (base.sharpness != null) params.sharpness = base.sharpness * sh;
    if (base.grain != null) params.grain = base.grain * g;
    if (base.rotate) params.rotate = base.rotate;
    if (base.noise != null) params.noise = base.noise;
    try {
      brush.add(name, params);
    } catch {
      // skip a preset the runtime rejects
    }
  }
}

function patchBrush() {
  if (patched || typeof window.brush === "undefined") return;
  const brush = window.brush;
  originals = {
    fill: brush.fill.bind(brush),
    fillBleed: brush.fillBleed.bind(brush),
    fillTexture: brush.fillTexture.bind(brush),
    circle: brush.circle.bind(brush),
    polygon: brush.polygon.bind(brush),
    line: brush.line.bind(brush),
    set: brush.set.bind(brush),
    noStroke: brush.noStroke.bind(brush),
    noFill: brush.noFill?.bind(brush),
    mass: brush.mass?.bind(brush),
    noMass: brush.noMass?.bind(brush),
  };
  patched = true;

  brush.fill = function (color, opacity) {
    const e = current;
    if (!e) {
      lastFill = { color, opacity };
      return originals.fill(color, opacity);
    }
    const next = { color: styleColor(color, e), opacity: styleOpacity(opacity, e) };
    lastFill = next;
    if (isDry(e)) {
      originals.noFill?.();
      return;
    }
    return originals.fill(next.color, next.opacity);
  };

  brush.fillBleed = function (strength) {
    const e = current;
    if (!e) return originals.fillBleed(strength);
    return originals.fillBleed(styleBleed(strength, e));
  };

  brush.fillTexture = function (texture, border, scatter) {
    const e = current;
    if (!e) return originals.fillTexture(texture, border, scatter);
    const [t, b] = styleTexture(texture, border, e);
    const bias = typeBias(e);
    const sc =
      bias.scatter === true
        ? true
        : bias.scatter === false
          ? false
          : scatter !== false && (Number(e.brushScatter) || 0.5) >= 0.18;
    return originals.fillTexture(t, b, sc);
  };

  brush.circle = function (x, y, r, irr) {
    const e = current;
    if (!e) return originals.circle(x, y, r, irr);
    const p = point(x, y, e);
    const rad = radius(r, e);
    const used = beginMass(rad * 2);
    try {
      return originals.circle(p.x, p.y, rad, irregularity(irr, e));
    } finally {
      endMass(used);
    }
  };

  brush.polygon = function (pts) {
    const e = current;
    if (!e || !Array.isArray(pts)) return originals.polygon(pts);
    const mapped = pts.map(([x, y]) => {
      const p = point(x, y, e);
      return [p.x, p.y];
    });
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of mapped) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const used = beginMass(Math.max(maxX - minX, maxY - minY));
    try {
      return originals.polygon(mapped);
    } finally {
      endMass(used);
    }
  };

  brush.line = function (x1, y1, x2, y2) {
    const e = current;
    if (!e) return originals.line(x1, y1, x2, y2);
    const a = point(x1, y1, e);
    const b = point(x2, y2, e);
    return originals.line(a.x, a.y, b.x, b.y);
  };

  brush.set = function (name, color, weight) {
    const e = current;
    if (!e) return originals.set(name, color, weight);
    const chosen = BRUSH_PRESETS[e.brushType] ? e.brushType : name;
    const w = Number(weight);
    const scale = typeBias(e).line || 1;
    const nextW = Number.isFinite(w) ? w * amp(e.density, 0.8, 1.25) * scale : weight;
    return originals.set(chosen, styleColor(color, e), nextW);
  };
}

window.__applyStudioBrush = applyStudioBrushes;

window.__setBrushEffects = function (effects) {
  current = effects && typeof effects === "object" ? effects : null;
  window.__effects = current;
  lastFill = null;
  patchBrush();
};
