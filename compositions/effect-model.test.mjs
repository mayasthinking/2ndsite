import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPOSITION_SCALE_MAX,
  COMPOSITION_SCALE_MIN,
  compositionFromScale,
  compositionPreviewScale,
  compositionVisualScale,
  pinchComposition,
  wheelComposition,
} from "./effect-model.js";

test("compositionVisualScale matches the wash renderer range", () => {
  assert.equal(compositionVisualScale(0), COMPOSITION_SCALE_MIN);
  assert.equal(compositionVisualScale(1), COMPOSITION_SCALE_MAX);
  assert.ok(Math.abs(compositionVisualScale(0.5) - 1.03) < 1e-9);
});

test("compositionFromScale inverts compositionVisualScale", () => {
  for (const value of [0, 0.25, 0.5, 0.8, 1]) {
    assert.ok(Math.abs(compositionFromScale(compositionVisualScale(value)) - value) < 1e-9);
  }
});

test("pinchComposition expands and shrinks from finger distance", () => {
  assert.ok(pinchComposition(0.5, 100, 150) > 0.5);
  assert.ok(pinchComposition(0.5, 100, 70) < 0.5);
  assert.ok(Math.abs(pinchComposition(0.5, 100, 100) - 0.5) < 1e-9);
});

test("pinchComposition clamps to the renderer size range", () => {
  assert.equal(pinchComposition(0.5, 80, 400), 1);
  assert.equal(pinchComposition(0.5, 80, 10), 0);
  assert.equal(pinchComposition(0.4, 0, 120), 0.4);
});

test("compositionPreviewScale is relative to the painted size", () => {
  assert.equal(compositionPreviewScale(0.5, 0.5), 1);
  assert.ok(compositionPreviewScale(0.5, 1) > 1);
  assert.ok(compositionPreviewScale(0.5, 0) < 1);
});

test("wheelComposition treats pinch-out (negative delta) as expand", () => {
  assert.ok(wheelComposition(0.5, -80) > 0.5);
  assert.ok(wheelComposition(0.5, 80) < 0.5);
  assert.equal(wheelComposition(0.5, 0), 0.5);
});
