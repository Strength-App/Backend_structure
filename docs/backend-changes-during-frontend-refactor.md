# Backend changes made during the frontend refactor

> Created 2026-06-07.

## Why this file exists

The **frontend** (`MaxMethodApp`) is going through a structured, multi-batch
refactor (documented in that repo's `docs/refactor-plan.md`). The **backend**
(this repo) will get its **own** structured refactor **after** the frontend's
completes.

In the meantime, a few backend changes are unavoidable — chiefly the
**mirrored utilities** (`src/utils/exerciseNameNormalize.js`,
`src/utils/epley.js`, `src/utils/classification.js`) that must stay byte-for-byte
in sync with their frontend twins. When a frontend batch changes one of those,
the backend twin has to change in the same step or the two sides desync across
the network boundary.

This file is the running log of every such backend change, so the future backend
refactor can **account for them** (verify they're still correct, fold them into
its own test coverage, and not re-litigate decisions already made on the frontend
side). It is **not** a substitute for that refactor — it's an inbox for it.

## How to use this log

- Every backend change made *because of* a frontend batch gets an entry below.
- Each entry: date · what changed · why (which frontend batch/PR drove it) ·
  files touched · how it was verified · pointer to the frontend-side decision.
- Keep entries short. The PRs and the frontend `docs/decisions.md` hold the full
  reasoning; this is the index the backend refactor reads first.

---

## Log

### 2026-06-07 — `exerciseNameNormalize`: add `"squats" → "Squat"` alias

- **What.** Added `"squats": "Squat"` to the `ALIASES` map in
  `src/utils/exerciseNameNormalize.js` (it previously held only
  `"back squat": "Squat"`). Extended `tests/unit/exerciseNameNormalize.test.js`
  (`node --test`) to cover the new alias.
- **Why.** Mirror of frontend PR
  [`MaxMethod#98`](https://github.com/Strength-App/MaxMethod/pull/98). The three
  legacy spellings of the barbell back squat in MongoDB program data — `Squat`,
  `Squats`, `Back Squat` — are the same lift and must canonicalize to `Squat`.
  Without this, a slot named `"Squats"` wrote its personal best under `"Squats"`
  and was **not** counted toward the Squat 1RM by
  `src/services/processBig3Progression.js`.
- **Backend PR.** [`Backend_structure#20`](https://github.com/Strength-App/Backend_structure/pull/20).
- **Files.** `src/utils/exerciseNameNormalize.js`,
  `tests/unit/exerciseNameNormalize.test.js`.
- **Verification.** `node --test tests/unit/exerciseNameNormalize.test.js
  tests/unit/processBig3Progression.test.js` → 42/42 pass.
- **Frontend decision record.** `MaxMethod` repo
  `docs/decisions.md#squat-alias-normalization-coverage` (also notes the
  `#mirrored-utils` discipline these two files follow).
- **For the backend refactor.** `exerciseNameNormalize.js` is one of three
  deliberately-mirrored utils with `MaxMethodApp`. The backend refactor should
  (a) keep the mirror discipline or replace it with a single shared source, and
  (b) confirm `processBig3Progression` + the `personal_bests` write paths route
  every exercise name through `canonicalExerciseName`.
