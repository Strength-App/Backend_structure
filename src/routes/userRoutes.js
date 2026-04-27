import express from "express";
import bcrypt from "bcrypt";
import { ObjectId } from "mongodb";
import db from "../config/database.js";
import { classification } from "../controllers/userController.js";
import sendEmail from "../utils/sendEmail.js";
import { selectExercise, extractExercisesByPattern, BODYWEIGHT_EXERCISES, BARBELL_EXERCISES, TIMED_EXERCISES, DISTANCE_EXERCISES } from "../utils/exerciseSelector.js";
import { predictWeight } from "../utils/weightPredictor.js";
import { buildWeightCorrectionMap, getCorrectionFactor, applyWeightCorrection, buildExerciseMaxMap } from "../utils/userWeightHistory.js";
import { pickCardioMachine } from "../utils/cardioSelector.js";
import { getRecentAssignments, recordAssignment } from "../utils/cardioAssignmentHistory.js";


const router = express.Router();
const saltRounds = 10;

function formatChangedFields(fields) {
  if (fields.length <= 1) return fields[0] ?? "profile details";
  if (fields.length === 2) return `${fields[0]} and ${fields[1]}`;
  return `${fields.slice(0, -1).join(", ")}, and ${fields.at(-1)}`;
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── Percentage-weight helpers ────────────────────────────────────────────────

/**
 * Which 1RM (bench/squat/deadlift) to use when resolving a percentage-based
 * weightNote for a given movement pattern.
 */
const PERCENT_REF_1RM = {
  "Horizontal Push": "bench",
  "Vertical Push":   "bench",
  "Squat Pattern":   "squat",
  "Hinge":           "deadlift",
};

// For fixed-exercise slots (pattern: null), map the fixed name to the reference 1RM.
const FIXED_EXERCISE_REF_1RM = {
  "Bench Press": "bench",
  "Squat":       "squat",
  "Back Squat":  "squat",
  "Deadlift":    "deadlift",
};

/**
 * Returns true if any weightNote in the slot contains a percentage string.
 * Used to decide whether to estimate an exercise's 1RM via AI.
 */
function hasPercentageWeightNotes(slot) {
  const containsPercent = (note) => {
    if (typeof note === "string") return note.includes("%");
    if (Array.isArray(note)) return note.some(n => typeof n === "string" && n.includes("%"));
    return false;
  };
  if (Array.isArray(slot.progression)) {
    return slot.progression.some(p => containsPercent(p.weightNote));
  }
  return containsPercent(slot.weightNote) || containsPercent(slot.backoffWeightNote);
}

/**
 * Parse "75%" or "80.5%" → fraction (0.75 / 0.805).  Returns null for anything else.
 */
function parsePercent(str) {
  if (typeof str !== "string") return null;
  const m = str.match(/^\s*(\d+(?:\.\d+)?)\s*%\+?\s*$/);
  return m ? parseFloat(m[1]) / 100 : null;
}

/**
 * Convert a weightNote value to actual lbs by applying any percentage strings
 * to ref1rm.  Handles:
 *   - Single string:            "75%"           → 170  (number)
 *   - Comma-separated string:   "70%, 75%, 80%" → [155, 165, 175]  (array)
 *   - Array of strings:         ["70%", "75%"]  → [155, 165]
 *   - Non-percentage strings pass through unchanged.
 * Returns the original value when ref1rm is falsy (1RMs not set yet).
 */
function resolveWeightNotes(note, ref1rm, isBarbell) {
  const floor = isBarbell ? 45 : 5;
  const convert = (s) => {
    const pct = parsePercent(s);
    if (pct == null || !ref1rm) return s;
    return Math.max(floor, Math.round((ref1rm * pct) / 5) * 5);
  };
  if (Array.isArray(note)) return note.map(convert);
  if (typeof note === "string" && note.includes(",")) {
    const parts = note.split(",").map(s => s.trim());
    const resolved = parts.map(convert);
    // Only replace if every part was a percentage
    // Return a string (not array) so resolveWeekValue on the client doesn't
    // mistake this per-set array for a per-week progression array.
    return resolved.every(r => typeof r === "number") ? resolved.join(", ") : note;
  }
  return convert(note ?? null);
}


async function updatePersonalBest(userId, exercise, actualWeight) {
  const usersCollection = db.collection("users");
  const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

  if (!user) {
    return null
  }

  // const currentPersonalBests = user.current_one_rep_maxes[exercise] ?? {};
  // const currentPersonalBest = currentPersonalBests[exercise] ?? 0;

  const currentPersonalBest = user.personal_bests?.[exercise] ?? 0;

  if (actualWeight > 0 && actualWeight > currentPersonalBest) {
    await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { [`personal_bests.${exercise}`]: actualWeight }}
    );
    return {isPersonalBest: true, previousPersonalBest: currentPersonalBest, newPersonalBest: actualWeight};
  }
  return {isPersonalBest: false, previousPersonalBest: currentPersonalBest,};
}

// ─── Auth Routes ─────────────────────────────────────────────────────────────

// Create account
router.post("/create-account", async (req, res) => {
  try {
    const collection = db.collection("users");
    const { firstName, lastName, email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }

    const existingUser = await collection.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = {
      firstName,
      lastName,
      email: normalizedEmail,
      password: hashedPassword,
      onboarding_complete: false,
      gender: null,
      current_bodyweight: null,
      current_one_rep_maxes: {
        squat: null,
        bench: null,
        deadlift: null
      },
      current_classification: null,
      current_workout_id: null,
      personal_bests: {},
      custom_exercises: [],
      bodyweight_history: [],
      classification_history: [],
    };

    const result = await collection.insertOne(newUser);

    try {
      await sendEmail({
        to: normalizedEmail,
        subject: "Welcome to MaxMethod",
        text: `Hi ${firstName || "there"},

Your MaxMethod account has been created successfully.

You can now sign in and finish onboarding.

- MaxMethod`,
      });
    } catch (emailErr) {
      console.error("Create-account email failed:", emailErr.message);
    }

    res.status(201).json({
      _id: result.insertedId,
      firstName,
      lastName,
      email: normalizedEmail
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating account" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const collection = db.collection("users");
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    const user = await collection.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ success: false, message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    res.status(200).json({
      success: true,
      user: {
        _id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        gender: user.gender,
        current_bodyweight: user.current_bodyweight,
        current_one_rep_maxes: user.current_one_rep_maxes,
        current_classification: user.current_classification,
        onboarding_complete: user.onboarding_complete,
        current_workout_id: user.current_workout_id,
        personal_bests: user.personal_bests
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Login error" });
  }
});

// ─── Onboarding Routes ────────────────────────────────────────────────────────

// Classification
router.post("/classification", classification);

// Goals — generate workout, save to workout_logs, link to user
router.post("/goals", async (req, res) => {
  try {
    const { userId, classification, daysPerWeek, goalSelection } = req.body;

    if (!userId || !classification || !daysPerWeek || !goalSelection) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const templateCollection = db.collection("workout_templates");
    const usersCollection = db.collection("users");
    const workoutLogsCollection = db.collection("workout_logs");
    const programLogsCollection = db.collection("program_logs");

    const templateClassification = classification.toLowerCase();

    // The weight loss templates are stored with focus "weight_loss" (underscore)
    // while the frontend sends "loseWeight" (camelCase) — map at query time.
    const templateFocus = goalSelection === "loseWeight" ? "weight_loss" : goalSelection;

    // Find matching template
    const templates = await templateCollection.find({
      "tags.classification": templateClassification,
      "tags.focus": templateFocus,
      "tags.daysPerWeek": Number(daysPerWeek)
    }).toArray();

    console.log("Templates found:", templates.length);
    console.log("First match title:", templates[0]?.title);
    console.log("Query params:", templateClassification, goalSelection, Number(daysPerWeek));

    if (!templates.length) {
      return res.status(404).json({ message: "No matching workout template found" });
    }

    const templateDays = templates[0].days;
    const firstProgressionLength = templateDays
        .flatMap(d => d.slots)
        .find(s => Array.isArray(s.progression) && s.progression.length > 0)
        ?.progression.length;
    const WEEKS = templates[0].weeks ?? templates[0].totalWeeks ?? templates[0].numWeeks ?? firstProgressionLength ?? 4;

    // Determine mesocycle number: count previously generated programs for this user
    const previousGeneratedCount = await programLogsCollection.countDocuments({
      userId: new ObjectId(userId),
      type: "generated"
    });
    const mesocycleNumber = previousGeneratedCount + 1;

    // Get exercises from the last generated program — that is the last mesocycle.
    // Custom workouts are excluded; only AI-generated programs count as mesocycles.
    const lastGeneratedProgram = await programLogsCollection.findOne(
        { userId: new ObjectId(userId), type: "generated" },
        { sort: { createdAt: -1 } }
    );
    const lastWorkout = lastGeneratedProgram
        ? await workoutLogsCollection.findOne({ _id: lastGeneratedProgram.workoutLogId })
        : null;
    const lastMesoExercises = lastWorkout ? extractExercisesByPattern(lastWorkout) : {};

    // Strength level must be lowercase for the AI selector
    const strengthLevel = classification.toLowerCase();

    // Fetch user's 1RMs for weight prediction
    const userDoc = await usersCollection.findOne({ _id: new ObjectId(userId) });
    const oneRMs = userDoc?.current_one_rep_maxes ?? {};
    const squat1rm = oneRMs.squat ?? 0;
    const bench1rm = oneRMs.bench ?? 0;
    const deadlift1rm = oneRMs.deadlift ?? 0;

    // Build personalized correction map from user's actual weight history (single query)
    const weightCorrectionMap = await buildWeightCorrectionMap(userId, db);

    // Build per-exercise max map for percentage-based weight calculation
    const exerciseMaxMap = await buildExerciseMaxMap(userId, db);

    // Weight loss templates allow exercise repeats within a week and cardio repeats within a day
    const isWeightLoss = templateFocus === "weight_loss";
    const templateId = templates[0]._id;

    // Pre-load cardio assignment history for weight loss templates so the anti-repetition
    // penalty in the cardio selector has data without hitting Mongo per-slot.
    const recentCardioAssignments = isWeightLoss
      ? await getRecentAssignments(db, userId, templateId)
      : [];

    // Cache AI-estimated 1RMs for fixed exercises that have % weightNotes but no stored
    // Big-3 mapping. Keyed by exercise name; populated lazily during week generation so
    // the AI service is called at most once per exercise per program generation.
    const estimated1rmCache = {};

    // Build weeks using the AI selector for each non-fixed slot
    const weeks = [];
    for (let wi = 0; wi < WEEKS; wi++) {
      const weekNum = wi + 1;
      // Track exercises assigned so far this week per pattern
      const usedThisWeek = {};

      const days = [];
      for (let di = 0; di < templateDays.length; di++) {
        const day = templateDays[di];
        const slots = [];

        for (let si = 0; si < day.slots.length; si++) {
          const slot = day.slots[si];
          const patternKey = slot.pattern ?? slot.label;
          const isCardioSlot = slot.pattern === 'Cardio' || slot.label === 'Cardio';

          // ── Cardio slots: skip weight prediction entirely ──────────────────
          if (isCardioSlot) {
            let exercise;
            if (typeof slot.fixed === 'string' && slot.fixed) {
              exercise = slot.fixed;
            } else if (isWeightLoss) {
              // Weight loss templates use the rules-based cardio selector instead of the RF model.
              const { machine, context, candidateScores } = pickCardioMachine(
                slot,
                day.slots,
                si,
                di,
                userDoc,
                recentCardioAssignments
              );
              exercise = machine;

              // Record for anti-repetition in subsequent slots this generation.
              recentCardioAssignments.push(machine);
              if (recentCardioAssignments.length > 5) recentCardioAssignments.shift();

              // Persist to DB (best-effort, non-blocking).
              recordAssignment(db, userId, templateId, machine).catch(() => {});

              // Emit selection log for future ML training dataset.
              console.info("[cardioSelector]", JSON.stringify({
                userId,
                templateId: templateId.toString(),
                dayIndex: di,
                slotIndex: si,
                slotContext: context,
                candidateScores,
                chosenMachine: machine,
                timestamp: new Date().toISOString(),
              }));
            } else {
              exercise = await selectExercise(
                  patternKey,
                  strengthLevel,
                  usedThisWeek[patternKey] ?? [],
                  lastMesoExercises[patternKey] ?? [],
                  weekNum,
                  mesocycleNumber,
                  false
              );
              if (!usedThisWeek[patternKey]) usedThisWeek[patternKey] = [];
              usedThisWeek[patternKey].push(exercise);
            }

            slots.push({
              slotIdx: si,
              label: 'Cardio',
              fixed: typeof slot.fixed === 'string' ? slot.fixed : false,
              exercise,
              sets: null,
              reps: null,
              weightNote: null,
              progression: null,
              projectedWeight: null,
              actualWeight: null,
              notes: "",
              superset: false,
              supersetGroup: null,
              cardioSets:  slot.weeklyCardio
                  ? (slot.weeklyCardio.find(w => w.week === weekNum)?.cardioSets ?? [])
                  : (slot.cardioSets ?? []),
              cardioType:  slot.cardioType  ?? null,
              cardioNote:  slot.cardioNote  ?? null,
            });
            continue;
          }

          // ── Circuit slots (EMOM / AMRAP / For Time) ───────────────────────
          const isCircuitSlot = Array.isArray(slot.exercises) && slot.exercises.length > 0;
          if (isCircuitSlot) {
            const resolvedExercises = [];
            for (const ex of slot.exercises) {
              let exName;
              if (typeof ex.fixed === 'string' && ex.fixed) {
                exName = ex.fixed;
              } else if (ex.pattern) {
                exName = await selectExercise(
                    ex.pattern,
                    strengthLevel,
                    isWeightLoss ? [] : (usedThisWeek[ex.pattern] ?? []),
                    lastMesoExercises[ex.pattern] ?? [],
                    weekNum,
                    mesocycleNumber,
                    isWeightLoss
                );
                if (!isWeightLoss) {
                  if (!usedThisWeek[ex.pattern]) usedThisWeek[ex.pattern] = [];
                  usedThisWeek[ex.pattern].push(exName);
                }
              } else {
                exName = ex.label;
              }
              // Predict weight for this circuit exercise
              let exProjectedWeight = null;
              const isRestSlot = ex.pattern == null && ex.fixed == null;
              if (!isRestSlot) {
                const NA_CIRCUIT_EXERCISES = new Set(["Banded Tibia Raises", "Banded Tibia Curls", "Band Pull Aparts"]);
                if (BODYWEIGHT_EXERCISES.has(exName)) {
                  exProjectedWeight = NA_CIRCUIT_EXERCISES.has(exName) ? "N/A" : "BW";
                } else {
                  // Parse target reps: time-based ("1:00") → 10, comma list ("21,15,9") → first, else parse int
                  let exTargetReps = null;
                  const exRepsRaw = ex.reps;
                  if (exRepsRaw != null) {
                    if (typeof exRepsRaw === 'string' && exRepsRaw.includes(':')) {
                      exTargetReps = 10;
                    } else if (typeof exRepsRaw === 'string' && exRepsRaw.includes(',')) {
                      exTargetReps = parseInt(exRepsRaw.split(',')[0].trim(), 10);
                    } else {
                      const parsed = parseInt(exRepsRaw, 10);
                      if (!isNaN(parsed)) exTargetReps = parsed;
                    }
                  }
                  const exPattern = ex.pattern ?? ex.label;
                  const isBarbell = BARBELL_EXERCISES.has(exName);
                  const baseWeight = exTargetReps
                    ? await predictWeight(
                        exName, exPattern, strengthLevel,
                        squat1rm, bench1rm, deadlift1rm,
                        exTargetReps, weekNum, mesocycleNumber
                      )
                    : null;
                  const correctionFactor = getCorrectionFactor(weightCorrectionMap, exName, exPattern);
                  exProjectedWeight = applyWeightCorrection(baseWeight, correctionFactor, isBarbell);
                }
              }

              resolvedExercises.push({
                label: ex.label,
                fixed: ex.fixed ?? null,
                exercise: exName,
                sets: ex.sets ?? null,
                reps: ex.reps ?? null,
                weightNote: ex.weightNote ?? null,
                projectedWeight: exProjectedWeight,
                note: ex.note ?? null,
              });
            }
            slots.push({
              slotIdx: si,
              label: slot.label ?? null,
              fixed: false,
              exercise: null,
              sets: null,
              reps: null,
              weightNote: null,
              projectedWeight: null,
              circuitType: slot.circuitType ?? null,
              totalTime: slot.totalTime ?? null,
              circuitNote: slot.circuitNote ?? null,
              exercises: resolvedExercises,
            });
            continue;
          }

          // ── Strength / regular slots ───────────────────────────────────────
          const hasProgression = Array.isArray(slot.progression) && slot.progression.length > 0;

          let exercise;
          if (typeof slot.fixed === 'string' && slot.fixed) {
            exercise = slot.fixed;
          } else {
            exercise = await selectExercise(
                patternKey,
                strengthLevel,
                isWeightLoss ? [] : (usedThisWeek[patternKey] ?? []),
                lastMesoExercises[patternKey] ?? [],
                weekNum,
                mesocycleNumber,
                isWeightLoss
            );
            // Weight loss: exercises may repeat in the same week — no weekly tracking
            if (!isWeightLoss) {
              if (!usedThisWeek[patternKey]) usedThisWeek[patternKey] = [];
              usedThisWeek[patternKey].push(exercise);
            }
          }

          // Determine target reps for this specific week for weight prediction
          const weekReps = hasProgression
              ? slot.progression[wi]?.reps
              : slot.reps;
          const targetReps = Array.isArray(weekReps)
              ? weekReps[0]
              : typeof weekReps === 'string' && weekReps.includes(',')
                  ? parseInt(weekReps.split(',')[0].trim(), 10)
                  : weekReps;

          // Resolve reference 1RM for percentage-based weightNotes
          const percentRefKey = PERCENT_REF_1RM[patternKey] ?? FIXED_EXERCISE_REF_1RM[slot.fixed];
          let percentRef1rm = percentRefKey === "bench" ? bench1rm
              : percentRefKey === "squat" ? squat1rm
                  : percentRefKey === "deadlift" ? deadlift1rm
                      : null;

          // For fixed exercises with % weightNotes but no Big-3 1RM mapping (e.g. Military
          // Press, Barbell Row, Barbell Curls), estimate the exercise's 1RM by asking the
          // AI model to predict the weight at 1 rep. Cache per exercise to avoid redundant
          // service calls across weeks.
          if (percentRef1rm == null && hasPercentageWeightNotes(slot)) {
            if (estimated1rmCache[exercise] === undefined) {
              estimated1rmCache[exercise] = await predictWeight(
                exercise, patternKey, strengthLevel,
                squat1rm, bench1rm, deadlift1rm,
                1, 1, 1  // 1 rep @ week 1 / meso 1 = stable 1RM estimate
              );
            }
            percentRef1rm = estimated1rmCache[exercise];
          }

          const isBarbell = BARBELL_EXERCISES.has(exercise);

          // For non-progression slots with a backoff set, merge backoff reps/weightNote
          // into the main strings so all sets have matching data entries.
          const effectiveReps = (!hasProgression && slot.backoffReps)
              ? `${slot.reps ?? ''},${slot.backoffReps}`
              : (slot.reps ?? null);
          const rawWeightNote = (!hasProgression && slot.backoffWeightNote)
              ? `${slot.weightNote ?? ''}, ${slot.backoffWeightNote}`
              : (slot.weightNote ?? null);

          // Resolve ALL weeks' weightNotes (percentages → lb values) for storage
          const resolvedWeightNote = hasProgression
              ? slot.progression.map(p => resolveWeightNotes(p.weightNote, percentRef1rm, isBarbell))
              : resolveWeightNotes(rawWeightNote, percentRef1rm, isBarbell);

          // Get this week's resolved note to drive projectedWeight
          const weekResolvedNote = hasProgression
              ? resolvedWeightNote[wi]
              : resolvedWeightNote;

          let projectedWeight;
          if (BODYWEIGHT_EXERCISES.has(exercise)) {
            const NA_EXERCISES = new Set(["Banded Tibia Raises", "Banded Tibia Curls", "Band Pull Aparts"]);
            projectedWeight = NA_EXERCISES.has(exercise) ? "N/A" : "BW";
          } else if (typeof weekResolvedNote === "number") {
            // weightNote was a single percentage string — use the resolved lb value directly
            projectedWeight = weekResolvedNote;
          } else if (slot.percent != null) {
            // slot.percent field — prefer user's logged exercise max, fall back to movement-pattern 1RM
            const refMax = exerciseMaxMap[exercise] ?? percentRef1rm;
            if (refMax != null) {
              const floor = isBarbell ? 45 : 5;
              projectedWeight = Math.max(floor, Math.round((refMax * slot.percent) / 5) * 5);
            } else {
              projectedWeight = null;
            }
          } else if (Array.isArray(weekResolvedNote) && weekResolvedNote.every(v => typeof v === "number")) {
            // Per-set weights are fully resolved in weightNote — no single projectedWeight needed
            projectedWeight = null;
          } else if (typeof weekResolvedNote === "string" && weekResolvedNote.includes("%")) {
            // Per-set percentage weights live in weightNote — client resolves them individually.
            // Do not overwrite with a single AI prediction.
            projectedWeight = null;
          } else if (typeof weekResolvedNote === "string" && weekResolvedNote.includes(",")) {
            // Per-set values (resolved from comma-separated percentages) — let the client
            // display each set's weight from weightNote. resolveWeightNotes returns a joined
            // string (not an array) so the array check above never fires for this case.
            projectedWeight = null;
          } else {
            const baseWeight = targetReps
                ? await predictWeight(
                    exercise,
                    patternKey,
                    strengthLevel,
                    squat1rm,
                    bench1rm,
                    deadlift1rm,
                    targetReps,
                    weekNum,
                    mesocycleNumber
                )
                : null;
            const correctionFactor = getCorrectionFactor(weightCorrectionMap, exercise, patternKey);
            projectedWeight = applyWeightCorrection(baseWeight, correctionFactor, isBarbell);
          }

          slots.push({
            slotIdx: si,
            label: slot.label ?? null,
            fixed: typeof slot.fixed === 'string' ? slot.fixed : false,
            exercise,
            sets: hasProgression
                ? slot.progression.map(p => p.sets)
                : (slot.sets ?? null),
            reps: hasProgression
                ? slot.progression.map(p => p.reps)
                : effectiveReps,
            weightNote: resolvedWeightNote,
            progression: hasProgression ? slot.progression : null,
            projectedWeight,
            actualWeight: null,
            notes: "",
            superset: slot.superset ?? false,
            supersetGroup: slot.supersetGroup ?? null,
            repsType: TIMED_EXERCISES.has(exercise) ? "time"
              : DISTANCE_EXERCISES.has(exercise) ? "distance"
              : null,
          });
        }

        days.push({
          dayNum: di + 1,
          title: day.title ?? `Day ${di + 1}`,
          completed: false,
          completedAt: null,
          slots
        });
      }

      weeks.push({ weekNum, days });
    }


    // Personal Best to log
    // Build the full weeks structure with resolved exercises
    // const weeks = Array.from({ length: WEEKS }, (_, wi) => ({
    //   weekNum: wi + 1,
    //   days: templateDays.map((day, di) => ({
    //     dayNum: di + 1,
    //     title: day.title ?? `Day ${di + 1}`,
    //     completed: false,
    //     completedAt: null,
    //     slots: day.slots.map((slot, si) => {
    //
    //       // Resolve exercise name:
    //       // - If slot.fixed is a non-empty string, use it directly
    //       // - Otherwise look up movementPatterns using slot.pattern first,
    //       //   then slot.label as fallback
    //       const patternKey = slot.pattern ?? slot.label;
    //       const options = movementPatterns[patternKey];
    //       const exercise = typeof slot.fixed === 'string' && slot.fixed
    //         ? slot.fixed
    //         : options?.[Math.floor(Math.random() * options.length)] ?? patternKey;
    //
    //       // Resolve sets/reps/weightNote:
    //       // Progression-based slots (main lifts) store these per week
    //       // inside a progression array. Accessory slots have them at top level.
    //       const hasProgression = Array.isArray(slot.progression) && slot.progression.length > 0;
    //
    //       return {
    //         slotIdx: si,
    //         label: slot.label ?? null,
    //         fixed: typeof slot.fixed === 'string' ? slot.fixed : false,
    //         exercise,
    //         // For progression slots, store per-week values as arrays
    //         // For accessory slots, store as plain values
    //         sets: hasProgression
    //           ? slot.progression.map(p => p.sets)
    //           : (slot.sets ?? null),
    //         reps: hasProgression
    //           ? slot.progression.map(p => p.reps)
    //           : (slot.reps ?? null),
    //         weightNote: hasProgression
    //           ? slot.progression.map(p => p.weightNote)
    //           : (slot.weightNote ?? null),
    //         // Keep full progression data for future reference
    //         progression: hasProgression ? slot.progression : null,
    //         projectedWeight: null,
    //         actualWeight: null,
    //         notes: ""
    //       };
    //     })
    //   }))
    // }));

    // Save to workout_logs
    const workoutLog = {
      userId: new ObjectId(userId),
      classification,
      daysPerWeek: Number(daysPerWeek),
      goalSelection,
      createdAt: new Date(),
      weeks,
    };

    const result = await workoutLogsCollection.insertOne(workoutLog);
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

    // Build a readable title for the program
    const goalLabels = { strength: "Strength", hypertrophy: "Hypertrophy", loseWeight: "Weight Loss" };
    const programTitle = `${daysPerWeek} Day ${classification} ${goalLabels[goalSelection] ?? goalSelection}`;

    // Insert into program_logs
    const programLog = {
      userId: new ObjectId(userId),
      type: "generated",
      title: programTitle,
      isActive: true,
      createdAt: new Date(),
      workoutLogId: result.insertedId
    };

    const programResult = await programLogsCollection.insertOne(programLog);

    // Deactivate all other programs for this user
    await programLogsCollection.updateMany(
        { userId: new ObjectId(userId), _id: { $ne: programResult.insertedId } },
        { $set: { isActive: false } }
    );

    // Link workout to user and mark onboarding complete.
    // Use $max so personal_bests only update if the training max exceeds the all-time record.
    // This preserves PRs earned in previous programs.
    await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          current_workout_id: result.insertedId,
          onboarding_complete: true,
        },
        $max: {
          "personal_bests.Squat":        user.current_one_rep_maxes.squat ?? 0,
          "personal_bests.Bench Press":  user.current_one_rep_maxes.bench ?? 0,
          "personal_bests.Deadlift":     user.current_one_rep_maxes.deadlift ?? 0
        },
        $push: { program_log_ids: programResult.insertedId }
      }
    );

    res.status(201).json({
      workoutId: result.insertedId,
      weeks
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error generating workout" });
  }
});

// ─── Debug: inspect workout_templates collection ──────────────────────────────
// Hit GET /api/users/debug-templates to see every template's tags
router.get("/debug-templates", async (_req, res) => {
  try {
    const templates = await db.collection("workout_templates").find({}).toArray();
    res.json(templates.map(t => ({
      _id: t._id,
      title: t.title,
      tags: t.tags,
    })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Workout Routes ───────────────────────────────────────────────────────────

// Get current workout for a user
router.get("/workout/:userId", async (req, res) => {
  try {
    const usersCollection = db.collection("users");
    const workoutLogsCollection = db.collection("workout_logs");

    const user = await usersCollection.findOne({ _id: new ObjectId(req.params.userId) });
    if (!user?.current_workout_id) {
      return res.status(404).json({ message: "No workout found for this user" });
    }
    console.log("current_workout_id:", user.current_workout_id);

    const workout = await workoutLogsCollection.findOne({ _id: new ObjectId(user.current_workout_id) });

    console.log("workout._id:", workout?._id);
    console.log("w0,d0,s0 actualWeight:", workout?.weeks?.[0]?.days?.[0]?.slots?.[0]?.actualWeight);

    if (!workout) {
      return res.status(404).json({ message: "Workout log not found" });
    }

    res.status(200).json(workout);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching workout" });
  }
});

// Check and update a personal best (used by logger and day pages)
router.post("/workout/pb-check", async (req, res) => {
  try {
    const { userId, exercise, actualWeight } = req.body;
    if (!userId || !exercise) return res.status(400).json({ message: "Missing fields" });
    const result = await updatePersonalBest(userId, exercise, Number(actualWeight));
    res.status(200).json(result ?? { isPersonalBest: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error checking personal best" });
  }
});

router.get("/workout/:userId/personal-bests", async (req, res) => {
  try {

    const usersCollection = db.collection("users");
    const user = await usersCollection.findOne({ _id: new ObjectId(req.params.userId) });

    if(!user) {
      return res.status(404).json({ message: "User not found" });
    }
    console.log("User's personal bests:", user.personal_bests);
    res.status(200).json({ personal_bests: user.personal_bests  ?? {} });
  } catch (err) {

    console.error(err);
    res.status(500).json({ message: "Error fetching personal bests" });
  }

});

// ─── Custom Exercises ────────────────────────────────────────────────────────

router.get("/:userId/custom-exercises", async (req, res) => {
  try {
    const user = await db.collection("users").findOne({ _id: new ObjectId(req.params.userId) });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ custom_exercises: user.custom_exercises ?? [] });
  } catch (err) {
    res.status(500).json({ message: "Error fetching custom exercises" });
  }
});

router.post("/:userId/custom-exercises", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "Exercise name required" });
    const collection = db.collection("users");
    const user = await collection.findOne({ _id: new ObjectId(req.params.userId) });
    if (!user) return res.status(404).json({ message: "User not found" });
    const trimmed = name.trim();
    if ((user.custom_exercises ?? []).some(n => n.toLowerCase() === trimmed.toLowerCase())) {
      return res.status(409).json({ message: "Exercise already exists" });
    }
    await collection.updateOne(
      { _id: new ObjectId(req.params.userId) },
      { $push: { custom_exercises: trimmed } }
    );
    res.status(200).json({ custom_exercises: [...(user.custom_exercises ?? []), trimmed] });
  } catch (err) {
    res.status(500).json({ message: "Error adding custom exercise" });
  }
});

router.delete("/:userId/custom-exercises/:name", async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    await db.collection("users").updateOne(
      { _id: new ObjectId(req.params.userId) },
      { $pull: { custom_exercises: name } }
    );
    res.status(200).json({ message: "Removed" });
  } catch (err) {
    res.status(500).json({ message: "Error removing custom exercise" });
  }
});

// Get all-time exercise history for a user across every program
router.get("/workout/:userId/exercise-history", async (req, res) => {
  try {
    const { exercise } = req.query;
    if (!exercise) return res.status(400).json({ message: "Missing exercise query param" });

    const usersCollection = db.collection("users");
    const programLogsCollection = db.collection("program_logs");
    const workoutLogsCollection = db.collection("workout_logs");

    const user = await usersCollection.findOne({ _id: new ObjectId(req.params.userId) });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Collect all workoutLogIds from every program this user has ever had
    const programLogIds = user.program_log_ids ?? [];
    const programLogs = await programLogsCollection
      .find({ _id: { $in: programLogIds.map(id => new ObjectId(id)) } })
      .toArray();

    const workoutLogIds = programLogs
      .map(p => p.workoutLogId)
      .filter(Boolean)
      .map(id => new ObjectId(id));

    const workoutLogs = await workoutLogsCollection
      .find({ _id: { $in: workoutLogIds } })
      .toArray();

    // Scan every completed day in every workout log for the requested exercise
    const results = [];
    for (const wl of workoutLogs) {
      for (const [wi, week] of (wl.weeks ?? []).entries()) {
        for (const [di, day] of (week.days ?? []).entries()) {
          if (!day.completed || !day.completedAt) continue;
          for (const [si, slot] of (day.slots ?? []).entries()) {
            if ((slot.exercise ?? '') !== exercise) continue;
            const completedSets = slot.completedSets ?? {};
            const hasCompleted = Object.values(completedSets).some(Boolean);
            if (!hasCompleted) continue;

            results.push({
              date: day.completedAt,
              dayTitle: day.title ?? `Day ${di + 1}`,
              weekNumber: wi + 1,
              programTitle: wl.title ?? null,
              setCount: (() => {
                const raw = Array.isArray(slot.sets) ? slot.sets[wi] : slot.sets;
                return parseInt(raw) || 0;
              })(),
              reps: (() => {
                const raw = Array.isArray(slot.reps) ? slot.reps[wi] : slot.reps;
                return raw;
              })(),
              actualWeights: slot.actualWeights ?? {},
              actualReps: slot.actualReps ?? {},
              completedSets,
            });
          }
        }
      }
    }

    // Scan quick_sessions for the same exercise
    const quickSessions = await db.collection("quick_sessions")
      .find({ userId: new ObjectId(req.params.userId) })
      .toArray();

    for (const qs of quickSessions) {
      for (const ex of (qs.exercises ?? [])) {
        if ((ex.name ?? '') !== exercise) continue;
        const completedSets = {};
        const actualWeights = {};
        const actualReps = {};
        (ex.sets ?? []).forEach((s, j) => {
          completedSets[j] = s.done ?? false;
          actualWeights[j] = s.weight ?? 0;
          actualReps[j] = s.reps ?? 0;
        });
        const hasCompleted = Object.values(completedSets).some(Boolean);
        if (!hasCompleted) continue;
        results.push({
          date: qs.date,
          dayTitle: qs.title,
          weekNumber: null,
          programTitle: null,
          setCount: ex.sets?.length ?? 0,
          reps: null,
          actualWeights,
          actualReps,
          completedSets,
        });
      }
    }

    // Sort newest first
    results.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.status(200).json({ history: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching exercise history" });
  }
});

// All-time workout history across every program
router.get("/workout/:userId/all-history", async (req, res) => {
  try {
    const usersCollection = db.collection("users");
    const programLogsCollection = db.collection("program_logs");
    const workoutLogsCollection = db.collection("workout_logs");

    const user = await usersCollection.findOne({ _id: new ObjectId(req.params.userId) });
    if (!user) return res.status(404).json({ message: "User not found" });

    const programLogIds = user.program_log_ids ?? [];
    const programLogs = await programLogsCollection
      .find({ _id: { $in: programLogIds.map(id => new ObjectId(id)) } })
      .toArray();

    const workoutLogIds = programLogs
      .map(p => p.workoutLogId)
      .filter(Boolean)
      .map(id => new ObjectId(id));

    const workoutLogs = await workoutLogsCollection
      .find({ _id: { $in: workoutLogIds } })
      .toArray();

    const sessions = [];
    for (const wl of workoutLogs) {
      for (const [wi, week] of (wl.weeks ?? []).entries()) {
        for (const [di, day] of (week.days ?? []).entries()) {
          if (!day.completed || !day.completedAt) continue;
          const completedSlots = (day.slots ?? [])
            .map(slot => ({
              exercise: slot.exercise ?? slot.label ?? null,
              sets: slot.sets,
              reps: slot.reps,
              actualWeights: slot.actualWeights ?? {},
              actualReps: slot.actualReps ?? {},
              completedSets: slot.completedSets ?? {},
              weightNote: slot.weightNote ?? null,
            }))
            .filter(slot => Object.values(slot.completedSets).some(Boolean));

          if (completedSlots.length === 0) continue;

          sessions.push({
            date: day.completedAt,
            dayTitle: day.title ?? `Day ${di + 1}`,
            weekNumber: wi + 1,
            weekIndex: wi,
            programTitle: wl.title ?? null,
            slots: completedSlots,
          });
        }
      }
    }

    // Merge in quick sessions
    const quickSessions = await db.collection("quick_sessions")
      .find({ userId: new ObjectId(req.params.userId) })
      .toArray();

    for (const qs of quickSessions) {
      sessions.push({
        date: qs.date,
        dayTitle: qs.title,
        weekNumber: null,
        weekIndex: null,
        programTitle: null,
        isQuickSession: true,
        slots: (qs.exercises ?? []).map(ex => ({
          exercise: ex.name,
          sets: ex.sets?.length ?? 0,
          reps: null,
          actualWeights: Object.fromEntries((ex.sets ?? []).map((s, i) => [i, s.weight ?? 0])),
          actualReps: Object.fromEntries((ex.sets ?? []).map((s, i) => [i, s.reps ?? 0])),
          completedSets: Object.fromEntries((ex.sets ?? []).map((s, i) => [i, s.done ?? false])),
          weightNote: null,
        })),
      });
    }

    // Sort oldest-first to compute running PRs chronologically
    sessions.sort((a, b) => new Date(a.date) - new Date(b.date));

    const runningMax = {}; // exercise -> best weight logged so far
    for (const session of sessions) {
      for (const slot of session.slots) {
        const name = slot.exercise;
        if (!name) continue;
        const prev = runningMax[name] ?? 0;
        let sessionBest = 0;
        for (const [j, done] of Object.entries(slot.completedSets)) {
          if (!done) continue;
          const w = Number(slot.actualWeights[j] ?? 0);
          if (w > sessionBest) sessionBest = w;
        }
        if (sessionBest > prev) {
          slot.prHit = true;
          slot.prWeight = sessionBest;
          runningMax[name] = sessionBest;
        } else {
          slot.prHit = false;
          slot.prWeight = null;
        }
      }
    }

    // Sort newest-first for display
    sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.status(200).json({ sessions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching all-time history" });
  }
});

// Save a quick (no-program) workout session
router.post("/quick-sessions", async (req, res) => {
  try {
    const { userId, title, exercises } = req.body;
    if (!userId) return res.status(400).json({ message: "Missing userId" });

    await db.collection("quick_sessions").insertOne({
      userId: new ObjectId(userId),
      title: title || `Quick Workout`,
      date: new Date().toISOString(),
      exercises: exercises ?? [],
    });

    res.status(201).json({ message: "Session saved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error saving session" });
  }
});

// Update a slot's logged weight and notes
router.patch("/workout/log", async (req, res) => {
  try {
    const { userId, weekNum, dayNum, slotIdx, setIdx, actualWeight, actualReps, notes, setDone, cardioTime, cardioIntensity, cardioDistance } = req.body;

    if (!userId || weekNum == null || dayNum == null || slotIdx == null) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
    if (!user?.current_workout_id) {
      return res.status(404).json({ message: "No active workout found" });
    }
    const workoutLogsCollection = db.collection("workout_logs");

    // Check and update personal bests
    let personalBestUpdate = null;
    let exercise = null;
    if (actualWeight !== undefined) {
      // Fetch the exercise name from the workout log
      const workout = await workoutLogsCollection.findOne({ _id: new ObjectId(user.current_workout_id) });
      const exercise = workout?.weeks[weekNum - 1]?.days[dayNum - 1]?.slots[slotIdx]?.exercise;

      if (exercise) {
        personalBestUpdate = await updatePersonalBest(userId, exercise, actualWeight);
      }
      if(personalBestUpdate?.isPersonalBest) console.log("Personal best updated:", personalBestUpdate.previousPersonalBest, "->", personalBestUpdate.newPersonalBest)
    }

    const updateFields = {};
    if (actualWeight !== undefined) {
      updateFields[`weeks.${weekNum - 1}.days.${dayNum - 1}.slots.${slotIdx}.actualWeights.${setIdx}`] = actualWeight;
    }
    if (actualReps !== undefined) {
      updateFields[`weeks.${weekNum - 1}.days.${dayNum - 1}.slots.${slotIdx}.actualReps.${setIdx}`] = actualReps;
    }
    if (notes !== undefined) {
      updateFields[`weeks.${weekNum - 1}.days.${dayNum - 1}.slots.${slotIdx}.notes`] = notes;
    }
    if (setDone !== undefined) {
      updateFields[`weeks.${weekNum - 1}.days.${dayNum - 1}.slots.${slotIdx}.completedSets.${setIdx}`] = setDone;
    }
    if (cardioTime !== undefined) {
      updateFields[`weeks.${weekNum - 1}.days.${dayNum - 1}.slots.${slotIdx}.cardioTimes.${setIdx}`] = cardioTime;
    }
    if (cardioIntensity !== undefined) {
      updateFields[`weeks.${weekNum - 1}.days.${dayNum - 1}.slots.${slotIdx}.cardioIntensities.${setIdx}`] = cardioIntensity;
    }
    if (cardioDistance !== undefined) {
      updateFields[`weeks.${weekNum - 1}.days.${dayNum - 1}.slots.${slotIdx}.cardioDistances.${setIdx}`] = cardioDistance;
    }

    const result = await workoutLogsCollection.updateOne(
      { _id: new ObjectId(user.current_workout_id) },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Workout log not found" });
    }
    // Debug
    console.log("actualWeight received:", req.body.actualWeight, typeof req.body.actualWeight);
    console.log("setIdx received:", req.body.setIdx);

    res.status(200).json({ message: "Log updated" , pbUpdate: personalBestUpdate ? { ...personalBestUpdate, exercise } : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating log" });
  }
});

// Update title of any workout log
router.patch("/workout-log/:workoutLogId/title", async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ message: "Missing title" });

    const result = await db.collection("workout_logs").updateOne(
      { _id: new ObjectId(req.params.workoutLogId) },
      { $set: { title } }
    );

    // Also update the matching program_log title so it stays in sync
    await db.collection("program_logs").updateOne(
      { workoutLogId: new ObjectId(req.params.workoutLogId) },
      { $set: { title } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Workout log not found" });
    }
    res.status(200).json({ message: "Title updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating title" });
  }
});

// Mark a day as complete
router.patch("/workout/complete-day", async (req, res) => {
  try {
    const { userId, weekNum, dayNum } = req.body;
    console.log("complete-day hit:", { userId, weekNum, dayNum }); // ← add this

    if (!userId || weekNum == null || dayNum == null) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const workoutLogsCollection = db.collection("workout_logs");

    const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
    if (!user?.current_workout_id) {
      return res.status(404).json({ message: "No active workout found" });
    }

    const result = await workoutLogsCollection.updateOne(
      { _id: new ObjectId(user.current_workout_id) },
      {
        $set: {
          [`weeks.${weekNum - 1}.days.${dayNum - 1}.completed`]: true,
          [`weeks.${weekNum - 1}.days.${dayNum - 1}.completedAt`]: new Date()
        }
      }
    );

    console.log("matchedCount:", result.matchedCount, "modifiedCount:", result.modifiedCount); // ← and this

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Workout log not found" });
    }
    res.status(200).json({ message: "Day marked complete" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error completing day" });
  }
});


router.patch("/workout/custom-day", async (req, res) => {
  try {
    const { userId, weekNum, dayNum, exercises } = req.body;

    if (!userId || weekNum == null || dayNum == null) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
    if (!user?.current_workout_id) {
      return res.status(404).json({ message: "No active workout found" });
    }

    const result = await db.collection("workout_logs").updateOne(
        { _id: user.current_workout_id },
        { $set: { [`weeks.${weekNum - 1}.days.${dayNum - 1}.exercises`]: exercises } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Workout log not found" });
    }

    res.status(200).json({ message: "Custom day updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating custom day" });
  }
});

router.get("/workout-log/:workoutLogId", async (req, res) => {
  try {
    const workout = await db.collection("workout_logs").findOne({
      _id: new ObjectId(req.params.workoutLogId)
    });
    if (!workout) {
      return res.status(404).json({ message: "Workout log not found" });
    }
    res.status(200).json(workout);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching workout log" });
  }
});

// ─── Custom Workout Routes ────────────────────────────────────────────────────

router.post("/custom-workout", async (req, res) => {
  try {
    const { userId, title, weeks } = req.body;

    if (!userId || !weeks) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const workoutLogsCollection = db.collection("workout_logs");
    const programLogsCollection = db.collection("program_logs");
    const usersCollection = db.collection("users");

    const workoutTitle = title || "Custom Workout";

    const workoutLog = {
      userId: new ObjectId(userId),
      type: "custom",
      title: workoutTitle,
      createdAt: new Date(),
      weeks
    };

    const result = await workoutLogsCollection.insertOne(workoutLog);

    const programLog = {
      userId: new ObjectId(userId),
      type: "custom",
      title: workoutTitle,
      isActive: true,
      createdAt: new Date(),
      workoutLogId: result.insertedId
    };

    const programResult = await programLogsCollection.insertOne(programLog);

    // Deactivate all other programs for this user
    await programLogsCollection.updateMany(
        { userId: new ObjectId(userId), _id: { $ne: programResult.insertedId } },
        { $set: { isActive: false } }
    );

    // Update user: set active workout and push to program_log_ids
    await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        {
          $set: { current_workout_id: result.insertedId },
          $push: { program_log_ids: programResult.insertedId }
        }
    );

    res.status(201).json({ workoutId: result.insertedId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error saving custom workout" });
  }
});

// ─── Edit Workout Log by ID (non-active programs) ─────────────────────────────

// Replace the full weeks structure of any workout log
router.patch("/workout-log/:workoutLogId/weeks", async (req, res) => {
  try {
    const { weeks } = req.body;
    if (!weeks) return res.status(400).json({ message: "Missing weeks" });
    const result = await db.collection("workout_logs").updateOne(
        { _id: new ObjectId(req.params.workoutLogId) },
        { $set: { weeks } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Workout log not found" });
    }
    res.status(200).json({ message: "Weeks updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating weeks" });
  }
});

// Update a slot's exercise in any workout log
router.patch("/workout-log/:workoutLogId/slot-exercise", async (req, res) => {
  try {
    const { weekNum, dayNum, slotIdx, exercise } = req.body;
    if (weekNum == null || dayNum == null || slotIdx == null || !exercise) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const result = await db.collection("workout_logs").updateOne(
        { _id: new ObjectId(req.params.workoutLogId) },
        { $set: { [`weeks.${weekNum - 1}.days.${dayNum - 1}.slots.${slotIdx}.exercise`]: exercise } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Workout log not found" });
    }
    res.status(200).json({ message: "Exercise updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating exercise" });
  }
});

// Update a custom day's exercises in any workout log
router.patch("/workout-log/:workoutLogId/custom-day", async (req, res) => {
  try {
    const { weekNum, dayNum, exercises } = req.body;
    if (weekNum == null || dayNum == null) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const result = await db.collection("workout_logs").updateOne(
        { _id: new ObjectId(req.params.workoutLogId) },
        { $set: { [`weeks.${weekNum - 1}.days.${dayNum - 1}.exercises`]: exercises } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Workout log not found" });
    }
    res.status(200).json({ message: "Custom day updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating custom day" });
  }
});

// ─── Program Log Routes ───────────────────────────────────────────────────────

// Get all programs for a user
router.get("/program-logs/:userId", async (req, res) => {
  try {
    const logs = await db.collection("program_logs")
        .find({ userId: new ObjectId(req.params.userId) })
        .sort({ createdAt: -1 })
        .toArray();

    res.status(200).json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching program logs" });
  }
});

// Deselect the active program
router.patch("/program-logs/deselect", async (req, res) => {
  try {
    const { userId } = req.body;
    const programLogs = db.collection("program_logs");
    const users = db.collection("users");

    await programLogs.updateMany(
      { userId: new ObjectId(userId) },
      { $set: { isActive: false } }
    );

    await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { current_workout_id: null } }
    );

    res.status(200).json({ message: "Active program deselected" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deselecting program" });
  }
});

// Set a program as active
router.patch("/program-logs/set-active", async (req, res) => {
  try {
    const { userId, programLogId } = req.body;
    const programLogs = db.collection("program_logs");
    const users = db.collection("users");

    // Deactivate all programs for this user
    await programLogs.updateMany(
        { userId: new ObjectId(userId) },
        { $set: { isActive: false } }
    );

    // Activate the selected one
    await programLogs.updateOne(
        { _id: new ObjectId(programLogId) },
        { $set: { isActive: true } }
    );

    // Get the workoutLogId from the selected program and update user
    const selectedProgram = await programLogs.findOne({ _id: new ObjectId(programLogId) });

    await users.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { current_workout_id: selectedProgram.workoutLogId } }
    );

    res.status(200).json({ message: "Active program updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error setting active program" });
  }
});

// Delete a program
router.delete("/program-logs/:programLogId", async (req, res) => {
  try {
    const { userId } = req.body;
    const programLogs = db.collection("program_logs");

    const program = await programLogs.findOne({ _id: new ObjectId(req.params.programLogId) });
    if (!program) {
      return res.status(404).json({ message: "Program not found" });
    }

    await programLogs.deleteOne({ _id: new ObjectId(req.params.programLogId) });

    await db.collection("users").updateOne(
        { _id: new ObjectId(userId) },
        { $pull: { program_log_ids: new ObjectId(req.params.programLogId) } }
    );

    res.status(200).json({ message: "Program deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting program" });
  }
});

// ------ User Profile Routes ───────────────────────────────────────────────────────
router.get("/profile/:userId", async (req, res) => {
  try {
    const users = db.collection("users");

    const user = await users.findOne(
      { _id: new ObjectId(req.params.userId) },
      { projection: { password: 0 } } // exclude password
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching user profile" });
  }
});

router.put("/update/:userId", async (req, res) => {
  try {
    const users = db.collection("users");
    const userId = new ObjectId(req.params.userId);
    const existingUser = await users.findOne({ _id: userId });

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const updates = {};
    const changedFields = [];

    if (req.body.firstName !== undefined) {
      updates.firstName = req.body.firstName;
      if (req.body.firstName !== existingUser.firstName) changedFields.push("first name");
    }
    if (req.body.lastName !== undefined) {
      updates.lastName = req.body.lastName;
      if (req.body.lastName !== existingUser.lastName) changedFields.push("last name");
    }
    if (req.body.email !== undefined) {
      const normalizedEmail = normalizeEmail(req.body.email);

      if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({ message: "Please enter a valid email address" });
      }

      if (normalizedEmail !== existingUser.email) {
        const emailInUse = await users.findOne({
          _id: { $ne: userId },
          email: normalizedEmail,
        });

        if (emailInUse) {
          return res.status(400).json({ message: "Email already registered" });
        }

        changedFields.push("email address");
      }

      updates.email = normalizedEmail;
    }
    if (req.body.gender !== undefined) updates.gender = req.body.gender;

    await users.updateOne(
      { _id: userId },
      { $set: updates }
    );

    if (changedFields.length > 0) {
      const updatedFirstName = updates.firstName ?? existingUser.firstName;
      const updatedLastName = updates.lastName ?? existingUser.lastName;
      const updatedEmail = updates.email ?? existingUser.email;
      const changedSummary = formatChangedFields(changedFields);
      const fullName = [updatedFirstName, updatedLastName].filter(Boolean).join(" ").trim();

      try {
        await sendEmail({
          to: updatedEmail,
          subject: "Profile Updated",
          text: `Hi ${updatedFirstName || fullName || "there"},

Your ${changedSummary} ${changedFields.length === 1 ? "was" : "were"} updated successfully.

If you did not make this change, login to the MaxMethod app and update your password.

- MaxMethod`,
        });
      } catch (emailErr) {
        console.error("Profile-update email failed:", emailErr.message);
      }
    }

    res.status(200).json({ message: "User updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating user" });
  }
});

router.put("/change-password/:userId", async (req, res) => {
  try {
    const users = db.collection("users");
    const { currentPassword, newPassword } = req.body;

    const user = await users.findOne({ _id: new ObjectId(req.params.userId) });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Current password incorrect" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await users.updateOne(
      { _id: new ObjectId(req.params.userId) },
      { $set: { password: hashedPassword } }
    );

    try {
      await sendEmail({
        to: user.email,
        subject: "Password Changed",
        text: `Hi ${user.firstName || "there"},

Your MaxMethod password was updated successfully.

If you did not make this change, reset your password immediately.

- MaxMethod`,
      });
    } catch (emailErr) {
      console.error("Password-change email failed:", emailErr.message);
    }

    res.status(200).json({ message: "Password updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating password" });
  }
});

export default router;
