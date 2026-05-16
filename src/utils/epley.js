// Pure 1RM estimation utilities. Single source of truth for the server side.
//
// Epley: 1RM = weight × (1 + reps / 30). A true 1-rep set IS the 1RM, so we
// special-case reps===1 instead of letting the formula's 1.033× artifact
// inflate it. Sets outside the [1, 15] rep range are not strength-signal sets
// (or beyond Epley's reliable range) and are skipped — caller treats null as
// "no e1RM from this set."

// The `allowHighReps` opt-in keeps the calculator tool (which intentionally
// renders estimates for high-rep inputs with a low-accuracy note) decoupled
// from the post-log feature, which skips reps > 15 as not-a-strength-signal.
export function estimateOneRepMax(weight, reps, { allowHighReps = false } = {}) {
  const w = Number(weight);
  const r = Number(reps);
  if (!Number.isFinite(w) || w <= 0) return null;
  if (!Number.isInteger(r) || r < 1) return null;
  if (!allowHighReps && r > 15) return null;
  if (r === 1) return w;
  return w * (1 + r / 30);
}

export function floorTo5(n) {
  if (!Number.isFinite(n)) return null;
  return Math.floor(n / 5) * 5;
}

// Given an array of { weight, reps } sets, return the set with the highest
// estimated 1RM (Epley) along with its e1RM value, or null if no valid set.
// "Top set" is defined by highest e1RM, NOT by heaviest weight — a 5×200 set
// (e1RM 233) beats a 1×215 (e1RM 215). Caller is responsible for filtering
// for completion before calling this.
export function topSetEpley(sets) {
  let best = null;
  for (const set of sets ?? []) {
    const e = estimateOneRepMax(set?.weight, set?.reps);
    if (e == null) continue;
    if (best == null || e > best.e1RM) {
      best = { weight: Number(set.weight), reps: Number(set.reps), e1RM: e };
    }
  }
  return best;
}
