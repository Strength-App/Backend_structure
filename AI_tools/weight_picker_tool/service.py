"""service.py

Flask HTTP server exposing the weight predictor as a local microservice.
The Node.js backend calls POST /predict-weight during workout generation.

Start with:
    python service.py

Runs on port 5002 by default.  Override with the PORT environment variable.

Dependencies: flask (pip install flask)
The weight predictor dependencies must also be installed:
    pip install xgboost scikit-learn pandas numpy joblib optuna
"""

import os
from flask import Flask, request, jsonify
from weight_predictor import predict_weight

app = Flask(__name__)


@app.route("/predict-weight", methods=["POST"])
def predict_weight_endpoint():
    data = request.get_json(force=True)

    required = [
        "exercise_name", "movement_pattern", "strength_level",
        "squat_1rm", "bench_1rm", "deadlift_1rm",
        "target_rep_range", "week_number", "mesocycle_number",
    ]
    missing = [k for k in required if k not in data]
    if missing:
        return jsonify({"error": f"Missing fields: {missing}"}), 400

    try:
        # target_rep_range may arrive as "5-8" or "12"; take the lower bound
        raw_reps = str(data["target_rep_range"]).split("-")[0]
        weight = predict_weight(
            exercise_name=data["exercise_name"],
            movement_pattern=data["movement_pattern"],
            strength_level=data["strength_level"],
            squat_1rm=float(data["squat_1rm"]),
            bench_1rm=float(data["bench_1rm"]),
            deadlift_1rm=float(data["deadlift_1rm"]),
            target_rep_range=int(raw_reps),
            week_number=int(data["week_number"]),
            mesocycle_number=int(data["mesocycle_number"]),
            percentage_override=data.get("percentage_override"),
            override_reference_1rm=data.get("override_reference_1rm"),
        )
        return jsonify({"weight": weight})

    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    except FileNotFoundError as exc:
        return jsonify({"error": str(exc)}), 503


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5002))
    print(f"Weight predictor service starting on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)
