from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import pandas as pd

app = Flask(__name__)
CORS(app)

# Load your trained model
model = joblib.load("landslide_model2.pkl")


@app.route("/")
def home():
    return jsonify({
        "message": "SIH AI Prediction API is running"
    })


@app.route("/predict", methods=["POST"])
def predict():

    try:

        data = request.get_json()

        features = [
            "latitude",
            "longitude",
            "rainfall_total_mm",
            "slope_degrees",
            "elevation_m"
        ]

        if not isinstance(data, dict):
            raise ValueError("Request body must be a JSON object.")

        missing = [feature for feature in features if feature not in data]
        if missing:
            raise ValueError("Missing required fields: " + ", ".join(missing))

        # Convert received data into a DataFrame
        input_data = pd.DataFrame([data])[features]

        # Make prediction
        prediction = model.predict(input_data)

        # Get probability if model supports it
        probability = None

        if hasattr(model, "predict_proba"):
            probability = float(
                model.predict_proba(input_data)[0][1]
            )

        return jsonify({
            "success": True,
            "prediction": int(prediction[0]),
            "risk_probability": probability
        })

    except Exception as e:

        return jsonify({
            "success": False,
            "error": str(e)
        }), 400

@app.route("/map-data", methods=["GET"])
def map_data():

    try:
        # Read the original dataset
        data = pd.read_csv("original_data.csv")

        # These must match the features used to train the model
        features = [
            "latitude",
            "longitude",
            "rainfall_total_mm",
            "slope_degrees",
            "elevation_m"
        ]

        # Give all rows to the model
        X = data[features]

        predictions = model.predict(X)

        # Get prediction probabilities
        probabilities = None

        if hasattr(model, "predict_proba"):
            probabilities = model.predict_proba(X)

        results = []

        # Create map data for every row
        for i, row in data.iterrows():

            prediction = int(predictions[i])

            # Default probability
            risk_probability = None

            if probabilities is not None:
                risk_probability = float(probabilities[i][1])

            results.append({
                "id": int(i),

                "place": str(row["place"]),

                # Leaflet coordinates
                "lat": float(row["latitude"]),
                "lng": float(row["longitude"]),

                # Model output
                "prediction": prediction,
                "risk_probability": risk_probability,

                # Original environmental data
                "rainfall_total_mm": float(
                    row["rainfall_total_mm"]
                ),
                "slope_degrees": float(
                    row["slope_degrees"]
                ),
                "elevation_m": float(
                    row["elevation_m"]
                )
            })

        return jsonify({
            "success": True,
            "count": len(results),
            "locations": results
        })

    except Exception as e:

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500
import os

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))

    app.run(
        host="0.0.0.0",
        port=port,
        debug=False
    )