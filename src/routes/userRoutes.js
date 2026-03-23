import express from "express";
import bcrypt from "bcrypt";
import { ObjectId } from "mongodb";
import db from "../config/database.js";
import { classification } from "../controllers/userController.js";

const router = express.Router();
const saltRounds = 10;

const movementPatterns = {
  "Horizontal Push": ["Bench Press", "Incline Bench Press", "Decline Bench Press", "Floor Press"],
  "Vertical Push": ["Military Press", "Seated Military Press", "Push Press"],
  "Unilateral Push": ["DB Incline Bench", "DB Flat Bench", "DB Shoulder Press", "Arnold Press", "DB Floor Press"],
  "Tricep Accessory": ["Dips", "Skullcrushers", "Tricep Pushdowns", "Tricep Extensions", "Dip Machine", "Overhead Tricep Extensions", "One Arm Extensions", "Close Grip Bench Press"],
  "Shoulder Accessory": ["Front Raises", "Lateral Raises", "Cable Lateral Raises", "Upright Rows", "Face Pulls", "Band Pull Aparts"],
  "Chest Accessory": ["Chest Fly Machine", "DB Chest Flys", "Pushups", "Weighted Pushups", "Floor Chest Flys", "Incline Chest Flys", "Cable Chest Flys", "Low to High Cable Flys"],
  "Push Machine": ["Chest Press Machine", "Shoulder Press Machine", "Decline Press Machine", "Incline Press Machine"],
  "Vertical Pull": ["Neutral Grip Pullups", "Pullups", "Chin Ups", "Lat Pulldowns", "Close Grip Lat Pulldowns", "Wide Grip Lat Pulldowns", "Single Arm Pulldowns"],
  "Vertical Pull Cable Only": ["Lat Pulldowns", "Close Grip Lat Pulldowns", "Wide Grip Lat Pulldowns", "Single Arm Pulldowns"],
  "Horizontal Pull": ["Barbell Row", "Underhand Barbell Row", "Cable Row", "T Bar Rows", "Single Arm Cable Rows", "Single Arm Dumbbell Rows", "Chest Supported Row", "Meadows Row", "Seal Row", "Pendlay Row"],
  "Posterior Upper Accessory": ["Scarecrows", "Rear Delt Flys", "Machine Rear Delt Flys", "Pullovers", "Cable Pullovers", "Shrugs", "DB Shrugs", "Trap Bar Shrugs", "YTWLs"],
  "Bicep Accessory": ["DB Curls", "Barbell Curls", "Ez Bar Curls", "Hammer Curls", "Preacher Curls", "Cable Curls", "Rope Curls", "Incline DB Curls", "Concentration Curls", "Cross Body Hammer Curls"],
  "Hinge": ["Hip Thrusts", "RDLs", "Trap Bar Deadlifts", "Barbell Glute Bridges", "Single Leg RDLs", "Sumo Deadlift", "Good Mornings"],
  "Squat Pattern": ["Front Squat", "SSB Squats", "Hack Squat Machine", "Pendulum Squat", "Leg Press", "Goblet Squat", "Zercher Squat"],
  "Posterior Chain Accessory": ["Back Extensions", "Nordics", "Reverse Hypers", "GHD Raises", "Single Leg Hip Thrusts"],
  "Unilateral Lower": ["Bulgarians", "Walking Lunges", "ATG Lunges", "Reverse Lunges", "Step Ups"],
  "Isolation Lower": ["Leg Extensions", "Single Leg Extensions", "Seated Leg Curls", "Lying Leg Curls", "Abductor Machine", "Adductor Machine"],
  "Calves & Shins": ["Single Leg Calf Raises", "Calf Raise Machine", "Seated Calf Raises", "Bodyweight Calf Raises", "Weighted Calf Raises", "Donkey Calf Raises", "Tibia Raises", "Tibia Curls", "Banded Tibia Curls"],
  "Machine Lower": ["Leg Press", "Hack Squat", "Pendulum Squat", "Reverse Hack Squat"],
  "Core": ["Plank", "Ab Wheel Rollouts", "Hanging Leg Raises", "Cable Crunches", "Decline Crunches", "Pallof Press", "Dead Bugs", "Suitcase Carries", "Farmer Carries"]
};


async function updatePersonalBest(userId, exercise, actualWeight) {
  const usersCollection = db.collection("users");
  const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

  if (!user) {
    return null
  }

  const currentPersonalBests = user.current_one_rep_maxes[exercise] ?? {};
  const currentPersonalBest = currentPersonalBests[exercise] ?? 0;

  if (actualWeight > currentPersonalBest) {
    await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { [`current_one_rep_maxes.${exercise}.${exercise}`]: actualWeight }}
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
      current_workout_id: null
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

// Login
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
        current_workout_id: user.current_workout_id
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

    // Find matching template
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
    const WEEKS = templates[0].weeks ?? templates[0].totalWeeks ?? templates[0].numWeeks ?? 4;

    // Build the full weeks structure with resolved exercises
    const weeks = Array.from({ length: WEEKS }, (_, wi) => ({
      weekNum: wi + 1,
      days: templateDays.map((day, di) => ({
        dayNum: di + 1,
        title: day.title ?? `Day ${di + 1}`,
        completed: false,
        completedAt: null,
        slots: day.slots.map((slot, si) => {

          // Resolve exercise name:
          // - If slot.fixed is a non-empty string, use it directly
          // - Otherwise look up movementPatterns using slot.pattern first,
          //   then slot.label as fallback
          const patternKey = slot.pattern ?? slot.label;
          const options = movementPatterns[patternKey];
          const exercise = typeof slot.fixed === 'string' && slot.fixed
            ? slot.fixed
            : options?.[Math.floor(Math.random() * options.length)] ?? patternKey;

          // Resolve sets/reps/weightNote:
          // Progression-based slots (main lifts) store these per week
          // inside a progression array. Accessory slots have them at top level.
          const hasProgression = Array.isArray(slot.progression) && slot.progression.length > 0;

          return {
            slotIdx: si,
            label: slot.label ?? null,
            fixed: typeof slot.fixed === 'string' ? slot.fixed : false,
            exercise,
            // For progression slots, store per-week values as arrays
            // For accessory slots, store as plain values
            sets: hasProgression
              ? slot.progression.map(p => p.sets)
              : (slot.sets ?? null),
            reps: hasProgression
              ? slot.progression.map(p => p.reps)
              : (slot.reps ?? null),
            weightNote: hasProgression
              ? slot.progression.map(p => p.weightNote)
              : (slot.weightNote ?? null),
            // Keep full progression data for future reference
            progression: hasProgression ? slot.progression : null,
            projectedWeight: null,
            actualWeight: null,
            notes: ""
          };
        })
      }))
    }));

    // Save to workout_logs
    const workoutLog = {
      userId: new ObjectId(userId),
      classification,
      daysPerWeek: Number(daysPerWeek),
      goalSelection,
      createdAt: new Date(),
      weeks
    };

    const result = await workoutLogsCollection.insertOne(workoutLog);

    // Link workout to user and mark onboarding complete
    await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          current_workout_id: result.insertedId,
          onboarding_complete: true
        }
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

// Get current workout for a user
router.get("/workout/:userId", async (req, res) => {
  try {
    const usersCollection = db.collection("users");
    const workoutLogsCollection = db.collection("workout_logs");

    const user = await usersCollection.findOne({ _id: new ObjectId(req.params.userId) });
    if (!user?.current_workout_id) {
      return res.status(404).json({ message: "No workout found for this user" });
    }

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

router.get("/workout/:userId/personal-bests", async (req, res) => {

})

// Update a slot's logged weight and notes
router.patch("/workout/log", async (req, res) => {
  try {
    const { userId, weekNum, dayNum, slotIdx, actualWeight, notes } = req.body;

    if (!userId || weekNum == null || dayNum == null || slotIdx == null) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const workoutLogsCollection = db.collection("workout_logs");

    // Check and update personal bests
    let personalBestUpdate = null;
    if (actualWeight !== undefined) {
      // Fetch the exercise name from the workout log
      const workout = await workoutLogsCollection.findOne({ _id: new ObjectId(userId) });
      const exercise = workout?.weeks[weekNum - 1]?.days[dayNum - 1]?.slots[slotIdx]?.exercise;

      if (exercise) {
        personalBestUpdate = await updatePersonalBest(userId, exercise, actualWeight);
      }
    }

    const updateFields = {};
    if (actualWeight !== undefined) {
      updateFields[`weeks.${weekNum - 1}.days.${dayNum - 1}.slots.${slotIdx}.actualWeight`] = actualWeight;
    }
    if (notes !== undefined) {
      updateFields[`weeks.${weekNum - 1}.days.${dayNum - 1}.slots.${slotIdx}.notes`] = notes;
    }

    const result = await workoutLogsCollection.updateOne(
      { userId: new ObjectId(userId) },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Workout log not found" });
    }

    res.status(200).json({ message: "Log updated" , pbUpdate: personalBestUpdate});
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating log" });
  }
});

// Mark a day as complete
router.patch("/workout/complete-day", async (req, res) => {
  try {
    const { userId, weekNum, dayNum } = req.body;

    if (!userId || weekNum == null || dayNum == null) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const workoutLogsCollection = db.collection("workout_logs");

    const result = await workoutLogsCollection.updateOne(
      { userId: new ObjectId(userId) },
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
    const updates = {}

    if (req.body.firstName !== undefined) updates.firstName = req.body.firstName
    if (req.body.lastName !== undefined) updates.lastName = req.body.lastName
    if (req.body.email !== undefined) updates.email = req.body.email
    if (req.body.gender !== undefined) updates.gender = req.body.gender

    await users.updateOne(
      { _id: new ObjectId(req.params.userId) },
      { $set: updates }
    )

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