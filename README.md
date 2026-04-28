# MaxMethod — Backend

Express.js REST API powering the MaxMethod training platform. Handles user auth, workout program generation, exercise selection, weight prediction, cardio assignment, and progress tracking — backed by MongoDB Atlas.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express 5 |
| Database | MongoDB Atlas (Mongoose 9) |
| Auth | bcrypt (password hashing) |
| Email | Nodemailer + Gmail SMTP |
| AI Tools | Python (Random Forest, XGBoost) |

---

## Getting Started

```bash
npm install
npm run dev    # nodemon, hot reload — runs on port 5050
npm start      # production
```

### Environment Variables

Create a `.env` file in the project root:

```env
MONGO_URI=<your MongoDB Atlas connection string>
PORT=5050
EMAIL_USER=<gmail address>
EMAIL_PASS=<gmail app password>
```

---

## Project Structure

```
Backend_structure/
├── server.js              # Entry point — Express setup, CORS, route mounting
├── src/
│   ├── config/
│   │   └── database.js    # MongoDB connection
│   ├── controllers/
│   │   └── userController.js   # Strength classification logic
│   ├── routes/
│   │   └── userRoutes.js  # All API endpoints (main file)
│   └── utils/
│       ├── exerciseSelector.js        # Rules-based exercise selection
│       ├── weightPredictor.js         # Working weight prediction
│       ├── userWeightHistory.js       # Per-user weight adjustment history
│       ├── cardioSelector.js          # Rules-based cardio machine selection
│       ├── cardioMachineMetadata.js   # Cardio machine data + fatigue maps
│       ├── cardioAssignmentHistory.js # Anti-repetition tracking for cardio
│       └── sendEmail.js               # Email notification helper
└── AI_tools/
    ├── exercise_selector_tool/        # Random Forest exercise selection (Python)
    └── weight_picker_tool/            # XGBoost weight prediction (Python)
```

---

## API Endpoints

All routes are mounted at `/api/users`.

### Auth & Profile

| Method | Route | Description |
|---|---|---|
| `POST` | `/create-account` | Register new user |
| `POST` | `/login` | Login |
| `GET` | `/profile/:userId` | Get user profile |
| `PUT` | `/update/:userId` | Update user profile |
| `PUT` | `/change-password/:userId` | Change password |

### Assessment

| Method | Route | Description |
|---|---|---|
| `POST` | `/classification` | Calculate strength level (Beginner → Elite) |
| `POST` | `/goals` | Set user fitness goals |

### Programs & Workout Logs

| Method | Route | Description |
|---|---|---|
| `GET` | `/workout/:userId` | Get active workout program |
| `GET` | `/workout-log/:workoutLogId` | Get a specific workout log |
| `GET` | `/program-logs/:userId` | Get all of a user's program history |
| `POST` | `/custom-workout` | Create a custom workout |
| `PATCH` | `/workout/complete-day` | Mark a day complete |
| `PATCH` | `/workout/custom-day` | Update a custom workout day |
| `PATCH` | `/workout/log` | Log exercise performance (sets/reps/weight) |
| `PATCH` | `/workout-log/:workoutLogId/title` | Rename a workout log |
| `PATCH` | `/workout-log/:workoutLogId/weeks` | Modify program weeks |
| `PATCH` | `/workout-log/:workoutLogId/swap-exercise-all-weeks` | Swap an exercise across all weeks |
| `PATCH` | `/workout-log/:workoutLogId/slot-exercise` | Replace exercise in a specific slot |
| `PATCH` | `/program-logs/set-active` | Set a program as active |
| `PATCH` | `/program-logs/deselect` | Deselect the active program |
| `DELETE` | `/program-logs/:programLogId` | Delete a program |

### Exercises & History

| Method | Route | Description |
|---|---|---|
| `GET` | `/:userId/custom-exercises` | List user's custom exercises |
| `POST` | `/:userId/custom-exercises` | Add a custom exercise |
| `DELETE` | `/:userId/custom-exercises/:name` | Remove a custom exercise |
| `GET` | `/workout/:userId/exercise-history` | Exercise performance history |
| `GET` | `/workout/:userId/all-history` | Complete workout history |
| `GET` | `/workout/:userId/personal-bests` | Personal records |
| `GET` | `/quick-sessions` | Quick session logs |

---

## Core Logic

### Strength Classification (`userController.js`)
Classifies users as Beginner, Novice, Intermediate, Advanced, or Elite using gender-specific and bodyweight-relative thresholds applied to their bench + squat + deadlift total.

### Exercise Selection (`utils/exerciseSelector.js`)
Rules-based selector that enforces:
- No weekly exercise repetition
- No mesocycle variation repeats
- Strength-level gating (some exercises locked until user reaches a threshold)

### Weight Prediction (`utils/weightPredictor.js`)
Two-stage prediction:
1. Percentage-based override gate (e.g. "75% of 1RM")
2. Model-based inference for other prescriptions

### Cardio Selector (`utils/cardioSelector.js`)
Rules-based cardio machine assignment with two stages:
1. Hard filters — skill floor, injury flags, HIIT vs steady-state, slot role (warmup / cooldown / workset / interspersed)
2. Weighted scoring — fatigue mapping based on the main lift of the day

Anti-repetition tracking prevents the same machine from being assigned within 5 sessions.

---

## AI Tools (Python)

These are standalone Python services called by the Node.js backend.

### Exercise Selector Tool (`AI_tools/exercise_selector_tool/`)
- Random Forest classifier trained on ~2,000 synthetic samples per movement pattern
- Covers all major movement patterns: horizontal/vertical push, pull, squat, hinge, unilateral, accessories, core
- Hard constraint rules enforced at inference time (weekly repetition, mesocycle variation, strength-level gating)
- Key files: `exercise_model.py` (training), `exercise_selector.py` (inference), `variation_families.py` (constraint definitions)

### Weight Picker Tool (`AI_tools/weight_picker_tool/`)
- XGBoost model tuned with Optuna (40 trials)
- Trained on synthetic data + real training data (weighted 3x)
- Minimum floor validation: 45 lbs for barbells, 5 lbs for dumbbells
- Key files: `weight_model.py` (training), `weight_predictor.py` (inference)

---

## Database

MongoDB Atlas — database name: `Maxmethod_db`

Main collections:
- `users` — profiles, strength metrics, custom exercises
- `cardio_assignment_history` — recent cardio machine assignments for anti-repetition
- Workout logs and program logs stored per user
