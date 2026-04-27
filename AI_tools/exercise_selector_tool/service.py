"""service.py

Flask HTTP server exposing the exercise selector as a local microservice.
The Node.js backend calls POST /select-exercise during workout generation.

Start with:
    python service.py

Runs on port 5001 by default.  Override with the PORT environment variable.

Dependencies: flask (pip install flask)
"""

import os
from flask import Flask, request, jsonify
from exercise_selector import select_exercise

app = Flask(__name__)


@app.route("/select-exercise", methods=["POST"])
def select_exercise_endpoint():
    data = request.get_json(force=True)

    required = [
        "movement_pattern", "strength_level",
        "exercises_used_this_week", "exercises_used_last_mesocycle",
        "week_number", "mesocycle_number",
    ]
    missing = [k for k in required if k not in data]
    if missing:
        return jsonify({"error": f"Missing fields: {missing}"}), 400

    try:
        exercise = select_exercise(
            movement_pattern=data["movement_pattern"],
            strength_level=data["strength_level"],
            exercises_used_this_week=data["exercises_used_this_week"],
            exercises_used_last_mesocycle=data["exercises_used_last_mesocycle"],
            week_number=int(data["week_number"]),
            mesocycle_number=int(data["mesocycle_number"]),
            is_weight_loss=bool(data.get("is_weight_loss", False)),
        )
        return jsonify({"exercise": exercise})

    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    except FileNotFoundError as exc:
        return jsonify({"error": str(exc)}), 503


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    print(f"Exercise selector service starting on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)
