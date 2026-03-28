import express from "express";
import bcrypt from "bcrypt";
import { ObjectId } from "mongodb";
import db from "../config/database.js";
import { classification } from "../controllers/userController.js";
import { selectExercise, extractExercisesByPattern, BODYWEIGHT_EXERCISES, BARBELL_EXERCISES } from "../utils/exerciseSelector.js";
import { predictWeight } from "../utils/weightPredictor.js";
import { buildWeightCorrectionMap, getCorrectionFactor, applyWeightCorrection, buildExerciseMaxMap } from "../utils/userWeightHistory.js";

const router = express.Router();
const saltRounds = 10;

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
    return resolved.every(r => typeof r === "number") ? resolved : note;
  }
  return convert(note ?? null);
}

// ─── Auth Routes ─────────────────────────────────────────────────────────────

router.post("/create-account", async (req, res) => {
  try {
    const collection = db.collection("users");
    const { firstName, lastName, email, password } = req.body;

    const existingUser = await collection.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = {
      firstName,
      lastName,
      email,
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
      program_log_ids: []
    };

    const result = await collection.insertOne(newUser);

    res.status(201).json({
      _id: result.insertedId,
      firstName,
      lastName,
      email
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating account" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const collection = db.collection("users");
    const { email, password } = req.body;

    const user = await collection.findOne({ email });
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
        program_log_ids: user.program_log_ids ?? []
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Login error" });
  }
});

// ─── Onboarding Routes ────────────────────────────────────────────────────────

router.post("/classification", classification);

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

    const templates = await templateCollection.find({
      "tags.classification": classification.toLowerCase(),
      "tags.focus": goalSelection,
      "tags.daysPerWeek": Number(daysPerWeek)
    }).toArray();

    console.log("Templates found:", templates.length);
    console.log("First match title:", templates[0]?.title);
    console.log("Query params:", classification.toLowerCase(), goalSelection, Number(daysPerWeek));

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

    // Build weeks using the AI selector for each non-fixed slot
    const weeks = [];
    for (let wi = 0; wi < WEEKS; wi++) {
      const weekNum = wi + 1;
      // Track exercises assigned so far this week per pattern (Rule 1: no weekly repeat)
      const usedThisWeek = {};

      const days = [];
      for (let di = 0; di < templateDays.length; di++) {
        const day = templateDays[di];
        const slots = [];

        for (let si = 0; si < day.slots.length; si++) {
          const slot = day.slots[si];
          const patternKey = slot.pattern ?? slot.label;
          const hasProgression = Array.isArray(slot.progression) && slot.progression.length > 0;

          let exercise;
          if (typeof slot.fixed === 'string' && slot.fixed) {
            exercise = slot.fixed;
          } else {
            exercise = await selectExercise(
              patternKey,
              strengthLevel,
              usedThisWeek[patternKey] ?? [],
              lastMesoExercises[patternKey] ?? [],
              weekNum,
              mesocycleNumber
            );
            if (!usedThisWeek[patternKey]) usedThisWeek[patternKey] = [];
            usedThisWeek[patternKey].push(exercise);
          }

          // Determine target reps for this specific week for weight prediction
          const weekReps = hasProgression
            ? slot.progression[wi]?.reps
            : slot.reps;
          const targetReps = Array.isArray(weekReps) ? weekReps[0] : weekReps;

          // Resolve reference 1RM for percentage-based weightNotes
          const percentRefKey = PERCENT_REF_1RM[patternKey];
          const percentRef1rm = percentRefKey === "bench" ? bench1rm
            : percentRefKey === "squat" ? squat1rm
            : percentRefKey === "deadlift" ? deadlift1rm
            : null;
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
            const NA_EXERCISES = new Set(["Banded Tibia Raises", "Banded Tibia Curls"]);
            projectedWeight = NA_EXERCISES.has(exercise) ? "N/A" : "BW";
          } else if (typeof weekResolvedNote === "number") {
            // weightNote was a percentage string — use the resolved lb value directly
            projectedWeight = weekResolvedNote;
          } else if (slot.percent != null && exerciseMaxMap[exercise] != null) {
            // slot.percent field — apply to user's logged exercise max
            const raw = exerciseMaxMap[exercise] * slot.percent;
            const floor = isBarbell ? 45 : 5;
            projectedWeight = Math.max(floor, Math.round(raw / 5) * 5);
          } else if (typeof weekResolvedNote === "string" && weekResolvedNote.includes("%")) {
            // Per-set percentage weights live in weightNote — client resolves them individually.
            // Do not overwrite with a single AI prediction.
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
            notes: ""
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

    const workoutLog = {
      userId: new ObjectId(userId),
      classification,
      daysPerWeek: Number(daysPerWeek),
      goalSelection,
      createdAt: new Date(),
      weeks
    };

    const result = await workoutLogsCollection.insertOne(workoutLog);

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

    // Update user: set active workout, mark onboarding complete, push to program_log_ids
    await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          current_workout_id: result.insertedId,
          onboarding_complete: true
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

// ─── Workout Routes ───────────────────────────────────────────────────────────

router.get("/workout/:userId", async (req, res) => {
  try {
    const usersCollection = db.collection("users");
    const workoutLogsCollection = db.collection("workout_logs");

    const user = await usersCollection.findOne({ _id: new ObjectId(req.params.userId) });
    if (!user?.current_workout_id) {
      return res.status(404).json({ message: "No workout found for this user" });
    }

    // Fix: fetch by the specific workout ID, not just any workout for this user
    const workout = await workoutLogsCollection.findOne({ _id: user.current_workout_id });

    if (!workout) {
      return res.status(404).json({ message: "Workout log not found" });
    }

    res.status(200).json(workout);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching workout" });
  }
});

router.patch("/workout/log", async (req, res) => {
  try {
    const { userId, weekNum, dayNum, slotIdx, actualWeight, notes } = req.body;

    if (!userId || weekNum == null || dayNum == null || slotIdx == null) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
    if (!user?.current_workout_id) {
      return res.status(404).json({ message: "No active workout found" });
    }

    const updateFields = {};
    if (actualWeight !== undefined) {
      updateFields[`weeks.${weekNum - 1}.days.${dayNum - 1}.slots.${slotIdx}.actualWeight`] = actualWeight;
    }
    if (notes !== undefined) {
      updateFields[`weeks.${weekNum - 1}.days.${dayNum - 1}.slots.${slotIdx}.notes`] = notes;
    }

    const result = await db.collection("workout_logs").updateOne(
      { _id: user.current_workout_id },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Workout log not found" });
    }

    res.status(200).json({ message: "Log updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating log" });
  }
});

router.patch("/workout/complete-day", async (req, res) => {
  try {
    const { userId, weekNum, dayNum } = req.body;

    if (!userId || weekNum == null || dayNum == null) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
    if (!user?.current_workout_id) {
      return res.status(404).json({ message: "No active workout found" });
    }

    const result = await db.collection("workout_logs").updateOne(
      { _id: user.current_workout_id },
      {
        $set: {
          [`weeks.${weekNum - 1}.days.${dayNum - 1}.completed`]: true,
          [`weeks.${weekNum - 1}.days.${dayNum - 1}.completedAt`]: new Date()
        }
      }
    );

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

// ─── Workout Log by ID ────────────────────────────────────────────────────────

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

// ─── User Profile Routes ──────────────────────────────────────────────────────

router.get("/profile/:userId", async (req, res) => {
  try {
    const users = db.collection("users");

    const user = await users.findOne(
      { _id: new ObjectId(req.params.userId) },
      { projection: { password: 0 } }
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
    const updates = {};

    if (req.body.firstName !== undefined) updates.firstName = req.body.firstName;
    if (req.body.lastName !== undefined) updates.lastName = req.body.lastName;
    if (req.body.email !== undefined) updates.email = req.body.email;
    if (req.body.gender !== undefined) updates.gender = req.body.gender;

    await users.updateOne(
      { _id: new ObjectId(req.params.userId) },
      { $set: updates }
    );

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

    res.status(200).json({ message: "Password updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating password" });
  }
});

export default router;