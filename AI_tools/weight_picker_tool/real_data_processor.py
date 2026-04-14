"""
real_data_processor.py

Converts the Kaggle "721 Weight Training Workouts" CSV (Strong app export) into
training rows compatible with the weight model's synthetic data schema.

Usage:
    from real_data_processor import load_real_training_data
    df_real = load_real_training_data("weightlifting_721_workouts.csv")

Or run directly for a quick preview:
    python real_data_processor.py weightlifting_721_workouts.csv

Place the downloaded CSV in the same directory as this file before running.

Dataset notes (from Kaggle):
  - All weights in pounds
  - Bodyweight exercises (dips, chin-ups, pull-ups): recorded weight = ADDED weight only
    (user bodyweight assumed 220 lbs, so total = recorded + 220)
  - Dumbbell weights: combined weight of BOTH arms (100s = 200 lbs recorded)
  - 1RM formula: MAX = WEIGHT / (1.0278 - 0.0278 * reps)
  - Extreme values (1000+ lbs) are likely typos — filtered out
"""

from __future__ import annotations

import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# Strong-app exercise name → (our movement pattern, our canonical name)
# ---------------------------------------------------------------------------

EXERCISE_MAP: dict[str, tuple[str, str]] = {
    # ── Horizontal Push ──────────────────────────────────────────────────
    "Bench Press (Barbell)":          ("Horizontal Push",           "Bench Press"),
    "Bench Press":                    ("Horizontal Push",           "Bench Press"),
    "Incline Bench Press (Barbell)":  ("Horizontal Push",           "Incline Bench Press"),
    "Incline Bench Press":            ("Horizontal Push",           "Incline Bench Press"),
    "Decline Bench Press (Barbell)":  ("Horizontal Push",           "Decline Bench Press"),
    "Decline Bench Press":            ("Horizontal Push",           "Decline Bench Press"),
    "Floor Press (Barbell)":          ("Horizontal Push",           "Floor Press"),
    "Floor Press":                    ("Horizontal Push",           "Floor Press"),

    # ── Vertical Push ────────────────────────────────────────────────────
    "Overhead Press (Barbell)":       ("Vertical Push",             "Military Press"),
    "Military Press (Barbell)":       ("Vertical Push",             "Military Press"),
    "Seated Press (Barbell)":         ("Vertical Push",             "Seated Military Press"),
    "Seated Overhead Press":          ("Vertical Push",             "Seated Military Press"),
    "Push Press (Barbell)":           ("Vertical Push",             "Push Press"),
    "Push Press":                     ("Vertical Push",             "Push Press"),
    "Overhead Press":                 ("Vertical Push",             "Military Press"),
    "Military Press":                 ("Vertical Push",             "Military Press"),

    # ── Unilateral Push ──────────────────────────────────────────────────
    "Incline Bench Press (Dumbbell)": ("Unilateral Push",           "DB Incline Bench"),
    "Bench Press (Dumbbell)":         ("Unilateral Push",           "DB Flat Bench"),
    "Dumbbell Bench Press":           ("Unilateral Push",           "DB Flat Bench"),
    "Shoulder Press (Dumbbell)":      ("Unilateral Push",           "DB Shoulder Press"),
    "Arnold Press (Dumbbell)":        ("Unilateral Push",           "Arnold Press"),
    "Arnold Press":                   ("Unilateral Push",           "Arnold Press"),

    # ── Push Machine ─────────────────────────────────────────────────────
    "Chest Press (Machine)":          ("Push Machine",              "Chest Press Machine"),
    "Chest Press (Leverage Machine)": ("Push Machine",              "Chest Press Machine"),
    "Shoulder Press (Machine)":       ("Push Machine",              "Shoulder Press Machine"),

    # ── Tricep Accessory ─────────────────────────────────────────────────
    "Tricep Pushdown (Cable)":        ("Tricep Accessory",          "Tricep Pushdowns"),
    "Tricep Pushdown":                ("Tricep Accessory",          "Tricep Pushdowns"),
    "Skullcrusher (Barbell)":         ("Tricep Accessory",          "Skullcrushers"),
    "Skullcrusher (EZ Bar)":          ("Tricep Accessory",          "Skullcrushers"),
    "Skull Crusher":                  ("Tricep Accessory",          "Skullcrushers"),
    "Tricep Extension (Cable)":       ("Tricep Accessory",          "Tricep Extensions"),
    "Tricep Extension (Dumbbell)":    ("Tricep Accessory",          "Overhead Tricep Extensions"),
    "Overhead Tricep Extension":      ("Tricep Accessory",          "Overhead Tricep Extensions"),
    "Close Grip Bench Press":         ("Tricep Accessory",          "Close Grip Bench Press"),
    "Dip (Assisted)":                 ("Tricep Accessory",          "Dip Machine"),
    "Dip (Machine)":                  ("Tricep Accessory",          "Dip Machine"),

    # ── Shoulder Accessory ───────────────────────────────────────────────
    "Lateral Raise (Dumbbell)":       ("Shoulder Accessory",        "Lateral Raises"),
    "Lateral Raise (Dumbbells)":      ("Shoulder Accessory",        "Lateral Raises"),
    "Lateral Raise (Cable)":          ("Shoulder Accessory",        "Cable Lateral Raises"),
    "Front Raise (Dumbbell)":         ("Shoulder Accessory",        "Front Raises"),
    "Face Pull (Cable)":              ("Shoulder Accessory",        "Face Pulls"),
    "Face Pull":                      ("Shoulder Accessory",        "Face Pulls"),
    "Upright Row (Barbell)":          ("Shoulder Accessory",        "Upright Rows"),
    "Upright Row (Dumbbell)":         ("Shoulder Accessory",        "Upright Rows"),

    # ── Chest Accessory ──────────────────────────────────────────────────
    "Chest Fly (Dumbbell)":           ("Chest Accessory",           "DB Chest Flys"),
    "Chest Fly (Cable)":              ("Chest Accessory",           "Cable Chest Flys"),
    "Chest Fly (Machine)":            ("Chest Accessory",           "Chest Fly Machine"),
    "Cable Fly":                      ("Chest Accessory",           "Cable Chest Flys"),

    # ── Vertical Pull ────────────────────────────────────────────────────
    "Chin Up":                        ("Vertical Pull",             "Chin Ups"),
    "Chin-Up":                        ("Vertical Pull",             "Chin Ups"),
    "Neutral Grip Chin-Up":           ("Vertical Pull",             "Neutral Grip Pullups"),
    "Neutral Chin":                   ("Vertical Pull",             "Neutral Grip Pullups"),
    "Neutral Chin-Up":                ("Vertical Pull",             "Neutral Grip Pullups"),
    "Pull Up":                        ("Vertical Pull",             "Pullups"),
    "Pull-Up":                        ("Vertical Pull",             "Pullups"),
    "Weighted Pull-Up":               ("Vertical Pull",             "Weighted Pull Ups"),
    "Weighted Pull Up":               ("Vertical Pull",             "Weighted Pull Ups"),
    "Weighted Chin-Up":               ("Vertical Pull",             "Weighted Chin Ups"),
    "Weighted Chin Up":               ("Vertical Pull",             "Weighted Chin Ups"),

    # ── Vertical Pull Cable Only ─────────────────────────────────────────
    "Lat Pulldown (Cable)":           ("Vertical Pull Cable Only",  "Lat Pulldowns"),
    "Lat Pulldown":                   ("Vertical Pull Cable Only",  "Lat Pulldowns"),
    "Close Grip Lat Pulldown":        ("Vertical Pull Cable Only",  "Close Grip Lat Pulldowns"),
    "Wide Grip Lat Pulldown":         ("Vertical Pull Cable Only",  "Wide Grip Lat Pulldowns"),
    "Single Arm Lat Pulldown":        ("Vertical Pull Cable Only",  "Single Arm Pulldowns"),

    # ── Horizontal Pull ──────────────────────────────────────────────────
    "Bent Over Row (Barbell)":        ("Horizontal Pull",           "Barbell Row"),
    "Bent-Over Row (Barbell)":        ("Horizontal Pull",           "Barbell Row"),
    "Barbell Row":                    ("Horizontal Pull",           "Barbell Row"),
    "Pendlay Row":                    ("Horizontal Pull",           "Pendlay Row"),
    "Cable Row":                      ("Horizontal Pull",           "Cable Row"),
    "Seated Cable Row":               ("Horizontal Pull",           "Cable Row"),
    "T-Bar Row":                      ("Horizontal Pull",           "T Bar Rows"),
    "Single Arm Row (Dumbbell)":      ("Horizontal Pull",           "Single Arm Dumbbell Rows"),
    "Chest Supported Row":            ("Horizontal Pull",           "Chest Supported Row"),
    "Meadows Row":                    ("Horizontal Pull",           "Meadows Row"),

    # ── Posterior Upper Accessory ────────────────────────────────────────
    "Rear Delt Fly (Dumbbell)":       ("Posterior Upper Accessory", "Rear Delt Flys"),
    "Rear Delt Fly (Cable)":          ("Posterior Upper Accessory", "Rear Delt Flys"),
    "Rear Delt Fly (Machine)":        ("Posterior Upper Accessory", "Machine Rear Delt Flys"),
    "Shrug (Barbell)":                ("Posterior Upper Accessory", "Shrugs"),
    "Shrug (Dumbbell)":               ("Posterior Upper Accessory", "DB Shrugs"),
    "Pullover (Dumbbell)":            ("Posterior Upper Accessory", "Pullovers"),

    # ── Bicep Accessory ──────────────────────────────────────────────────
    "Bicep Curl (Barbell)":           ("Bicep Accessory",           "Barbell Curls"),
    "Bicep Curl (Dumbbell)":          ("Bicep Accessory",           "DB Curls"),
    "Bicep Curl (Cable)":             ("Bicep Accessory",           "Cable Curls"),
    "Hammer Curl (Dumbbell)":         ("Bicep Accessory",           "Hammer Curls"),
    "Preacher Curl (Barbell)":        ("Bicep Accessory",           "Preacher Curls"),
    "Preacher Curl (EZ Bar)":         ("Bicep Accessory",           "Preacher Curls"),
    "Preacher Curl (Dumbbell)":       ("Bicep Accessory",           "Preacher Curls"),
    "Concentration Curl":             ("Bicep Accessory",           "Concentration Curls"),
    "EZ Bar Curl":                    ("Bicep Accessory",           "Ez Bar Curls"),

    # ── Hinge ────────────────────────────────────────────────────────────
    "Deadlift (Barbell)":             ("Hinge",                     "RDLs"),
    "Romanian Deadlift (Barbell)":    ("Hinge",                     "RDLs"),
    "Romanian Deadlift":              ("Hinge",                     "RDLs"),
    "RDL":                            ("Hinge",                     "RDLs"),
    "Sumo Deadlift":                  ("Hinge",                     "Sumo Deadlift"),
    "Trap Bar Deadlift":              ("Hinge",                     "Trap Bar Deadlifts"),
    "Hip Thrust (Barbell)":           ("Hinge",                     "Hip Thrusts"),
    "Hip Thrust":                     ("Hinge",                     "Hip Thrusts"),
    "Good Morning (Barbell)":         ("Hinge",                     "Good Mornings"),
    "Good Morning":                   ("Hinge",                     "Good Mornings"),

    # ── Squat Pattern ────────────────────────────────────────────────────
    "Squat (Barbell)":                ("Squat Pattern",             "Front Squat"),
    "Back Squat":                     ("Squat Pattern",             "Front Squat"),
    "Front Squat (Barbell)":          ("Squat Pattern",             "Front Squat"),
    "Front Squat":                    ("Squat Pattern",             "Front Squat"),
    "Hack Squat (Machine)":           ("Machine Lower",             "Hack Squat Machine"),
    "Leg Press (Machine)":            ("Squat Pattern",             "Leg Press"),
    "Leg Press":                      ("Squat Pattern",             "Leg Press"),
    "Goblet Squat":                   ("Squat Pattern",             "Goblet Squat"),
    "Goblet Squat (Dumbbell)":        ("Squat Pattern",             "Goblet Squat"),

    # ── Unilateral Lower ─────────────────────────────────────────────────
    "Bulgarian Split Squat":          ("Unilateral Lower",          "Bulgarians"),
    "Lunge (Barbell)":                ("Unilateral Lower",          "Walking Lunges"),
    "Lunge (Dumbbell)":               ("Unilateral Lower",          "Walking Lunges"),
    "Walking Lunge":                  ("Unilateral Lower",          "Walking Lunges"),
    "Reverse Lunge":                  ("Unilateral Lower",          "Reverse Lunges"),
    "Step Up (Dumbbell)":             ("Unilateral Lower",          "Step Ups"),

    # ── Isolation Lower ──────────────────────────────────────────────────
    "Leg Extension (Machine)":        ("Isolation Lower",           "Leg Extensions"),
    "Leg Curl (Machine)":             ("Isolation Lower",           "Lying Leg Curls"),
    "Leg Curl (Lying)":               ("Isolation Lower",           "Lying Leg Curls"),
    "Leg Curl (Seated)":              ("Isolation Lower",           "Seated Leg Curls"),
    "Abductor (Machine)":             ("Isolation Lower",           "Abductor Machine"),
    "Adductor (Machine)":             ("Isolation Lower",           "Adductor Machine"),

    # ── Calves & Shins ───────────────────────────────────────────────────
    "Calf Press":                     ("Calves & Shins",            "Calf Raise Machine"),
    "Calf Raise (Machine)":           ("Calves & Shins",            "Calf Raise Machine"),
    "Standing Calf Raise":            ("Calves & Shins",            "Calf Raise Machine"),
    "Seated Calf Raise":              ("Calves & Shins",            "Seated Calf Raises"),

    # ── Core ─────────────────────────────────────────────────────────────
    "Cable Crunch":                   ("Core",                      "Cable Crunches"),
    "Ab Wheel":                       ("Core",                      "Ab Wheel Rollouts"),
    "Pallof Press":                   ("Core",                      "Pallof Press"),
    "Hanging Leg Raise":              ("Core",                      "Hanging Leg Raises"),

    # ── Additional mappings from CSV audit ───────────────────────────────
    # Vertical Push
    "Seated Shoulder  Press (Barbell)": ("Vertical Push",           "Seated Military Press"),
    "Seated Shoulder Press (Barbell)":  ("Vertical Push",           "Seated Military Press"),
    "Seated Military Press":            ("Vertical Push",           "Seated Military Press"),
    "Seated Overhead Press (Barbell)":  ("Vertical Push",           "Seated Military Press"),

    # Tricep Accessory
    "Weighted dips":                  ("Tricep Accessory",          "Weighted Dips"),
    "Weighted Dips":                  ("Tricep Accessory",          "Weighted Dips"),
    "Dip":                            ("Tricep Accessory",          "Dips"),
    "Dips":                           ("Tricep Accessory",          "Dips"),

    # Horizontal Pull
    "Hammer seated row (CLOSE GRIP)": ("Horizontal Pull",           "Cable Row"),
    "Hammer Seated Row":              ("Horizontal Pull",           "Cable Row"),
    "Seated Cable Row (close Grip)":  ("Horizontal Pull",           "Cable Row"),
    "Seated Cable Row":               ("Horizontal Pull",           "Cable Row"),
    "Seated Row":                     ("Horizontal Pull",           "Cable Row"),
    "T-bar Row":                      ("Horizontal Pull",           "T Bar Rows"),
    "T Bar Row":                      ("Horizontal Pull",           "T Bar Rows"),
    "Bent Over Row (Dumbbell)":       ("Horizontal Pull",           "Single Arm Dumbbell Rows"),

    # Squat Pattern
    "Squat":                          ("Squat Pattern",             "Front Squat"),
    "Barbell Squat":                  ("Squat Pattern",             "Front Squat"),
    "Back Squat (Barbell)":           ("Squat Pattern",             "Front Squat"),
    "Leg press (hinge )":             ("Squat Pattern",             "Leg Press"),
    "Leg Press (hinge)":              ("Squat Pattern",             "Leg Press"),

    # Posterior Upper Accessory
    "Rear delt fly":                  ("Posterior Upper Accessory", "Rear Delt Flys"),
    "Rear Delt Fly":                  ("Posterior Upper Accessory", "Rear Delt Flys"),

    # Isolation Lower
    "Leg outward fly":                ("Isolation Lower",           "Abductor Machine"),
    "Leg Outward Fly":                ("Isolation Lower",           "Abductor Machine"),
    "Leg curl":                       ("Isolation Lower",           "Lying Leg Curls"),
    "Leg Curl":                       ("Isolation Lower",           "Lying Leg Curls"),
    "Leg Extension":                  ("Isolation Lower",           "Leg Extensions"),

    # Shoulder Accessory
    "Face pull":                      ("Shoulder Accessory",        "Face Pulls"),
    "Lateral Raise":                  ("Shoulder Accessory",        "Lateral Raises"),
    "Lateral Raise (Dumbbell)":       ("Shoulder Accessory",        "Lateral Raises"),

    # ── Unilateral Push
    "Incline Press (Dumbbell)":         ("Unilateral Push",           "DB Incline Bench"),
    "Low Incline Dumbbell Bench":       ("Unilateral Push",           "DB Incline Bench"),
    "Dumbbell Shoulder Press":          ("Unilateral Push",           "DB Shoulder Press"),
    "Seated Shoulder Press (Dumbbell)": ("Unilateral Push",           "DB Shoulder Press"),
    "Seated Military Press (Dumbbell)": ("Unilateral Push",           "DB Shoulder Press"),
    "Overhead Press (Dumbbell)":        ("Unilateral Push",           "DB Shoulder Press"),
    "Shoulder Press (Standing)":        ("Vertical Push",             "Military Press"),

    # ── Tricep Accessory
    "Tricep pushdown":                ("Tricep Accessory",          "Tricep Pushdowns"),
    "Tricep Pushdown":                ("Tricep Accessory",          "Tricep Pushdowns"),

    # ── Bicep Accessory
    "Hammer Curl (Dumbbell )":        ("Bicep Accessory",           "Hammer Curls"),
    "Hammer Curl":                    ("Bicep Accessory",           "Hammer Curls"),
    "Bicep Curl (barbell )":          ("Bicep Accessory",           "Barbell Curls"),
    "Bicep Curl (Barbell)":           ("Bicep Accessory",           "Barbell Curls"),

    # ── Vertical Pull
    "Neutral Chin":                   ("Vertical Pull",             "Neutral Grip Pullups"),
    "Neutral Chin-Up":                ("Vertical Pull",             "Neutral Grip Pullups"),

    # ── Horizontal Pull
    "Hammer Row - Wide Grip":         ("Horizontal Pull",           "Cable Row"),
    "Hammer High Row - 1 Arm":        ("Horizontal Pull",           "Single Arm Cable Rows"),

    # ── Squat Pattern / Machine Lower
    "Hack Squat":                     ("Machine Lower",             "Hack Squat Machine"),
    "high bar squat":                 ("Squat Pattern",             "Front Squat"),
    "High Bar Squat":                 ("Squat Pattern",             "Front Squat"),
    "Leg press":                      ("Squat Pattern",             "Leg Press"),
}

# Exercises where recorded weight = ADDED weight only (bodyweight not included).
# Per dataset notes: user BW assumed 220 lbs, so total = recorded + 220.
#
# NOTE: "Weighted Dips", "Dip", "Dips" are intentionally excluded here.
#   - Regular Dips are treated as bodyweight-only in the app (projectedWeight="BW")
#     so they never need a weight prediction and pollute training if inflated.
#   - Weighted Dips records the ADDED weight only; our app's target weight should
#     also be just the added weight, so no bodyweight correction is applied.
BODYWEIGHT_ADDED_EXERCISES = {
    "Chin Up", "Chin-Up", "Neutral Grip Chin-Up",
    "Pull Up", "Pull-Up",
}

ASSUMED_BODYWEIGHT = 220.0  # lbs (per dataset documentation)

# ---------------------------------------------------------------------------
# 1RM estimation (dataset's documented formula — essentially Epley)
# ---------------------------------------------------------------------------

def estimate_1rm(weight: float, reps: int) -> float:
    if reps == 1:
        return weight
    if reps >= 20:          # very high rep sets unreliable for 1RM estimation
        return np.nan
    return weight / (1.0278 - 0.0278 * reps)


# ---------------------------------------------------------------------------
# Strength level classification
# ---------------------------------------------------------------------------

ONE_RM_RANGES = {
    "beginner":     {"squat": (0,    160),  "bench": (0,    120),  "deadlift": (0,    190)},
    "novice":       {"squat": (160,  290),  "bench": (120,  185),  "deadlift": (190,  335)},
    "intermediate": {"squat": (290,  405),  "bench": (185,  275),  "deadlift": (335,  455)},
    "advanced":     {"squat": (405,  550),  "bench": (275,  365),  "deadlift": (455,  600)},
    "elite":        {"squat": (550, 9999),  "bench": (365, 9999),  "deadlift": (600, 9999)},
}

LEVEL_ORDER = ["beginner", "novice", "intermediate", "advanced", "elite"]


def classify_strength(squat_1rm: float, bench_1rm: float, deadlift_1rm: float) -> str:
    scores = []
    for lift, val in [("squat", squat_1rm), ("bench", bench_1rm), ("deadlift", deadlift_1rm)]:
        if np.isnan(val):
            continue
        for level in LEVEL_ORDER:
            lo, hi = ONE_RM_RANGES[level][lift]
            if lo <= val < hi:
                scores.append(LEVEL_ORDER.index(level))
                break
        else:
            scores.append(len(LEVEL_ORDER) - 1)   # elite if above all ranges

    if not scores:
        return "intermediate"

    avg_idx = int(round(sum(scores) / len(scores)))
    return LEVEL_ORDER[min(avg_idx, len(LEVEL_ORDER) - 1)]


# ---------------------------------------------------------------------------
# Main loader
# ---------------------------------------------------------------------------

def load_real_training_data(csv_path: str | Path) -> pd.DataFrame:
    """
    Parse the Strong-app CSV export and return a DataFrame in the same schema
    as the synthetic training data:

        strength_level, squat_1rm, bench_1rm, deadlift_1rm,
        exercise_name, movement_pattern,
        week_number, mesocycle_number, target_rep_range, working_weight
    """
    csv_path = Path(csv_path)
    if not csv_path.exists():
        raise FileNotFoundError(
            f"Kaggle CSV not found at '{csv_path}'.\n"
            "Download it from https://www.kaggle.com/datasets/joep89/weightlifting/data\n"
            "and place the CSV in the weight_picker_tool directory."
        )

    raw = pd.read_csv(csv_path)
    raw.columns = raw.columns.str.strip()

    # ── Normalise column names (Strong app uses several layouts) ──────────
    col_map = {}
    for c in raw.columns:
        cl = c.lower().strip()
        if "exercise" in cl and "name" in cl:  col_map[c] = "exercise_name"
        elif cl in ("weight", "weight (lbs)", "weight (kg)"): col_map[c] = "weight"
        elif cl == "reps":                      col_map[c] = "reps"
        elif "date" in cl:                      col_map[c] = "date"
        elif "workout" in cl and "name" in cl:  col_map[c] = "workout_name"
    raw = raw.rename(columns=col_map)

    required = {"exercise_name", "weight", "reps"}
    missing = required - set(raw.columns)
    if missing:
        raise ValueError(
            f"CSV is missing expected columns: {missing}.\n"
            f"Found: {list(raw.columns)}"
        )

    # ── Basic cleaning ────────────────────────────────────────────────────
    df = raw[["exercise_name", "weight", "reps"]].copy()
    if "date" in raw.columns:
        df["date"] = pd.to_datetime(raw["date"], errors="coerce")
    else:
        df["date"] = pd.NaT

    df["exercise_name"] = df["exercise_name"].astype(str).str.strip()
    df["weight"] = pd.to_numeric(df["weight"], errors="coerce")
    df["reps"]   = pd.to_numeric(df["reps"],   errors="coerce").astype("Int64")

    # Drop nulls, extreme weights (typos), and zero-rep sets
    df = df.dropna(subset=["weight", "reps"])
    df = df[df["weight"] > 0]
    df = df[df["weight"] < 1000]    # filter out obvious typos (per dataset notes)
    df = df[df["reps"]   > 0]
    df = df[df["reps"]   < 20]      # >20 reps unreliable for 1RM estimation

    # ── Adjust bodyweight-added exercises ─────────────────────────────────
    bw_mask = df["exercise_name"].isin(BODYWEIGHT_ADDED_EXERCISES)
    df.loc[bw_mask, "weight"] = df.loc[bw_mask, "weight"] + ASSUMED_BODYWEIGHT

    # ── Map to our movement patterns ──────────────────────────────────────
    df["pattern"]      = df["exercise_name"].map(lambda x: EXERCISE_MAP.get(x, (None, None))[0])
    df["our_exercise"] = df["exercise_name"].map(lambda x: EXERCISE_MAP.get(x, (None, None))[1])

    mapped = df.dropna(subset=["pattern", "our_exercise"]).copy()

    unmapped_count = df["pattern"].isna().sum()
    if unmapped_count > 0:
        unmapped = df[df["pattern"].isna()]["exercise_name"].value_counts().head(15)
        print(f"  [real_data] {unmapped_count} rows unmapped ({df['exercise_name'].nunique()} unique exercises in CSV).")
        print(f"  [real_data] Top unmapped: {unmapped.to_dict()}")

    if mapped.empty:
        raise ValueError("No exercises could be mapped. Check EXERCISE_MAP or CSV column names.")

    # ── Estimate 1RM per set ──────────────────────────────────────────────
    mapped["estimated_1rm"] = mapped.apply(
        lambda r: estimate_1rm(r["weight"], int(r["reps"])), axis=1
    )
    mapped = mapped.dropna(subset=["estimated_1rm"])

    # ── Derive user's best 1RMs per canonical exercise ────────────────────
    # Use the top 5% of estimates per exercise to approximate true 1RM
    best_1rms = (
        mapped.groupby("our_exercise")["estimated_1rm"]
        .quantile(0.95)
        .to_dict()
    )

    # Derive the "big 3" for classification and as model features
    squat_1rm    = best_1rms.get("Front Squat", np.nan)
    bench_1rm    = best_1rms.get("Bench Press", np.nan)
    deadlift_1rm = best_1rms.get("RDLs", np.nan)

    # Fall back to related exercises if primary lifts not found
    if np.isnan(squat_1rm):
        squat_1rm = best_1rms.get("Leg Press", np.nan)
    if np.isnan(bench_1rm):
        for alt in ["DB Flat Bench", "Incline Bench Press", "Chest Press Machine"]:
            if not np.isnan(best_1rms.get(alt, np.nan)):
                bench_1rm = best_1rms[alt] * 1.10   # slight upward adjustment
                break
    if np.isnan(deadlift_1rm):
        deadlift_1rm = best_1rms.get("Sumo Deadlift", np.nan)

    print(f"  [real_data] Estimated big-3 1RMs — "
          f"Squat: {squat_1rm:.0f} | Bench: {bench_1rm:.0f} | Deadlift: {deadlift_1rm:.0f}")

    strength_level = classify_strength(squat_1rm, bench_1rm, deadlift_1rm)
    print(f"  [real_data] Classified as: {strength_level}")

    # ── Assign week / mesocycle numbers chronologically ──────────────────
    if mapped["date"].notna().any():
        mapped = mapped.sort_values("date")
        date_min = mapped["date"].min()
        mapped["days_elapsed"] = (mapped["date"] - date_min).dt.days.fillna(0).astype(int)
        # One mesocycle ≈ 6 weeks (42 days); week within meso cycles 1–6
        mapped["mesocycle_number"] = (mapped["days_elapsed"] // 42).clip(0, 9) + 1
        mapped["week_number"]      = ((mapped["days_elapsed"] % 42) // 7).clip(0, 5) + 1
    else:
        mapped["week_number"]      = 1
        mapped["mesocycle_number"] = 1

    # ── Build training rows ───────────────────────────────────────────────
    rows = []
    for _, row in mapped.iterrows():
        ex_1rm = best_1rms.get(row["our_exercise"], np.nan)
        if np.isnan(ex_1rm) or ex_1rm <= 0:
            continue

        # Use exercise-specific 1RM for squat/bench/deadlift features where sensible
        s1rm = squat_1rm    if not np.isnan(squat_1rm)    else ex_1rm
        b1rm = bench_1rm    if not np.isnan(bench_1rm)    else ex_1rm
        d1rm = deadlift_1rm if not np.isnan(deadlift_1rm) else ex_1rm

        rows.append({
            "strength_level":   strength_level,
            "squat_1rm":        s1rm,
            "bench_1rm":        b1rm,
            "deadlift_1rm":     d1rm,
            "exercise_name":    row["our_exercise"],
            "movement_pattern": row["pattern"],
            "week_number":      int(row["week_number"]),
            "mesocycle_number": int(row["mesocycle_number"]),
            "target_rep_range": int(row["reps"]),
            "working_weight":   float(row["weight"]),
        })

    df_out = pd.DataFrame(rows)
    df_out["working_weight"] = df_out["working_weight"].clip(lower=5.0)
    print(f"  [real_data] Generated {len(df_out):,} real training rows "
          f"across {df_out['movement_pattern'].nunique()} movement patterns.")
    return df_out


# ---------------------------------------------------------------------------
# Quick preview when run directly
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    csv_file = sys.argv[1] if len(sys.argv) > 1 else "weightlifting_721_workouts.csv"
    try:
        df = load_real_training_data(csv_file)
        print("\nSample rows:")
        print(df.head(10).to_string(index=False))
        print(f"\nPattern distribution:\n{df['movement_pattern'].value_counts()}")
        print(f"\nStrength level: {df['strength_level'].iloc[0]}")
    except FileNotFoundError as e:
        print(e)
