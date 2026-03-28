/**
 * weightPredictor.js
 *
 * Calls the Python AI weight predictor service (AI_tools/weight_picker_tool/service.py).
 * Falls back to null if the service is unavailable so workout generation never
 * hard-fails due to the AI service being down.
 */

const WEIGHT_PREDICTOR_URL = process.env.WEIGHT_PREDICTOR_URL || "http://localhost:5002";

/**
 * Ask the AI service to predict the working weight for a given exercise slot.
 * Returns null if the service is unreachable, errored, or 1RMs are missing.
 *
 * @param {string}  exerciseName
 * @param {string}  movementPattern
 * @param {string}  strengthLevel       - "beginner"|"novice"|"intermediate"|"advanced"|"elite"
 * @param {number}  squat1rm            - squat 1RM in lbs
 * @param {number}  bench1rm            - bench press 1RM in lbs
 * @param {number}  deadlift1rm         - deadlift 1RM in lbs
 * @param {number}  targetRepRange      - target reps for the working set
 * @param {number}  weekNumber          - 1–6
 * @param {number}  mesocycleNumber     - 1, 2, 3, …
 * @param {number}  [percentageOverride]      - optional fraction of 1RM (e.g. 0.75)
 * @param {string}  [overrideReference1rm]    - "squat"|"bench"|"deadlift"|"overhead_press"
 * @returns {Promise<number|null>} predicted weight in lbs, or null on failure
 */
export async function predictWeight(
  exerciseName,
  movementPattern,
  strengthLevel,
  squat1rm,
  bench1rm,
  deadlift1rm,
  targetRepRange,
  weekNumber,
  mesocycleNumber,
  percentageOverride = null,
  overrideReference1rm = null
) {
  // Guard: skip the call if 1RMs haven't been set yet
  if (!squat1rm || !bench1rm || !deadlift1rm) return null;

  try {
    const body = {
      exercise_name: exerciseName,
      movement_pattern: movementPattern,
      strength_level: strengthLevel,
      squat_1rm: squat1rm,
      bench_1rm: bench1rm,
      deadlift_1rm: deadlift1rm,
      target_rep_range: targetRepRange,
      week_number: weekNumber,
      mesocycle_number: mesocycleNumber,
    };
    if (percentageOverride != null) body.percentage_override = percentageOverride;
    if (overrideReference1rm != null) body.override_reference_1rm = overrideReference1rm;

    const response = await fetch(`${WEIGHT_PREDICTOR_URL}/predict-weight`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Weight predictor service responded ${response.status}`);
    }

    const { weight } = await response.json();
    return weight;
  } catch (err) {
    console.warn(`[weightPredictor] AI service unavailable, projectedWeight will be null: ${err.message}`);
    return null;
  }
}
