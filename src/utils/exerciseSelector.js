/**
 * exerciseSelector.js
 *
 * Calls the Python AI exercise selector service (AI_tools/service.py).
 * Falls back to random selection if the service is unavailable so workout
 * generation never hard-fails due to the AI service being down.
 */

const SELECTOR_URL = process.env.EXERCISE_SELECTOR_URL || "http://localhost:5001";

// Exercises that load a standard 45 lb Olympic barbell — minimum target weight is 45 lbs.
export const BARBELL_EXERCISES = new Set([
  "Bench Press", "Incline Bench Press", "Decline Bench Press", "Floor Press",
  "Military Press", "Seated Military Press", "Push Press",
  "Close Grip Bench Press", "Skullcrushers",
  "Barbell Row", "Underhand Barbell Row", "Pendlay Row", "Seal Row",
  "RDLs", "Sumo Deadlift", "Good Mornings", "Hip Thrusts", "Barbell Glute Bridges",
  "Trap Bar Deadlifts",
  "Front Squat", "SSB Squats", "Zercher Squat",
  "Barbell Curls",
  "Bulgarians",
]);

// Exercises performed with bodyweight only — should display "BW" instead of a target weight.
// Weighted variants (e.g. "Weighted Dips", "Back Extensions") are intentionally excluded so they receive predictions.
export const BODYWEIGHT_EXERCISES = new Set([
  // Vertical Pull — unweighted only
  "Pullups", "Chin Ups", "Neutral Grip Pullups",
  // Tricep Accessory — unweighted only
  "Dips",
  // Chest Accessory — unweighted only
  "Pushups",
  // Posterior Chain Accessory — unweighted only
  "Nordics", "Bodyweight Back Extensions", "GHD Raises",
  // Calves & Shins — unweighted only
  "Bodyweight Calf Raises", "Tibia Raises", "Banded Tibia Raises", "Banded Tibia Curls",
  // Core — always bodyweight
  "Plank", "Ab Wheel Rollouts", "Hanging Leg Raises", "Decline Crunches", "Dead Bugs",
  // Lower body — bodyweight variants
  "Bodyweight Squat", "Bodyweight Lunges", "Bodyweight ATG Lunges",
  "Bodyweight Bulgarians", "Bodyweight Hip Thrusts", "Bodyweight Glute Bridges",
]);

// Mirrors the movement pattern lists in userRoutes.js — used for fallback only.
const MOVEMENT_PATTERNS = {
  "Horizontal Push": ["Bench Press", "Incline Bench Press", "Decline Bench Press", "Floor Press"],
  "Vertical Push": ["Military Press", "Seated Military Press", "Push Press"],
  "Unilateral Push": ["DB Incline Bench", "DB Flat Bench", "DB Shoulder Press", "Arnold Press", "DB Floor Press"],
  "Tricep Accessory": ["Dips", "Weighted Dips", "Skullcrushers", "Tricep Pushdowns", "Tricep Extensions", "Dip Machine", "Overhead Tricep Extensions", "One Arm Extensions", "Close Grip Bench Press"],
  "Shoulder Accessory": ["Front Raises", "Lateral Raises", "Cable Lateral Raises", "Upright Rows", "Face Pulls", "Band Pull Aparts"],
  "Chest Accessory": ["Chest Fly Machine", "DB Chest Flys", "Pushups", "Weighted Pushups", "Floor Chest Flys", "Incline Chest Flys", "Cable Chest Flys", "Low to High Cable Flys"],
  "Push Machine": ["Chest Press Machine", "Shoulder Press Machine", "Decline Press Machine", "Incline Press Machine"],
  "Vertical Pull": ["Pullups", "Weighted Pull Ups", "Chin Ups", "Weighted Chin Ups", "Neutral Grip Pullups", "Weighted Neutral Grip Pullups", "Lat Pulldowns", "Close Grip Lat Pulldowns", "Wide Grip Lat Pulldowns", "Single Arm Pulldowns"],
  "Vertical Pull Cable Only": ["Lat Pulldowns", "Close Grip Lat Pulldowns", "Wide Grip Lat Pulldowns", "Single Arm Pulldowns"],
  "Horizontal Pull": ["Barbell Row", "Underhand Barbell Row", "Cable Row", "T Bar Rows", "Single Arm Cable Rows", "Single Arm Dumbbell Rows", "Chest Supported Row", "Meadows Row", "Seal Row", "Pendlay Row"],
  "Posterior Upper Accessory": ["Scarecrows", "Rear Delt Flys", "Machine Rear Delt Flys", "Pullovers", "Cable Pullovers", "Shrugs", "DB Shrugs", "Trap Bar Shrugs", "YTWLs"],
  "Bicep Accessory": ["DB Curls", "Barbell Curls", "Ez Bar Curls", "Hammer Curls", "Preacher Curls", "Cable Curls", "Rope Curls", "Incline DB Curls", "Concentration Curls", "Cross Body Hammer Curls"],
  "Hinge": ["Hip Thrusts", "Bodyweight Hip Thrusts", "RDLs", "Trap Bar Deadlifts", "Barbell Glute Bridges", "Bodyweight Glute Bridges", "Single Leg RDLs", "Sumo Deadlift", "Good Mornings"],
  "Squat Pattern": ["Front Squat", "SSB Squats", "Goblet Squat", "Zercher Squat", "Bodyweight Squat"],
  "Posterior Chain Accessory": ["Back Extensions", "Bodyweight Back Extensions", "Nordics", "Reverse Hypers", "GHD Raises", "Single Leg Hip Thrusts"],
  "Unilateral Lower": ["Bulgarians", "Bodyweight Bulgarians", "Walking Lunges", "Bodyweight Lunges", "ATG Lunges", "Bodyweight ATG Lunges", "Reverse Lunges", "Step Ups"],
  "Isolation Lower": ["Leg Extensions", "Single Leg Extensions", "Seated Leg Curls", "Lying Leg Curls", "Abductor Machine", "Adductor Machine"],
  "Calves & Shins": ["Single Leg Calf Raises", "Calf Raise Machine", "Seated Calf Raises", "Bodyweight Calf Raises", "Weighted Calf Raises", "Donkey Calf Raises", "Tibia Raises", "Tibia Curls", "Banded Tibia Curls"],
  "Machine Lower": ["Leg Press", "Hack Squat Machine", "Pendulum Squat", "Reverse Hack Squat"],
  "Core": ["Plank", "Ab Wheel Rollouts", "Hanging Leg Raises", "Cable Crunches", "Decline Crunches", "Pallof Press", "Dead Bugs", "Suitcase Carries", "Farmer Carries"],
};

function randomFallback(pattern) {
  const options = MOVEMENT_PATTERNS[pattern];
  if (!options?.length) return pattern;
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Ask the AI service to select the best exercise for a given slot.
 * Falls back to random selection if the service is unreachable or errors.
 *
 * @param {string}   movementPattern
 * @param {string}   strengthLevel          - "beginner"|"novice"|"intermediate"|"advanced"|"elite"
 * @param {string[]} exercisesUsedThisWeek  - exercises already assigned this week for this pattern
 * @param {string[]} exercisesUsedLastMeso  - exercises used last mesocycle for this pattern
 * @param {number}   weekNumber             - 1–6
 * @param {number}   mesocycleNumber        - 1, 2, 3, …
 * @returns {Promise<string>} exercise name
 */
export async function selectExercise(
  movementPattern,
  strengthLevel,
  exercisesUsedThisWeek,
  exercisesUsedLastMeso,
  weekNumber,
  mesocycleNumber
) {
  try {
    const response = await fetch(`${SELECTOR_URL}/select-exercise`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        movement_pattern: movementPattern,
        strength_level: strengthLevel,
        exercises_used_this_week: exercisesUsedThisWeek,
        exercises_used_last_mesocycle: exercisesUsedLastMeso,
        week_number: weekNumber,
        mesocycle_number: mesocycleNumber,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Selector service responded ${response.status}`);
    }

    const { exercise } = await response.json();
    return exercise;
  } catch (err) {
    console.warn(`[exerciseSelector] AI service unavailable, using random fallback: ${err.message}`);
    return randomFallback(movementPattern);
  }
}

/**
 * Extract all exercises grouped by pattern from a workout log document.
 * Used to populate exercises_used_last_mesocycle for the AI selector.
 *
 * @param {object} workoutLog  - a full workout_logs document
 * @returns {Record<string, string[]>}  pattern -> unique exercise names
 */
export function extractExercisesByPattern(workoutLog) {
  const byPattern = {};
  for (const week of workoutLog?.weeks ?? []) {
    for (const day of week.days ?? []) {
      for (const slot of day.slots ?? []) {
        if (!slot.exercise || slot.fixed) continue;
        const pattern = slot.label;
        if (!pattern) continue;
        if (!byPattern[pattern]) byPattern[pattern] = new Set();
        byPattern[pattern].add(slot.exercise);
      }
    }
  }
  return Object.fromEntries(
    Object.entries(byPattern).map(([k, v]) => [k, [...v]])
  );
}
