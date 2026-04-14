"""variation_families.py

Defines variation-family groupings used to enforce Rule 2 (No Mesocycle
Variation Repeat).  Exercises that share a family name are considered
"close variations" and must not be repeated within the same mesocycle.

The primary data structure is VARIATION_FAMILIES (family_name -> exercises).
EXERCISE_TO_FAMILY is a reverse-lookup dict built automatically from it.

A secondary fuzzy-matching helper (requires ``thefuzz``) is provided as a
fallback for exercise names that are not present in the canonical mapping.
"""

from __future__ import annotations

from typing import Optional

# ---------------------------------------------------------------------------
# Primary mapping: family_name -> list[exercise_name]
# ---------------------------------------------------------------------------

VARIATION_FAMILIES: dict[str, list[str]] = {

    # -- Horizontal Push -----------------------------------------------------
    "barbell_horizontal_press": [
        "Bench Press", "Incline Bench Press", "Decline Bench Press", "Floor Press",
    ],

    # -- Vertical Push --------------------------------------------------------
    "overhead_barbell_press": [
        "Military Press", "Seated Military Press", "Push Press",
    ],

    # -- Unilateral Push ------------------------------------------------------
    "db_press_flat_incline": ["DB Incline Bench", "DB Flat Bench", "DB Floor Press"],
    "db_shoulder_press":     ["DB Shoulder Press", "Arnold Press"],

    # -- Tricep Accessory -----------------------------------------------------
    "dip_variation":             ["Dips", "Dip Machine"],
    "skull_crusher_variation":   ["Skullcrushers", "Close Grip Bench Press"],
    "tricep_pushdown_variation": [
        "Tricep Pushdowns", "Tricep Extensions",
        "Overhead Tricep Extensions", "One Arm Extensions",
    ],

    # -- Shoulder Accessory ---------------------------------------------------
    "lateral_raise_variation": ["Lateral Raises", "Cable Lateral Raises"],
    "rear_chain_pull":         ["Face Pulls", "Band Pull Aparts"],
    "front_raise_variation":   ["Front Raises", "Upright Rows"],

    # -- Chest Accessory ------------------------------------------------------
    "chest_fly_variation": [
        "DB Chest Flys", "Chest Fly Machine", "Floor Chest Flys",
        "Incline Chest Flys", "Cable Chest Flys", "Low to High Cable Flys",
    ],
    "pushup_variation": ["Pushups", "Weighted Pushups"],

    # -- Push Machine ---------------------------------------------------------
    "chest_press_machine_variation": [
        "Chest Press Machine", "Decline Press Machine", "Incline Press Machine",
    ],
    "shoulder_press_machine_variation": ["Shoulder Press Machine"],

    # -- Vertical Pull --------------------------------------------------------
    "pullup_variation": ["Pullups", "Chin Ups", "Neutral Grip Pullups"],
    "lat_pulldown_variation": [
        "Lat Pulldowns", "Close Grip Lat Pulldowns",
        "Wide Grip Lat Pulldowns", "Single Arm Pulldowns",
    ],

    # -- Horizontal Pull ------------------------------------------------------
    "barbell_row_variation": ["Barbell Row", "Underhand Barbell Row", "Pendlay Row"],
    "cable_row_variation":   ["Cable Row", "Single Arm Cable Rows", "T Bar Rows"],
    "db_row_variation":      ["Single Arm Dumbbell Rows", "Chest Supported Row"],
    "specialty_row_variation": ["Meadows Row", "Seal Row"],

    # -- Posterior Upper Accessory --------------------------------------------
    "rear_delt_variation": [
        "Rear Delt Flys", "Machine Rear Delt Flys", "Scarecrows", "YTWLs",
    ],
    "pullover_variation": ["Pullovers", "Cable Pullovers"],
    "shrug_variation":    ["Shrugs", "DB Shrugs", "Trap Bar Shrugs"],

    # -- Bicep Accessory ------------------------------------------------------
    "db_curl_variation":      ["DB Curls", "Incline DB Curls", "Concentration Curls"],
    "barbell_curl_variation": ["Barbell Curls", "Ez Bar Curls"],
    "hammer_curl_variation":  ["Hammer Curls", "Cross Body Hammer Curls"],
    "cable_curl_variation":   ["Cable Curls", "Rope Curls", "Preacher Curls"],

    # -- Hinge ----------------------------------------------------------------
    "hip_thrust_variation": ["Hip Thrusts", "Barbell Glute Bridges"],
    "rdl_variation":        ["RDLs", "Single Leg RDLs", "Good Mornings"],
    "deadlift_variation":   ["Trap Bar Deadlifts", "Sumo Deadlift"],

    # -- Squat Pattern --------------------------------------------------------
    "barbell_squat_variation": ["Front Squat", "SSB Squats", "Zercher Squat"],
    "machine_squat_variation": ["Hack Squat Machine", "Pendulum Squat", "Leg Press"],
    "goblet_squat_variation":  ["Goblet Squat"],

    # -- Posterior Chain Accessory --------------------------------------------
    "back_extension_variation": ["Back Extensions", "Reverse Hypers", "GHD Raises"],
    "nordic_variation":         ["Nordics"],
    "single_leg_hip_thrust":    ["Single Leg Hip Thrusts"],

    # -- Unilateral Lower -----------------------------------------------------
    "lunge_variation":    ["Walking Lunges", "ATG Lunges", "Reverse Lunges", "Step Ups"],
    "bulgarian_variation": ["Bulgarians"],

    # -- Isolation Lower ------------------------------------------------------
    "leg_extension_variation": ["Leg Extensions", "Single Leg Extensions"],
    "leg_curl_variation":      ["Seated Leg Curls", "Lying Leg Curls"],
    "hip_machine_variation":   ["Abductor Machine", "Adductor Machine"],

    # -- Calves & Shins -------------------------------------------------------
    "calf_raise_variation": [
        "Single Leg Calf Raises", "Calf Raise Machine", "Seated Calf Raises",
        "Bodyweight Calf Raises", "Weighted Calf Raises", "Donkey Calf Raises",
    ],
    "tibia_variation": ["Tibia Raises", "Tibia Curls", "Banded Tibia Curls"],

    # -- Machine Lower --------------------------------------------------------
    "machine_lower_press_variation": [
        "Leg Press", "Hack Squat", "Pendulum Squat", "Reverse Hack Squat",
    ],

    # -- Core -----------------------------------------------------------------
    "plank_variation":        ["Plank", "Dead Bugs"],
    "ab_wheel_variation":     ["Ab Wheel Rollouts"],
    "hanging_core_variation": ["Hanging Leg Raises"],
    "cable_core_variation":   ["Cable Crunches", "Pallof Press"],
    "crunch_variation":       ["Decline Crunches"],
    "carry_variation":        ["Suitcase Carries", "Farmer Carries"],

    # -- Cardio ---------------------------------------------------------------
    "treadmill_variation":  ["Treadmill", "Curved Treadmill"],
    "bike_variation":       ["Bike", "Assault Bike", "Recumbent Bike"],
    "elliptical_variation": ["Elliptical"],
    "stairmaster_variation": ["Stairmaster"],
    "rowing_variation":     ["Rowing Machine"],
    "ski_erg_variation":    ["Ski Erg"],
}

# ---------------------------------------------------------------------------
# Reverse lookup: exercise_name -> family_name   (built automatically)
# ---------------------------------------------------------------------------

EXERCISE_TO_FAMILY: dict[str, str] = {
    exercise: family
    for family, exercises in VARIATION_FAMILIES.items()
    for exercise in exercises
}


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def get_exercise_family(exercise_name: str) -> Optional[str]:
    """Return the variation-family key for *exercise_name*, or ``None`` if unknown."""
    return EXERCISE_TO_FAMILY.get(exercise_name)


def are_close_variations(exercise_a: str, exercise_b: str) -> bool:
    """Return ``True`` if *exercise_a* and *exercise_b* share a variation family."""
    family_a = get_exercise_family(exercise_a)
    family_b = get_exercise_family(exercise_b)
    return (family_a is not None) and (family_a == family_b)


def get_exercise_family_fuzzy(
    exercise_name: str,
    threshold: int = 80,
) -> Optional[str]:
    """Fuzzy-match *exercise_name* against known exercises and return its family.

    Raises
    ------
    ImportError
        If ``thefuzz`` is not installed.
    """
    if exercise_name in EXERCISE_TO_FAMILY:
        return EXERCISE_TO_FAMILY[exercise_name]

    try:
        from thefuzz import fuzz  # type: ignore[import]
    except ImportError as exc:
        raise ImportError(
            "thefuzz is required for fuzzy matching. "
            "Install it with: pip install thefuzz python-Levenshtein"
        ) from exc

    best_family: Optional[str] = None
    best_score: int = 0

    for family, exercises in VARIATION_FAMILIES.items():
        for known_exercise in exercises:
            score: int = fuzz.token_sort_ratio(
                exercise_name.lower(), known_exercise.lower()
            )
            if score > best_score and score >= threshold:
                best_score = score
                best_family = family

    return best_family
