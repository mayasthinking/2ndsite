import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPOSITION_SCALE_MAX,
  COMPOSITION_SCALE_MID,
  COMPOSITION_SCALE_MIN,
  SIZE_SCALES,
  compositionFromScale,
  compositionFromSizeScale,
  compositionPreviewScale,
  compositionVisualScale,
  formatSizeScale,
  nearestSizeScale,
  sizeScaleFromComposition,
} from "./effect-model.js";

test("compositionVisualScale keeps 1x at the default midpoint and reaches 4x", () => {
  assert.equal(compositionVisualScale(0), COMPOSITION_SCALE_MIN);
  assert.equal(compositionVisualScale(0.5), COMPOSITION_SCALE_MID);
  assert.equal(compositionVisualScale(1), COMPOSITION_SCALE_MAX);
});

test("compositionFromScale inverts compositionVisualScale", () => {
  for (const value of [0, 0.25, 0.5, 0.75, 1]) {
    assert.ok(Math.abs(compositionFromScale(compositionVisualScale(value)) - value) < 1e-9);
  }
});

test("size dial steps map to composition and back", () => {
  assert.deepEqual(SIZE_SCALES, [1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4]);
  assert.equal(formatSizeScale(1), "1x");
  assert.equal(formatSizeScale(1.25), "1.25x");
  assert.equal(formatSizeScale(2), "2x");
  assert.equal(nearestSizeScale(1.3), 1.25);
  assert.equal(nearestSizeScale(3.8), 4);
  assert.equal(sizeScaleFromComposition(0.5), 1);
  assert.equal(sizeScaleFromComposition(1), 4);
  assert.equal(compositionFromSizeScale(1), 0.5);
  assert.equal(compositionFromSizeScale(4), 1);
  assert.ok(Math.abs(compositionVisualScale(compositionFromSizeScale(2)) - 2) < 1e-9);
});

test("compositionPreviewScale is relative to the painted size", () => {
  assert.equal(compositionPreviewScale(0.5, 0.5), 1);
  assert.ok(Math.abs(compositionPreviewScale(0.5, 1) - 4) < 1e-9);
  assert.ok(compositionPreviewScale(0.5, 0) < 1);
});
