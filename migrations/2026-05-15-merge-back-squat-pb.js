/**
 * 2026-05-15-merge-back-squat-pb.js — M2
 *
 * Collapse personal_bests["Back Squat"] into personal_bests["Squat"] for
 * every user that has a "Back Squat" entry. After this feature deploys, the
 * runtime canonicalExerciseName helper rewrites "Back Squat" → "Squat" at
 * every write path, so new "Back Squat" entries can't be created. This
 * script handles the historical data: any pre-deploy user whose
 * personal_bests dict still has both keys (or just "Back Squat") gets the
 * max of the two written to "Squat" and the "Back Squat" key removed.
 *
 * IDEMPOTENT. After the first run, the filter (personal_bests."Back Squat"
 * exists) matches zero docs, so re-runs are no-ops.
 *
 * Edge cases:
 *   - User has Back Squat AND Squat: set Squat = max(both), unset Back Squat.
 *   - User has Back Squat but no Squat: set Squat = Back Squat value,
 *     unset Back Squat. (Treats missing Squat as 0 in the max — the Back
 *     Squat value wins by default.)
 *   - User has Squat but no Back Squat: filtered out at query level — no
 *     write. (Not idempotent-relevant because the filter excludes these.)
 *   - User has neither: filtered out at query level — no write.
 *
 * Writes ONLY to personal_bests.Squat (set) and personal_bests."Back Squat"
 * (unset). No other field mutated.
 *
 * Invocation:  node migrations/2026-05-15-merge-back-squat-pb.js
 *              (run from Backend_structure/)
 */

import db from "../src/config/database.js";

async function run() {
  const users = db.collection("users");

  const cursor = users.find({ "personal_bests.Back Squat": { $exists: true } });

  let touched = 0;
  const touchedIds = [];

  for await (const u of cursor) {
    const backSquat = Number(u.personal_bests?.["Back Squat"] ?? 0);
    const squat = Number(u.personal_bests?.["Squat"] ?? 0);
    const merged = Math.max(backSquat, squat);

    await users.updateOne(
      { _id: u._id },
      {
        $set: { "personal_bests.Squat": merged },
        $unset: { "personal_bests.Back Squat": "" },
      }
    );
    touched++;
    touchedIds.push(String(u._id));
    console.log(
      `[M2] user=${String(u._id)} merged backSquat=${backSquat} squat=${squat} → Squat=${merged}`
    );
  }

  console.log("");
  console.log(`[M2] DONE — touched=${touched}`);
  if (touched > 0) {
    console.log(`[M2] touched user ids:\n  ${touchedIds.join("\n  ")}`);
  }
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("[M2] FAILED:", err);
    process.exit(1);
  });
