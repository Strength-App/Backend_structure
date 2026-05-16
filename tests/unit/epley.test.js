/**
 * epley.test.js
 *
 * Unit tests for the Epley 1RM utility. Covers the formula itself, the
 * sanity guards (weight/reps domain, high-rep cap), the reps==1 special
 * case, and topSetEpley's selection-by-e1RM-not-by-weight contract.
 *
 * Run with:  node --test tests/unit/epley.test.js
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  estimateOneRepMax,
  floorTo5,
  topSetEpley,
} from "../../src/utils/epley.js";

describe("estimateOneRepMax", () => {
  test("reps==1 returns weight directly (no Epley inflation)", () => {
    assert.strictEqual(estimateOneRepMax(225, 1), 225);
    assert.strictEqual(estimateOneRepMax(315, 1), 315);
  });

  test("reps==5 at 200 lb yields 233.33 (Epley)", () => {
    const e = estimateOneRepMax(200, 5);
    assert.ok(Math.abs(e - 233.333) < 0.01, `expected ~233.33, got ${e}`);
  });

  test("reps==10 at 135 lb yields 180 (Epley)", () => {
    // 135 × (1 + 10/30) = 135 × 1.333... = 180
    const e = estimateOneRepMax(135, 10);
    assert.ok(Math.abs(e - 180) < 0.01, `expected ~180, got ${e}`);
  });

  test("weight==0 returns null", () => {
    assert.strictEqual(estimateOneRepMax(0, 5), null);
  });

  test("negative weight returns null", () => {
    assert.strictEqual(estimateOneRepMax(-100, 5), null);
  });

  test("reps==0 returns null", () => {
    assert.strictEqual(estimateOneRepMax(200, 0), null);
  });

  test("reps>15 returns null by default", () => {
    assert.strictEqual(estimateOneRepMax(135, 16), null);
    assert.strictEqual(estimateOneRepMax(135, 20), null);
  });

  test("reps>15 returns a value when allowHighReps=true", () => {
    // Calculator-tool opt-in path.
    const e = estimateOneRepMax(135, 20, { allowHighReps: true });
    assert.ok(e != null && e > 0, `expected value with allowHighReps, got ${e}`);
  });

  test("non-integer reps return null", () => {
    assert.strictEqual(estimateOneRepMax(200, 5.5), null);
  });

  test("string inputs coerce numerically", () => {
    assert.strictEqual(estimateOneRepMax("225", "1"), 225);
  });

  test("NaN inputs return null", () => {
    assert.strictEqual(estimateOneRepMax(NaN, 5), null);
    assert.strictEqual(estimateOneRepMax(200, NaN), null);
  });
});

describe("floorTo5", () => {
  test("floors to nearest 5", () => {
    assert.strictEqual(floorTo5(247), 245);
    assert.strictEqual(floorTo5(245), 245);
    assert.strictEqual(floorTo5(249.9), 245);
    assert.strictEqual(floorTo5(250), 250);
  });

  test("zero stays zero", () => {
    assert.strictEqual(floorTo5(0), 0);
  });

  test("non-finite returns null", () => {
    assert.strictEqual(floorTo5(NaN), null);
    assert.strictEqual(floorTo5(Infinity), null);
  });
});

describe("topSetEpley", () => {
  test("returns null for empty array", () => {
    assert.strictEqual(topSetEpley([]), null);
  });

  test("returns null for null/undefined", () => {
    assert.strictEqual(topSetEpley(null), null);
    assert.strictEqual(topSetEpley(undefined), null);
  });

  test("returns the only set if one is valid", () => {
    const top = topSetEpley([{ weight: 225, reps: 5 }]);
    assert.strictEqual(top.weight, 225);
    assert.strictEqual(top.reps, 5);
    assert.ok(Math.abs(top.e1RM - 262.5) < 0.01);
  });

  test("highest e1RM wins, NOT heaviest weight", () => {
    // 5×200 → e1RM 233.33
    // 1×215 → e1RM 215.00 (heaviest weight, but lower e1RM)
    // 8×185 → e1RM 234.33 (winner)
    const top = topSetEpley([
      { weight: 200, reps: 5 },
      { weight: 215, reps: 1 },
      { weight: 185, reps: 8 },
    ]);
    assert.strictEqual(top.weight, 185);
    assert.strictEqual(top.reps, 8);
  });

  test("skips invalid sets and picks among valid", () => {
    const top = topSetEpley([
      { weight: 0, reps: 5 },        // skipped
      { weight: 100, reps: 0 },       // skipped
      { weight: 135, reps: 20 },      // skipped (cap)
      { weight: 225, reps: 5 },       // valid: e1RM 262.5
      { weight: 250, reps: 1 },       // valid: e1RM 250.0
    ]);
    assert.strictEqual(top.weight, 225);
    assert.strictEqual(top.reps, 5);
  });

  test("returns null when all sets invalid", () => {
    assert.strictEqual(topSetEpley([
      { weight: 0, reps: 5 },
      { weight: 100, reps: 20 },
    ]), null);
  });

  test("tolerates malformed set objects", () => {
    const top = topSetEpley([
      null,
      undefined,
      {},
      { weight: 225, reps: 3 },
    ]);
    assert.strictEqual(top.weight, 225);
    assert.strictEqual(top.reps, 3);
  });
});
