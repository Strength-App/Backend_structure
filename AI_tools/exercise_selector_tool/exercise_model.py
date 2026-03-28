"""exercise_model.py

Random Forest exercise selector - full training pipeline.

Workflow
--------
1. Define the exercise universe (MOVEMENT_PATTERNS) and constraint rules.
2. Generate ~2 000 synthetic training samples per movement pattern by
   randomly sampling user/program context and applying hard constraint
   filters to determine valid candidates, then labelling with a weighted
   heuristic.
3. Encode each sample as a numeric feature vector:
     - One-hot  : strength_level (5 dims)
     - Ordinal  : week_number, mesocycle_number
     - Multi-hot: exercises_used_this_week, exercises_used_last_mesocycle
4. Train one RandomForestClassifier per movement pattern, tuned with
   GridSearchCV (3-fold CV, 18 hyperparameter combinations).
5. Evaluate on an 80/20 hold-out split: accuracy, top-3 accuracy,
   confusion matrix.
6. Persist all models + metadata to ``models/exercise_models.joblib``.

Run directly to (re)train::

    python exercise_model.py

Dependencies: numpy, pandas, scikit-learn, joblib
"""

from __future__ import annotations

import random
import warnings
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, confusion_matrix
from sklearn.model_selection import GridSearchCV, train_test_split
from sklearn.preprocessing import LabelEncoder

from variation_families import EXERCISE_TO_FAMILY

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# Exercise universe
# ---------------------------------------------------------------------------

MOVEMENT_PATTERNS: dict[str, list[str]] = {
    "Horizontal Push": [
        "Bench Press", "Incline Bench Press", "Decline Bench Press", "Floor Press",
    ],
    "Vertical Push": [
        "Military Press", "Seated Military Press", "Push Press",
    ],
    "Unilateral Push": [
        "DB Incline Bench", "DB Flat Bench", "DB Shoulder Press",
        "Arnold Press", "DB Floor Press",
    ],
    "Tricep Accessory": [
        "Dips", "Weighted Dips", "Skullcrushers", "Tricep Pushdowns", "Tricep Extensions",
        "Dip Machine", "Overhead Tricep Extensions", "One Arm Extensions",
        "Close Grip Bench Press",
    ],
    "Shoulder Accessory": [
        "Front Raises", "Lateral Raises", "Cable Lateral Raises",
        "Upright Rows", "Face Pulls", "Band Pull Aparts",
    ],
    "Chest Accessory": [
        "Chest Fly Machine", "DB Chest Flys", "Pushups", "Weighted Pushups",
        "Floor Chest Flys", "Incline Chest Flys", "Cable Chest Flys",
        "Low to High Cable Flys",
    ],
    "Push Machine": [
        "Chest Press Machine", "Shoulder Press Machine",
        "Decline Press Machine", "Incline Press Machine",
    ],
    "Vertical Pull": [
        "Pullups", "Weighted Pull Ups", "Chin Ups", "Weighted Chin Ups",
        "Neutral Grip Pullups", "Weighted Neutral Grip Pullups",
        "Lat Pulldowns", "Close Grip Lat Pulldowns",
        "Wide Grip Lat Pulldowns", "Single Arm Pulldowns",
    ],
    "Vertical Pull Cable Only": [
        "Lat Pulldowns", "Close Grip Lat Pulldowns",
        "Wide Grip Lat Pulldowns", "Single Arm Pulldowns",
    ],
    "Horizontal Pull": [
        "Barbell Row", "Underhand Barbell Row", "Cable Row", "T Bar Rows",
        "Single Arm Cable Rows", "Single Arm Dumbbell Rows",
        "Chest Supported Row", "Meadows Row", "Seal Row", "Pendlay Row",
    ],
    "Posterior Upper Accessory": [
        "Scarecrows", "Rear Delt Flys", "Machine Rear Delt Flys",
        "Pullovers", "Cable Pullovers", "Shrugs", "DB Shrugs",
        "Trap Bar Shrugs", "YTWLs",
    ],
    "Bicep Accessory": [
        "DB Curls", "Barbell Curls", "Ez Bar Curls", "Hammer Curls",
        "Preacher Curls", "Cable Curls", "Rope Curls", "Incline DB Curls",
        "Concentration Curls", "Cross Body Hammer Curls",
    ],
    "Hinge": [
        "Hip Thrusts", "Bodyweight Hip Thrusts", "RDLs", "Trap Bar Deadlifts",
        "Barbell Glute Bridges", "Bodyweight Glute Bridges",
        "Single Leg RDLs", "Sumo Deadlift", "Good Mornings",
    ],
    "Squat Pattern": [
        "Front Squat", "SSB Squats", "Goblet Squat", "Zercher Squat", "Bodyweight Squat",
    ],
    "Posterior Chain Accessory": [
        "Back Extensions", "Bodyweight Back Extensions", "Nordics", "Reverse Hypers",
        "GHD Raises", "Single Leg Hip Thrusts",
    ],
    "Unilateral Lower": [
        "Bulgarians", "Bodyweight Bulgarians", "Walking Lunges", "Bodyweight Lunges",
        "ATG Lunges", "Bodyweight ATG Lunges", "Reverse Lunges", "Step Ups",
    ],
    "Isolation Lower": [
        "Leg Extensions", "Single Leg Extensions", "Seated Leg Curls",
        "Lying Leg Curls", "Abductor Machine", "Adductor Machine",
    ],
    "Calves & Shins": [
        "Single Leg Calf Raises", "Calf Raise Machine", "Seated Calf Raises",
        "Bodyweight Calf Raises", "Weighted Calf Raises", "Donkey Calf Raises",
        "Tibia Raises", "Tibia Curls", "Banded Tibia Curls",
    ],
    "Machine Lower": [
        "Leg Press", "Hack Squat Machine", "Pendulum Squat", "Reverse Hack Squat",
    ],
    "Core": [
        "Plank", "Ab Wheel Rollouts", "Hanging Leg Raises", "Cable Crunches",
        "Decline Crunches", "Pallof Press", "Dead Bugs",
        "Suitcase Carries", "Farmer Carries",
    ],
}

# Ordered list of all strength levels (also used for one-hot encoding)
STRENGTH_LEVELS: list[str] = [
    "beginner", "novice", "intermediate", "advanced", "elite"
]

# Population weights for synthetic data generation
STRENGTH_WEIGHTS: list[float] = [0.20, 0.25, 0.30, 0.15, 0.10]

# Multi-joint exercises that earn a compound bonus in weeks 1-2
COMPOUND_EXERCISES: frozenset[str] = frozenset({
    "Bench Press", "Incline Bench Press", "Decline Bench Press", "Floor Press",
    "Military Press", "Seated Military Press", "Push Press",
    "Barbell Row", "Underhand Barbell Row", "Pendlay Row",
    "T Bar Rows", "Seal Row", "Meadows Row",
    "Hip Thrusts", "RDLs", "Trap Bar Deadlifts", "Sumo Deadlift",
    "Good Mornings", "Barbell Glute Bridges", "Single Leg RDLs",
    "Front Squat", "SSB Squats", "Hack Squat Machine", "Pendulum Squat",
    "Leg Press", "Goblet Squat", "Zercher Squat",
    "Pullups", "Chin Ups", "Neutral Grip Pullups",
    "Lat Pulldowns", "Close Grip Lat Pulldowns",
    "Wide Grip Lat Pulldowns", "Single Arm Pulldowns",
    "Bulgarians", "Walking Lunges", "ATG Lunges", "Reverse Lunges", "Step Ups",
    "Dips", "Close Grip Bench Press",
})

# Exercises preferred for advanced/elite: high-technique, heavy compound,
# or specialized movements not suitable for beginners/novices.
_ADVANCED_PREFERRED: frozenset[str] = frozenset({
    "Pendlay Row", "Meadows Row", "Seal Row",
    "Sumo Deadlift", "Good Mornings", "Single Leg RDLs",
    "Front Squat", "SSB Squats", "Zercher Squat",
    "Push Press",
    "Weighted Pull Ups", "Weighted Chin Ups", "Weighted Neutral Grip Pullups", "Weighted Dips",
    "ATG Lunges", "Bulgarians",
    "Nordics", "Reverse Hypers", "GHD Raises",
    "YTWLs", "Scarecrows", "Pullovers",
    "Incline DB Curls", "Concentration Curls", "Cross Body Hammer Curls",
    "Ab Wheel Rollouts", "Hanging Leg Raises", "Suitcase Carries",
    "Donkey Calf Raises", "Tibia Curls", "Banded Tibia Curls",
    "Decline Bench Press", "Arnold Press", "DB Floor Press",
})

# ---------------------------------------------------------------------------
# Strength-level gating (Rule 3)
# ---------------------------------------------------------------------------

# Beginner: foundational compound movements, machines, and bodyweight only.
# Focus on learning technique before loading. Patterns not listed are unrestricted.
_BEGINNER_WHITELISTS: dict[str, frozenset[str]] = {
    "Horizontal Push":           frozenset({"Bench Press"}),
    "Vertical Push":             frozenset({"Seated Military Press"}),
    "Unilateral Push":           frozenset({"DB Flat Bench", "DB Shoulder Press"}),
    "Tricep Accessory":          frozenset({"Tricep Pushdowns", "Tricep Extensions", "Dip Machine", "Overhead Tricep Extensions", "One Arm Extensions"}),
    "Shoulder Accessory":        frozenset({"Lateral Raises", "Front Raises", "Band Pull Aparts"}),
    "Chest Accessory":           frozenset({"Chest Fly Machine", "DB Chest Flys", "Pushups"}),
    "Push Machine":              frozenset({"Chest Press Machine", "Shoulder Press Machine"}),
    "Vertical Pull":             frozenset({"Lat Pulldowns", "Close Grip Lat Pulldowns", "Wide Grip Lat Pulldowns", "Single Arm Pulldowns"}),
    "Horizontal Pull":           frozenset({"Cable Row", "Chest Supported Row", "Single Arm Dumbbell Rows"}),
    "Posterior Upper Accessory": frozenset({"Rear Delt Flys", "Machine Rear Delt Flys", "DB Shrugs"}),
    "Bicep Accessory":           frozenset({"DB Curls", "Hammer Curls", "Cable Curls"}),
    "Hinge":                     frozenset({"Bodyweight Hip Thrusts", "Bodyweight Glute Bridges", "Hip Thrusts", "Barbell Glute Bridges"}),
    "Squat Pattern":             frozenset({"Goblet Squat", "Bodyweight Squat"}),
    "Posterior Chain Accessory": frozenset({"Bodyweight Back Extensions", "Single Leg Hip Thrusts"}),
    "Unilateral Lower":          frozenset({"Bodyweight Bulgarians", "Bodyweight Lunges", "Reverse Lunges", "Step Ups"}),
    "Calves & Shins":            frozenset({"Bodyweight Calf Raises", "Calf Raise Machine"}),
    "Machine Lower":             frozenset({"Leg Press", "Hack Squat Machine"}),
    "Core":                      frozenset({"Plank", "Decline Crunches", "Pallof Press", "Dead Bugs"}),
}

# Novice: broader access than beginner — introduces basic barbells and free weights,
# but still gates out advanced technique-dependent movements.
# Patterns not listed are unrestricted at this level.
_NOVICE_WHITELISTS: dict[str, frozenset[str]] = {
    "Horizontal Push":           frozenset({"Bench Press", "Incline Bench Press", "Floor Press"}),
    "Vertical Push":             frozenset({"Military Press", "Seated Military Press"}),
    "Unilateral Push":           frozenset({"DB Flat Bench", "DB Incline Bench", "DB Shoulder Press"}),
    "Tricep Accessory":          frozenset({"Dips", "Tricep Pushdowns", "Tricep Extensions", "Dip Machine", "Overhead Tricep Extensions", "One Arm Extensions"}),
    "Shoulder Accessory":        frozenset({"Front Raises", "Lateral Raises", "Cable Lateral Raises", "Face Pulls", "Band Pull Aparts"}),
    "Chest Accessory":           frozenset({"Chest Fly Machine", "DB Chest Flys", "Pushups", "Weighted Pushups", "Floor Chest Flys"}),
    "Vertical Pull":             frozenset({"Lat Pulldowns", "Close Grip Lat Pulldowns", "Wide Grip Lat Pulldowns", "Single Arm Pulldowns", "Pullups", "Chin Ups", "Neutral Grip Pullups"}),
    "Horizontal Pull":           frozenset({"Barbell Row", "Underhand Barbell Row", "Cable Row", "T Bar Rows", "Single Arm Cable Rows", "Single Arm Dumbbell Rows", "Chest Supported Row"}),
    "Posterior Upper Accessory": frozenset({"Rear Delt Flys", "Machine Rear Delt Flys", "Shrugs", "DB Shrugs", "Cable Pullovers", "Trap Bar Shrugs"}),
    "Bicep Accessory":           frozenset({"DB Curls", "Barbell Curls", "Ez Bar Curls", "Hammer Curls", "Cable Curls", "Rope Curls", "Preacher Curls"}),
    "Hinge":                     frozenset({"Hip Thrusts", "Bodyweight Hip Thrusts", "RDLs", "Trap Bar Deadlifts", "Barbell Glute Bridges", "Bodyweight Glute Bridges"}),
    "Squat Pattern":             frozenset({"Goblet Squat", "Bodyweight Squat"}),
    "Posterior Chain Accessory": frozenset({"Back Extensions", "Bodyweight Back Extensions", "Single Leg Hip Thrusts"}),
    "Unilateral Lower":          frozenset({"Bulgarians", "Bodyweight Bulgarians", "Walking Lunges", "Bodyweight Lunges", "Reverse Lunges", "Step Ups"}),
    "Calves & Shins":            frozenset({"Single Leg Calf Raises", "Calf Raise Machine", "Seated Calf Raises", "Bodyweight Calf Raises", "Tibia Raises"}),
    "Machine Lower":             frozenset({"Leg Press", "Hack Squat Machine", "Pendulum Squat"}),
    "Core":                      frozenset({"Plank", "Cable Crunches", "Decline Crunches", "Pallof Press", "Dead Bugs", "Farmer Carries"}),
}


def get_valid_exercises_for_strength_level(
    exercises: list[str],
    pattern: str,
    strength_level: str,
) -> list[str]:
    """Apply Rule 3 (strength-level gating) and return permitted exercises.

    Beginner  – restricted to foundational/machine/bodyweight exercises per pattern.
    Novice    – broader access; introduces basic barbells and free weights,
                gates out advanced technique-dependent movements.
    Intermediate/Advanced/Elite – unrestricted access to all exercises.
    """
    if strength_level in ("intermediate", "advanced", "elite"):
        return list(exercises)

    if strength_level == "beginner":
        whitelist = _BEGINNER_WHITELISTS.get(pattern)
        if whitelist is not None:
            return [e for e in exercises if e in whitelist]
        return list(exercises)

    if strength_level == "novice":
        whitelist = _NOVICE_WHITELISTS.get(pattern)
        if whitelist is not None:
            return [e for e in exercises if e in whitelist]
        return list(exercises)

    return list(exercises)


def apply_weekly_filter(
    candidates: list[str],
    exercises_used_this_week: list[str],
) -> list[str]:
    """Rule 1: Remove exercises already assigned this week for this pattern."""
    used_set = set(exercises_used_this_week)
    return [e for e in candidates if e not in used_set]


def apply_mesocycle_filter(
    candidates: list[str],
    exercises_used_last_mesocycle: list[str],
) -> list[str]:
    """Rule 2: Remove exercises whose variation family appeared last mesocycle."""
    last_meso_families: set[str] = set()
    for ex in exercises_used_last_mesocycle:
        fam = EXERCISE_TO_FAMILY.get(ex)
        if fam is not None:
            last_meso_families.add(fam)

    def _is_meso_repeat(exercise: str) -> bool:
        fam = EXERCISE_TO_FAMILY.get(exercise)
        return fam is not None and fam in last_meso_families

    return [e for e in candidates if not _is_meso_repeat(e)]


def get_valid_exercises(
    pattern: str,
    strength_level: str,
    exercises_used_this_week: list[str],
    exercises_used_last_mesocycle: list[str],
) -> list[str]:
    """Return the fully-filtered exercise pool for a given context."""
    all_exercises = MOVEMENT_PATTERNS[pattern]
    pool = get_valid_exercises_for_strength_level(all_exercises, pattern, strength_level)
    pool = apply_weekly_filter(pool, exercises_used_this_week)
    pool = apply_mesocycle_filter(pool, exercises_used_last_mesocycle)
    return pool


# ---------------------------------------------------------------------------
# Heuristic scoring for ground-truth label generation
# ---------------------------------------------------------------------------

def score_exercise(
    exercise: str,
    week_number: int,
    exercises_used_last_mesocycle: list[str],
    strength_level: str = "intermediate",
) -> float:
    """Score a pre-filtered candidate exercise using the labelling heuristic."""
    score = 0.0

    last_meso_families: set[str] = {
        EXERCISE_TO_FAMILY[e]
        for e in exercises_used_last_mesocycle
        if e in EXERCISE_TO_FAMILY
    }
    candidate_family = EXERCISE_TO_FAMILY.get(exercise)
    if candidate_family not in last_meso_families:
        score += 3.0

    score += 2.0  # always awarded (exercise passed strength-level filter)

    if week_number <= 2 and exercise in COMPOUND_EXERCISES:
        score += 1.0

    # Advanced/elite lifters prefer high-technique and heavy compound movements
    if strength_level in ("advanced", "elite") and exercise in _ADVANCED_PREFERRED:
        score += 1.0

    return score


# ---------------------------------------------------------------------------
# Synthetic data generation
# ---------------------------------------------------------------------------

def _generate_synthetic_sample(
    pattern: str,
    rng: random.Random,
) -> dict[str, Any] | None:
    """Generate a single synthetic training sample for *pattern*."""
    all_exercises = MOVEMENT_PATTERNS[pattern]

    strength_level: str   = rng.choices(STRENGTH_LEVELS, weights=STRENGTH_WEIGHTS)[0]
    week_number: int      = rng.randint(1, 6)
    mesocycle_number: int = rng.randint(1, 4)

    valid_for_level = get_valid_exercises_for_strength_level(
        all_exercises, pattern, strength_level
    )
    if not valid_for_level:
        return None

    max_used_week = max(0, len(valid_for_level) - 1)
    n_used_week = rng.randint(0, min(max_used_week, 3))
    exercises_used_this_week = rng.sample(valid_for_level, n_used_week)

    n_used_last_meso = rng.randint(0, min(len(all_exercises), 4))
    exercises_used_last_mesocycle = rng.sample(all_exercises, n_used_last_meso)

    valid_pool = get_valid_exercises(
        pattern, strength_level,
        exercises_used_this_week, exercises_used_last_mesocycle,
    )
    if not valid_pool:
        return None

    scored = [(ex, score_exercise(ex, week_number, exercises_used_last_mesocycle, strength_level))
              for ex in valid_pool]
    rng.shuffle(scored)
    scored.sort(key=lambda t: t[1], reverse=True)
    label = scored[0][0]

    return {
        "pattern":                       pattern,
        "strength_level":                strength_level,
        "week_number":                   week_number,
        "mesocycle_number":              mesocycle_number,
        "exercises_used_this_week":      exercises_used_this_week,
        "exercises_used_last_mesocycle": exercises_used_last_mesocycle,
        "label":                         label,
    }


def generate_all_training_data(
    n_samples_per_pattern: int = 2000,
    seed: int = 42,
) -> pd.DataFrame:
    """Generate synthetic training data for all movement patterns."""
    rng = random.Random(seed)
    all_samples: list[dict[str, Any]] = []

    for pattern in MOVEMENT_PATTERNS:
        samples: list[dict[str, Any]] = []
        attempts = 0
        max_attempts = n_samples_per_pattern * 15

        while len(samples) < n_samples_per_pattern and attempts < max_attempts:
            sample = _generate_synthetic_sample(pattern, rng)
            if sample is not None:
                samples.append(sample)
            attempts += 1

        print(
            f"  {pattern:<32} {len(samples):>5} samples  "
            f"({attempts} attempts)"
        )
        all_samples.extend(samples)

    return pd.DataFrame(all_samples)


# ---------------------------------------------------------------------------
# Feature encoding
# ---------------------------------------------------------------------------

def build_feature_vector(
    sample: dict[str, Any],
    pattern: str,
    exercises: list[str],
) -> np.ndarray:
    """Encode a single sample into a numeric feature vector.

    Feature layout
    --------------
    [0:5]       One-hot strength_level (beginner ... elite)
    [5]         week_number      (ordinal integer)
    [6]         mesocycle_number (ordinal integer)
    [7:7+N]     Multi-hot exercises_used_this_week
    [7+N:7+2N]  Multi-hot exercises_used_last_mesocycle

    where N = len(exercises) for the given pattern.
    """
    n = len(exercises)
    ex_index: dict[str, int] = {ex: i for i, ex in enumerate(exercises)}

    sl_vec = np.zeros(5, dtype=np.float64)
    sl_vec[STRENGTH_LEVELS.index(sample["strength_level"])] = 1.0

    ordinal_vec = np.array(
        [float(sample["week_number"]), float(sample["mesocycle_number"])],
        dtype=np.float64,
    )

    used_week_vec = np.zeros(n, dtype=np.float64)
    for ex in sample["exercises_used_this_week"]:
        if ex in ex_index:
            used_week_vec[ex_index[ex]] = 1.0

    used_meso_vec = np.zeros(n, dtype=np.float64)
    for ex in sample["exercises_used_last_mesocycle"]:
        if ex in ex_index:
            used_meso_vec[ex_index[ex]] = 1.0

    return np.concatenate([sl_vec, ordinal_vec, used_week_vec, used_meso_vec])


def build_dataset_for_pattern(
    df: pd.DataFrame,
    pattern: str,
) -> tuple[np.ndarray, np.ndarray, list[str], LabelEncoder]:
    """Build the feature matrix X and integer label vector y for one pattern."""
    pattern_df = df[df["pattern"] == pattern].reset_index(drop=True)
    exercises  = MOVEMENT_PATTERNS[pattern]

    X = np.array([
        build_feature_vector(row.to_dict(), pattern, exercises)
        for _, row in pattern_df.iterrows()
    ])

    le = LabelEncoder()
    le.fit(exercises)
    y = le.transform(pattern_df["label"].values)

    return X, y, exercises, le


# ---------------------------------------------------------------------------
# Model training
# ---------------------------------------------------------------------------

_PARAM_GRID: dict[str, list[Any]] = {
    "n_estimators":     [100, 200],
    "max_depth":        [None, 10, 20],
    "min_samples_leaf": [1, 2, 4],
}


def train_pattern_model(
    X_train: np.ndarray,
    y_train: np.ndarray,
) -> RandomForestClassifier:
    """Train a RandomForestClassifier for one pattern via GridSearchCV."""
    base = RandomForestClassifier(random_state=42, n_jobs=-1)
    grid_search = GridSearchCV(
        base,
        _PARAM_GRID,
        cv=3,
        scoring="accuracy",
        n_jobs=-1,
        refit=True,
    )
    grid_search.fit(X_train, y_train)
    print(
        f"    Best params : {grid_search.best_params_}  "
        f"CV acc: {grid_search.best_score_:.3f}"
    )
    return grid_search.best_estimator_


# ---------------------------------------------------------------------------
# Evaluation helpers
# ---------------------------------------------------------------------------

def top_k_accuracy(
    model: RandomForestClassifier,
    X_test: np.ndarray,
    y_test: np.ndarray,
    k: int = 3,
) -> float:
    """Compute top-k accuracy on a test set."""
    proba = model.predict_proba(X_test)
    k = min(k, proba.shape[1])
    top_k_indices = np.argsort(proba, axis=1)[:, -k:]

    correct = 0
    for i, true_class_int in enumerate(y_test):
        top_k_class_ints = model.classes_[top_k_indices[i]]
        if true_class_int in top_k_class_ints:
            correct += 1

    return correct / len(y_test)


def evaluate_pattern_model(
    model: RandomForestClassifier,
    X_test: np.ndarray,
    y_test: np.ndarray,
    label_encoder: LabelEncoder,
    pattern: str,
) -> dict[str, Any]:
    """Evaluate a trained model and print a human-readable summary."""
    y_pred = model.predict(X_test)
    acc  = accuracy_score(y_test, y_pred)
    top3 = top_k_accuracy(model, X_test, y_test, k=3)
    cm   = confusion_matrix(y_test, y_pred, labels=model.classes_)

    print(f"\n  -- {pattern} --")
    print(f"    Accuracy      : {acc:.3f}")
    print(f"    Top-3 Accuracy: {top3:.3f}")
    print(f"    Classes       : {list(label_encoder.classes_)}")
    print(f"    Confusion matrix shape: {cm.shape}")

    return {"accuracy": acc, "top3_accuracy": top3, "confusion_matrix": cm}


# ---------------------------------------------------------------------------
# Main training orchestration
# ---------------------------------------------------------------------------

def train_all_models(
    n_samples_per_pattern: int = 2000,
    seed: int = 42,
    model_output_path: str = "models/exercise_models.joblib",
) -> dict[str, Any]:
    """End-to-end training pipeline: data generation -> training -> evaluation -> save."""
    print("=" * 60)
    print("Generating synthetic training data ...")
    print("=" * 60)
    df = generate_all_training_data(n_samples_per_pattern, seed)
    print(f"\nTotal samples: {len(df):,}\n")

    results: dict[str, Any] = {}

    print("=" * 60)
    print("Training models ...")
    print("=" * 60)

    for pattern in MOVEMENT_PATTERNS:
        print(f"\nPattern: '{pattern}'")
        X, y, exercises, le = build_dataset_for_pattern(df, pattern)

        class_counts = np.bincount(y, minlength=len(exercises))
        can_stratify = bool(np.all(class_counts[np.unique(y)] >= 2))

        X_train, X_test, y_train, y_test = train_test_split(
            X, y,
            test_size=0.2,
            random_state=seed,
            stratify=y if can_stratify else None,
        )

        model   = train_pattern_model(X_train, y_train)
        metrics = evaluate_pattern_model(model, X_test, y_test, le, pattern)

        results[pattern] = {
            "model":         model,
            "label_encoder": le,
            "exercises":     exercises,
            "metrics":       metrics,
        }

    output_path = Path(model_output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(results, output_path)

    print("\n" + "=" * 60)
    print(f"Models saved -> {output_path.resolve()}")
    print("=" * 60)

    print("\nSummary")
    print(f"  {'Pattern':<32} {'Acc':>6}  {'Top-3':>6}")
    print("  " + "-" * 47)
    for pattern, data in results.items():
        m = data["metrics"]
        print(f"  {pattern:<32} {m['accuracy']:>6.3f}  {m['top3_accuracy']:>6.3f}")

    return results


if __name__ == "__main__":
    train_all_models()
