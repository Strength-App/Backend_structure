/**
 * cardioSelector.test.js
 *
 * Unit tests for the rule-based cardio selector covering all four real
 * weight loss template tiers: Beginner, Novice, Intermediate, Advanced.
 *
 * Run with:  node --experimental-vm-modules node_modules/.bin/jest tests/unit/cardioSelector.test.js
 * (or whatever test runner is configured — no test framework is assumed below,
 *  tests use plain assertions so they can be ported to Jest/Vitest/Node:test)
 */

import { pickCardioMachine, buildSlotContext } from "../../src/utils/cardioSelector.js";
import { CARDIO_METADATA } from "../../src/utils/cardioMachineMetadata.js";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function makeUser(classification, injuries = []) {
  return { current_classification: classification, injuries };
}

/**
 * Build a minimal cardio slot matching real template shapes.
 */
function cardioSlot({
  label = "Cardio",
  cardioType = "HIIT",
  cardioSets = [],
  fixed = null,
} = {}) {
  return { label, pattern: "Cardio", cardioType, cardioSets, fixed };
}

/**
 * Build a minimal strength slot (non-cardio) for populating day context.
 */
function strengthSlot(label = "Main Lift", fixed = null) {
  return { label, pattern: "Squat Pattern", fixed };
}

/**
 * Helper to call pickCardioMachine and return just the chosen machine name.
 */
function pick(slot, daySlots, slotIndex, user, recent = []) {
  const { machine } = pickCardioMachine(slot, daySlots, slotIndex, 0, user, recent);
  return machine;
}

// ─── HIIT :30/:30 sets (ratio = 1.0, interspersed) ──────────────────────────

function hiit3030Sets(count = 5) {
  return Array.from({ length: count }, () => ({ maxEffort: ":30", recovery: ":30" }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Beginner Weight Loss Template", () => {
  const user = makeUser("beginner");

  describe("HIIT slots — interspersed :30/:30 (ratio 1.0)", () => {
    // Pattern: strength → cardio → strength → cardio → ...
    const daySlots = [
      strengthSlot("Squat Pattern"),
      cardioSlot({ cardioType: "HIIT", cardioSets: hiit3030Sets() }),
      strengthSlot("Horizontal Push"),
      cardioSlot({ cardioType: "HIIT", cardioSets: hiit3030Sets() }),
    ];

    const allowedMachines = new Set(["Bike", "Elliptical", "Stairmaster"]);

    test("HIIT slot 1 → Bike, Elliptical, or Stairmaster", () => {
      const result = pick(daySlots[1], daySlots, 1, user);
      expect(allowedMachines.has(result)).toBe(true);
    });

    test("HIIT slot 2 → Bike, Elliptical, or Stairmaster", () => {
      const result = pick(daySlots[3], daySlots, 3, user);
      expect(allowedMachines.has(result)).toBe(true);
    });

    test("Assault Bike excluded (skillFloor 3, user is beginner/level 1)", () => {
      const result = pick(daySlots[1], daySlots, 1, user);
      expect(result).not.toBe("Assault Bike");
    });

    test("Curved Treadmill excluded (skillFloor 3)", () => {
      const result = pick(daySlots[1], daySlots, 1, user);
      expect(result).not.toBe("Curved Treadmill");
    });

    test("Recumbent Bike excluded (hiitSuitability 1 — too low for interspersed HIIT)", () => {
      // Recumbent Bike has hiitSuitability=1; at ratio 1.0 it scores far below Bike/Elliptical.
      // Run many picks with varied recent history to confirm it never wins.
      const recents = [[], ["Bike"], ["Elliptical"], ["Bike", "Elliptical"]];
      for (const recent of recents) {
        const result = pick(daySlots[1], daySlots, 1, user, recent);
        expect(result).not.toBe("Recumbent Bike");
      }
    });
  });

  describe("Steady State slots — interspersed 8:00 moderate", () => {
    const ssSets = [{ duration: "8:00" }];
    const daySlots = [
      strengthSlot(),
      cardioSlot({ cardioType: "Steady State", cardioSets: ssSets }),
      strengthSlot(),
    ];

    const allowedMachines = new Set(["Bike", "Elliptical", "Recumbent Bike"]);

    test("Steady State → Bike, Elliptical, or Recumbent Bike", () => {
      const result = pick(daySlots[1], daySlots, 1, user);
      expect(allowedMachines.has(result)).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Novice Weight Loss Template", () => {
  const user = makeUser("novice");

  describe("Aerobic Base finisher (20–35 min light) — workset", () => {
    // Day 1: strength work done, single cardio finisher
    const ssSets = [{ duration: "20:00" }];
    const daySlots = [
      strengthSlot("Squat Pattern"),
      strengthSlot("Horizontal Push"),
      cardioSlot({ label: "Cardio", cardioType: "Aerobic Base", cardioSets: ssSets }),
    ];

    const allowedMachines = new Set(["Bike", "Elliptical", "Treadmill"]);

    test("Aerobic Base finisher → Bike, Elliptical, or Treadmill", () => {
      const result = pick(daySlots[2], daySlots, 2, user);
      expect(allowedMachines.has(result)).toBe(true);
    });
  });

  describe("HIIT finisher — 1:00/:1:30 (ratio ≈ 0.67) — workset", () => {
    const hiitSets = Array.from({ length: 4 }, () => ({ maxEffort: "1:00", recovery: "1:30" }));
    const generalDaySlots = [
      strengthSlot("Squat Pattern"),
      cardioSlot({ label: "Cardio", cardioType: "HIIT", cardioSets: hiitSets }),
    ];

    const allowedMachines = new Set(["Rowing Machine", "Assault Bike", "Bike"]);

    test("HIIT finisher (no main lift) → Rowing Machine, Assault Bike, or Bike", () => {
      const result = pick(generalDaySlots[1], generalDaySlots, 1, user);
      expect(allowedMachines.has(result)).toBe(true);
    });
  });

  describe("HIIT finisher after Deadlift — muscle conflict penalty", () => {
    const hiitSets = Array.from({ length: 4 }, () => ({ maxEffort: "1:00", recovery: "1:30" }));
    const deadliftDaySlots = [
      strengthSlot("Main Lift", "Deadlift"),
      strengthSlot("Horizontal Push"),
      cardioSlot({ label: "Cardio", cardioType: "HIIT", cardioSets: hiitSets }),
    ];

    test("After Deadlift: Rowing Machine penalised (back overlap) — Assault Bike or Bike preferred", () => {
      const result = pick(deadliftDaySlots[2], deadliftDaySlots, 2, user);
      // Rowing Machine has [legs, back, lungs] — 2 overlapping muscles with Deadlift fatigue → -4 penalty.
      // Assault Bike / Bike should win over Rowing Machine.
      expect(result).not.toBe("Rowing Machine");
    });

    test("After Deadlift: winner is Assault Bike or Bike", () => {
      const result = pick(deadliftDaySlots[2], deadliftDaySlots, 2, user);
      expect(["Assault Bike", "Bike"].includes(result)).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Intermediate Weight Loss Template", () => {
  const user = makeUser("intermediate");

  describe("Warmup / cooldown slots (10 min light)", () => {
    const lightSets = [{ duration: "10:00" }];
    const allowedMachines = new Set(["Recumbent Bike", "Elliptical", "Bike"]);

    test("Warmup slot → Recumbent Bike, Elliptical, or Bike", () => {
      const daySlots = [
        cardioSlot({ label: "Warmup Cardio", cardioType: "Steady State", cardioSets: lightSets }),
        strengthSlot("Squat Pattern"),
        strengthSlot("Horizontal Push"),
      ];
      const result = pick(daySlots[0], daySlots, 0, user);
      expect(allowedMachines.has(result)).toBe(true);
    });

    test("Cooldown slot → Recumbent Bike, Elliptical, or Bike", () => {
      const daySlots = [
        strengthSlot("Squat Pattern"),
        strengthSlot("Horizontal Push"),
        cardioSlot({ label: "Cooldown Cardio", cardioType: "Steady State", cardioSets: lightSets }),
      ];
      const result = pick(daySlots[2], daySlots, 2, user);
      expect(allowedMachines.has(result)).toBe(true);
    });

    test("Day 3 cooldown after Back Squat — warmup role dominates, low-impact bike expected", () => {
      const daySlots = [
        strengthSlot("Main Lift", "Back Squat"),
        strengthSlot("Unilateral Lower"),
        cardioSlot({ label: "Cooldown Cardio", cardioType: "Steady State", cardioSets: lightSets }),
      ];
      const result = pick(daySlots[2], daySlots, 2, user);
      // Warmup role scoring dominates; any high-warmupSuitability low-impact bike is acceptable.
      expect(allowedMachines.has(result)).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Advanced Weight Loss Template", () => {
  const user = makeUser("advanced");

  describe("Fixed machine slots — bypass all logic", () => {
    // The integration layer in userRoutes.js handles this; the selector itself
    // is never called when slot.fixed is set. Confirm buildSlotContext still works.
    test("buildSlotContext runs without throwing on a fixed slot", () => {
      const fixedSlot = cardioSlot({ fixed: "Treadmill", cardioSets: [] });
      const daySlots = [strengthSlot(), fixedSlot];
      expect(() => buildSlotContext(fixedSlot, daySlots, 1, 1)).not.toThrow();
    });
  });

  describe("Steady State warmup / cooldown bookends", () => {
    const lightSets = [{ duration: "10:00" }];
    const allowedMachines = new Set(["Recumbent Bike", "Bike", "Elliptical"]);

    test("Warmup bookend → Recumbent Bike, Bike, or Elliptical", () => {
      const daySlots = [
        cardioSlot({ label: "Warmup Cardio", cardioType: "Steady State", cardioSets: lightSets }),
        strengthSlot("Squat Pattern"),
      ];
      const result = pick(daySlots[0], daySlots, 0, user);
      expect(allowedMachines.has(result)).toBe(true);
    });

    test("Cooldown bookend → Recumbent Bike, Bike, or Elliptical", () => {
      const daySlots = [
        strengthSlot("Squat Pattern"),
        cardioSlot({ label: "Cooldown Cardio", cardioType: "Steady State", cardioSets: lightSets }),
      ];
      const result = pick(daySlots[1], daySlots, 1, user);
      expect(allowedMachines.has(result)).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Hard filter edge cases", () => {
  const user = makeUser("beginner");

  test("HIIT with work:rest ≤ 0.25 excludes machine-paced Treadmill", () => {
    const sets = [{ maxEffort: ":10", recovery: ":50" }]; // ratio = 0.2
    const daySlots = [cardioSlot({ cardioType: "HIIT", cardioSets: sets })];
    const { candidateScores } = pickCardioMachine(daySlots[0], daySlots, 0, 0, makeUser("intermediate"), []);
    const names = candidateScores.map((c) => c.machine);
    expect(names).not.toContain("Treadmill"); // machine-paced, excluded at ratio ≤ 0.25
  });

  test("Knee injury excludes Treadmill, Curved Treadmill, Stairmaster", () => {
    const injuredUser = makeUser("intermediate", ["knee"]);
    const sets = [{ duration: "20:00" }];
    const daySlots = [cardioSlot({ cardioType: "Steady State", cardioSets: sets })];
    const { candidateScores } = pickCardioMachine(daySlots[0], daySlots, 0, 0, injuredUser, []);
    const names = candidateScores.map((c) => c.machine);
    expect(names).not.toContain("Treadmill");
    expect(names).not.toContain("Curved Treadmill");
    expect(names).not.toContain("Stairmaster");
  });

  test("Lower back injury excludes Rowing Machine and Ski Erg", () => {
    const injuredUser = makeUser("intermediate", ["lower_back"]);
    const sets = [{ duration: "20:00" }];
    const daySlots = [cardioSlot({ cardioType: "Steady State", cardioSets: sets })];
    const { candidateScores } = pickCardioMachine(daySlots[0], daySlots, 0, 0, injuredUser, []);
    const names = candidateScores.map((c) => c.machine);
    expect(names).not.toContain("Rowing Machine");
    expect(names).not.toContain("Ski Erg");
  });

  test("Skill floor waived for warmup slots (beginner can use Assault Bike for warmup)", () => {
    const lightSets = [{ duration: "10:00" }];
    const daySlots = [
      cardioSlot({ label: "Warmup Cardio", cardioType: "Steady State", cardioSets: lightSets }),
      strengthSlot(),
    ];
    const { candidateScores } = pickCardioMachine(daySlots[0], daySlots, 0, 0, user, []);
    const names = candidateScores.map((c) => c.machine);
    // Assault Bike (skillFloor 3) should survive the filter for warmup even at level 1
    expect(names).toContain("Assault Bike");
  });

  test("Anti-repetition penalty reduces score for repeated machines", () => {
    const sets = [{ maxEffort: "1:00", recovery: "1:30" }];
    const daySlots = [strengthSlot(), cardioSlot({ cardioType: "HIIT", cardioSets: sets })];
    const userAdv = makeUser("advanced");

    const noRepeat = pickCardioMachine(daySlots[1], daySlots, 1, 0, userAdv, []);
    const withRepeat = pickCardioMachine(daySlots[1], daySlots, 1, 0, userAdv, [
      noRepeat.machine, noRepeat.machine, noRepeat.machine,
    ]);

    const noRepeatScore = noRepeat.candidateScores.find((c) => c.machine === noRepeat.machine).score;
    const withRepeatScore = withRepeat.candidateScores.find((c) => c.machine === noRepeat.machine)?.score;

    // The repeated machine's score must be lower.
    if (withRepeatScore !== undefined) {
      expect(withRepeatScore).toBeLessThan(noRepeatScore);
    }
  });
});
