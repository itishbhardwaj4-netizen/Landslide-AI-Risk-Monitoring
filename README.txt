LANDSAFE NER
============

LANDSAFE NER is a simple landslide-risk demonstration for Northeast India.
It shows how a trained machine-learning model can turn environmental data
into a risk flag on a map.

What happens in this project?
-----------------------------

1. Flask reads the locations and environmental values in
   backend/original_data.csv.
2. The trained model in backend/landslide_model2.pkl predicts the landslide
   risk for every row.
3. The website receives those results and shows every location on a Leaflet
   map with a risk colour and score.

Risk colours
------------

Green  = Low risk
Amber  = Moderate risk
Orange = High risk
Red    = Critical risk

How to run the demo
-------------------

You need two things running: the Flask backend and the website frontend.

Step 1: Start the Flask backend

Open a terminal in the project folder and run:

  cd backend
  venv/bin/python app.py

You should see Flask running on:

  http://127.0.0.1:5001

Opening that address in a browser should show:

  "SIH AI Prediction API is running"

Step 2: Start the website

In VS Code, open index.html and click "Go Live".
Live Server usually opens the website at:

  http://127.0.0.1:5500

For local development, keep the Flask terminal open while using the website.
The deployed frontend uses the Render API at:

  https://landslide-ai-risk-monitoring.onrender.com

Deploy the frontend on Render
-----------------------------

This project includes render.yaml for a Render Static Site. It publishes only
the website files (index.html, style.css, and script.js), so the model and CSV
are not exposed by the frontend deployment.

1. Push the latest project changes to GitHub.
2. In Render, choose New > Static Site and select this repository.
3. Render will detect render.yaml. Create the service named
   landsafe-ner-frontend and deploy it.
4. Open the generated frontend URL. It will fetch predictions from the
   deployed Flask API automatically.

How to use the website during the demo
--------------------------------------

- Command Center: shows the map, total locations, high-risk count, critical
  count, and the highest-priority locations.
- Risk Map: search for a location, filter by risk level, or click a marker to
  see its model inputs and prediction.
- Locations: shows all CSV/model locations as cards, sorted by highest risk.
- Add Location: enter a new name, coordinates, rainfall, slope, and elevation.
  The values are sent to Flask, predicted by the model, and added to the map.
- Expert Review: High and Critical results can be marked Verify or Dismiss.

Important demo note
-------------------

Added locations and Expert Review decisions are only kept in the current
browser session. Refreshing the page resets them. The original CSV and trained
model are never changed by the website.

Main project files
------------------

index.html                 Website layout
style.css                  Website design and colours
script.js                  Website behaviour, map, filters, and form
backend/app.py             Flask API and model endpoints
backend/original_data.csv  Input data used by the model
backend/landslide_model2.pkl  Trained landslide-risk model

Troubleshooting
---------------

"Flask data unavailable"
  Start Flask with the command in Step 1, then refresh the website.

The map is blank
  Make sure you are connected to the internet. Leaflet uses online map tiles.

The website does not update after editing a file
  Refresh the Live Server page in the browser.
