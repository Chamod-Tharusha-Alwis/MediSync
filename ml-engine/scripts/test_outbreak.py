# python test_outbreak.py
import requests
from datetime import datetime

ML_URL = "http://localhost:5001"

print("💉 Simulating MASSIVE Influenza prescription spike in Colombo...")

today = datetime.now().strftime('%Y-%m-%d')

# Inject 300 fake prescriptions to guarantee a Z-Score > 3.0
for i in range(1, 301):
    payload = {
        "district": "Colombo",
        "drugCategory": "antiviral", # Changed to antiviral for Influenza
        "date": today
    }
    try:
        requests.post(f"{ML_URL}/ingest", json=payload)
        if i % 50 == 0:
            print(f"  → Ingested {i} prescriptions into ML buffer...")
    except Exception as e:
        print("ML Engine offline. Ensure app.py is running on port 5001.")
        exit(1)

print("\n🔍 Triggering ML Outbreak Analysis...")

# Hit the outbreak endpoint
analyze_res = requests.post(f"{ML_URL}/api/ml/predict-outbreak", json={"district": "Colombo"})

if analyze_res.status_code == 200:
    data = analyze_res.json()
    print("\n📊 --- ML ENGINE RESULT ---")
    print(f"Disease:          {data.get('disease')}")
    print(f"Anomaly Detected: {data.get('anomaly')}")
    print(f"Z-Score:          {data.get('z_score')}")
    print(f"Latest Actual:    {data.get('latest_actual')}")
    print(f"Severity:         {data.get('severity')}")
    print(f"Message/Status:   {data.get('status')}")
    
    if data.get('anomaly'):
        print("\n🚨 CRITICAL OUTBREAK DETECTED! Z-Score breached 3.0 threshold!")
    else:
        print("\n✅ System running normal. (Z-Score is below 3.0)")
else:
    print("Error calling predict:", analyze_res.text)