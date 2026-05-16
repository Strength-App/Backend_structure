// Canonicalize exercise display names that have legacy/synonym variants.
// Used at every write-path that touches personal_bests or estimated_one_rep_maxes
// so "Back Squat" and "Squat" collapse into a single canonical key ("Squat").
//
// Match is case-insensitive on input but the canonical output preserves the
// stored title-case form. Unknown names pass through unchanged.
//
// MIRROR: keep in sync with
// client/max-method/src/utils/exerciseNameNormalize.js. The ALIASES map and
// canonicalExerciseName signature must match the client twin. Drift would
// desync server-side write canonicalization from client-side read lookups
// (Issue 2 was caused by that exact gap before the client mirror existed).

const ALIASES = {
  "back squat": "Squat",
};

export function canonicalExerciseName(name) {
  if (typeof name !== "string") return name;
  const aliased = ALIASES[name.trim().toLowerCase()];
  return aliased ?? name;
}
