"""
rep_percentage_table.py

Provides rep-to-percentage-of-1RM lookup tables and formula-based calculations
used during synthetic data generation and available for external use.

Two formulas are supported:
  - Epley:   1RM = weight × (1 + reps / 30)
             → %1RM = 1 / (1 + reps / 30)
  - Brzycki: 1RM = weight × 36 / (37 - reps)
             → %1RM = (37 - reps) / 36

The module exposes:
  - EPLEY_TABLE    : dict mapping rep count → % of 1RM (Epley)
  - BRZYCKI_TABLE  : dict mapping rep count → % of 1RM (Brzycki)
  - get_percentage : function to retrieve % by formula and rep count
  - weight_from_1rm: convenience function returning working weight given 1RM
"""

from __future__ import annotations


# ---------------------------------------------------------------------------
# Formula implementations
# ---------------------------------------------------------------------------

def epley_percentage(reps: int) -> float:
    if reps < 1:
        raise ValueError(f"reps must be >= 1, got {reps}")
    if reps == 1:
        return 1.0
    return 1.0 / (1.0 + reps / 30.0)


def brzycki_percentage(reps: int) -> float:
    if reps < 1 or reps >= 37:
        raise ValueError(f"reps must be 1–36 for Brzycki formula, got {reps}")
    return (37 - reps) / 36.0


# ---------------------------------------------------------------------------
# Pre-computed lookup tables (reps 1–20)
# ---------------------------------------------------------------------------

EPLEY_TABLE: dict[int, float] = {r: epley_percentage(r) for r in range(1, 21)}
BRZYCKI_TABLE: dict[int, float] = {r: brzycki_percentage(r) for r in range(1, 21)}

EPLEY_TABLE_ROUNDED: dict[int, float] = {r: round(v, 4) for r, v in EPLEY_TABLE.items()}
BRZYCKI_TABLE_ROUNDED: dict[int, float] = {r: round(v, 4) for r, v in BRZYCKI_TABLE.items()}


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------

def get_percentage(reps: int, formula: str = "epley") -> float:
    formula = formula.lower()
    if formula == "epley":
        return epley_percentage(reps)
    elif formula == "brzycki":
        return brzycki_percentage(reps)
    else:
        raise ValueError(f"Unknown formula '{formula}'. Choose 'epley' or 'brzycki'.")


def weight_from_1rm(
    one_rep_max: float,
    reps: int,
    formula: str = "epley",
    round_to: float = 2.5,
) -> float:
    if one_rep_max <= 0:
        raise ValueError(f"one_rep_max must be positive, got {one_rep_max}")
    pct = get_percentage(reps, formula)
    raw = one_rep_max * pct
    return round(raw / round_to) * round_to


# ---------------------------------------------------------------------------
# Convenience: progression modifier
# ---------------------------------------------------------------------------

def progression_modifier(week_number: int, mesocycle_number: int) -> float:
    # Calibrated against WNDTP Starting Strength data:
    #   - Beginners gain ~10 lbs/week squat, ~5 lbs/week bench over 15 weeks
    #   - Within-mesocycle progression: ~2% per week (vs prior 1.5%)
    #   - Later mesocycles have a higher baseline due to accumulated adaptation
    weekly = (week_number - 1) * 0.020
    meso   = (mesocycle_number - 1) * 0.015
    return weekly + meso


# ---------------------------------------------------------------------------
# Quick sanity-check when run as a script
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=== Epley Rep-to-Percentage Table ===")
    for r, pct in EPLEY_TABLE_ROUNDED.items():
        print(f"  {r:>2} reps → {pct:.4f}  ({pct*100:.1f}% of 1RM)")

    print("\n=== Brzycki Rep-to-Percentage Table ===")
    for r, pct in BRZYCKI_TABLE_ROUNDED.items():
        print(f"  {r:>2} reps → {pct:.4f}  ({pct*100:.1f}% of 1RM)")

    print("\n=== Example: 315 lb deadlift 1RM, sets of 5 ===")
    w_epley   = weight_from_1rm(315, 5, formula="epley",   round_to=5.0)
    w_brzycki = weight_from_1rm(315, 5, formula="brzycki", round_to=5.0)
    print(f"  Epley working weight:   {w_epley} lbs")
    print(f"  Brzycki working weight: {w_brzycki} lbs")
