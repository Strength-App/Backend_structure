// Canonical user-response shape. The single source of truth for what a
// user-shaped response looks like. Used by /create-account and /login so
// the frontend's setUser() at both entry points (welcomepage login,
// createAcc registration) writes an identically-shaped object to UserContext
// and localStorage. Drift between the two endpoints is what caused the
// post-workout 2nd screen badge bug — this helper closes that bug class.
//
// Allowlist approach: only the 11 fields below are exposed. Sensitive fields
// (password, future 2FA secrets, etc.) require an explicit edit to be
// returned. Adding fields here is a deliberate, reviewable decision.
//
// /profile/:userId is intentionally NOT a consumer — it returns a richer
// shape (history arrays, etc.) for the settings page. If a third user-shaped
// endpoint needs a different shape (richer or narrower), that's the trigger
// for splitting this helper into named variants. Until then, single canonical
// shape.
//
// Input contract: userDoc must have `_id` (ObjectId or string-coercible).
// /create-account passes { ...newUser, _id: result.insertedId } since the
// constructed newUser doesn't have _id yet.
export function buildUserResponse(userDoc) {
  return {
    _id: userDoc._id.toString(),
    email: userDoc.email,
    firstName: userDoc.firstName,
    lastName: userDoc.lastName,
    gender: userDoc.gender,
    current_bodyweight: userDoc.current_bodyweight,
    current_one_rep_maxes: userDoc.current_one_rep_maxes,
    current_classification: userDoc.current_classification,
    onboarding_complete: userDoc.onboarding_complete,
    current_workout_id: userDoc.current_workout_id,
    personal_bests: userDoc.personal_bests,
  };
}
