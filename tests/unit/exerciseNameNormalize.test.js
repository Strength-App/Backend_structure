/**
 * exerciseNameNormalize.test.js
 *
 * Unit tests for the exercise-name canonicalizer. Confirms the squat-family
 * aliasing (Back Squat and Squats both → Squat, case-insensitive and
 * whitespace-tolerant) and pass-through for unknown names.
 *
 * Run with:  node --test tests/unit/exerciseNameNormalize.test.js
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { canonicalExerciseName } from "../../src/utils/exerciseNameNormalize.js";

describe("canonicalExerciseName", () => {
  test("Back Squat → Squat", () => {
    assert.strictEqual(canonicalExerciseName("Back Squat"), "Squat");
  });

  test("case-insensitive alias", () => {
    assert.strictEqual(canonicalExerciseName("back squat"), "Squat");
    assert.strictEqual(canonicalExerciseName("BACK SQUAT"), "Squat");
    assert.strictEqual(canonicalExerciseName("BaCk SqUaT"), "Squat");
  });

  test("Squats → Squat", () => {
    assert.strictEqual(canonicalExerciseName("Squats"), "Squat");
  });

  test("case-insensitive Squats alias", () => {
    assert.strictEqual(canonicalExerciseName("squats"), "Squat");
    assert.strictEqual(canonicalExerciseName("SQUATS"), "Squat");
  });

  test("trims surrounding whitespace before aliasing", () => {
    assert.strictEqual(canonicalExerciseName("  Back Squat  "), "Squat");
    assert.strictEqual(canonicalExerciseName("  Squats  "), "Squat");
  });

  test("Squat passes through unchanged (only the plural is an alias)", () => {
    assert.strictEqual(canonicalExerciseName("Squat"), "Squat");
  });

  test("unrelated names pass through unchanged", () => {
    assert.strictEqual(canonicalExerciseName("Bench Press"), "Bench Press");
    assert.strictEqual(canonicalExerciseName("Deadlift"), "Deadlift");
    assert.strictEqual(canonicalExerciseName("Front Squat"), "Front Squat");
    assert.strictEqual(canonicalExerciseName("Goblet Squat"), "Goblet Squat");
  });

  test("non-string inputs pass through", () => {
    assert.strictEqual(canonicalExerciseName(null), null);
    assert.strictEqual(canonicalExerciseName(undefined), undefined);
    assert.strictEqual(canonicalExerciseName(42), 42);
  });
});
