/**
 * cardioSelector.js
 *
 * Rules-based cardio machine selector for weight loss templates.
 * Called only when:
 *   - template.tags.focus === "weight_loss"
 *   - slot.pattern === "Cardio" (or slot.label === "Cardio")
 *   - slot.fixed is falsy
 *
 * Architecture: Stage 1 (hard filters) → Stage 2 (weighted scoring) → pick winner.
 *
 * HOW TO EXTEND
 * ─────────────
 * New machine: add metadata entry to cardioMachineMetadata.js (all fields required).
 * New main lift: add an entry to MAIN_LIFT_FATIGUE_MAP in cardioMachineMetadata.js.
 * New injury flag: add an entry to INJURY_EXCLUSIONS in cardioMachineMetadata.js.
 * New slot role: extend detectSlotRole() and add scoring branches below.
 * Tune scoring weights: only edit the score() function constants — keep Stage 1 pure.
 */

import {
  CARDIO_METADATA,
  MAIN_LIFT_FATIGUE_MAP,
  INJURY_EXCLUSIONS,
  CARDIO_FALLBACK,
} from "./cardioMachineMetadata.js";

// ─── Level mapping ────────────────────────────────────────────────────────────

const LEVEL_TO_INT = {
  beginner:     1,
  novice:       2,
  intermediate: 3,
  advanced:     4,
  elite:        5,
};

// ─── Slot-context helpers ─────────────────────────────────────────────────────

/**
 * Parse a cardio time string (":30", "1:30", "10:00") to seconds.
 * Returns null for anything that doesn't match.
 */
function parseTimeToSeconds(str) {
  if (typeof str !== "string") return null;
  const parts = str.trim().split(":");
  if (parts.length === 2) {
    const [m, s] = parts.map(Number);
    if (!isNaN(m) && !isNaN(s)) return m * 60 + s;
  }
  return null;
}

/**
 * Derive work:rest ratio from a single cardioSet entry.
 * Steady-state sets without effort/recovery return null.
 */
function computeWorkRestRatio(cardioSet) {
  const effortSec = parseTimeToSeconds(cardioSet?.maxEffort);
  const recoverySec = parseTimeToSeconds(cardioSet?.recovery);
  if (effortSec != null && recoverySec != null && recoverySec > 0) {
    return effortSec / recoverySec;
  }
  return null;
}

/**
 * Determine the slot role based on the slot label and its position in the day.
 *
 * @param {object}   slot          - current slot from the template day
 * @param {object[]} daySlots      - all slots in the day
 * @param {number}   slotIndex     - index of this slot in daySlots
 * @returns {"warmup"|"cooldown"|"workset"|"interspersed"}
 */
function detectSlotRole(slot, daySlots, slotIndex) {
  const label = (slot.label ?? "").toLowerCase();

  if (label.includes("warmup")) return "warmup";
  if (label.includes("cooldown")) return "cooldown";

  // Determine if there are non-cardio slots before and after this slot.
  const isCardio = (s) => s.pattern === "Cardio" || s.label === "Cardio";
  const hasStrengthBefore = daySlots.slice(0, slotIndex).some((s) => !isCardio(s));
  const hasStrengthAfter  = daySlots.slice(slotIndex + 1).some((s) => !isCardio(s));

  if (hasStrengthBefore && hasStrengthAfter) return "interspersed";
  if (hasStrengthBefore && !hasStrengthAfter) return "workset";

  // Cardio before any strength (opening) — treat as workset if no strength follows,
  // otherwise interspersed covers the gap above.
  return "workset";
}

/**
 * Find the main lift for the day — the slot where slot.fixed is set and
 * slot.label contains "Main Lift".
 *
 * @param {object[]} daySlots
 * @returns {string|null}
 */
function getDayMainLift(daySlots) {
  for (const s of daySlots) {
    if (
      typeof s.fixed === "string" &&
      s.fixed &&
      typeof s.label === "string" &&
      s.label.includes("Main Lift")
    ) {
      return s.fixed;
    }
  }
  return null;
}

/**
 * Build the full slot context object consumed by the filter and scoring stages.
 *
 * @param {object}   slot
 * @param {object[]} daySlots
 * @param {number}   slotIndex
 * @param {number}   dayIndex
 * @returns {object} slotContext
 */
export function buildSlotContext(slot, daySlots, slotIndex, dayIndex) {
  const slotRole = detectSlotRole(slot, daySlots, slotIndex);
  const cardioType = slot.cardioType ?? null;

  // Work:rest from the first representative cardioSet that has effort/recovery fields.
  const cardioSets = slot.cardioSets ?? [];
  let workRestRatio = null;
  for (const cs of cardioSets) {
    const ratio = computeWorkRestRatio(cs);
    if (ratio !== null) {
      workRestRatio = ratio;
      break;
    }
  }

  const totalDurationMinutes = cardioSets.reduce((sum, cs) => {
    const effort = parseTimeToSeconds(cs?.maxEffort) ?? 0;
    const rest   = parseTimeToSeconds(cs?.recovery)  ?? 0;
    const dur    = parseTimeToSeconds(cs?.duration)  ?? 0;
    return sum + (effort + rest + dur) / 60;
  }, 0);

  return {
    slotRole,
    cardioType,
    workRestRatio,
    totalDurationMinutes,
    isFirstSlotOfDay: slotIndex === 0,
    isLastSlotOfDay:  slotIndex === daySlots.length - 1,
    dayMainLift: getDayMainLift(daySlots),
    dayIndex,
  };
}

// ─── Stage 1: Hard filters ────────────────────────────────────────────────────

/**
 * Return the subset of machines that pass all hard-constraint filters.
 * Falls back to CARDIO_FALLBACK when everything is eliminated.
 *
 * @param {object[]} machines      - array of CARDIO_METADATA values
 * @param {object}   slotContext
 * @param {number}   userLevel     - integer 1–5
 * @param {string[]} injuryFlags   - e.g. ["knee", "lower_back"]
 * @returns {object[]} passing machines
 */
function applyHardFilters(machines, slotContext, userLevel, injuryFlags) {
  const { slotRole, cardioType, workRestRatio } = slotContext;
  const isLightSlot = slotRole === "warmup" || slotRole === "cooldown";

  // Collect all machine names excluded by injury flags.
  const injuryExcluded = new Set();
  for (const flag of injuryFlags) {
    for (const name of INJURY_EXCLUSIONS[flag] ?? []) {
      injuryExcluded.add(name);
    }
  }

  const passing = machines.filter((m) => {
    // 1. Skill floor (waived for warmup/cooldown)
    if (!isLightSlot && m.skillFloor > userLevel) return false;

    // 2. Injury flags
    if (injuryFlags.length && injuryExcluded.has(m.name)) return false;

    // 3. True alactic HIIT (work:rest ≤ 0.25) → must be self-paced
    //    Curved Treadmill is allowed because the user controls it.
    if (
      cardioType === "HIIT" &&
      workRestRatio !== null &&
      workRestRatio <= 0.25 &&
      m.paceControl !== "self"
    ) {
      return false;
    }

    return true;
  });

  if (passing.length === 0) {
    const fallback = CARDIO_METADATA[CARDIO_FALLBACK];
    return fallback ? [fallback] : [];
  }

  return passing;
}

// ─── Stage 2: Scoring ─────────────────────────────────────────────────────────

/**
 * Compute a numeric fitness score for a single machine given the slot context.
 *
 * @param {object}   machine
 * @param {object}   slotContext
 * @param {number}   userLevel
 * @param {string[]} recentAssignments - last ≤5 machine names for this user/template
 * @returns {number}
 */
function score(machine, slotContext, userLevel, recentAssignments) {
  const { slotRole, cardioType, workRestRatio, dayMainLift } = slotContext;
  let s = 0;

  // ── Base suitability ──────────────────────────────────────────────────────
  if (slotRole === "warmup" || slotRole === "cooldown") {
    s += machine.warmupSuitability * 3;
  } else if (slotRole === "interspersed" && cardioType === "HIIT") {
    s += machine.hiitSuitability * 2;
  } else if (slotRole === "interspersed" && cardioType === "Steady State") {
    s += machine.steadyStateSuitability * 2;
  } else if (slotRole === "workset" && cardioType === "HIIT") {
    s += machine.hiitSuitability * 3;
  } else if (slotRole === "workset" && cardioType === "Steady State") {
    s += machine.steadyStateSuitability * 3;
  } else if (slotRole === "workset" && cardioType === "Aerobic Base") {
    s += machine.steadyStateSuitability * 2 + machine.warmupSuitability * 1;
  }

  // ── Work:rest ratio bonus (HIIT worksets) ─────────────────────────────────
  if (cardioType === "HIIT" && workRestRatio !== null) {
    if (workRestRatio <= 0.25) {
      // True alactic — favour self-paced, max-effort machines
      if (machine.hiitSuitability >= 5) s += 4;
      if (machine.paceControl === "self") s += 2;
    } else if (workRestRatio <= 0.5) {
      // Short work / longer rest
      if (machine.hiitSuitability >= 4) s += 2;
    } else {
      // 1:1 or longer work — sustainable machines preferred
      if (machine.hiitSuitability >= 3 && machine.hiitSuitability <= 4) s += 2;
    }
  }

  // ── Muscle-group conflict penalty ─────────────────────────────────────────
  if (slotRole === "workset" && dayMainLift && MAIN_LIFT_FATIGUE_MAP[dayMainLift]) {
    const fatigued = MAIN_LIFT_FATIGUE_MAP[dayMainLift];
    const overlap  = machine.primaryMuscles.filter((m) => fatigued.includes(m)).length;
    s -= overlap * 2;
  }

  // ── Level-appropriate bias ────────────────────────────────────────────────
  if (userLevel <= 2 && machine.skillFloor === 1) s += 1;

  // ── Anti-repetition penalty ───────────────────────────────────────────────
  if (recentAssignments.length > 0) {
    const usesInLast5 = recentAssignments.filter((n) => n === machine.name).length;
    if (usesInLast5 > 0) s -= usesInLast5 * 1.5;
  }

  return s;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Select the best cardio machine for a weight loss template slot.
 *
 * @param {object}   slot              - template slot object
 * @param {object[]} daySlots          - all slots in the day (for context detection)
 * @param {number}   slotIndex         - index of this slot within daySlots
 * @param {number}   dayIndex          - 0-based day index within the program
 * @param {object}   user              - user document (current_classification, injuries)
 * @param {string[]} recentAssignments - last ≤5 machines assigned for this user/template
 * @returns {{ machine: string, context: object, candidateScores: object[] }}
 */
export function pickCardioMachine(slot, daySlots, slotIndex, dayIndex, user, recentAssignments) {
  const rawLevel = (user?.current_classification ?? "beginner").toLowerCase();
  const userLevel = LEVEL_TO_INT[rawLevel] ?? 1;
  const injuryFlags = Array.isArray(user?.injuries) ? user.injuries : [];

  const slotContext = buildSlotContext(slot, daySlots, slotIndex, dayIndex);

  const allMachines = Object.values(CARDIO_METADATA);
  const candidates  = applyHardFilters(allMachines, slotContext, userLevel, injuryFlags);

  // Score every candidate
  const scored = candidates.map((m) => ({
    machine: m.name,
    score: score(m, slotContext, userLevel, recentAssignments),
    skillFloor: m.skillFloor,
  }));

  // Sort: highest score first; tie-break by lowest skillFloor (more accessible)
  scored.sort((a, b) => b.score - a.score || a.skillFloor - b.skillFloor);

  const chosen = scored[0]?.machine ?? CARDIO_FALLBACK;

  return {
    machine: chosen,
    context: slotContext,
    candidateScores: scored,
  };
}
