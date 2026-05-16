/**
 * 2026-05-15-backfill-estimated-1rm.js — M1
 *
 * Backfill estimated_one_rep_maxes from current_one_rep_maxes for existing
 * users. Without this, users created before the feature deploy will have
 * estimated_one_rep_maxes missing or all-null, which collapses their level
 * via bigThreeTotalForUser's fallback to current — correct but slow to
 * recover; this script raises their estimated immediately to match their
 * known actual.
 *
 * IDEMPOTENT. Safe to re-run any number of times. Per-lift: only copies
 * current → estimated if estimated is null AND current is non-null. Already-
 * populated estimated lifts (from a workout post-deploy, or from a previous
 * run) are left untouched.
 *
 * Edge cases:
 *   - User has no current_one_rep_maxes at all (onboarding never finished
 *     the maxes step): skipped. No write.
 *   - User has current_one_rep_maxes but estimated_one_rep_maxes missing:
 *     fills only the lifts whose current is non-null.
 *   - User has both populated already: skipped (nothing to do).
 *
 * Writes ONLY to user.estimated_one_rep_maxes.<lift>. No other field
 * mutated. Dotted-path partial updates so each lift is independent.
 *
 * Invocation:  node migrations/2026-05-15-backfill-estimated-1rm.js
 *              (run from Backend_structure/)
 */

import db from "../src/config/database.js";

const LIFTS = ["bench", "squat", "deadlift"];

async function run() {
  const users = db.collection("users");

  const cursor = users.find({
    current_one_rep_maxes: { $exists: true, $ne: null },
  });

  let touched = 0;
  let skipped = 0;
  const touchedIds = [];

  for await (const u of cursor) {
    const current = u.current_one_rep_maxes ?? {};
    const estimated = u.estimated_one_rep_maxes ?? {};

    const setFields = {};
    for (const lift of LIFTS) {
      const cur = current[lift];
      const est = estimated[lift];
      if (est == null && cur != null) {
        setFields[`estimated_one_rep_maxes.${lift}`] = cur;
      }
    }

    if (Object.keys(setFields).length === 0) {
      skipped++;
      continue;
    }

    await users.updateOne({ _id: u._id }, { $set: setFields });
    touched++;
    touchedIds.push(String(u._id));
    console.log(
      `[M1] user=${String(u._id)} backfilled lifts=${Object.keys(setFields).map(k => k.split(".")[1]).join(",")}`
    );
  }

  console.log("");
  console.log(`[M1] DONE — touched=${touched} skipped=${skipped}`);
  if (touched > 0) {
    console.log(`[M1] touched user ids:\n  ${touchedIds.join("\n  ")}`);
  }
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("[M1] FAILED:", err);
    process.exit(1);
  });
