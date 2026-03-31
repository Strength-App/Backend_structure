"""exercise_selector.py

Inference interface for the Random Forest exercise selector.

Load pre-trained models (produced by ``exercise_model.py``) and expose
``select_exercise()``, which enforces all hard constraint rules before
returning the highest-probability valid exercise.

Constraint enforcement
----------------------
Three rules are applied as post-prediction filters:

Rule 1 - No Weekly Repetition
    The same exercise must not appear twice in the same week for the same
    movement pattern.

Rule 2 - No Mesocycle Variation Repeat
    If an exercise (or any exercise in its variation family) was used in the
    previous mesocycle, it must not be selected in the current mesocycle.
    Family membership is defined in ``variation_families.VARIATION_FAMILIES``.

Rule 3 - Strength-Level Gating
    Beginners and novices are restricted to specific exercises per pattern.
    Intermediate and above have unrestricted access.

Usage
-----
>>> from exercise_selector import select_exercise
>>> exercise = select_exercise(
...     movement_pattern="Vertical Pull",
...     strength_level="intermediate",
...     exercises_used_this_week=["Lat Pulldowns"],
...     exercises_used_last_mesocycle=["Lat Pulldowns", "Wide Grip Lat Pulldowns"],
...     week_number=2,
...     mesocycle_number=2,
... )
>>> print(exercise)

Prerequisites
-------------
Run ``python exercise_model.py`` once to train and save the model bundle
to ``models/exercise_models.joblib`` before calling ``select_exercise()``.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import joblib
import numpy as np

from exercise_model import (
    MOVEMENT_PATTERNS,
    STRENGTH_LEVELS,
    apply_mesocycle_filter,
    apply_weekly_filter,
    build_feature_vector,
    get_valid_exercises_for_strength_level,
)

# ---------------------------------------------------------------------------
# Model loading -- module-level cache (loaded once per process)
# ---------------------------------------------------------------------------

_DEFAULT_MODEL_PATH: Path = Path(__file__).parent / "models" / "exercise_models.joblib"
_MODEL_CACHE: Optional[dict] = None


def load_models(model_path: str | Path = _DEFAULT_MODEL_PATH) -> dict:
    """Load all trained pattern models from disk (cached after first call).

    Raises
    ------
    FileNotFoundError
        If the model bundle does not exist.  Run ``exercise_model.py`` first.
    """
    global _MODEL_CACHE
    if _MODEL_CACHE is not None:
        return _MODEL_CACHE

    model_path = Path(model_path)
    if not model_path.exists():
        raise FileNotFoundError(
            f"Model bundle not found at '{model_path}'.\n"
            "Train the models first by running:\n"
            "    python exercise_model.py"
        )

    _MODEL_CACHE = joblib.load(model_path)
    return _MODEL_CACHE


def reload_models(model_path: str | Path = _DEFAULT_MODEL_PATH) -> dict:
    """Force a fresh load from disk, bypassing the module-level cache."""
    global _MODEL_CACHE
    _MODEL_CACHE = None
    return load_models(model_path)


# ---------------------------------------------------------------------------
# Internal constraint helpers
# ---------------------------------------------------------------------------

def _get_valid_pool(
    pattern: str,
    strength_level: str,
    exercises_used_this_week: list[str],
    exercises_used_last_mesocycle: list[str],
) -> list[str]:
    """Return the fully-filtered exercise pool for a prediction context."""
    all_exercises = MOVEMENT_PATTERNS[pattern]
    pool = get_valid_exercises_for_strength_level(all_exercises, pattern, strength_level)
    pool = apply_weekly_filter(pool, exercises_used_this_week)
    pool = apply_mesocycle_filter(pool, exercises_used_last_mesocycle)
    return pool


# ---------------------------------------------------------------------------
# Public prediction interface
# ---------------------------------------------------------------------------

def select_exercise(
    movement_pattern: str,
    strength_level: str,
    exercises_used_this_week: list[str],
    exercises_used_last_mesocycle: list[str],
    week_number: int,
    mesocycle_number: int,
    model_path: str | Path = _DEFAULT_MODEL_PATH,
) -> str:
    """Return the single best exercise for the given program context.

    The Random Forest assigns probability scores to all candidate exercises.
    Hard constraint filters eliminate invalid ones (Rules 1, 2, 3).  The
    highest-probability surviving candidate is returned.

    Raises
    ------
    ValueError
        If *movement_pattern* or *strength_level* is unrecognised, or if
        no valid exercise remains after all constraints are applied.
    FileNotFoundError
        If the model bundle has not been generated yet.
    """
    if movement_pattern not in MOVEMENT_PATTERNS:
        raise ValueError(
            f"Unknown movement pattern: '{movement_pattern}'.\n"
            f"Valid patterns: {list(MOVEMENT_PATTERNS.keys())}"
        )
    if strength_level not in STRENGTH_LEVELS:
        raise ValueError(
            f"Unknown strength level: '{strength_level}'.\n"
            f"Valid levels: {STRENGTH_LEVELS}"
        )

    valid_pool = _get_valid_pool(
        movement_pattern,
        strength_level,
        exercises_used_this_week,
        exercises_used_last_mesocycle,
    )

    if not valid_pool:
        # Relax Rule 1 (weekly uniqueness) — allow a repeat within the week
        all_exercises = MOVEMENT_PATTERNS[movement_pattern]
        pool_no_weekly = get_valid_exercises_for_strength_level(all_exercises, movement_pattern, strength_level)
        pool_no_weekly = apply_mesocycle_filter(pool_no_weekly, exercises_used_last_mesocycle)
        if pool_no_weekly:
            valid_pool = pool_no_weekly
        else:
            # Relax Rule 2 (mesocycle history) as well — just apply strength-level gating
            pool_level_only = get_valid_exercises_for_strength_level(all_exercises, movement_pattern, strength_level)
            if pool_level_only:
                valid_pool = pool_level_only
            else:
                raise ValueError(
                    f"No valid exercises remain for "
                    f"pattern='{movement_pattern}', strength_level='{strength_level}' "
                    f"after applying all constraint rules.\n"
                    f"  exercises_used_this_week    : {exercises_used_this_week}\n"
                    f"  exercises_used_last_mesocycle: {exercises_used_last_mesocycle}\n"
                    "Consider relaxing the mesocycle history or week assignments."
                )

    models = load_models(model_path)
    pattern_data = models[movement_pattern]

    model     = pattern_data["model"]
    le        = pattern_data["label_encoder"]
    exercises = pattern_data["exercises"]

    sample = {
        "strength_level":                strength_level,
        "week_number":                   week_number,
        "mesocycle_number":              mesocycle_number,
        "exercises_used_this_week":      exercises_used_this_week,
        "exercises_used_last_mesocycle": exercises_used_last_mesocycle,
    }
    feature_vec = build_feature_vector(sample, movement_pattern, exercises)
    X = feature_vec.reshape(1, -1)

    proba = model.predict_proba(X)[0]

    exercise_scores: dict[str, float] = {ex: 0.0 for ex in valid_pool}
    for class_int, prob in zip(model.classes_, proba):
        ex_name = le.inverse_transform([class_int])[0]
        if ex_name in exercise_scores:
            exercise_scores[ex_name] = float(prob)

    ranked_valid = sorted(
        valid_pool,
        key=lambda ex: exercise_scores[ex],
        reverse=True,
    )

    return ranked_valid[0]


# ---------------------------------------------------------------------------
# CLI demo (python exercise_selector.py)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("Exercise Selector - demo predictions\n")

    demo_cases = [
        {
            "movement_pattern":              "Vertical Pull",
            "strength_level":                "beginner",
            "exercises_used_this_week":      ["Lat Pulldowns"],
            "exercises_used_last_mesocycle": ["Pullups"],
            "week_number":                   2,
            "mesocycle_number":              2,
        },
        {
            "movement_pattern":              "Hinge",
            "strength_level":                "intermediate",
            "exercises_used_this_week":      ["Hip Thrusts"],
            "exercises_used_last_mesocycle": ["RDLs", "Trap Bar Deadlifts"],
            "week_number":                   3,
            "mesocycle_number":              2,
        },
        {
            "movement_pattern":              "Tricep Accessory",
            "strength_level":                "novice",
            "exercises_used_this_week":      ["Skullcrushers"],
            "exercises_used_last_mesocycle": ["Tricep Pushdowns"],
            "week_number":                   2,
            "mesocycle_number":              3,
        },
        {
            "movement_pattern":              "Squat Pattern",
            "strength_level":                "elite",
            "exercises_used_this_week":      ["Front Squat"],
            "exercises_used_last_mesocycle": ["SSB Squats"],
            "week_number":                   1,
            "mesocycle_number":              4,
        },
        {
            "movement_pattern":              "Core",
            "strength_level":                "advanced",
            "exercises_used_this_week":      [],
            "exercises_used_last_mesocycle": ["Plank"],
            "week_number":                   1,
            "mesocycle_number":              1,
        },
    ]

    for case in demo_cases:
        try:
            result = select_exercise(**case)
            print(
                f"  pattern={case['movement_pattern']!r:<28} "
                f"level={case['strength_level']!r:<14} "
                f"=> {result!r}"
            )
        except (ValueError, FileNotFoundError) as exc:
            print(f"  ERROR: {exc}")
