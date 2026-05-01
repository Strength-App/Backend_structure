"""
weight_predictor.py

Exposes a single public function:

    predict_weight(...)

Two-stage gate:
    Stage 1 — Override gate (hard rule, absolute precedence)
        If `percentage_override` is provided, compute the working weight
        directly from the relevant 1RM and return immediately.

    Stage 2 — Model inference
        Load the trained XGBoost model + encoder artefacts and run inference.

Artefacts are loaded lazily on first call and cached for subsequent calls.
"""

from __future__ import annotations

import os
import urllib.request
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import joblib
from sklearn.model_selection import KFold
from sklearn.preprocessing import OneHotEncoder

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# Shared constants (also used by weight_model.py during training)
# ---------------------------------------------------------------------------

CV_FOLDS = 5
RANDOM_SEED = 42
STRENGTH_LEVELS = ["beginner", "novice", "intermediate", "advanced", "elite"]

# Exercises that load a standard 45 lb Olympic barbell — minimum target weight is 45 lbs.
BARBELL_EXERCISES = {
    # Horizontal Push
    "Bench Press", "Incline Bench Press", "Decline Bench Press", "Floor Press",
    # Vertical Push
    "Military Press", "Seated Military Press", "Push Press",
    # Tricep Accessory
    "Close Grip Bench Press",
    # Horizontal Pull
    "Barbell Row", "Underhand Barbell Row", "Pendlay Row", "Seal Row",
    # Hinge
    "RDLs", "Sumo Deadlift", "Good Mornings", "Hip Thrusts", "Barbell Glute Bridges",
    "Trap Bar Deadlifts",
    # Squat Pattern
    "Front Squat", "SSB Squats", "Zercher Squat",
    # Bicep Accessory
    "Barbell Curls",
    # Unilateral Lower
    "Bulgarians",
}


# ---------------------------------------------------------------------------
# Feature encoder — defined here so pickled artefacts resolve to this module
# ---------------------------------------------------------------------------

class FeatureEncoder:
    NUMERIC_COLS = ["squat_1rm", "bench_1rm", "deadlift_1rm",
                    "week_number", "mesocycle_number", "target_rep_range"]

    def __init__(self) -> None:
        self._strength_ohe = None
        self._pattern_ohe  = None
        self._exercise_target_map: dict[str, float] = {}
        self._global_mean: float = 0.0
        self._feature_names: list[str] = []

    def fit(self, df: pd.DataFrame, y: pd.Series, cv_folds: int = CV_FOLDS) -> "FeatureEncoder":
        self._strength_ohe = OneHotEncoder(
            categories=[STRENGTH_LEVELS], sparse_output=False, handle_unknown="ignore"
        )
        self._strength_ohe.fit(df[["strength_level"]])

        patterns = sorted(df["movement_pattern"].unique())
        self._pattern_ohe = OneHotEncoder(
            categories=[patterns], sparse_output=False, handle_unknown="ignore"
        )
        self._pattern_ohe.fit(df[["movement_pattern"]])

        self._global_mean = float(y.mean())
        self._exercise_target_map = self._fit_target_encoding(df["exercise_name"], y, cv_folds)

        self._feature_names = (
            list(self._strength_ohe.get_feature_names_out(["strength_level"]))
            + list(self._pattern_ohe.get_feature_names_out(["movement_pattern"]))
            + ["exercise_name_encoded"]
            + self.NUMERIC_COLS
        )
        return self

    def _fit_target_encoding(self, exercise_series, y, cv_folds):
        kf = KFold(n_splits=cv_folds, shuffle=True, random_state=RANDOM_SEED)
        encoded = np.full(len(exercise_series), self._global_mean)
        indices = np.arange(len(exercise_series))

        for train_idx, val_idx in kf.split(indices):
            train_ex   = exercise_series.iloc[train_idx]
            train_y    = y.iloc[train_idx]
            fold_means = train_y.groupby(train_ex).mean()
            encoded[val_idx] = exercise_series.iloc[val_idx].map(fold_means).fillna(self._global_mean).values

        return y.groupby(exercise_series).mean().to_dict()

    def transform(self, df: pd.DataFrame) -> np.ndarray:
        if self._strength_ohe is None:
            raise RuntimeError("FeatureEncoder must be fit() before transform().")

        strength_enc  = self._strength_ohe.transform(df[["strength_level"]])
        pattern_enc   = self._pattern_ohe.transform(df[["movement_pattern"]])
        exercise_enc  = (
            df["exercise_name"]
            .map(self._exercise_target_map)
            .fillna(self._global_mean)
            .values
            .reshape(-1, 1)
        )
        numeric = df[self.NUMERIC_COLS].values.astype(float)

        return np.hstack([strength_enc, pattern_enc, exercise_enc, numeric])

    def fit_transform(self, df: pd.DataFrame, y: pd.Series, cv_folds: int = CV_FOLDS) -> np.ndarray:
        self.fit(df, y, cv_folds)
        return self.transform(df)

    @property
    def feature_names(self) -> list[str]:
        return list(self._feature_names)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ARTEFACT_DIR = Path("weight_model_artefacts")

LOWER_BODY_PATTERNS = {
    "Hinge", "Squat Pattern", "Posterior Chain Accessory",
    "Unilateral Lower", "Isolation Lower", "Calves & Shins", "Machine Lower",
}

VALID_REFERENCE_KEYS = {"squat", "bench", "deadlift", "overhead_press"}
OVERHEAD_PRESS_RATIO = 0.64


# ---------------------------------------------------------------------------
# Lazy-loaded model cache
# ---------------------------------------------------------------------------

def _download_artefact_if_missing(path: Path, env_var: str) -> None:
    """Fetch an artefact from <env_var> URL if not on disk.

    Hosting these as public download URLs (e.g. GitHub Release assets) avoids
    Git LFS — Railway/Railpack snapshots don't reliably resolve LFS pointers
    so `joblib.load` blows up with `KeyError: 118` on the pointer file's first
    byte ('v' from "version https://...").
    """
    if path.exists():
        return
    url = os.environ.get(env_var)
    if not url:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    print(f"[weight_predictor] downloading {path.name} from {url}", flush=True)
    urllib.request.urlretrieve(url, path)
    size_mb = path.stat().st_size / 1024 / 1024
    print(f"[weight_predictor] downloaded {size_mb:.1f} MB -> {path}", flush=True)


class _ModelCache:
    _model   = None
    _encoder = None
    _loaded  = False

    @classmethod
    def load(cls, artefact_dir: Path = ARTEFACT_DIR) -> tuple:
        if not cls._loaded:
            model_path   = artefact_dir / "xgb_model.joblib"
            encoder_path = artefact_dir / "feature_encoder.joblib"

            _download_artefact_if_missing(model_path,   "WEIGHT_MODEL_URL")
            _download_artefact_if_missing(encoder_path, "WEIGHT_ENCODER_URL")

            if not model_path.exists() or not encoder_path.exists():
                raise FileNotFoundError(
                    f"Model artefacts not found in '{artefact_dir}'. "
                    "Either train locally with `python weight_model.py`, or set "
                    "WEIGHT_MODEL_URL and WEIGHT_ENCODER_URL env vars to "
                    "downloadable .joblib URLs."
                )

            cls._model   = joblib.load(model_path)
            cls._encoder = joblib.load(encoder_path)
            cls._loaded  = True

        return cls._model, cls._encoder

    @classmethod
    def invalidate(cls) -> None:
        cls._model   = None
        cls._encoder = None
        cls._loaded  = False


# ---------------------------------------------------------------------------
# Rounding helper
# ---------------------------------------------------------------------------

def _round_to_increment(weight: float, increment: float = 5.0) -> float:
    rounded = round(weight / increment) * increment
    return max(5.0, rounded)


def _cap_1rm(movement_pattern: str, squat_1rm: float, bench_1rm: float, deadlift_1rm: float) -> float:
    """Return the 1RM ceiling appropriate for the given movement pattern."""
    if movement_pattern in {"Hinge", "Posterior Chain Accessory"}:
        return deadlift_1rm
    if movement_pattern in LOWER_BODY_PATTERNS:
        return squat_1rm
    return bench_1rm


def _apply_1rm_cap(weight: float, cap: float) -> float:
    """Floor weight to the nearest 5 lb increment at or below cap."""
    capped = min(weight, cap)
    return max(5.0, (capped // 5) * 5)


# ---------------------------------------------------------------------------
# Override gate
# ---------------------------------------------------------------------------

def _apply_override(
    percentage_override: float,
    override_reference_1rm: str,
    squat_1rm: float,
    bench_1rm: float,
    deadlift_1rm: float,
    movement_pattern: str,
) -> float:
    ref = override_reference_1rm.lower().strip()
    if ref not in VALID_REFERENCE_KEYS:
        raise ValueError(
            f"Invalid override_reference_1rm '{override_reference_1rm}'. "
            f"Must be one of: {sorted(VALID_REFERENCE_KEYS)}"
        )

    if ref == "squat":
        reference_1rm = squat_1rm
    elif ref == "bench":
        reference_1rm = bench_1rm
    elif ref == "deadlift":
        reference_1rm = deadlift_1rm
    elif ref == "overhead_press":
        reference_1rm = bench_1rm * OVERHEAD_PRESS_RATIO

    raw_weight = percentage_override * reference_1rm
    rounded = _round_to_increment(raw_weight)
    cap = _cap_1rm(movement_pattern, squat_1rm, bench_1rm, deadlift_1rm)
    return _apply_1rm_cap(rounded, cap)


# ---------------------------------------------------------------------------
# Model inference
# ---------------------------------------------------------------------------

def _model_predict(
    exercise_name: str,
    movement_pattern: str,
    strength_level: str,
    squat_1rm: float,
    bench_1rm: float,
    deadlift_1rm: float,
    target_rep_range: int,
    week_number: int,
    mesocycle_number: int,
    artefact_dir: Path = ARTEFACT_DIR,
) -> float:
    model, encoder = _ModelCache.load(artefact_dir)

    row = pd.DataFrame([{
        "strength_level":   strength_level,
        "squat_1rm":        squat_1rm,
        "bench_1rm":        bench_1rm,
        "deadlift_1rm":     deadlift_1rm,
        "exercise_name":    exercise_name,
        "movement_pattern": movement_pattern,
        "week_number":      week_number,
        "mesocycle_number": mesocycle_number,
        "target_rep_range": target_rep_range,
    }])

    X = encoder.transform(row)
    raw_pred = float(model.predict(X)[0])

    rounded = _round_to_increment(raw_pred)
    cap = _cap_1rm(movement_pattern, squat_1rm, bench_1rm, deadlift_1rm)
    return _apply_1rm_cap(rounded, cap)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def predict_weight(
    exercise_name: str,
    movement_pattern: str,
    strength_level: str,
    squat_1rm: float,
    bench_1rm: float,
    deadlift_1rm: float,
    target_rep_range: int,
    week_number: int,
    mesocycle_number: int,
    percentage_override: float | None = None,
    override_reference_1rm: str | None = None,
    artefact_dir: Path = ARTEFACT_DIR,
) -> float:
    valid_levels = {"beginner", "novice", "intermediate", "advanced", "elite"}
    if strength_level not in valid_levels:
        raise ValueError(
            f"Invalid strength_level '{strength_level}'. "
            f"Must be one of: {sorted(valid_levels)}"
        )

    if percentage_override is not None:
        if override_reference_1rm is None:
            raise ValueError(
                "override_reference_1rm is required when percentage_override is provided."
            )
        weight = _apply_override(
            percentage_override=percentage_override,
            override_reference_1rm=override_reference_1rm,
            squat_1rm=squat_1rm,
            bench_1rm=bench_1rm,
            deadlift_1rm=deadlift_1rm,
            movement_pattern=movement_pattern,
        )
    else:
        weight = _model_predict(
            exercise_name=exercise_name,
            movement_pattern=movement_pattern,
            strength_level=strength_level,
            squat_1rm=squat_1rm,
            bench_1rm=bench_1rm,
            deadlift_1rm=deadlift_1rm,
            target_rep_range=target_rep_range,
            week_number=week_number,
            mesocycle_number=mesocycle_number,
            artefact_dir=artefact_dir,
        )

    if exercise_name in BARBELL_EXERCISES:
        weight = max(45.0, weight)

    return weight
