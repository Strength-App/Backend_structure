/**
 * cardioAssignmentHistory.js
 *
 * Read/write helpers for the `cardio_assignment_history` MongoDB collection.
 * Tracks the last 5 cardio machine assignments per (userId, templateId) pair
 * so the selector can apply an anti-repetition penalty.
 *
 * Schema:
 *   { userId: ObjectId, templateId: ObjectId, machines: string[] }
 *   — `machines` is a capped circular buffer of the 5 most-recent assignments,
 *     newest-last. Index is created on { userId, templateId } for fast lookups.
 */

const COLLECTION = "cardio_assignment_history";
const HISTORY_LIMIT = 5;

/**
 * Retrieve the recent machine list for a user/template pair.
 * Returns an empty array when no history exists yet.
 *
 * @param {import('mongodb').Db} db
 * @param {string|import('mongodb').ObjectId} userId
 * @param {string|import('mongodb').ObjectId} templateId
 * @returns {Promise<string[]>}
 */
export async function getRecentAssignments(db, userId, templateId) {
  try {
    const doc = await db.collection(COLLECTION).findOne(
      { userId: userId.toString(), templateId: templateId.toString() },
      { projection: { machines: 1 } }
    );
    return doc?.machines ?? [];
  } catch (err) {
    console.warn(`[cardioAssignmentHistory] read failed, returning empty: ${err.message}`);
    return [];
  }
}

/**
 * Append a machine assignment to the history for a user/template pair.
 * Trims the list to the last HISTORY_LIMIT entries after appending.
 *
 * @param {import('mongodb').Db} db
 * @param {string|import('mongodb').ObjectId} userId
 * @param {string|import('mongodb').ObjectId} templateId
 * @param {string} machineName
 * @returns {Promise<void>}
 */
export async function recordAssignment(db, userId, templateId, machineName) {
  try {
    const col = db.collection(COLLECTION);
    const key = { userId: userId.toString(), templateId: templateId.toString() };

    // Push the new assignment then slice to keep only the last HISTORY_LIMIT entries.
    await col.updateOne(
      key,
      [
        {
          $set: {
            machines: {
              $slice: [
                { $concatArrays: [{ $ifNull: ["$machines", []] }, [machineName]] },
                -HISTORY_LIMIT,
              ],
            },
            updatedAt: "$$NOW",
          },
        },
      ],
      { upsert: true }
    );
  } catch (err) {
    // Non-fatal — history is a best-effort anti-repetition aid, not load-bearing.
    console.warn(`[cardioAssignmentHistory] write failed, continuing: ${err.message}`);
  }
}

/**
 * Ensure the collection index exists. Call once at startup (idempotent).
 *
 * @param {import('mongodb').Db} db
 * @returns {Promise<void>}
 */
export async function ensureCardioHistoryIndex(db) {
  try {
    await db.collection(COLLECTION).createIndex(
      { userId: 1, templateId: 1 },
      { unique: true, background: true }
    );
  } catch (err) {
    console.warn(`[cardioAssignmentHistory] index creation failed: ${err.message}`);
  }
}
