# MaxMethod Backend

The backend that powers the MaxMethod fitness app. It generates personalized
strength/hypertrophy/weight-loss programs, tracks workout logs, and exposes the
REST API consumed by the React client.

The system is split into two layers:

1. **Node.js API** (`server.js` + `src/`) — Express/MongoDB service that owns
   user data, programs, and workout logs.
2. **Python AI microservices** (`AI_tools/`) — two Flask apps the Node API calls
   during program generation: an exercise selector and a working-weight
   predictor.

---

## Stack

| Layer            | Tech                                                  |
| ---------------- | ----------------------------------------------------- |
| API              | Node.js (ES modules), Express 5                       |
| Database         | MongoDB (`mongodb` driver, `Maxmethod_db`)            |
| Auth             | bcrypt + email/password (no JWT yet)                  |
| Email            | Nodemailer                                            |
| AI services      | Python 3, Flask, gunicorn                             |
| Exercise model   | scikit-learn                                          |
| Weight model     | XGBoost                                               |

---

## Repository layout

```
Backend_structure/
├── server.js                  # Express entry point
├── package.json
├── prisma/                    # legacy schema (Mongo is the live store)
├── src/
│   ├── config/database.js     # Mongo client + DB handle
│   ├── routes/userRoutes.js   # all /api/users/* endpoints
│   ├── controllers/           # classification, auth, etc.
│   ├── middleware/            # auth, validate, rateLimiter, errorHandler
│   ├── models/users.js
│   └── utils/
│       ├── exerciseSelector.js     # HTTP client → exercise_selector_tool
│       ├── weightPredictor.js      # HTTP client → weight_picker_tool
│       ├── cardioSelector.js       # rules-based cardio picker (weight-loss)
│       ├── cardioAssignmentHistory.js
│       ├── cardioMachineMetadata.js
│       ├── userWeightHistory.js    # per-user weight correction map
│       ├── sendEmail.js
│       └── ...
└── AI_tools/
    ├── exercise_selector_tool/     # Flask app on :5001
    └── weight_picker_tool/         # Flask app on :5002
```

---

## How program generation works

`POST /api/users/goals` is the heart of the backend. Given a user's
classification, days/week, and goal, it:

1. Looks up a matching template in `workout_templates`
   (tagged by classification, focus, days/week).
2. For every non-fixed slot in every week, calls the Python **exercise
   selector** to pick a movement based on the user's history and mesocycle.
3. For non-bodyweight slots, calls the Python **weight predictor** to project
   working weights from the user's 1RMs (squat/bench/deadlift), then applies a
   per-user correction factor built from logged history
   (`userWeightHistory.js`).
4. For weight-loss templates, replaces cardio AI calls with the rules-based
   `cardioSelector` to balance machine variety across the week.
5. Persists the resolved program to `workout_logs`, registers it in
   `program_logs`, and links it to the user as `current_workout_id`.

If either Python service is unreachable, the Node helpers fall back gracefully
(random pick / null weight) so generation never hard-fails.

---

## MongoDB collections

| Collection           | Purpose                                                |
| -------------------- | ------------------------------------------------------ |
| `users`              | Profiles, 1RMs, personal bests, custom exercises       |
| `workout_templates`  | Source-of-truth program templates (tagged for lookup)  |
| `workout_logs`       | Resolved programs (weeks → days → slots)               |
| `program_logs`       | One row per program a user has generated/customized    |
| `quick_sessions`     | Ad-hoc no-program workouts                             |
| `library_videos`     | `exercise_name` → `mux_playback_id` for video lookup   |

---

## Running locally

### 1. Environment

Create `.env` in `Backend_structure/`:

```
MONGODB_URI=mongodb+srv://...
PORT=5050
EXERCISE_SELECTOR_URL=http://localhost:5001
WEIGHT_PREDICTOR_URL=http://localhost:5002
# email config used by sendEmail.js, e.g. SMTP_HOST / SMTP_USER / SMTP_PASS
```

### 2. Node API

```bash
npm install
npm run dev          # nodemon
# or
npm start            # node server
```

The server listens on `PORT` (default 5050) and mounts routes at
`/api/users/*`. CORS is open to the local Vite dev server
(`http://localhost:5173`) and the production domains.

### 3. Python AI services

Each tool is a standalone Flask app with its own `requirements.txt`.

```bash
# Exercise selector — port 5001
cd AI_tools/exercise_selector_tool
pip install -r requirements.txt
python service.py

# Weight predictor — port 5002
cd AI_tools/weight_picker_tool
pip install -r requirements.txt
python service.py
```

Override the port with `PORT=...`. Both services include a `Procfile` for
gunicorn-based deploys.

---

## REST API surface

All routes are mounted under `/api/users`. Selected endpoints:

### Auth & profile
- `POST /create-account`
- `POST /login`
- `GET  /profile/:userId`
- `PUT  /update/:userId`
- `PUT  /change-password/:userId`

### Onboarding
- `POST /classification` — compute strength classification from 1RMs/bodyweight
- `POST /goals` — generate a full program (see flow above)

### Workouts
- `GET   /workout/:userId` — current active workout
- `GET   /workout-log/:workoutLogId`
- `PATCH /workout/log` — log set weight/reps/notes/cardio
- `PATCH /workout/complete-day`
- `POST  /workout/pb-check`
- `GET   /workout/:userId/personal-bests`
- `GET   /workout/:userId/exercise-history?exercise=...`
- `GET   /workout/:userId/all-history`

### Custom workouts & programs
- `POST   /custom-workout`
- `POST   /quick-sessions`
- `GET    /program-logs/:userId`
- `PATCH  /program-logs/set-active`
- `PATCH  /program-logs/deselect`
- `DELETE /program-logs/:programLogId`
- `PATCH  /workout-log/:workoutLogId/weeks`
- `PATCH  /workout-log/:workoutLogId/swap-exercise-all-weeks`
- `PATCH  /workout-log/:workoutLogId/slot-exercise`
- `PATCH  /workout-log/:workoutLogId/title`

### Custom exercises
- `GET    /:userId/custom-exercises`
- `POST   /:userId/custom-exercises`
- `DELETE /:userId/custom-exercises/:name`

### Library
- `GET /library-videos`
- `GET /debug-templates` — dev helper, lists all template tags
