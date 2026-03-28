/**
 * userWeightHistory.js
 *
 * Builds a personalized weight correction map from a user's logged actual weights.
 * The correction factor captures how much stronger or weaker a user is relative
 * to the base model prediction, learned from their own workout history.
 *
 * Usage:
 *   const map    = await buildWeightCorrectionMap(userId, db);
 *   const factor = getCorrectionFactor(map, exerciseName, movementPattern);
 *   const adjusted = applyWeightCorrection(baseWeight, factor, isBarbellExercise);
 */

import { ObjectId } from "mongodb";

const BARBELL_MINIMUM = 45;
const GENERAL_MINIMUM = 5;

// Confidence saturates after this many observations (per exercise or pattern)
const FULL_CONFIDENCE_AT = 10;

// Maximum recency decay per observation (0.85 → each older obs worth 15% less)
const RECENCY_DECAY = 0.85;

// Clamp correction factor to prevent wild swings from noisy early data
const MIN_FACTOR = 0.60;
const MAX_FACTOR = 1.60;


/**
 * Run one aggregation query and return a correction map for the user.
 * Keys: "ex:<exerciseName>" and "pat:<movementPattern>"
 * Values: blended correction factor (1.0 = no adjustment)
 *
 * @param {string|ObjectId} userId
 * @param {object} db  - MongoDB db instance
 * @returns {Promise<object>}
 */
export async function buildWeightCorrectionMap(userId, db) {
  const collection = db.collection("workout_logs");

  // Unwind to slot level, keep only slots where both weights are numeric and positive
  const pipeline = [
    { $match: { userId: new ObjectId(userId) } },
    { $unwind: "$weeks" },
    { $unwind: "$weeks.days" },
    { $unwind: "$weeks.days.slots" },
    {
      $match: {
        "weeks.days.slots.projectedWeight": { $type: "number", $gt: 0 },
        "weeks.days.slots.actualWeight":    { $type: "number", $gt: 0 },
      },
    },
    {
      $project: {
        exercise:  "$weeks.days.slots.exercise",
        pattern:   "$weeks.days.slots.label",
        ratio: {
          $divide: [
            "$weeks.days.slots.actualWeight",
            "$weeks.days.slots.projectedWeight",
          ],
        },
        createdAt: 1,
      },
    },
    { $sort: { createdAt: -1 } },
  ];

  const observations = await collection.aggregate(pipeline).toArray();
  return _buildMap(observations);
}


/**
 * Look up the correction factor for a specific exercise/pattern from the map.
 * Prefers exercise-level data; falls back to pattern-level; defaults to 1.0.
 */
export function getCorrectionFactor(correctionMap, exerciseName, movementPattern) {
  return (
    correctionMap[`ex:${exerciseName}`] ??
    correctionMap[`pat:${movementPattern}`] ??
    1.0
  );
}


/**
 * Apply a correction factor to a base model prediction.
 * Re-rounds to nearest 5 lb increment and enforces the appropriate floor.
 *
 * @param {number|string|null} baseWeight  - from the Python service ("BW", null, or number)
 * @param {number}             factor      - from getCorrectionFactor
 * @param {boolean}            isBarbell   - whether exercise uses an Olympic barbell
 * @returns {number|string|null}
 */
export function applyWeightCorrection(baseWeight, factor, isBarbell) {
  if (typeof baseWeight !== "number") return baseWeight; // "BW" or null passes through

  const adjusted = baseWeight * factor;
  const rounded  = Math.round(adjusted / 5) * 5;
  const floor    = isBarbell ? BARBELL_MINIMUM : GENERAL_MINIMUM;
  return Math.max(floor, rounded);
}


/**
 * Build a map of each exercise → the user's all-time highest logged actualWeight.
 * Used to calculate percentage-based target weights for slots with a `percent` field.
 *
 * @param {string|ObjectId} userId
 * @param {object} db  - MongoDB db instance
 * @returns {Promise<Record<string, number>>}  exercise name → max weight in lbs
 */
export async function buildExerciseMaxMap(userId, db) {
  const collection = db.collection("workout_logs");

  const pipeline = [
    { $match: { userId: new ObjectId(userId) } },
    { $unwind: "$weeks" },
    { $unwind: "$weeks.days" },
    { $unwind: "$weeks.days.slots" },
    {
      $match: {
        "weeks.days.slots.actualWeight": { $type: "number", $gt: 0 },
      },
    },
    {
      $group: {
        _id: "$weeks.days.slots.exercise",
        max: { $max: "$weeks.days.slots.actualWeight" },
      },
    },
  ];

  const results = await collection.aggregate(pipeline).toArray();
  return Object.fromEntries(results.map(r => [r._id, r.max]));
}


// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _buildMap(observations) {
  const byExercise = {};
  const byPattern  = {};

  for (const obs of observations) {
    if (!byExercise[obs.exercise]) byExercise[obs.exercise] = [];
    byExercise[obs.exercise].push(obs.ratio);

    if (obs.pattern) {
      if (!byPattern[obs.pattern]) byPattern[obs.pattern] = [];
      byPattern[obs.pattern].push(obs.ratio);
    }
  }

  const map = {};

  for (const [exercise, ratios] of Object.entries(byExercise)) {
    map[`ex:${exercise}`] = _blendedFactor(ratios);
  }

  for (const [pattern, ratios] of Object.entries(byPattern)) {
    map[`pat:${pattern}`] = _blendedFactor(ratios);
  }

  return map;
}


/**
 * Compute a blended correction factor from a list of actual/predicted ratios.
 * - Newer observations are weighted more heavily (exponential decay).
 * - The factor is blended toward 1.0 when observations are sparse.
 * - Clamped to [MIN_FACTOR, MAX_FACTOR] to prevent extreme adjustments.
 */
function _blendedFactor(ratios) {
  // Exponentially weight by recency (index 0 = most recent)
  const weights    = ratios.map((_, i) => Math.pow(RECENCY_DECAY, i));
  const totalW     = weights.reduce((a, b) => a + b, 0);
  const weightedAvg = ratios.reduce((sum, r, i) => sum + r * weights[i], 0) / totalW;

  // Blend toward 1.0 when sparse; full confidence at FULL_CONFIDENCE_AT observations
  const confidence = Math.min(ratios.length / FULL_CONFIDENCE_AT, 1.0);
  const factor     = 1.0 + confidence * (weightedAvg - 1.0);

  return Math.max(MIN_FACTOR, Math.min(MAX_FACTOR, factor));
}
