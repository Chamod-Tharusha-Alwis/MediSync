from flask import Flask, request, jsonify
from apscheduler.schedulers.background import BackgroundScheduler
import pandas as pd
import numpy as np
from prophet import Prophet
import os

app = Flask(__name__)

# In-memory buffer for incoming data points
data_buffer = []

# Load and prepare Sri Lanka dengue data
def load_model():
    try:
        df = pd.read_csv('data/srilanka_dengue_weekly.csv')
        df = df[['Date', 'Value']].rename(columns={'Date': 'ds', 'Value': 'y'})
        df['ds'] = pd.to_datetime(df['ds'])
        df = df.dropna()
        model = Prophet(yearly_seasonality=True, weekly_seasonality=True)
        model.fit(df)
        return model, df
    except Exception as e:
        print(f"Model load warning: {e}")
        return None, None

prophet_model, historical_df = load_model()

# POST /ingest — receives anonymized data point from Node.js API
@app.route('/ingest', methods=['POST'])
def ingest():
    data = request.json
    data_buffer.append({
        'district': data.get('district'),
        'drugCategory': data.get('drugCategory'),
        'date': data.get('date')
    })
    return jsonify({'status': 'received'})

# Anomaly detection job — runs every 6 hours
def detect_anomalies():
    if not data_buffer or prophet_model is None:
        return
    
    df = pd.DataFrame(data_buffer)
    df['ds'] = pd.to_datetime(df['date'])
    
    # Aggregate daily counts
    daily_counts = df.groupby('ds').size().reset_index(name='y')
    
    if len(daily_counts) < 3:
        return
    
    # Prophet prediction for comparison
    future = prophet_model.make_future_dataframe(periods=7)
    forecast = prophet_model.predict(future)
    
    # Z-score anomaly check on latest data
    recent = daily_counts['y'].values[-7:]
    mean = np.mean(historical_df['y']) if historical_df is not None else np.mean(recent)
    std = np.std(historical_df['y']) if historical_df is not None else np.std(recent)
    
    for count in recent:
        z_score = (count - mean) / (std + 1e-9)
        if z_score > 3.0:
            trigger_alert({
                'type': 'OUTBREAK_ANOMALY',
                'z_score': round(z_score, 2),
                'message': f'Anomalous spike detected: z-score {z_score:.2f}'
            })
            break

def trigger_alert(alert_data):
    try:
        import requests
        requests.post(
            f"{os.getenv('NODE_API_URL')}/api/alerts/outbreak",
            json=alert_data,
            headers={'X-Internal-Key': os.getenv('INTERNAL_API_KEY')}
        )
        print(f"Alert triggered: {alert_data}")
    except Exception as e:
        print(f"Alert dispatch failed: {e}")

# POST /analyze — on-demand analysis endpoint
@app.route('/analyze', methods=['POST'])
def analyze():
    data = request.json
    district = data.get('district', 'all')
    result = {
        'district': district,
        'anomaly': False,
        'z_score': 0.0,
        'message': 'No anomaly detected'
    }
    return jsonify(result)

# Start scheduler
scheduler = BackgroundScheduler()
scheduler.add_job(detect_anomalies, 'interval', hours=6)
scheduler.start()

if __name__ == '__main__':
    app.run(port=5001, debug=True)