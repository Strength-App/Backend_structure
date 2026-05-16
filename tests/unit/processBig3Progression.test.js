/**
 * processBig3Progression.test.js
 *
 * Unit tests for the big-3 estimated-1RM progression service. Covers the two
 * pure helpers (computeBig3Candidates, computeBig3Updates) which together
 * encode all of the spec'd behavior: top-set-by-e1RM, Back Squat canonical
 * routing, sanity guards, reps==1 short-circuit, and the null-stored
 * first-time-entry rule.
 *
 * The async IO wrapper (processBig3Progression) is not unit-tested here —
 * it is a thin DB read+write around the two pure helpers, verifiable by
 * inspection. End-to-end integration is exercised via the route handlers.
 *
 * Run with:  node --test tests/unit/processBig3Progression.test.js
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  computeBig3Candidates,
  computeBig3Updates,
} from "../../src/services/processBig3Progression.js";

// ─── Builders ────────────────────────────────────────────────────────────────

// Construct a program-log slot. Pass an array of {weight, reps, done}
// triples; the builder writes them into the actualWeights / actualReps /
// completedSets object-keyed-by-index shape that program logs use.
function programSlot(exercise, sets) {
  const actualWeights = {};
  const actualReps = {};
  const completedSets = {};
  sets.forEach((s, i) => {
    actualWeights[i] = s.weight;
    actualReps[i] = s.reps;
    completedSets[i] = s.done !== false; // default to completed
  });
  return { exercise, actualWeights, actualReps, completedSets };
}

// Construct a program-log "day" object with the given slots.
function programDay(slots) {
  return { slots };
}

// Construct a quick-session exercise. Sets are array-shaped with weight/reps/done.
function quickEx(name, sets) {
  return {
    name,
    sets: sets.map(s => ({ weight: s.weight, reps: s.reps, done: s.done !== false })),
  };
}

// Construct a quick-session document.
function quickSession(exercises) {
  return { exercises };
}

// ─── computeBig3Candidates ───────────────────────────────────────────────────

describe("computeBig3Candidates — no big-3 in workout", () => {
  test("empty slots → all null candidates", () => {
    const c = computeBig3Candidates(programDay([]), "program");
    assert.deepStrictEqual(c, { bench: null, squat: null, deadlift: null });
  });

  test("only accessory lifts → all null", () => {
    const day = programDay([
      programSlot("Dumbbell Row", [{ weight: 80, reps: 10 }]),
      programSlot("Leg Press", [{ weight: 405, reps: 8 }]),
    ]);
    const c = computeBig3Candidates(day, "program");
    assert.deepStrictEqual(c, { bench: null, squat: null, deadlift: null });
  });
});

describe("computeBig3Candidates — single big-3 lift", () => {
  test("bench press 5×200 → bench candidate 230 (floor of 233.33)", () => {
    const day = programDay([
      programSlot("Bench Press", [{ weight: 200, reps: 5 }]),
    ]);
    const c = computeBig3Candidates(day, "program");
    assert.strictEqual(c.bench, 230);
    assert.strictEqual(c.squat, null);
    assert.strictEqual(c.deadlift, null);
  });

  test("deadlift 8×315 → deadlift candidate 395 (floor of 399.0)", () => {
    const day = programDay([
      programSlot("Deadlift", [{ weight: 315, reps: 8 }]),
    ]);
    const c = computeBig3Candidates(day, "program");
    assert.strictEqual(c.deadlift, 395);
    assert.strictEqual(c.bench, null);
    assert.strictEqual(c.squat, null);
  });

  test("squat 1-rep top set uses weight directly (no Epley)", () => {
    const day = programDay([
      programSlot("Squat", [{ weight: 405, reps: 1 }]),
    ]);
    const c = computeBig3Candidates(day, "program");
    assert.strictEqual(c.squat, 405);
  });
});

describe("computeBig3Candidates — multiple big-3 lifts independent", () => {
  test("bench + squat + deadlift in one day → three candidates", () => {
    const day = programDay([
      programSlot("Bench Press", [{ weight: 200, reps: 5 }]), // 230
      programSlot("Squat",       [{ weight: 315, reps: 3 }]), // floor(346.5)=345
      programSlot("Deadlift",    [{ weight: 405, reps: 1 }]), // 405 (reps==1)
    ]);
    const c = computeBig3Candidates(day, "program");
    assert.strictEqual(c.bench, 230);
    assert.strictEqual(c.squat, 345);
    assert.strictEqual(c.deadlift, 405);
  });
});

describe("computeBig3Candidates — Back Squat normalization", () => {
  test("Back Squat slot → routed to squat candidate", () => {
    const day = programDay([
      programSlot("Back Squat", [{ weight: 315, reps: 5 }]), // e1RM 367.5 → 365
    ]);
    const c = computeBig3Candidates(day, "program");
    assert.strictEqual(c.squat, 365);
    assert.strictEqual(c.bench, null);
  });

  test("mixed Back Squat + Squat → buckets merge; top across both wins", () => {
    const day = programDay([
      programSlot("Back Squat", [{ weight: 225, reps: 5 }]), // e1RM 262.5 → 260
      programSlot("Squat",      [{ weight: 315, reps: 3 }]), // e1RM 346.5 → 345 (wins)
    ]);
    const c = computeBig3Candidates(day, "program");
    assert.strictEqual(c.squat, 345);
  });

  test("case-insensitive Back Squat alias still routes", () => {
    const day = programDay([
      programSlot("back squat", [{ weight: 315, reps: 1 }]),
    ]);
    const c = computeBig3Candidates(day, "program");
    assert.strictEqual(c.squat, 315);
  });
});

describe("computeBig3Candidates — sanity guards on sets", () => {
  test("weight=0 sets are skipped", () => {
    const day = programDay([
      programSlot("Bench Press", [
        { weight: 0, reps: 5 },
        { weight: 0, reps: 10 },
      ]),
    ]);
    assert.strictEqual(computeBig3Candidates(day, "program").bench, null);
  });

  test("reps=0 sets are skipped", () => {
    const day = programDay([
      programSlot("Bench Press", [{ weight: 225, reps: 0 }]),
    ]);
    assert.strictEqual(computeBig3Candidates(day, "program").bench, null);
  });

  test("reps>15 sets are skipped (no allowHighReps in service)", () => {
    const day = programDay([
      programSlot("Bench Press", [{ weight: 135, reps: 20 }]),
    ]);
    assert.strictEqual(computeBig3Candidates(day, "program").bench, null);
  });

  test("non-completed sets are ignored", () => {
    const day = programDay([
      programSlot("Bench Press", [
        { weight: 315, reps: 5, done: false }, // not completed — should be ignored
        { weight: 200, reps: 5, done: true },  // → 230
      ]),
    ]);
    assert.strictEqual(computeBig3Candidates(day, "program").bench, 230);
  });

  test("mix of valid and invalid sets → valid ones still picked", () => {
    const day = programDay([
      programSlot("Squat", [
        { weight: 0, reps: 5 },            // skip (weight)
        { weight: 135, reps: 20 },         // skip (reps cap)
        { weight: 100, reps: 0 },          // skip (reps=0)
        { weight: 225, reps: 5 },          // valid → 262.5 → 260
      ]),
    ]);
    assert.strictEqual(computeBig3Candidates(day, "program").squat, 260);
  });
});

describe("computeBig3Candidates — top set is highest e1RM, not heaviest weight", () => {
  test("5×200 (e1RM 233) beats 1×215 (e1RM 215) — top set wins by e1RM", () => {
    const day = programDay([
      programSlot("Bench Press", [
        { weight: 215, reps: 1 }, // e1RM 215 (heaviest weight)
        { weight: 200, reps: 5 }, // e1RM 233.33 → 230 (winner)
      ]),
    ]);
    assert.strictEqual(computeBig3Candidates(day, "program").bench, 230);
  });

  test("heavier 1-rep wins if multi-rep e1RM is lower", () => {
    const day = programDay([
      programSlot("Bench Press", [
        { weight: 250, reps: 1 }, // e1RM 250 (winner)
        { weight: 200, reps: 5 }, // e1RM 233 → 230
      ]),
    ]);
    assert.strictEqual(computeBig3Candidates(day, "program").bench, 250);
  });
});

describe("computeBig3Candidates — source shape handling", () => {
  test("quick source with exercise shape", () => {
    const session = quickSession([
      quickEx("Deadlift", [{ weight: 315, reps: 5 }]), // e1RM 367.5 → 365
      quickEx("Squat", [{ weight: 225, reps: 1 }]),    // reps==1 → 225
    ]);
    const c = computeBig3Candidates(session, "quick");
    assert.strictEqual(c.deadlift, 365);
    assert.strictEqual(c.squat, 225);
    assert.strictEqual(c.bench, null);
  });

  test("quick source ignores non-completed sets", () => {
    const session = quickSession([
      quickEx("Bench Press", [
        { weight: 315, reps: 5, done: false },
        { weight: 200, reps: 5, done: true },
      ]),
    ]);
    assert.strictEqual(computeBig3Candidates(session, "quick").bench, 230);
  });

  test("Back Squat normalization works in quick source too", () => {
    const session = quickSession([
      quickEx("Back Squat", [{ weight: 315, reps: 3 }]), // e1RM 346.5 → 345
    ]);
    assert.strictEqual(computeBig3Candidates(session, "quick").squat, 345);
  });

  test("missing source returns all-null candidates", () => {
    const c = computeBig3Candidates(programDay([
      programSlot("Bench Press", [{ weight: 200, reps: 5 }]),
    ]), undefined);
    assert.deepStrictEqual(c, { bench: null, squat: null, deadlift: null });
  });

  test("malformed workout (null) returns all-null candidates", () => {
    assert.deepStrictEqual(
      computeBig3Candidates(null, "program"),
      { bench: null, squat: null, deadlift: null }
    );
  });
});

// ─── computeBig3Updates ──────────────────────────────────────────────────────

describe("computeBig3Updates — first-time entries (stored is null)", () => {
  test("stored is null + valid candidate → update with before=null, delta=candidate", () => {
    const u = computeBig3Updates(
      { bench: 230, squat: null, deadlift: null },
      { bench: null, squat: null, deadlift: null }
    );
    assert.deepStrictEqual(u, [
      { lift: "bench", before: null, after: 230, delta: 230 },
    ]);
  });

  test("stored key is missing (undefined) → still updates", () => {
    const u = computeBig3Updates({ squat: 315, bench: null, deadlift: null }, {});
    assert.deepStrictEqual(u, [
      { lift: "squat", before: null, after: 315, delta: 315 },
    ]);
  });

  test("stored is missing entirely (undefined arg) → still updates", () => {
    const u = computeBig3Updates({ deadlift: 405, bench: null, squat: null }, undefined);
    assert.deepStrictEqual(u, [
      { lift: "deadlift", before: null, after: 405, delta: 405 },
    ]);
  });

  test("stored is null arg → still updates", () => {
    const u = computeBig3Updates({ bench: 225, squat: null, deadlift: null }, null);
    assert.deepStrictEqual(u, [
      { lift: "bench", before: null, after: 225, delta: 225 },
    ]);
  });
});

describe("computeBig3Updates — subsequent entries (stored is number)", () => {
  test("candidate > stored → update with delta", () => {
    const u = computeBig3Updates(
      { bench: 252, squat: null, deadlift: null },
      { bench: 245, squat: 315, deadlift: 405 }
    );
    assert.deepStrictEqual(u, [
      { lift: "bench", before: 245, after: 252, delta: 7 },
    ]);
  });

  test("candidate equal to stored → no-op", () => {
    const u = computeBig3Updates(
      { bench: 245, squat: null, deadlift: null },
      { bench: 245, squat: null, deadlift: null }
    );
    assert.deepStrictEqual(u, []);
  });

  test("candidate < stored → no-op", () => {
    const u = computeBig3Updates(
      { bench: 230, squat: null, deadlift: null },
      { bench: 245, squat: null, deadlift: null }
    );
    assert.deepStrictEqual(u, []);
  });
});

describe("computeBig3Updates — multiple lifts independent", () => {
  test("two lifts both improve → two updates in order bench/squat/deadlift", () => {
    const u = computeBig3Updates(
      { bench: 252, squat: 320, deadlift: null },
      { bench: 245, squat: 315, deadlift: 405 }
    );
    assert.strictEqual(u.length, 2);
    assert.deepStrictEqual(u[0], { lift: "bench", before: 245, after: 252, delta: 7 });
    assert.deepStrictEqual(u[1], { lift: "squat", before: 315, after: 320, delta: 5 });
  });

  test("one improves, one doesn't → one update", () => {
    const u = computeBig3Updates(
      { bench: 230, squat: 320, deadlift: null },
      { bench: 245, squat: 315, deadlift: null }
    );
    assert.deepStrictEqual(u, [
      { lift: "squat", before: 315, after: 320, delta: 5 },
    ]);
  });

  test("all three improve → three updates", () => {
    const u = computeBig3Updates(
      { bench: 250, squat: 320, deadlift: 410 },
      { bench: 245, squat: 315, deadlift: 405 }
    );
    assert.strictEqual(u.length, 3);
    assert.deepStrictEqual(u.map(x => x.lift), ["bench", "squat", "deadlift"]);
  });
});

describe("computeBig3Updates — null candidates", () => {
  test("null candidate for a lift → no update for that lift", () => {
    const u = computeBig3Updates(
      { bench: null, squat: null, deadlift: null },
      { bench: 245, squat: null, deadlift: null }
    );
    assert.deepStrictEqual(u, []);
  });

  test("mix of null and valid candidates → only valid ones considered", () => {
    const u = computeBig3Updates(
      { bench: null, squat: 320, deadlift: null },
      { bench: 245, squat: 315, deadlift: null }
    );
    assert.deepStrictEqual(u, [
      { lift: "squat", before: 315, after: 320, delta: 5 },
    ]);
  });
});

describe("computeBig3Updates — null comparison is explicit, not coerced", () => {
  // The implementation uses `before == null || candidate > before`, with the
  // null check first. JS coercion (candidate > null) would also yield true
  // when candidate>0, but the explicit branch documents intent and survives
  // changes to the comparison operator or future formula swaps.
  test("explicit null branch catches null stored before any numeric comparison", () => {
    const u = computeBig3Updates({ bench: 5, squat: null, deadlift: null }, { bench: null });
    assert.deepStrictEqual(u, [
      { lift: "bench", before: null, after: 5, delta: 5 },
    ]);
  });
});
