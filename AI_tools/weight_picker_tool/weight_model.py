"""
weight_model.py

Full training pipeline for the XGBoost working-weight predictor.

Run directly:
    python weight_model.py

Produces:
    weight_model_artefacts/xgb_model.joblib
    weight_model_artefacts/feature_encoder.joblib
    weight_model_artefacts/best_params.joblib
    weight_model_artefacts/feature_names.json
"""

from __future__ import annotations

import os
import json
import warnings
import numpy as np
import pandas as pd
from pathlib import Path

from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import xgboost as xgb
import joblib

try:
    import optuna
    optuna.logging.set_verbosity(optuna.logging.WARNING)
    HAS_OPTUNA = True
except ImportError:
    HAS_OPTUNA = False

from rep_percentage_table import weight_from_1rm, progression_modifier
from weight_predictor import FeatureEncoder, CV_FOLDS, RANDOM_SEED, STRENGTH_LEVELS
from real_data_processor import load_real_training_data

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ARTEFACT_DIR    = Path("weight_model_artefacts")
KAGGLE_CSV      = Path("weightlifting_721_workouts.csv")
N_SAMPLES       = 16_000
N_OPTUNA_TRIALS = 40

# Weight applied to each real data row relative to one synthetic row.
# 3.0 means each real observation counts as 3× a synthetic sample, reflecting
# that real data is more trustworthy than generated data.
REAL_DATA_WEIGHT = 3.0

# Calibrated against Starting Strength (WNDTP) novice data:
#   - Beginner: reflects optimal SS starting weights (squat 95–115 lbs per article recommendation)
#   - Novice upper bound reflects median KDTP gains after ~15 weeks
#     (squat +154 lbs → ~286 lbs, bench +70 lbs → ~183 lbs, deadlift +94 lbs → ~246 lbs)
#   - Deadlift starts ~15% above squat (article ratio ~1.15×) for beginner/novice
ONE_RM_RANGES: dict[str, dict[str, tuple[float, float]]] = {
    "beginner":     {"squat": (95,  160),  "bench": (65,  120),  "deadlift": (110, 190)},
    "novice":       {"squat": (160, 290),  "bench": (120, 185),  "deadlift": (190, 335)},
    "intermediate": {"squat": (290, 405),  "bench": (185, 275),  "deadlift": (335, 455)},
    "advanced":     {"squat": (405, 550),  "bench": (275, 365),  "deadlift": (455, 600)},
    "elite":        {"squat": (550, 800),  "bench": (365, 500),  "deadlift": (600, 800)},
}

LEVEL_WEIGHTS = [0.20, 0.25, 0.30, 0.15, 0.10]
REP_OPTIONS = [3, 4, 5, 6, 8, 10, 12, 15]

MOVEMENT_PATTERNS: dict[str, list[str]] = {
    "Horizontal Push":            ["Bench Press", "Incline Bench Press", "Decline Bench Press", "Floor Press"],
    "Vertical Push":              ["Military Press", "Seated Military Press", "Push Press"],
    "Unilateral Push":            ["DB Incline Bench", "DB Flat Bench", "DB Shoulder Press", "Arnold Press", "DB Floor Press"],
    "Tricep Accessory":           ["Dips", "Weighted Dips", "Skullcrushers", "Tricep Pushdowns", "Tricep Extensions",
                                   "Dip Machine", "Overhead Tricep Extensions", "One Arm Extensions", "Close Grip Bench Press"],
    "Shoulder Accessory":         ["Front Raises", "Lateral Raises", "Cable Lateral Raises",
                                   "Upright Rows", "Face Pulls", "Band Pull Aparts"],
    "Chest Accessory":            ["Chest Fly Machine", "DB Chest Flys", "Pushups", "Weighted Pushups",
                                   "Floor Chest Flys", "Incline Chest Flys", "Cable Chest Flys", "Low to High Cable Flys"],
    "Push Machine":               ["Chest Press Machine", "Shoulder Press Machine", "Decline Press Machine", "Incline Press Machine"],
    "Vertical Pull":              ["Pullups", "Weighted Pull Ups", "Chin Ups", "Weighted Chin Ups",
                                   "Neutral Grip Pullups", "Weighted Neutral Grip Pullups",
                                   "Lat Pulldowns", "Close Grip Lat Pulldowns",
                                   "Wide Grip Lat Pulldowns", "Single Arm Pulldowns"],
    "Vertical Pull Cable Only":   ["Lat Pulldowns", "Close Grip Lat Pulldowns", "Wide Grip Lat Pulldowns", "Single Arm Pulldowns"],
    "Horizontal Pull":            ["Barbell Row", "Underhand Barbell Row", "Cable Row", "T Bar Rows",
                                   "Single Arm Cable Rows", "Single Arm Dumbbell Rows", "Chest Supported Row",
                                   "Seal Row", "Pendlay Row"],
    "Posterior Upper Accessory":  ["Scarecrows", "Rear Delt Flys", "Machine Rear Delt Flys", "Pullovers",
                                   "Cable Pullovers", "Shrugs", "DB Shrugs", "Trap Bar Shrugs", "YTWLs"],
    "Bicep Accessory":            ["DB Curls", "Barbell Curls", "Ez Bar Curls", "Hammer Curls",
                                   "Preacher Curls", "Cable Curls", "Rope Curls", "Incline DB Curls",
                                   "Concentration Curls", "Cross Body Hammer Curls"],
    "Hinge":                      ["Hip Thrusts", "Bodyweight Hip Thrusts", "RDLs", "Trap Bar Deadlifts",
                                   "Barbell Glute Bridges", "Bodyweight Glute Bridges",
                                   "Single Leg RDLs", "Sumo Deadlift", "Good Mornings"],
    "Squat Pattern":              ["Front Squat", "SSB Squats", "Goblet Squat", "Zercher Squat", "Bodyweight Squat"],
    "Posterior Chain Accessory":  ["Back Extensions", "Bodyweight Back Extensions", "Nordics", "Reverse Hypers",
                                   "GHD Raises", "Single Leg Hip Thrusts"],
    "Unilateral Lower":           ["Bulgarians", "Bodyweight Bulgarians", "Walking Lunges", "Bodyweight Lunges",
                                   "ATG Lunges", "Bodyweight ATG Lunges", "Reverse Lunges", "Step Ups"],
    "Isolation Lower":            ["Leg Extensions", "Single Leg Extensions", "Seated Leg Curls",
                                   "Lying Leg Curls", "Abductor Machine", "Adductor Machine"],
    "Calves & Shins":             ["Single Leg Calf Raises", "Calf Raise Machine", "Seated Calf Raises",
                                   "Bodyweight Calf Raises", "Weighted Calf Raises", "Donkey Calf Raises",
                                   "Tibia Raises", "Tibia Curls", "Banded Tibia Curls"],
    "Machine Lower":              ["Leg Press", "Hack Squat Machine", "Pendulum Squat", "Reverse Hack Squat"],
    "Core":                       ["Plank", "Ab Wheel Rollouts", "Hanging Leg Raises", "Cable Crunches",
                                   "Decline Crunches", "Pallof Press", "Dead Bugs", "Suitcase Carries", "Farmer Carries"],
}

LOWER_BODY_PATTERNS = {
    "Hinge", "Squat Pattern", "Posterior Chain Accessory",
    "Unilateral Lower", "Isolation Lower", "Calves & Shins", "Machine Lower",
}

# Ratios calibrated using SS lift relationships from WNDTP article:
#   - Bench ≈ 0.58× deadlift / ≈ 0.86× squat for beginners
#   - Barbell rows prescribed at ~90% of bench working weight →
#     rows ≈ 0.55–0.65× deadlift_1rm (raised from 0.20–0.40)
#   - Press ≈ 0.58× bench (article: press +48 lbs from ~65 lbs start)
ACCESSORY_RATIOS: dict[str, tuple[str, float, float]] = {
    "Horizontal Push":           ("bench",    0.55, 0.88),
    "Vertical Push":             ("bench",    0.45, 0.70),
    "Unilateral Push":           ("bench",    0.15, 0.32),
    "Tricep Accessory":          ("bench",    0.10, 0.22),
    "Shoulder Accessory":        ("bench",    0.08, 0.15),
    "Chest Accessory":           ("bench",    0.10, 0.22),
    "Push Machine":              ("bench",    0.30, 0.58),
    "Vertical Pull":             ("deadlift", 0.12, 0.28),
    "Vertical Pull Cable Only":  ("deadlift", 0.12, 0.26),
    "Horizontal Pull":           ("deadlift", 0.40, 0.65),
    "Posterior Upper Accessory": ("deadlift", 0.08, 0.22),
    "Bicep Accessory":           ("bench",    0.10, 0.22),
    "Hinge":                     ("deadlift", 0.50, 0.80),
    "Squat Pattern":             ("squat",    0.55, 0.85),
    "Posterior Chain Accessory": ("deadlift", 0.12, 0.28),
    "Unilateral Lower":          ("squat",    0.15, 0.32),
    "Isolation Lower":           ("squat",    0.10, 0.22),
    "Calves & Shins":            ("squat",    0.08, 0.20),
    "Machine Lower":             ("squat",    0.28, 0.58),
    "Core":                      ("bench",    0.00, 0.00),
}

CORE_RANGE = (10.0, 45.0)

# ── Exercise-specific overrides ──────────────────────────────────────────────
#
# Some exercises sit inside a pattern whose default ratio range is a poor fit.
# These dicts let us assign per-exercise ground-truth logic without creating
# new movement patterns.

# Compound accessory lifts that should use the Epley formula (like Horizontal
# Push) rather than a fixed ratio × rep_scale.  Value: (ref_1rm_key, scale).
# scale shrinks the reference 1RM to reflect that the exercise is slightly
# weaker than the primary compound (e.g. close-grip ≈ 87% of bench).
COMPOUND_WITHIN_ACCESSORY: dict[str, tuple[str, float]] = {
    "Close Grip Bench Press": ("bench", 0.87),  # barbell compound — ~87% of bench 1RM
}

# Isolation accessories whose weight profile differs strongly from the rest of
# their pattern.  Value: (ref_1rm_key, ratio_lo, ratio_hi).
# All ratios are fractions of the reference 1RM; working weight =
#   ref_1rm × ratio × rep_scale(reps).
EXERCISE_RATIO_OVERRIDES: dict[str, tuple[str, float, float]] = {
    # Bulgarians: always performed with dumbbells — weight shown is per dumbbell.
    # Intermediate squat ~350 lbs → realistic 25–55 lbs per hand.
    # Default pattern ratio (0.15–0.32 × squat) overshoots; this corrects it.
    "Bulgarians":             ("squat",    0.08, 0.18),
    # Weighted Dips: ratio represents ADDED weight only (not bodyweight + plates).
    # A 225 lb bench intermediate typically adds 20–55 lbs.
    "Weighted Dips":          ("bench",    0.10, 0.28),
    # Rear delt isolation — dumbbells or cables, much lighter than shrugs/pullovers
    "Rear Delt Flys":         ("bench",    0.05, 0.12),
    "Machine Rear Delt Flys": ("bench",    0.06, 0.14),
    # Very light corrective/scapular work
    "Scarecrows":             ("bench",    0.02, 0.06),
    "YTWLs":                  ("bench",    0.02, 0.06),
    # Pullovers are heavier than flys but lighter than shrugs
    "Pullovers":              ("bench",    0.14, 0.28),
    "Cable Pullovers":        ("bench",    0.12, 0.24),
}


def rep_scale(reps: int) -> float:
    table = {3: 1.10, 4: 1.07, 5: 1.04, 6: 1.00, 8: 0.92, 10: 0.85, 12: 0.78, 15: 0.70}
    if reps in table:
        return table[reps]
    keys = sorted(table.keys())
    for i in range(len(keys) - 1):
        lo, hi = keys[i], keys[i + 1]
        if lo <= reps <= hi:
            t = (reps - lo) / (hi - lo)
            return table[lo] + t * (table[hi] - table[lo])
    return 0.70


# ---------------------------------------------------------------------------
# Synthetic data generation
# ---------------------------------------------------------------------------

def generate_synthetic_data(n_samples: int = N_SAMPLES, seed: int = RANDOM_SEED) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    exercise_pool: list[tuple[str, str]] = []
    for pattern, exercises in MOVEMENT_PATTERNS.items():
        for ex in exercises:
            exercise_pool.append((pattern, ex))

    rows = []
    for _ in range(n_samples):
        level = rng.choice(STRENGTH_LEVELS, p=LEVEL_WEIGHTS)
        ranges = ONE_RM_RANGES[level]
        squat_1rm    = float(rng.uniform(*ranges["squat"]))
        bench_1rm    = float(rng.uniform(*ranges["bench"]))
        deadlift_1rm = float(rng.uniform(*ranges["deadlift"]))

        week_number      = int(rng.integers(1, 7))
        mesocycle_number = int(rng.integers(1, 5))
        target_rep_range = int(rng.choice(REP_OPTIONS))

        idx = rng.integers(0, len(exercise_pool))
        movement_pattern, exercise_name = exercise_pool[idx]

        is_lower = movement_pattern in LOWER_BODY_PATTERNS
        round_to = 5.0 if is_lower else 2.5

        working_weight = _compute_ground_truth(
            exercise_name=exercise_name,
            movement_pattern=movement_pattern,
            squat_1rm=squat_1rm,
            bench_1rm=bench_1rm,
            deadlift_1rm=deadlift_1rm,
            target_rep_range=target_rep_range,
            week_number=week_number,
            mesocycle_number=mesocycle_number,
            strength_level=level,
            round_to=round_to,
            rng=rng,
        )

        rows.append({
            "strength_level":    level,
            "squat_1rm":         squat_1rm,
            "bench_1rm":         bench_1rm,
            "deadlift_1rm":      deadlift_1rm,
            "exercise_name":     exercise_name,
            "movement_pattern":  movement_pattern,
            "week_number":       week_number,
            "mesocycle_number":  mesocycle_number,
            "target_rep_range":  target_rep_range,
            "working_weight":    working_weight,
        })

    df = pd.DataFrame(rows)
    df["working_weight"] = df["working_weight"].clip(lower=2.5)
    return df


def _compute_ground_truth(
    exercise_name: str,
    movement_pattern: str,
    squat_1rm: float,
    bench_1rm: float,
    deadlift_1rm: float,
    target_rep_range: int,
    week_number: int,
    mesocycle_number: int,
    strength_level: str,
    round_to: float,
    rng: np.random.Generator,
) -> float:
    prog_mod = progression_modifier(week_number, mesocycle_number)
    _1rm_map = {"squat": squat_1rm, "bench": bench_1rm, "deadlift": deadlift_1rm}

    if movement_pattern == "Core":
        level_scale = {"beginner": 0.8, "novice": 0.9, "intermediate": 1.0, "advanced": 1.15, "elite": 1.3}
        base = float(rng.uniform(*CORE_RANGE)) * level_scale.get(strength_level, 1.0)
        noise = rng.normal(0, 2.5)
        raw = base + noise
        return max(2.5, round(raw / round_to) * round_to)

    # ── Exercise-specific override: compound accessory (uses Epley formula) ──
    if exercise_name in COMPOUND_WITHIN_ACCESSORY:
        ref_key, scale = COMPOUND_WITHIN_ACCESSORY[exercise_name]
        ref_1rm = _1rm_map[ref_key]
        base_pct = 1.0 / (1.0 + target_rep_range / 30.0) if target_rep_range > 1 else 1.0
        effective_pct = min(base_pct * scale + prog_mod, 0.97)
        raw = ref_1rm * effective_pct
        noise = rng.normal(0, 2.5)
        raw += noise
        return max(2.5, round(raw / round_to) * round_to)

    # ── Exercise-specific override: isolation accessory with its own ratio ──
    if exercise_name in EXERCISE_RATIO_OVERRIDES:
        ref_key, ratio_lo, ratio_hi = EXERCISE_RATIO_OVERRIDES[exercise_name]
        ref_1rm = _1rm_map[ref_key]
        ratio = float(rng.uniform(ratio_lo, ratio_hi))
        raw = ref_1rm * ratio * rep_scale(target_rep_range)
        raw *= (1.0 + prog_mod * 0.5)
        noise = rng.normal(0, 2.5)
        raw += noise
        return max(2.5, round(raw / round_to) * round_to)

    # ── Default: use pattern-level ratio ─────────────────────────────────────
    ref_key, ratio_lo, ratio_hi = ACCESSORY_RATIOS[movement_pattern]
    ref_1rm = _1rm_map[ref_key]

    if movement_pattern in ("Horizontal Push", "Vertical Push"):
        base_pct = 1.0 / (1.0 + target_rep_range / 30.0) if target_rep_range > 1 else 1.0
        effective_pct = min(base_pct + prog_mod, 0.97)
        raw = ref_1rm * effective_pct
    else:
        ratio = float(rng.uniform(ratio_lo, ratio_hi))
        raw = ref_1rm * ratio * rep_scale(target_rep_range)
        raw *= (1.0 + prog_mod * 0.5)

    noise = rng.normal(0, 2.5)
    raw += noise

    return max(2.5, round(raw / round_to) * round_to)


# ---------------------------------------------------------------------------
# Hyperparameter tuning
# ---------------------------------------------------------------------------

def _build_optuna_objective(X_tr, y_tr, X_val, y_val):
    def objective(trial):
        params = {
            "n_estimators":      trial.suggest_int("n_estimators", 200, 1000, step=100),
            "max_depth":         trial.suggest_int("max_depth", 3, 9),
            "learning_rate":     trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
            "subsample":         trial.suggest_float("subsample", 0.6, 1.0),
            "colsample_bytree":  trial.suggest_float("colsample_bytree", 0.5, 1.0),
            "min_child_weight":  trial.suggest_int("min_child_weight", 1, 10),
            "gamma":             trial.suggest_float("gamma", 0.0, 1.0),
            "reg_alpha":         trial.suggest_float("reg_alpha", 1e-4, 10.0, log=True),
            "reg_lambda":        trial.suggest_float("reg_lambda", 1e-4, 10.0, log=True),
            "objective":         "reg:squarederror",
            "tree_method":       "hist",
            "random_state":      RANDOM_SEED,
            "n_jobs":            -1,
        }
        model = xgb.XGBRegressor(**params)
        model.fit(X_tr, y_tr, eval_set=[(X_val, y_val)], verbose=False)
        preds = model.predict(X_val)
        return float(np.sqrt(mean_squared_error(y_val, preds)))
    return objective


DEFAULT_PARAMS = {
    "n_estimators":     600,
    "max_depth":        6,
    "learning_rate":    0.05,
    "subsample":        0.8,
    "colsample_bytree": 0.8,
    "min_child_weight": 3,
    "gamma":            0.1,
    "reg_alpha":        0.5,
    "reg_lambda":       1.0,
    "objective":        "reg:squarederror",
    "tree_method":      "hist",
    "random_state":     RANDOM_SEED,
    "n_jobs":           -1,
}


def tune_hyperparameters(X_tr, y_tr, X_val, y_val, n_trials=N_OPTUNA_TRIALS):
    if not HAS_OPTUNA:
        print("  [INFO] Optuna not installed — using default hyperparameters.")
        return DEFAULT_PARAMS

    print(f"  [INFO] Running Optuna search ({n_trials} trials)...")
    study = optuna.create_study(direction="minimize", sampler=optuna.samplers.TPESampler(seed=RANDOM_SEED))
    study.optimize(_build_optuna_objective(X_tr, y_tr, X_val, y_val), n_trials=n_trials, show_progress_bar=False)

    best = study.best_params
    best.update({"objective": "reg:squarederror", "tree_method": "hist",
                 "random_state": RANDOM_SEED, "n_jobs": -1})
    print(f"  [INFO] Best validation RMSE: {study.best_value:.2f} lbs")
    return best


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

def evaluate(model, X_test, y_test, df_test):
    preds = model.predict(X_test)

    rmse = np.sqrt(mean_squared_error(y_test, preds))
    mae  = mean_absolute_error(y_test, preds)
    r2   = r2_score(y_test, preds)

    print("\n" + "=" * 60)
    print("  OVERALL TEST SET METRICS")
    print("=" * 60)
    print(f"  RMSE : {rmse:.2f} lbs")
    print(f"  MAE  : {mae:.2f} lbs")
    print(f"  R²   : {r2:.4f}")

    print("\n" + "=" * 60)
    print("  METRICS BY MOVEMENT PATTERN")
    print("=" * 60)

    results = []
    for pattern in sorted(df_test["movement_pattern"].unique()):
        mask   = df_test["movement_pattern"].values == pattern
        p_true = y_test[mask]
        p_pred = preds[mask]
        if len(p_true) < 2:
            continue
        p_rmse = np.sqrt(mean_squared_error(p_true, p_pred))
        p_mae  = mean_absolute_error(p_true, p_pred)
        p_r2   = r2_score(p_true, p_pred)
        results.append((pattern, len(p_true), p_rmse, p_mae, p_r2))

    results.sort(key=lambda x: x[2], reverse=True)
    print(f"  {'Pattern':<30} {'N':>5}  {'RMSE':>7}  {'MAE':>7}  {'R²':>7}")
    print("  " + "-" * 58)
    for pattern, n, p_rmse, p_mae, p_r2 in results:
        print(f"  {pattern:<30} {n:>5}  {p_rmse:>6.2f}  {p_mae:>6.2f}  {p_r2:>6.4f}")
    print("=" * 60 + "\n")


# ---------------------------------------------------------------------------
# Main training pipeline
# ---------------------------------------------------------------------------

def train(
    n_samples: int = N_SAMPLES,
    n_optuna_trials: int = N_OPTUNA_TRIALS,
    artefact_dir: Path = ARTEFACT_DIR,
):
    artefact_dir.mkdir(parents=True, exist_ok=True)

    print("[1/7] Generating synthetic training data...")
    df_synthetic = generate_synthetic_data(n_samples=n_samples)
    print(f"      Generated {len(df_synthetic):,} synthetic rows across {df_synthetic['movement_pattern'].nunique()} movement patterns.")

    if KAGGLE_CSV.exists():
        print(f"      Found Kaggle CSV — loading real training data...")
        try:
            df_real = load_real_training_data(KAGGLE_CSV)
            # Replicate each real row REAL_DATA_WEIGHT times so the model
            # treats real observations as more authoritative than synthetic ones
            df_real_weighted = pd.concat(
                [df_real] * int(REAL_DATA_WEIGHT), ignore_index=True
            )
            df = pd.concat([df_synthetic, df_real_weighted], ignore_index=True)
            print(f"      Combined dataset: {len(df):,} rows "
                  f"({len(df_synthetic):,} synthetic + {len(df_real_weighted):,} real weighted).")
        except Exception as exc:
            print(f"      WARNING: Could not load real data ({exc}). Using synthetic only.")
            df = df_synthetic
    else:
        print(f"      Kaggle CSV not found at '{KAGGLE_CSV}' — using synthetic data only.")
        print(f"      To include real data, download from:")
        print(f"      https://www.kaggle.com/datasets/joep89/weightlifting/data")
        print(f"      and place the CSV here as '{KAGGLE_CSV}'.")
        df = df_synthetic

    print("[2/7] Splitting data (80% train / 20% test)...")
    df_train, df_test = train_test_split(df, test_size=0.20, random_state=RANDOM_SEED, shuffle=True)
    y_train = df_train["working_weight"].reset_index(drop=True)
    y_test  = df_test["working_weight"].reset_index(drop=True)
    df_train = df_train.drop(columns=["working_weight"]).reset_index(drop=True)
    df_test  = df_test.drop(columns=["working_weight"]).reset_index(drop=True)

    print("[3/7] Fitting feature encoder...")
    encoder = FeatureEncoder()
    X_train = encoder.fit_transform(df_train, y_train)
    X_test  = encoder.transform(df_test)
    print(f"      Feature matrix shape: {X_train.shape}")

    X_tr, X_val, y_tr, y_val = train_test_split(
        X_train, y_train.values, test_size=0.10, random_state=RANDOM_SEED
    )

    print("[4/7] Hyperparameter search...")
    best_params = tune_hyperparameters(X_tr, y_tr, X_val, y_val, n_trials=n_optuna_trials)

    print("[5/7] Training final model on full training set...")
    model = xgb.XGBRegressor(**best_params)
    model.fit(X_train, y_train.values, verbose=False)

    print("[6/7] Evaluating on held-out test set...")
    evaluate(model, X_test, y_test.values, df_test)

    print("[7/7] Saving artefacts...")
    joblib.dump(model,       artefact_dir / "xgb_model.joblib")
    joblib.dump(encoder,     artefact_dir / "feature_encoder.joblib")
    joblib.dump(best_params, artefact_dir / "best_params.joblib")

    with open(artefact_dir / "feature_names.json", "w") as f:
        json.dump(encoder.feature_names, f, indent=2)

    print(f"      Artefacts saved to: {artefact_dir.resolve()}")
    return model, encoder, best_params


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    train()
