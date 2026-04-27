/**
 * cardioMachineMetadata.js
 *
 * Static metadata for all cardio machines available in weight loss templates.
 * Values are calibrated for rule-based scoring in the cardio selector.
 *
 * To add a new machine: add an entry to CARDIO_MACHINES and a matching key
 * in CARDIO_METADATA. All fields are required.
 *
 * To add a new main lift fatigue mapping: add an entry to MAIN_LIFT_FATIGUE_MAP.
 */

export const CARDIO_MACHINES = [
  "Treadmill",
  "Curved Treadmill",
  "Assault Bike",
  "Bike",
  "Recumbent Bike",
  "Elliptical",
  "Stairmaster",
  "Rowing Machine",
  "Ski Erg",
];

/**
 * Per-machine properties used by the hard-filter and scoring stages.
 *
 * skillFloor      — minimum user level (1=beginner … 5=elite) for safe/effective use
 * impact          — joint stress: "low" | "medium" | "high"
 * primaryMuscles  — muscle groups fatigued (used for overlap penalty vs main lift)
 * hiitSuitability — 1–5, suitability for true max-effort intervals
 * steadyStateSuitability — 1–5, suitability for sustained moderate-intensity work
 * warmupSuitability      — 1–5, suitability for light warmup / cooldown work
 * paceControl     — "self" (user sets pace) | "machine" (belt/flywheel sets pace)
 * upperBodyDominant — true when upper-body drive is a primary component
 * lowerBodyDominant — true when lower-body drive is a primary component
 */
export const CARDIO_METADATA = {
  "Treadmill": {
    name: "Treadmill",
    skillFloor: 1,
    impact: "high",
    primaryMuscles: ["legs", "lungs"],
    hiitSuitability: 3,
    steadyStateSuitability: 4,
    warmupSuitability: 4,
    paceControl: "machine",
    upperBodyDominant: false,
    lowerBodyDominant: true,
  },
  "Curved Treadmill": {
    name: "Curved Treadmill",
    skillFloor: 3,
    impact: "high",
    primaryMuscles: ["legs", "lungs"],
    hiitSuitability: 5,
    steadyStateSuitability: 3,
    warmupSuitability: 2,
    paceControl: "self",
    upperBodyDominant: false,
    lowerBodyDominant: true,
  },
  "Assault Bike": {
    name: "Assault Bike",
    skillFloor: 3,
    impact: "low",
    primaryMuscles: ["legs", "arms", "lungs"],
    hiitSuitability: 5,
    steadyStateSuitability: 3,
    warmupSuitability: 2,
    paceControl: "self",
    upperBodyDominant: true,
    lowerBodyDominant: true,
  },
  "Bike": {
    name: "Bike",
    skillFloor: 1,
    impact: "low",
    primaryMuscles: ["legs", "lungs"],
    hiitSuitability: 3,
    steadyStateSuitability: 5,
    warmupSuitability: 4,
    paceControl: "self",
    upperBodyDominant: false,
    lowerBodyDominant: true,
  },
  "Recumbent Bike": {
    name: "Recumbent Bike",
    skillFloor: 1,
    impact: "low",
    primaryMuscles: ["legs", "lungs"],
    hiitSuitability: 1,
    steadyStateSuitability: 4,
    warmupSuitability: 5,
    paceControl: "self",
    upperBodyDominant: false,
    lowerBodyDominant: true,
  },
  "Elliptical": {
    name: "Elliptical",
    skillFloor: 1,
    impact: "low",
    primaryMuscles: ["legs", "arms", "lungs"],
    hiitSuitability: 2,
    steadyStateSuitability: 4,
    warmupSuitability: 5,
    paceControl: "self",
    upperBodyDominant: true,
    lowerBodyDominant: true,
  },
  "Stairmaster": {
    name: "Stairmaster",
    skillFloor: 2,
    impact: "medium",
    primaryMuscles: ["legs", "glutes", "lungs"],
    hiitSuitability: 3,
    steadyStateSuitability: 4,
    warmupSuitability: 2,
    paceControl: "machine",
    upperBodyDominant: false,
    lowerBodyDominant: true,
  },
  "Rowing Machine": {
    name: "Rowing Machine",
    skillFloor: 2,
    impact: "low",
    primaryMuscles: ["legs", "back", "lungs"],
    hiitSuitability: 5,
    steadyStateSuitability: 4,
    warmupSuitability: 3,
    paceControl: "self",
    upperBodyDominant: true,
    lowerBodyDominant: true,
  },
  "Ski Erg": {
    name: "Ski Erg",
    skillFloor: 3,
    impact: "low",
    primaryMuscles: ["back", "arms", "core", "lungs"],
    hiitSuitability: 5,
    steadyStateSuitability: 3,
    warmupSuitability: 2,
    paceControl: "self",
    upperBodyDominant: true,
    lowerBodyDominant: false,
  },
};

/**
 * Muscle groups fatigued by each main lift.
 * Used to penalise cardio machines that compound that fatigue within the same session.
 *
 * To extend: add the exact fixed exercise name as the key and list the muscle
 * group strings that match entries in CARDIO_METADATA.primaryMuscles.
 */
export const MAIN_LIFT_FATIGUE_MAP = {
  "Deadlift":            ["legs", "back", "glutes"],
  "Back Squat":          ["legs", "glutes"],
  "Front Squat":         ["legs", "glutes"],
  "Hip Thrusts":         ["glutes", "legs"],
  "Bench Press":         [],
  "Incline Bench Press": [],
  "Military Press":      [],
  "Push Press":          [],
  "Barbell Row":         ["back"],
};

/**
 * Injury-flag → machines to exclude.
 * Keys must match the injury flag strings stored on the user profile.
 * Values list exact machine names from CARDIO_MACHINES.
 */
export const INJURY_EXCLUSIONS = {
  knee:        ["Treadmill", "Curved Treadmill", "Stairmaster"],
  lower_back:  ["Rowing Machine", "Ski Erg"],
  shoulder:    ["Ski Erg", "Rowing Machine", "Assault Bike"],
};

/** Safe fallback when all machines are filtered out (should never happen). */
export const CARDIO_FALLBACK = "Recumbent Bike";
