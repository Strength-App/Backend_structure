// Big-3 estimated-1RM progression service. Runs after a workout completes,
// detects Bench Press / Squat / Deadlift sets, finds the top set per lift
// via highest Epley e1RM (NOT heaviest weight), and raises the user's
// estimated_one_rep_maxes if the candidate exceeds the stored value.
//
// Single write site: this service writes ONLY to estimated_one_rep_maxes.
// It never reads or writes current_one_rep_maxes — that field is the user's
// authoritative actual 1RM, mutable only through the onboarding/profile UI.
//
// Failure policy: never throws. On any error (missing user, malformed
// workout, DB failure) returns [] and logs via console.warn so the
// post-workout HTTP response stays unblocked.

import { ObjectId } from "mongodb";
import { estimateOneRepMax, floorTo5, topSetEpley } from "../utils/epley.js";
import { canonicalExerciseName } from "../utils/exerciseNameNormalize.js";

// The DB module performs a top-level connect on import. Defer it to runtime
// via dynamic import so unit tests can exercise the pure helpers below
// without spinning up Mongo.
async function getUsersCollection() {
  const { default: db } = await import("../config/database.js");
  return db.collection("users");
}

// Canonical-name → estimated_one_rep_maxes key. Mirrors SEEDED_PB_KEY's
// big-three subset; aliases like "Back Squat" are collapsed upstream via
// canonicalExerciseName before this lookup.
const BIG3_KEY = {
  "Bench Press": "bench",
  "Squat":       "squat",
  "Deadlift":    "deadlift",
};

// ─── Private extractors ──────────────────────────────────────────────────────

// Flatten a program-log COMPLETED DAY (not the whole workout) into a list of
// { exerciseName, sets: [{weight, reps}] } over completed sets only. The
// caller is responsible for selecting the right day before invoking.
function extractProgramSets(day) {
  const out = [];
  for (const slot of day?.slots ?? []) {
    if (!slot?.exercise) continue;
    const weights = slot.actualWeights ?? {};
    const reps = slot.actualReps ?? {};
    const completed = slot.completedSets ?? {};
    const sets = [];
    for (const key of Object.keys(completed)) {
      if (!completed[key]) continue;
      sets.push({ weight: Number(weights[key]), reps: Number(reps[key]) });
    }
    if (sets.length > 0) out.push({ exerciseName: slot.exercise, sets });
  }
  return out;
}

// Flatten a quick-session document into the same shape.
function extractQuickSets(session) {
  const out = [];
  for (const ex of session?.exercises ?? []) {
    if (!ex?.name) continue;
    const sets = [];
    for (const s of ex.sets ?? []) {
      if (!s?.done) continue;
      sets.push({ weight: Number(s.weight), reps: Number(s.reps) });
    }
    if (sets.length > 0) out.push({ exerciseName: ex.name, sets });
  }
  return out;
}

// ─── Pure helpers (exported for testing) ─────────────────────────────────────

// Given a workout shape + source tag, return a candidates dict keyed by big-3
// key ({ bench, squat, deadlift }). Each value is the floor-to-5 e1RM of the
// top set across all big-3 occurrences for that lift, or null if no valid
// top set was found for that lift.
//
// "Top set" is defined as the set with the highest Epley estimate across all
// big-3 occurrences in this workout — NOT the heaviest weight. A 5×200
// (e1RM 233) beats a 1×215 (e1RM 215) for the squat candidate even though
// 215 is heavier. Reps == 1 short-circuits Epley (handled inside
// estimateOneRepMax). The default reps cap of 15 applies — high-rep sets
// are skipped as not-a-strength-signal.
export function computeBig3Candidates(workout, source) {
  const groups =
    source === "program" ? extractProgramSets(workout) :
    source === "quick"   ? extractQuickSets(workout) :
    [];

  const buckets = { bench: [], squat: [], deadlift: [] };
  for (const g of groups) {
    const canonical = canonicalExerciseName(g.exerciseName);
    const key = BIG3_KEY[canonical];
    if (!key) continue;
    buckets[key].push(...g.sets);
  }

  const candidates = { bench: null, squat: null, deadlift: null };
  for (const key of ["bench", "squat", "deadlift"]) {
    const top = topSetEpley(buckets[key]);
    if (top == null) continue;
    const floored = floorTo5(top.e1RM);
    if (floored == null || floored <= 0) continue;
    candidates[key] = floored;
  }
  return candidates;
}

// Given candidates and the user's stored estimated_one_rep_maxes, return the
// list of updates to apply. Explicit null check on stored — first-time
// entries (stored value is null/missing) ALWAYS win regardless of candidate
// magnitude. Direct JS coercion (e.g., `candidate > stored` where stored is
// null) would coerce null to 0, which is correct here but the explicit check
// documents intent and survives future formula or comparison changes.
export function computeBig3Updates(candidates, stored) {
  const safeStored = stored ?? {};
  const updates = [];
  for (const key of ["bench", "squat", "deadlift"]) {
    const candidate = candidates?.[key];
    if (candidate == null) continue;
    const before = safeStored[key];
    if (before == null || candidate > before) {
      updates.push({
        lift: key,
        before: before ?? null,
        after: candidate,
        delta: candidate - (before ?? 0),
      });
    }
  }
  return updates;
}

// ─── Service entry point (IO) ────────────────────────────────────────────────

export async function processBig3Progression(userId, workout, { source } = {}) {
  try {
    if (!userId || !workout || !source) return [];

    const candidates = computeBig3Candidates(workout, source);

    const usersCollection = await getUsersCollection();
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
    if (!user) {
      console.warn(`[processBig3Progression] user not found: ${userId}`);
      return [];
    }

    const updates = computeBig3Updates(candidates, user.estimated_one_rep_maxes);
    if (updates.length === 0) return [];

    const setFields = {};
    for (const u of updates) {
      setFields[`estimated_one_rep_maxes.${u.lift}`] = u.after;
    }
    await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $set: setFields }
    );
    return updates;
  } catch (err) {
    console.warn("[processBig3Progression] failed:", err?.message ?? err);
    return [];
  }
}

export default processBig3Progression;

// Re-export the formula primitives so callers wiring this service can reason
// about its inputs without separately importing from utils/epley.
export { estimateOneRepMax, topSetEpley };
