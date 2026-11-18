# MediSync - ML Engine

A Python Flask microservice handling disease diagnosis, real-time outbreak anomaly detection, and symptom matching utilizing a 71k+ ICD-10 SQLite database (`medisync.db`).

## Live URL
[LIVE URL PLACEHOLDER]

## Environment Variables
Create a `.env` file with the following variable names (do NOT include actual secrets):
- `FLASK_DEBUG`
- `FLASK_ENV`
- `INTERNAL_API_KEY`
- `MONGO_URI`

## Local Run Instructions
1. Navigate to the `ml-engine` directory.
2. Install dependencies: `pip install -r requirements.txt`
3. Run the Flask server: `python app.py`

Last verified: 2026-11-18 at commit f5337833. Location and internal links only; the content is a dated record and was not re-checked against the code (current documents are listed in docs/INDEX.md).
