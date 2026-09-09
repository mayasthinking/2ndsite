import { hexToOklch, parseColor, formatOklch } from "./color.js";

export const DEFAULT_COLOR = hexToOklch("#8b2f32");

export const BRUSH_TYPES = ["HB", "2B", "2H", "charcoal", "cpencil", "crayon", "spray", "marker"];

export const BRUSH_SLIDERS = [
  { id: "brushWeight", label: "weight" },
  { id: "brushScatter", label: "scatter" },
  { id: "brushGrain", label: "grain" },
  { id: "brushSpacing", label: "spacing" },
  { id: "brushSharpness", label: "sharpness" },
];

export const PLACEMENT_SLIDERS = [
  { id: "placeX", label: "across" },
  { id: "placeY", label: "up" },
  { id: "composition", label: "size" },
];

// Keep in sync with brush-effects.js point() — amp(composition, 0.58, 1.48).
export const COMPOSITION_SCALE_MIN = 0.58;
export const COMPOSITION_SCALE_MAX = 1.48;

function clamp01(value, fallback = 0.5) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(1, Math.max(0, next));
}

export function compositionVisualScale(value) {
  const t = clamp01(value);
  return COMPOSITION_SCALE_MIN + (COMPOSITION_SCALE_MAX - COMPOSITION_SCALE_MIN) * t;
}

export function compositionFromScale(scale) {
  const span = COMPOSITION_SCALE_MAX - COMPOSITION_SCALE_MIN;
  const next = Number(scale);
  if (!Number.isFinite(next) || !(span > 0)) return 0.5;
  return clamp01((next - COMPOSITION_SCALE_MIN) / span);
}

export function pinchComposition(startComposition, startDistance, currentDistance) {
  if (!(startDistance > 0) || !(currentDistance > 0)) return clamp01(startComposition);
  const nextScale = compositionVisualScale(startComposition) * (currentDistance / startDistance);
  return compositionFromScale(
    Math.min(COMPOSITION_SCALE_MAX, Math.max(COMPOSITION_SCALE_MIN, nextScale))
  );
}

export function compositionPreviewScale(startComposition, nextComposition) {
  const startScale = compositionVisualScale(startComposition);
  if (!(startScale > 0)) return 1;
  return compositionVisualScale(nextComposition) / startScale;
}

export function wheelComposition(startComposition, deltaY) {
  const dy = Number(deltaY);
  if (!Number.isFinite(dy) || dy === 0) return clamp01(startComposition);
  const nextScale = compositionVisualScale(startComposition) * Math.exp(-dy * 0.0024);
  return compositionFromScale(
    Math.min(COMPOSITION_SCALE_MAX, Math.max(COMPOSITION_SCALE_MIN, nextScale))
  );
}

export const EFFECT_KEYS = [
  "composition",
  "placeX",
  "placeY",
  "spatialDepth",
  "bleed",
  "granulation",
  "transparency",
  "edgeSoftness",
  "pigment",
  "luminosity",
  "density",
  "warmth",
  "stillness",
  "dreaminess",
  "grandeur",
  "valence",
  "arousal",
  "intimacy",
  "vulnerability",
  "uncanniness",
  "nostalgia",
  "eventImminence",
  "temporalAmbiguity",
  "pointOfView",
  "psychologicalSpecificity",
  "openness",
  "brushWeight",
  "brushScatter",
  "brushGrain",
  "brushSpacing",
  "brushSharpness",
];

export const EFFECT_GROUPS = [
  {
    id: "form",
    label: "form",
    keys: [
      { id: "spatialDepth", label: "depth" },
    ],
  },
  {
    id: "texture",
    label: "texture",
    keys: [
      { id: "granulation", label: "grain" },
      { id: "edgeSoftness", label: "edge" },
    ],
  },
  {
    id: "light",
    label: "light",
    keys: [
      { id: "luminosity", label: "luminosity" },
      { id: "warmth", label: "warmth" },
    ],
  },
  {
    id: "atmosphere",
    label: "atmosphere",
    keys: [
      { id: "density", label: "density" },
      { id: "stillness", label: "stillness" },
    ],
  },
  {
    id: "affect",
    label: "affect",
    keys: [
      { id: "valence", label: "valence" },
      { id: "intimacy", label: "intimacy" },
    ],
  },
];

export function defaultEffects() {
  const effects = { color: { ...DEFAULT_COLOR }, brushType: "HB" };
  for (const key of EFFECT_KEYS) effects[key] = 0.5;
  effects.granulation = 0.62;
  effects.brushGrain = 0.64;
  effects.brushWeight = 0.58;
  effects.brushScatter = 0.56;
  return effects;
}

export function clampEffects(raw = {}) {
  const effects = defaultEffects();
  const parsed = parseColor(raw.color);
  if (parsed) effects.color = parsed;
  if (BRUSH_TYPES.includes(raw.brushType)) effects.brushType = raw.brushType;
  for (const key of EFFECT_KEYS) {
    const value = Number(raw[key]);
    if (Number.isFinite(value)) effects[key] = Math.min(1, Math.max(0, value));
  }
  return effects;
}

function tone(value, low, mid, high) {
  if (value < 0.48) return low;
  if (value > 0.52) return high;
  return mid;
}

export function describeEffects(raw) {
  const e = clampEffects(raw);
  return [
    `Pigment color: ${formatOklch(e.color)}.`,
    `BRUSH — type ${e.brushType}; weight ${e.brushWeight.toFixed(2)} (${tone(e.brushWeight, "fine", "even", "heavy")}); scatter ${e.brushScatter.toFixed(2)} (${tone(e.brushScatter, "held", "some spread", "broken")}); grain ${e.brushGrain.toFixed(2)} (${tone(e.brushGrain, "smooth", "toothy", "gritty")}); spacing ${e.brushSpacing.toFixed(2)} (${tone(e.brushSpacing, "dense", "even", "open")}); sharpness ${e.brushSharpness.toFixed(2)} (${tone(e.brushSharpness, "soft tip", "firm", "crisp")}).`,
    `PLACEMENT — across ${e.placeX.toFixed(2)} (${tone(e.placeX, "left of center", "centered", "right of center")}); up ${e.placeY.toFixed(2)} (${tone(e.placeY, "low on the page", "mid", "high on the page")}); size ${e.composition.toFixed(2)} (${tone(e.composition, "airy and small", "balanced", "large on the page")}).`,
    `FORM — depth ${e.spatialDepth.toFixed(2)} (${tone(e.spatialDepth, "flat and frontal", "some overlap", "receding space")}).`,
    `TEXTURE — grain ${e.granulation.toFixed(2)} (${tone(e.granulation, "smooth wash", "some tooth", "heavy granulation")}); edge ${e.edgeSoftness.toFixed(2)} (${tone(e.edgeSoftness, "held, dry", "soft", "lost")}).`,
    `LIGHT — luminosity ${e.luminosity.toFixed(2)} (${tone(e.luminosity, "dim", "even", "bright")}); warmth ${e.warmth.toFixed(2)} (${tone(e.warmth, "cool", "neutral", "warm")}).`,
    `ATMOSPHERE — density ${e.density.toFixed(2)} (${tone(e.density, "thin air", "present", "heavy")}); stillness ${e.stillness.toFixed(2)} (${tone(e.stillness, "stirred", "calm", "very still")}).`,
    `AFFECT — valence ${e.valence.toFixed(2)} (${tone(e.valence, "tender / low", "even", "bright")}); intimacy ${e.intimacy.toFixed(2)} (${tone(e.intimacy, "distant", "near", "close")}).`,
    e.brushType === "crayon"
      ? "This is wax crayon, not watercolor. Fills become scribbled wax. Build form with overlapping dry color and set + line. Paper must show through. No wet bleed."
      : ["charcoal", "cpencil", "spray"].includes(e.brushType)
        ? `This is dry ${e.brushType}, not a wet wash. Fills become that medium. Use set + line for accents. Keep paper visible.`
        : "Let these qualities shape the wash: how it sits on the page, the grain of the pigment, the light, the air, and the feeling. Use the named brush for any set + line work.",
  ].join("\n");
}
