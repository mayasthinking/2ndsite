import { clampEffects } from "./effect-model.js?v=15";
import { oklchToHex, hexToRgb } from "./color.js";

export const PAPER = { r: 243, g: 238, b: 228 };
export const CELLS = 96;
export const PREVIEW_CELLS = 40;

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function lumaOf(c) {
  return (c.r * 0.3 + c.g * 0.59 + c.b * 0.11) / 255;
}

function rgbToHsl(c) {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-6) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  if (s < 1e-6) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t) => {
    let x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * ((2 / 3 - x) * 6);
    return p;
  };
  return {
    r: hue(h + 1 / 3) * 255,
    g: hue(h) * 255,
    b: hue(h - 1 / 3) * 255,
  };
}

function toHex(c) {
  const hex = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;
}

function pigmentize(c, wet, tint = null, tintAmt = 0) {
  let base = c;
  if (tint && tintAmt > 0) {
    base = {
      r: c.r + (tint.r - c.r) * tintAmt,
      g: c.g + (tint.g - c.g) * tintAmt,
      b: c.b + (tint.b - c.b) * tintAmt,
    };
  }
  const hsl = rgbToHsl(base);
  const sat = Math.min(1, hsl.s * (wet ? 1.16 : 1.06) + (hsl.s > 0.04 ? 0.03 : 0));
  const light = clamp(hsl.l * (wet ? 0.96 : 0.92), 0.06, 0.9);
  return hslToRgb(hsl.h, sat, light);
}

function makeCanvas(width, height) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function rasterContain(source, cells) {
  const canvas = makeCanvas(cells, cells);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.clearRect(0, 0, cells, cells);
  const width = source.width || source.naturalWidth;
  const height = source.height || source.naturalHeight;
  const scale = Math.max(cells / width, cells / height);
  const w = width * scale;
  const h = height * scale;
  ctx.drawImage(source, (cells - w) / 2, (cells - h) / 2, w, h);
  return ctx.getImageData(0, 0, cells, cells).data;
}

function at(data, cells, x, y) {
  const i = (clamp(y, 0, cells - 1) * cells + clamp(x, 0, cells - 1)) * 4;
  if (data[i + 3] < 20) return null;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

function regionStats(data, cells, x0, y0, x1, y1) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  let rMin = 255;
  let gMin = 255;
  let bMin = 255;
  let rMax = 0;
  let gMax = 0;
  let bMax = 0;
  let lumaMin = 1;
  let lumaMax = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const c = at(data, cells, x, y);
      if (!c) continue;
      r += c.r;
      g += c.g;
      b += c.b;
      n += 1;
      if (c.r < rMin) rMin = c.r;
      if (c.g < gMin) gMin = c.g;
      if (c.b < bMin) bMin = c.b;
      if (c.r > rMax) rMax = c.r;
      if (c.g > gMax) gMax = c.g;
      if (c.b > bMax) bMax = c.b;
      const luma = lumaOf(c);
      if (luma < lumaMin) lumaMin = luma;
      if (luma > lumaMax) lumaMax = luma;
    }
  }
  if (!n) return { empty: true, color: { ...PAPER }, range: 0, lumaRange: 0, luma: 1 };
  const color = { r: r / n, g: g / n, b: b / n };
  const local = at(data, cells, (x0 + x1) >> 1, (y0 + y1) >> 1) || color;
  return {
    empty: false,
    color,
    local,
    range: Math.max(rMax - rMin, gMax - gMin, bMax - bMin),
    lumaRange: lumaMax - lumaMin,
    luma: lumaOf(color),
  };
}

function collectDabs(data, cells, { fast = false } = {}) {
  const dabs = [];
  const minLeaf = fast ? 5 : 3;
  const alwaysSplit = fast ? 12 : 8;
  const washAt = fast ? 16 : 12;
  function visit(x0, y0, x1, y1) {
    const w = x1 - x0;
    const h = y1 - y0;
    if (w < 1 || h < 1) return;
    const stats = regionStats(data, cells, x0, y0, x1, y1);
    if (stats.empty) return;
    const span = Math.max(w, h);
    const varied = stats.range > 12 || stats.lumaRange > 0.04;
    const shouldSplit = span > minLeaf && (varied || span > alwaysSplit);
    if (shouldSplit) {
      const mx = (x0 + x1) >> 1;
      const my = (y0 + y1) >> 1;
      if (mx > x0 && my > y0 && mx < x1 && my < y1) {
        if (span >= washAt) {
          dabs.push({
            gx0: x0,
            gy0: y0,
            gx1: x1,
            gy1: y1,
            color: stats.color,
            luma: stats.luma,
            range: stats.range,
            area: w * h,
            wash: true,
          });
        }
        visit(x0, y0, mx, my);
        visit(mx, y0, x1, my);
        visit(x0, my, mx, y1);
        visit(mx, my, x1, y1);
        return;
      }
    }
    dabs.push({
      gx0: x0,
      gy0: y0,
      gx1: x1,
      gy1: y1,
      color: span <= alwaysSplit ? stats.local : stats.color,
      luma: lumaOf(span <= alwaysSplit ? stats.local : stats.color),
      range: stats.range,
      area: w * h,
      wash: false,
    });
  }
  visit(0, 0, cells, cells);
  return dabs;
}

function wobble(rand, span, amount) {
  return (rand() - 0.5) * span * amount;
}

function cellPoly(dab, scale, rand, tight) {
  const l = dab.gx0 * scale;
  const t = dab.gy0 * scale;
  const r = dab.gx1 * scale;
  const b = dab.gy1 * scale;
  const w = r - l;
  const h = b - t;
  const pad = tight ? 0.05 : 0.09;
  const j = tight ? 0.05 : 0.11;
  const ox = w * pad;
  const oy = h * pad;
  const mx = (l + r) / 2;
  const my = (t + b) / 2;
  return [
    [l - ox + wobble(rand, w, j), t - oy + wobble(rand, h, j)],
    [mx + wobble(rand, w, j), t - oy + wobble(rand, h, j)],
    [r + ox + wobble(rand, w, j), t - oy + wobble(rand, h, j)],
    [r + ox + wobble(rand, w, j), my + wobble(rand, h, j)],
    [r + ox + wobble(rand, w, j), b + oy + wobble(rand, h, j)],
    [mx + wobble(rand, w, j), b + oy + wobble(rand, h, j)],
    [l - ox + wobble(rand, w, j), b + oy + wobble(rand, h, j)],
    [l - ox + wobble(rand, w, j), my + wobble(rand, h, j)],
  ];
}

function colorDelta(a, b) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) / 255;
}

/** Distinct canvas-preview profiles so each mobile brush tap looks different. */
const BRUSH_PREVIEW = {
  HB: {
    wet: true,
    opacityMul: 1,
    dabKeep: 1,
    wobble: 1,
    tightBias: false,
    lineBudget: 36,
    lineWeight: 0.38,
    darken: 1,
    blur: 1.15,
    fillAlpha: 0.58,
    secondPass: 0.42,
    lineAlpha: 0.48,
    lineScale: 1.6,
    lineCap: "round",
    stipple: false,
    hardEdge: false,
  },
  "2B": {
    wet: true,
    opacityMul: 1.28,
    dabKeep: 1,
    wobble: 1.25,
    tightBias: false,
    lineBudget: 30,
    lineWeight: 0.7,
    darken: 0.82,
    blur: 1.55,
    fillAlpha: 0.72,
    secondPass: 0.55,
    lineAlpha: 0.62,
    lineScale: 2.2,
    lineCap: "round",
    stipple: false,
    hardEdge: false,
  },
  "2H": {
    wet: true,
    opacityMul: 0.62,
    dabKeep: 0.72,
    wobble: 0.55,
    tightBias: true,
    lineBudget: 52,
    lineWeight: 0.18,
    darken: 1.12,
    blur: 0.7,
    fillAlpha: 0.34,
    secondPass: 0.22,
    lineAlpha: 0.4,
    lineScale: 0.9,
    lineCap: "round",
    stipple: false,
    hardEdge: false,
  },
  charcoal: {
    wet: false,
    opacityMul: 1.35,
    dabKeep: 0.88,
    wobble: 0.7,
    tightBias: true,
    lineBudget: 48,
    lineWeight: 0.95,
    darken: 0.55,
    blur: 0.28,
    fillAlpha: 0.84,
    secondPass: 0.62,
    lineAlpha: 0.78,
    lineScale: 2.6,
    lineCap: "square",
    stipple: false,
    hardEdge: true,
  },
  cpencil: {
    wet: false,
    opacityMul: 0.48,
    dabKeep: 0.55,
    wobble: 0.35,
    tightBias: true,
    lineBudget: 64,
    lineWeight: 0.14,
    darken: 0.9,
    blur: 0.2,
    fillAlpha: 0.28,
    secondPass: 0.18,
    lineAlpha: 0.66,
    lineScale: 0.75,
    lineCap: "round",
    stipple: false,
    hardEdge: true,
  },
  crayon: {
    wet: false,
    opacityMul: 1.08,
    dabKeep: 0.8,
    wobble: 1.7,
    tightBias: false,
    lineBudget: 28,
    lineWeight: 1.15,
    darken: 0.92,
    warm: 18,
    blur: 0.55,
    fillAlpha: 0.7,
    secondPass: 0.48,
    lineAlpha: 0.58,
    lineScale: 2.8,
    lineCap: "round",
    stipple: false,
    hardEdge: false,
  },
  spray: {
    wet: false,
    opacityMul: 0.4,
    dabKeep: 0.45,
    wobble: 2.2,
    tightBias: false,
    lineBudget: 12,
    lineWeight: 1.6,
    darken: 1.05,
    blur: 0.15,
    fillAlpha: 0.22,
    secondPass: 0.12,
    lineAlpha: 0.28,
    lineScale: 0.5,
    lineCap: "round",
    stipple: true,
    hardEdge: true,
  },
  marker: {
    wet: true,
    opacityMul: 1.45,
    dabKeep: 0.62,
    wobble: 0.2,
    tightBias: true,
    lineBudget: 18,
    lineWeight: 1.35,
    darken: 0.88,
    blur: 0.05,
    fillAlpha: 0.88,
    secondPass: 0.2,
    lineAlpha: 0.82,
    lineScale: 3.4,
    lineCap: "square",
    stipple: false,
    hardEdge: true,
  },
};

export function brushPreviewProfile(brushType) {
  return BRUSH_PREVIEW[brushType] || BRUSH_PREVIEW.HB;
}

function planMarks(data, cells, size, rand, brushType, tint = null, tintAmt = 0, opts = {}) {
  const profile = brushPreviewProfile(brushType);
  const wet = profile.wet;
  const fast = Boolean(opts.fast);
  let dabs = collectDabs(data, cells, { fast });
  dabs.sort((a, b) => Number(b.wash) - Number(a.wash) || b.area - a.area || a.luma - b.luma);
  if (opts.maxDabs && dabs.length > opts.maxDabs) dabs = dabs.slice(0, opts.maxDabs);

  const scale = size / cells;
  const marks = [];
  for (const dab of dabs) {
    if (profile.dabKeep < 1 && rand() > profile.dabKeep) continue;
    let pigment = pigmentize(dab.color, wet, tint, tintAmt);
    pigment = {
      r: pigment.r * profile.darken,
      g: pigment.g * profile.darken,
      b: pigment.b * profile.darken,
    };
    if (profile.warm) {
      pigment = {
        r: clamp(pigment.r + profile.warm, 0, 255),
        g: clamp(pigment.g + profile.warm * 0.45, 0, 255),
        b: clamp(pigment.b - profile.warm * 0.35, 0, 255),
      };
    }
    const wash = Boolean(dab.wash);
    const tight = profile.tightBias || (!wash && (dab.range > 22 || dab.area < 20));
    let opacity = wash
      ? clamp(72 + (1 - dab.luma) * 46, 58, 128)
      : clamp((tight ? 150 : 124) + (1 - dab.luma) * 52, 108, 214);
    opacity = clamp(opacity * profile.opacityMul, 28, 240);
    const jScale = profile.wobble;
    const pts = cellPoly(dab, scale, rand, tight).map(([x, y]) => [
      x + wobble(rand, scale, 0.08 * (jScale - 1)),
      y + wobble(rand, scale, 0.08 * (jScale - 1)),
    ]);
    marks.push({
      kind: "poly",
      pts,
      hex: toHex(pigment),
      opacity,
      bleed: wet ? (wash ? 0.3 : tight ? 0.12 : 0.2) : profile.hardEdge ? 0.04 : 0.1,
      texture: wet ? (tight ? 0.38 : 0.3) : profile.stipple ? 0.7 : 0.45,
      border: wet ? (tight ? 0.32 : 0.22) : 0.35,
      stipple: Boolean(profile.stipple),
    });
  }

  if (opts.skipLines) return marks;

  const lineBudget = Math.max(4, Math.round(profile.lineBudget * (opts.lineScale || 1)));
  const edges = [];
  for (let y = 1; y < cells - 1; y++) {
    for (let x = 1; x < cells - 1; x++) {
      const here = at(data, cells, x, y);
      if (!here) continue;
      const luma = lumaOf(here);
      if (luma > 0.97) continue;
      const right = at(data, cells, x + 1, y);
      const left = at(data, cells, x - 1, y);
      const down = at(data, cells, x, y + 1);
      const up = at(data, cells, x, y - 1);
      if (!right || !left || !down || !up) continue;
      const gx = lumaOf(right) - lumaOf(left);
      const gy = lumaOf(down) - lumaOf(up);
      const lumaMag = Math.hypot(gx, gy);
      const chromaMag = Math.hypot(colorDelta(right, left), colorDelta(down, up));
      const mag = Math.max(lumaMag, chromaMag);
      if (mag < 0.07) continue;
      edges.push({ x, y, gx, gy, mag, color: here });
    }
  }
  edges.sort((a, b) => b.mag - a.mag);
  const step = Math.max(1, Math.floor(edges.length / (lineBudget * 3)));
  let drawn = 0;
  for (let i = 0; i < edges.length && drawn < lineBudget; i += step) {
    const edge = edges[i];
    const nlen = Math.hypot(-edge.gy, edge.gx) || 1;
    const len = scale * (0.45 + edge.mag * 0.9) * (0.75 + profile.wobble * 0.25);
    let pigment = pigmentize(edge.color, wet, tint, tintAmt);
    pigment = {
      r: pigment.r * profile.darken * 0.78,
      g: pigment.g * profile.darken * 0.78,
      b: pigment.b * profile.darken * 0.78,
    };
    marks.push({
      kind: "line",
      x1: (edge.x + 0.5) * scale - (-edge.gy / nlen) * len,
      y1: (edge.y + 0.5) * scale - (edge.gx / nlen) * len,
      x2: (edge.x + 0.5) * scale + (-edge.gy / nlen) * len,
      y2: (edge.y + 0.5) * scale + (edge.gx / nlen) * len,
      hex: toHex(pigment),
      weight: profile.lineWeight,
    });
    drawn += 1;
  }

  return marks;
}

export function planFromPixels(data, cells, size, seed, effects, opts = {}) {
  const e = clampEffects(effects || {});
  const tintHex = e.color ? oklchToHex(e.color) : null;
  const tint = tintHex ? hexToRgb(tintHex) : null;
  // Keep pigment mixes strong enough that mobile color taps read clearly in the fast preview.
  const tintAmt = tint ? 0.28 + (Number(e.pigment) || 0.5) * 0.55 : 0;
  return planMarks(
    data,
    cells,
    size,
    mulberry32(Number(seed) || 1),
    e.brushType || "HB",
    tint,
    tintAmt,
    opts
  );
}

export function averageHex(source) {
  const canvas = makeCanvas(24, 24);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, 24, 24);
  const data = ctx.getImageData(0, 0, 24, 24).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] + data[i + 1] + data[i + 2] > 700) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n += 1;
  }
  if (!n) return "#8b2f32";
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function splitSubjectFromImageData(image) {
  const w = image.width;
  const h = image.height;
  const src = image.data;
  const base = new Uint8ClampedArray(src.length);
  const lift = new Uint8ClampedArray(src.length);
  const hitsSize = 72;
  const hits = new Uint8Array(hitsSize * hitsSize);
  const pr = PAPER.r;
  const pg = PAPER.g;
  const pb = PAPER.b;
  for (let i = 0, p = 0; i < src.length; i += 4, p += 1) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    const dist = Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb);
    const t = Math.max(0, Math.min(1, (dist - 14) / 32));
    const a = Math.round(t * 255);
    lift[i] = r;
    lift[i + 1] = g;
    lift[i + 2] = b;
    lift[i + 3] = a;
    base[i] = r + (pr - r) * t;
    base[i + 1] = g + (pg - g) * t;
    base[i + 2] = b + (pb - b) * t;
    base[i + 3] = 255;
    const hx = Math.min(hitsSize - 1, Math.floor(((p % w) / w) * hitsSize));
    const hy = Math.min(hitsSize - 1, Math.floor((Math.floor(p / w) / h) * hitsSize));
    const hi = hy * hitsSize + hx;
    if (a > hits[hi]) hits[hi] = a;
  }
  return { width: w, height: h, base, lift, hits: Array.from(hits), hitsSize };
}

export async function blobToDataUrl(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}
