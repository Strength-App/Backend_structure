# Cardio Selector — Architecture & Extension Guide

## Overview

The cardio selector is a **rules-based bootstrap layer** that replaces the Random Forest model for the `Cardio` movement pattern slot in weight loss templates. The RF model only has access to `user.classification` (strength level), which is a poor predictor for cardio machine selection. Machine choice depends on session context (HIIT vs steady state, slot role, main lift of the day) — none of which the RF was trained on.

This layer will be replaced by a properly featured ML model once we have enough outcome data. The selection log (see Logging below) is designed to become the training set for that model.

## Files

| File | Purpose |
|---|---|
| `cardioMachineMetadata.js` | Static machine data: skill floors, impact, suitability scores, fatigue maps |
| `cardioSelector.js` | Core logic: slot context detection, hard filters, weighted scoring |
| `cardioAssignmentHistory.js` | MongoDB read/write helpers for anti-repetition tracking |
| `../../tests/unit/cardioSelector.test.js` | Unit tests covering all four template tiers |

## Architecture

```
slot.fixed is set?
  └─ YES → return slot.fixed verbatim (coach override, skip all logic)
  └─ NO →
       buildSlotContext()           detect slotRole, cardioType, work:rest ratio, dayMainLift
           │
       Stage 1: applyHardFilters() eliminate machines that violate hard constraints
           │   (skill floor, injury flags, HIIT pace-control rule)
           │
       Stage 2: score()             rank survivors by weighted fitness score
           │
       pick highest score           tie-break: lowest skillFloor wins
           │
       recordAssignment()           persist to cardio_assignment_history
       log selection                emit JSON for future ML training
```

## Slot Role Detection

| Role | Condition |
|---|---|
| `warmup` | `slot.label` contains "Warmup" |
| `cooldown` | `slot.label` contains "Cooldown" |
| `workset` | Cardio comes after all strength work (or is standalone) |
| `interspersed` | Non-cardio slots exist both before and after this slot |

Warmup/cooldown slots ignore the skill floor filter — any machine is safe for light 10-minute work.

## Scoring Weights (Stage 2)

See `cardioSelector.js → score()`. The main levers are:

- `warmupSuitability * 3` — warmup/cooldown role (strong signal)
- `hiitSuitability * 3` — HIIT workset (strong signal)
- `steadyStateSuitability * 3` — Steady State workset
- `hiitSuitability * 2` / `steadyStateSuitability * 2` — interspersed (weaker)
- Work:rest ratio bonuses — reward self-paced machines at ≤0.25 ratio
- Overlap penalty — `−2` per overlapping muscle group with the day's main lift
- Anti-repetition — `−1.5` per appearance in last 5 assignments

## MongoDB Collection: `cardio_assignment_history`

```js
{
  userId:     string,   // ObjectId.toString()
  templateId: string,   // ObjectId.toString()
  machines:   string[], // last 5, newest-last (circular buffer)
  updatedAt:  ISODate
}
```

Index: `{ userId: 1, templateId: 1 }` (unique). Created by `ensureCardioHistoryIndex()` — call once at server startup.

## Logging

Every selection emits a structured JSON line via `console.info("[cardioSelector]", ...)`:

```json
{
  "userId": "...",
  "templateId": "...",
  "dayIndex": 0,
  "slotIndex": 2,
  "slotContext": {
    "slotRole": "workset",
    "cardioType": "HIIT",
    "workRestRatio": 0.67,
    "totalDurationMinutes": 10,
    "dayMainLift": "Deadlift",
    "dayIndex": 0
  },
  "candidateScores": [
    { "machine": "Assault Bike", "score": 18, "skillFloor": 3 },
    { "machine": "Bike",         "score": 15, "skillFloor": 1 }
  ],
  "chosenMachine": "Assault Bike",
  "timestamp": "2026-04-27T12:00:00.000Z"
}
```

Ship these logs to a store (e.g. MongoDB `cardio_selection_logs`) and add a `userRating` or session-performance field later to build the ML training set.

## How to Extend

### Add a new cardio machine

1. Add the machine name to `CARDIO_MACHINES` in `cardioMachineMetadata.js`.
2. Add a full metadata entry to `CARDIO_METADATA` (all fields required — see existing entries for reference).
3. Add a test case covering its expected role.

### Add a new main lift fatigue mapping

Add an entry to `MAIN_LIFT_FATIGUE_MAP` in `cardioMachineMetadata.js`. The key must exactly match the `slot.fixed` string used in the template. Values are muscle group strings that must match entries in `CARDIO_METADATA.primaryMuscles`.

### Add a new injury flag

Add an entry to `INJURY_EXCLUSIONS` in `cardioMachineMetadata.js`. The key must match the injury flag string stored on the user document (`user.injuries[]`). Values are exact machine names.

### Tune scoring

All weight constants live in `cardioSelector.js → score()`. Do not modify Stage 1 filters for tuning purposes — hard filters are correctness constraints, not preference knobs.

### Replacing this layer with an ML model

When outcome data is available:
1. Export `cardio_selection_logs` + user ratings as a CSV.
2. Train a model with features: `slotRole`, `cardioType`, `workRestRatio`, `userLevel`, `dayMainLift`, `recentMachines`.
3. Expose a new endpoint on the Python service (e.g. `/select-cardio`).
4. Replace `pickCardioMachine()` call in `userRoutes.js` with a call to that endpoint.
5. Keep the hard-filter layer as a post-processing constraint on model output.
