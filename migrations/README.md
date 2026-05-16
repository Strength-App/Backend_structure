# Migrations

Standalone one-time scripts that mutate user data outside the normal
request lifecycle. Each script is named `YYYY-MM-DD-<short-slug>.js` and
mutates only the documents it explicitly targets.

## When to use

These scripts are **not wired into app boot or any auto-run mechanism**.
They run only when a human invokes them manually at deploy time, against
the correct database, with eyes on the output. There is no migration
runner, no migration history table, and no automatic ordering — each
script's filename and inline docs are the source of truth.

If a script needs to be re-run (e.g., after a partial failure or to mop
up users created between deploys), it can be: every script in this
folder is idempotent by construction. Re-runs find nothing new to do
and exit cleanly.

## How to run

From the `Backend_structure/` directory, with `MONGODB_URI` in the
environment (via `.env` or shell export):

```
node migrations/<filename>.js
```

The script imports `src/config/database.js`, which performs the same
Mongo connect handshake the production server uses. Output goes to
stdout — log it manually if you want a record. Each script calls
`process.exit(0)` on success and `process.exit(1)` on failure, so
chaining is safe (`script1 && script2`).

## Run order for the big-3 progression feature

Both migrations target the user collection but are independent — they
don't read each other's writes. Either order works. Suggested order:

1. **`2026-05-15-merge-back-squat-pb.js`** (M2) — collapses any
   `personal_bests["Back Squat"]` entries into `personal_bests["Squat"]`
   (max of the two, then unset Back Squat). Mandatory: the runtime
   normalizer rewrites "Back Squat" → "Squat" at every write path, so
   any stale Back Squat PR data would be orphaned in the schema without
   this merge.

2. **`2026-05-15-backfill-estimated-1rm.js`** (M1) — populates
   `estimated_one_rep_maxes.{bench,squat,deadlift}` from the user's
   existing `current_one_rep_maxes` values, per-lift, only where
   estimated is null AND current is non-null. Without this, existing
   users will show level 0 on first load post-deploy because the new
   leveling source (`estimated_one_rep_maxes`, with fallback to
   current) sees all-nulls. The fallback chain catches this case
   gracefully, but the backfill makes the level reflect their actual
   strength immediately rather than waiting for their first big-3
   workout to populate estimated via the progression service.

## Verifying success

After M1:
```
db.users.countDocuments({
  current_one_rep_maxes: { $exists: true, $ne: null },
  $or: [
    { estimated_one_rep_maxes: { $exists: false } },
    {
      "estimated_one_rep_maxes.bench": null,
      "estimated_one_rep_maxes.squat": null,
      "estimated_one_rep_maxes.deadlift": null,
    },
  ],
})
```
Expected: zero (no users left with current populated but estimated empty).

After M2:
```
db.users.countDocuments({ "personal_bests.Back Squat": { $exists: true } })
```
Expected: zero (no users with the legacy key).

## What these scripts deliberately do NOT do

- Modify documents outside the user collection.
- Touch `current_one_rep_maxes` (M1 reads only; M2 doesn't touch it).
- Write to `personal_bests` keys other than `Squat` and `Back Squat` (M2).
- Roll back. There is no reversal script — if you need to undo, restore
  from a Mongo backup taken before invocation.
