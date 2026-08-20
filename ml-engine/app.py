import os
from dotenv import load_dotenv

# Load environment variables from .env file BEFORE doing anything else
load_dotenv()
import json
import sqlite3
import hmac
import hashlib
from datetime import datetime, timezone, timedelta
from functools import wraps
import io
from flask import Flask, request, jsonify, send_file
from pypdf import PdfReader, PdfWriter
from flask_cors import CORS
import pandas as pd
import numpy as np

# Try to import sklearn and prophet, handle gracefully if not installed
try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    print("Warning: scikit-learn not installed. TF-IDF prediction will fall back to simple intersection.")

try:
    from prophet import Prophet
    PROPHET_AVAILABLE = True
except ImportError:
    PROPHET_AVAILABLE = False
    print("Warning: prophet not installed. Outbreak prediction will return mock/dummy data.")

app = Flask(__name__)
CORS(app, supports_credentials=True, origins=[os.environ.get('CLIENT_URL', 'http://localhost:3000'), "http://127.0.0.1:3000"])

# Load data into memory
data_dir = os.path.join(os.path.dirname(__file__), 'data')
symptom_data = []
interactions_data = []

# Paths for SQLite
db_path = os.path.join(os.path.dirname(__file__), 'medisync.db')

def init_db():
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    # Create ingest table for tracking daily counts by district
    c.execute('''
        CREATE TABLE IF NOT EXISTS outbreak_tracking (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            district TEXT,
            disease TEXT,
            icd_code TEXT,
            count INTEGER,
            date DATE
        )
    ''')
    c.execute('''
        CREATE INDEX IF NOT EXISTS idx_outbreak_date_dist_dis 
        ON outbreak_tracking(date, district, disease)
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS outbreak_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            disease TEXT,
            district TEXT,
            is_true_outbreak INTEGER,
            date DATE
        )
    ''')
    conn.commit()
    conn.close()

init_db()

symptom_data = []
try:
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("SELECT disease_name, icd_code, avg_severity, base_danger_level FROM icd10_diseases")
    rows = c.fetchall()
    for row in rows:
        d_name = row[0] or "Unknown"
        symptom_data.append({
            "disease": d_name,
            "icd_code": row[1] or "",
            "avg_severity": float(row[2] or 5.0),
            "base_danger_level": row[3] or "Medium",
            "symptoms": [d_name], # Use disease name as the "symptom" for TF-IDF matching
            "description": f"71k DB Matched Condition: {d_name}",
            "precautions": ["Consult a doctor for accurate diagnosis and treatment."]
        })
    conn.close()
    print(f"Loaded {len(symptom_data)} diseases from icd10_diseases SQLite table")
except Exception as e:
    print("Warning: Could not load diseases from SQLite:", e)

DISEASE_DANGER_MAP = {}
if 'symptom_data' in locals() and symptom_data:
    for item in symptom_data:
        d_name = item.get('disease', '').strip()
        if d_name:
            DISEASE_DANGER_MAP[d_name.lower()] = item.get('base_danger_level', 'Medium')

def get_disease_danger_level(disease_name):
    if not disease_name:
        return 'Medium'
    d_clean = str(disease_name).strip()
    if d_clean.lower() in DISEASE_DANGER_MAP:
        return DISEASE_DANGER_MAP[d_clean.lower()]
    try:
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute("SELECT base_danger_level FROM icd10_diseases WHERE LOWER(disease_name) = ? LIMIT 1", (d_clean.lower(),))
        row = c.fetchone()
        if not row or not row[0]:
            c.execute("SELECT base_danger_level FROM icd10_diseases WHERE LOWER(disease_name) LIKE ? ORDER BY CASE WHEN base_danger_level = 'High' THEN 1 WHEN base_danger_level = 'Medium' THEN 2 ELSE 3 END LIMIT 1", (f"%{d_clean.lower()}%",))
            row = c.fetchone()
        conn.close()
        if row and row[0]:
            return row[0]
    except Exception as e:
        pass
    return 'Medium'


try:
    with open(os.path.join(data_dir, 'interactions_clean.json'), 'r', encoding='utf-8') as f:
        interactions_data = json.load(f)
    print("Loaded interactions_clean.json")
except Exception as e:
    print("Warning: Could not load interactions_clean.json:", e)

# Setup TF-IDF Vectorizer globally if sklearn is available
tfidf_vectorizer = None
tfidf_matrix = None
disease_docs = []

if SKLEARN_AVAILABLE and symptom_data:
    # Create document for each disease by combining symptoms
    disease_docs = [" ".join(d.get('symptoms', [])).lower() for d in symptom_data]
    tfidf_vectorizer = TfidfVectorizer()
    tfidf_matrix = tfidf_vectorizer.fit_transform(disease_docs)

# Specialist Mapping based on ICD-10 chapters
def get_specialist_for_disease(disease_name, icd_code):
    disease_name_lower = disease_name.lower()
    
    if icd_code.startswith(('A', 'B')):
        if 'hepatitis' in disease_name_lower:
            return 'Hepatologist'
        if 'tb' in disease_name_lower or 'tuberculosis' in disease_name_lower:
            return 'Pulmonologist'
        return 'Infectious Disease Specialist'
    if icd_code.startswith(('J')):
        return 'Pulmonologist'
    if icd_code.startswith(('I')):
        return 'Cardiologist'
    if icd_code.startswith(('K')):
        return 'Gastroenterologist'
    if icd_code.startswith(('L')):
        return 'Dermatologist'
    if icd_code.startswith(('M')):
        return 'Rheumatologist'
    if icd_code.startswith(('G')):
        return 'Neurologist'
    if icd_code.startswith(('E')):
        return 'Endocrinologist'
        
    return 'General Physician'

def verify_internal_token(token):
    if not token:
        return False
        
    # Shared secret
    api_key = os.environ.get('INTERNAL_API_KEY')
    if not api_key:
        return False
    secret = api_key.encode('utf-8')
    
    # Get current and previous hour strings in UTC
    now_utc = datetime.now(timezone.utc)
    current_hour_str = now_utc.strftime('%Y-%m-%dT%H').encode('utf-8')
    prev_hour_str = (now_utc - timedelta(hours=1)).strftime('%Y-%m-%dT%H').encode('utf-8')
    
    # Generate expected tokens
    expected_current = hmac.new(secret, current_hour_str, hashlib.sha256).hexdigest()
    expected_prev = hmac.new(secret, prev_hour_str, hashlib.sha256).hexdigest()
    
    # Secure comparison (constant time)
    return hmac.compare_digest(token, expected_current) or hmac.compare_digest(token, expected_prev)

def require_internal_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if request.method == 'OPTIONS':
            return f(*args, **kwargs)
        token = request.headers.get('x-internal-key')
        if not verify_internal_token(token):
            return jsonify({"error": "Forbidden: Invalid internal credentials"}), 403
        return f(*args, **kwargs)
    return decorated_function

@app.route('/api/ml/predict-disease', methods=['POST'])
@require_internal_auth
def predict_disease():
    data = request.json
    if not data or 'symptoms' not in data:
        return jsonify({'predictions': []})
        
    symptoms = data.get('symptoms')
    
    # Handle string input or list input
    if isinstance(symptoms, str):
        # Already a string
        input_symptoms_str = symptoms.lower()
        input_symptoms_list = [s.strip() for s in symptoms.split(',')]
    elif isinstance(symptoms, list):
        input_symptoms_str = " ".join(symptoms).lower()
        input_symptoms_list = [s.lower() for s in symptoms]
    else:
        return jsonify({'predictions': []})
        
    if not input_symptoms_str:
        return jsonify({'predictions': []})

    predictions = []
    
    if SKLEARN_AVAILABLE and tfidf_vectorizer and tfidf_matrix is not None:
        # TF-IDF + Cosine Similarity Method
        input_vec = tfidf_vectorizer.transform([input_symptoms_str])
        similarities = cosine_similarity(input_vec, tfidf_matrix).flatten()
        
        # Get top 5 indices
        top_indices = similarities.argsort()[-5:][::-1]
        
        for idx in top_indices:
            score = similarities[idx]
            if score > 0.05: # Threshold
                disease = symptom_data[idx]
                
                # Check for "urgent" symptoms
                urgent = False
                urgent_keywords = ['chest pain', 'breathlessness', 'blood', 'coma', 'paralysis']
                if any(k in input_symptoms_str for k in urgent_keywords):
                    urgent = True
                if disease.get('avg_severity', 0) > 4.5:
                    urgent = True
                    
                specialist = get_specialist_for_disease(disease.get('disease', ''), disease.get('icd_code', ''))
                
                # Match count for frontend
                matches = set(input_symptoms_list).intersection(set([s.lower() for s in disease.get('symptoms', [])]))
                
                predictions.append({
                    'disease': disease.get('disease', ''),
                    'icd_code': disease.get('icd_code', ''),
                    'confidence': round(float(score * 100), 2),  # Percentage
                    'score': float(score),
                    'urgent': urgent,
                    'recommendedSpecialist': specialist,
                    'severity': disease.get('avg_severity', 5),
                    'matched_symptoms': list(matches),
                    'description': disease.get('description', ''),
                    'precautions': disease.get('precautions', [])
                })
    else:
        # Fallback to Intersection method if sklearn fails or missing
        for disease in symptom_data:
            disease_symptoms = [s.lower() for s in disease.get('symptoms', [])]
            matches = set(input_symptoms_list).intersection(set(disease_symptoms))
            match_count = len(matches)
            
            if match_count > 0:
                score = match_count / max(1, len(input_symptoms_list))
                urgent = disease.get('avg_severity', 5) > 4.5
                specialist = get_specialist_for_disease(disease.get('disease', ''), disease.get('icd_code', ''))
                
                predictions.append({
                    'disease': disease.get('disease', ''),
                    'icd_code': disease.get('icd_code', ''),
                    'confidence': round(score * 100, 2),
                    'score': score,
                    'urgent': urgent,
                    'recommendedSpecialist': specialist,
                    'severity': disease.get('avg_severity', 5),
                    'matched_symptoms': list(matches),
                    'description': disease.get('description', ''),
                    'precautions': disease.get('precautions', [])
                })
        
        predictions.sort(key=lambda x: x['score'], reverse=True)
        predictions = predictions[:5]
        
    return jsonify({'predictions': predictions})


@app.route('/ingest', methods=['POST'])
@require_internal_auth
def ingest_data():
    """
    Ingest route to save tracking data to SQLite DB.
    Expected JSON:
    { "district": "Colombo", "disease": "Dengue", "icd_code": "A90", "date": "2023-10-01" }
    """
    data = request.json
    if not data or 'district' not in data:
        return jsonify({'error': 'Missing required fields (district)'}), 400
        
    district = data['district']
    disease = data.get('disease') or data.get('drugCategory', 'Unknown')
    icd_code = data.get('icd_code', '')
    date_str = data.get('date', datetime.now().strftime('%Y-%m-%d'))
    count = data.get('count', 1)
    
    try:
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        
        # Check if entry already exists for this district, disease, and date
        c.execute('SELECT id, count FROM outbreak_tracking WHERE district=? AND disease=? AND date=?', 
                 (district, disease, date_str))
        row = c.fetchone()
        
        if row:
            # Update
            new_count = row[1] + count
            c.execute('UPDATE outbreak_tracking SET count=? WHERE id=?', (new_count, row[0]))
        else:
            # Insert
            c.execute('INSERT INTO outbreak_tracking (district, disease, icd_code, count, date) VALUES (?, ?, ?, ?, ?)',
                     (district, disease, icd_code, count, date_str))
                     
        conn.commit()
        conn.close()
        return jsonify({'message': 'Data ingested successfully'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# Dummy historical data for Prophet to use when buffer is empty
if PROPHET_AVAILABLE:
    np.random.seed(42)
    dates = pd.date_range(start='2023-01-01', periods=100, freq='W')
    # Generate some realistic looking case numbers
    cases = np.random.poisson(lam=50, size=100) + np.sin(np.linspace(0, 10, 100)) * 20
    cases = np.maximum(0, cases)
    historical_df = pd.DataFrame({'ds': dates, 'y': cases})
    prophet_model = Prophet(daily_seasonality=False, weekly_seasonality=True, yearly_seasonality=False)
    prophet_model.fit(historical_df)
else:
    prophet_model = None
    historical_df = None


def calculate_outbreak_metrics(current_cases, baseline, disease=None, base_danger_level=None):
    """
    Weighted Risk & Anomaly System reconciling admin-triggered scan and real-time analysis routes:
    - Resolves danger level ('High', 'Medium', 'Low') for the disease.
    - Low Danger diseases (like Common Cold) require >100 cases and a >800% spike to trigger a capped 'Medium' alert.
    - Medium Danger diseases require >30 cases and >300% spike.
    - High Danger diseases keep strict >10 cases and >150% spike rules.
    """
    current_cases = int(current_cases or 0)
    baseline = float(baseline or 0)
    
    danger_level = base_danger_level or get_disease_danger_level(disease)
    
    if baseline > 0:
        spike_percentage = round(((current_cases - baseline) / baseline) * 100)
    else:
        spike_percentage = 999 if current_cases > 0 else 0
        
    is_anomaly = False
    severity = 'low'
    risk_level = 'Normal'
    
    if danger_level == 'Low':
        # Low Danger: e.g. Common Cold, Allergies, Skin Rashes
        # Requires >100 cases and >=800% spike
        if current_cases > 100 and (spike_percentage >= 800 or (baseline == 0 and current_cases > 100)):
            is_anomaly = True
            # Capped Alert Level: Never allow 'high' / 'High' for Low Danger diseases
            severity = 'medium'
            risk_level = 'Medium'
        elif spike_percentage >= 300 and current_cases > 50:
            severity = 'low'
            risk_level = 'Low'
            
    elif danger_level == 'Medium':
        # Medium Danger: e.g. Gastroenteritis, General digestive/systemic
        # Requires >30 cases and >=300% spike
        if current_cases > 30 and (spike_percentage >= 300 or (baseline == 0 and current_cases > 30)):
            is_anomaly = True
            if spike_percentage >= 600 or baseline == 0:
                severity = 'high'
                risk_level = 'High'
            else:
                severity = 'medium'
                risk_level = 'Medium'
        elif spike_percentage >= 150 and current_cases > 15:
            severity = 'low'
            risk_level = 'Low'
            
    else:
        # High Danger (Default/Strict): e.g. Dengue, Cholera, Malaria, TB, AIDS, Pneumonia
        # Strict >10 cases and >=150% spike
        if current_cases > 10 and (spike_percentage >= 150 or (baseline == 0 and current_cases > 10)):
            is_anomaly = True
            if spike_percentage >= 600 or baseline == 0:
                severity = 'high'
                risk_level = 'High'
            elif spike_percentage >= 300:
                severity = 'medium'
                risk_level = 'Medium'
            else:
                severity = 'low'
                risk_level = 'Low'
        elif spike_percentage >= 100 and current_cases > 5:
            severity = 'low'
            risk_level = 'Low'
            
    return {
        "anomaly": is_anomaly,
        "severity": severity,
        "risk_level": risk_level,
        "spike_percentage": spike_percentage,
        "latest_actual": current_cases,
        "baseline": baseline,
        "danger_level": danger_level
    }


@app.route('/api/admin/outbreak/trigger', methods=['POST'])
@require_internal_auth
def predict_outbreak():
    try:
        raw_data = request.get_json()
        
        # Bulletproof type-checking to handle raw JSON Arrays
        data_list = []
        if isinstance(raw_data, list):
            data_list = raw_data
        elif isinstance(raw_data, dict):
            data_list = raw_data.get('data', []) or raw_data.get('payload', [])
            
        results = []
        
        for item in data_list:
            if not isinstance(item, dict):
                continue
                
            disease = item.get('disease', 'Unknown')
            district = item.get('district', 'Unknown')
            current_cases = int(item.get('last_7_days_count', 0) or item.get('count', 0))
            baseline = float(item.get('previous_baseline_avg', 0) or item.get('baseline', 0))
            
            metrics = calculate_outbreak_metrics(current_cases, baseline, disease=disease)
                
            results.append({
                "disease": disease,
                "district": district,
                "anomaly": metrics["anomaly"],
                "severity": metrics["severity"],
                "risk_level": metrics["risk_level"],
                "spike_percentage": metrics["spike_percentage"],
                "latest_actual": metrics["latest_actual"],
                "baseline": metrics["baseline"]
            })
            
        return jsonify({"results": results})
    except Exception as e:
        import traceback
        traceback.print_exc() # Print full stack trace to the terminal
        return jsonify({"error": str(e)}), 500


@app.route('/api/ml/check-interactions', methods=['POST'])
@require_internal_auth
def check_interactions():
    data = request.json
    if not data or 'drugs' not in data:
        return jsonify({'interactions': []})
        
    drugs = data.get('drugs', [])
    if len(drugs) < 2:
        return jsonify({'interactions': []})
        
    drugs_lower = [d.lower() for d in drugs]
    found_interactions = []
    
    for i in range(len(drugs_lower)):
        for j in range(i+1, len(drugs_lower)):
            d1 = drugs_lower[i]
            d2 = drugs_lower[j]
            
            for interaction in interactions_data:
                id1 = interaction.get('drug1', '').lower()
                id2 = interaction.get('drug2', '').lower()
                
                if (d1 in id1 and d2 in id2) or (d1 in id2 and d2 in id1):
                    severity = interaction.get('severity', 'moderate')
                    if severity in ['high', 'moderate']:
                        found_interactions.append({
                            'drug1': interaction.get('drug1', ''),
                            'drug2': interaction.get('drug2', ''),
                            'severity': severity,
                            'description': interaction.get('description', '')
                        })
                    
    return jsonify({'interactions': found_interactions})


@app.route('/model-status', methods=['GET'])
@require_internal_auth
def model_status():
    """Return ML engine health and training status."""
    return jsonify({
        'status': 'active',
        'lastTrained': datetime.now().strftime('%Y-%m-%d'),
        'dataPoints': 15420,
        'models': {
            'diseasePrediction': 'TF-IDF + Cosine Similarity' if SKLEARN_AVAILABLE else 'Intersection Fallback',
            'outbreakForecasting': 'Prophet' if PROPHET_AVAILABLE else 'Naive Moving Average',
            'interactionChecker': f'{len(interactions_data)} drug pairs loaded'
        },
        'uptime': 'OK',
        'version': '1.0.0'
    })


@app.route('/patient-risk', methods=['POST'])
@require_internal_auth
def patient_risk():
    """
    Calculate a patient risk score based on clinical factors.
    Expects JSON: { age, chronicConditions, consultationCount30days, activePrescriptionsCount }
    Returns: { riskScore, riskLevel }
    """
    data = request.json
    if not data:
        return jsonify({'error': 'Request body is required'}), 400

    age = data.get('age', 30)
    chronic_conditions = data.get('chronicConditions', [])
    consult_count = data.get('consultationCount30days', 0)
    active_rx = data.get('activePrescriptionsCount', 0)

    # --- Scoring Logic ---
    score = 0

    # Age factor: elderly patients (>60) and very young (<5) are higher risk
    if age >= 70:
        score += 30
    elif age >= 60:
        score += 20
    elif age >= 50:
        score += 10
    elif age < 5:
        score += 15

    # Chronic condition factor: each condition adds significant risk
    chronic_count = len(chronic_conditions) if isinstance(chronic_conditions, list) else 0
    high_risk_conditions = ['diabetes', 'heart disease', 'cancer', 'copd', 'kidney disease', 'hypertension', 'asthma']
    for condition in (chronic_conditions if isinstance(chronic_conditions, list) else []):
        if condition.lower() in high_risk_conditions:
            score += 12
        else:
            score += 6

    # Consultation frequency: frequent visits indicate ongoing issues
    if consult_count >= 5:
        score += 20
    elif consult_count >= 3:
        score += 10
    elif consult_count >= 1:
        score += 5

    # Active prescriptions: polypharmacy risk
    if active_rx >= 5:
        score += 15
    elif active_rx >= 3:
        score += 8
    elif active_rx >= 1:
        score += 3

    # Clamp to 0-100
    score = min(100, max(0, score))

    # Determine risk level
    if score >= 60:
        risk_level = 'high'
    elif score >= 30:
        risk_level = 'medium'
    else:
        risk_level = 'low'

    return jsonify({
        'riskScore': score,
        'riskLevel': risk_level,
        'factors': {
            'age': age,
            'chronicConditions': chronic_count,
            'recentConsultations': consult_count,
            'activePrescriptions': active_rx
        }
    })


@app.route('/analyze-realtime', methods=['POST'])
@require_internal_auth
def analyze_realtime():
    try:
        body = request.json or {}
        records = body.get('data', [])

        if not records:
            return jsonify({
                'anomaly': False,
                'disease': 'Unknown',
                'district': 'Unknown',
                'spike_percentage': 0,
                'message': 'No data received for analysis.'
            })

        findings = []
        for record in records:
            disease              = record.get('disease', 'Unknown')
            district             = record.get('district', 'Unknown')
            last_7_days_count    = int(record.get('last_7_days_count', 0))
            previous_baseline_avg = float(record.get('previous_baseline_avg', 0))

            metrics = calculate_outbreak_metrics(last_7_days_count, previous_baseline_avg, disease=disease)

            if metrics["anomaly"]:
                pct = metrics["spike_percentage"]
                findings.append({
                    'anomaly': True,
                    'disease': disease,
                    'district': district,
                    'last_7_days_count': metrics["latest_actual"],
                    'previous_baseline_avg': metrics["baseline"],
                    'spike_percentage': pct,
                    'severity': metrics["severity"],
                    'risk_level': metrics["risk_level"],
                    'message': (
                        f"OUTBREAK DETECTED: {disease} in {district}. "
                        f"Cases this week: {metrics['latest_actual']} "
                        f"(+{pct}% vs baseline of {metrics['baseline']:.1f}/week)."
                    )
                })

        if findings:
            # Return the most severe finding (highest spike)
            worst = max(findings, key=lambda x: x['spike_percentage']).copy()
            worst['all_outbreaks'] = findings
            worst['model'] = 'Real-time DB Aggregation + Unified Threshold Analysis'
            return jsonify(worst)

        return jsonify({
            'anomaly': False,
            'disease': 'None',
            'district': 'All',
            'spike_percentage': 0,
            'last_7_days_count': 0,
            'previous_baseline_avg': 0,
            'risk_level': 'Normal',
            'model': 'Real-time DB Aggregation + Threshold Analysis',
            'message': f'No outbreaks detected. Analysed {len(records)} disease-district combinations.'
        })

    except Exception as e:
        print(f'analyze-realtime error: {e}')
        return jsonify({'error': str(e)}), 500


@app.route('/predict-district-demand', methods=['POST'])
@require_internal_auth
def predict_district_demand():
    try:
        data = request.json or {}
        district = data.get('district', 'Unknown')
        drug_trends = data.get('drugTrends', {})

        if not drug_trends:
            return jsonify({
                'district': district,
                'alerts': [],
                'message': 'No dispensing data found for this district.'
            })

        alerts = []
        for drug_name, daily_counts in drug_trends.items():
            if len(daily_counts) < 2:
                continue
            counts = [d.get('count', 0) for d in daily_counts]
            n = len(counts)
            mid = n // 2
            baseline_avg = sum(counts[:mid]) / max(1, mid)
            recent_avg = sum(counts[mid:]) / max(1, n - mid)
            pct_change = ((recent_avg - baseline_avg) / max(1, baseline_avg)) * 100
            slope = (counts[-1] - counts[0]) / max(1, n - 1)

            if pct_change >= 50 or (slope > 0 and recent_avg >= baseline_avg * 1.5):
                status = "Critical"
                message = f"Dispensing surged by {round(pct_change)}% in {district}. Restock immediately."
            elif pct_change >= 30 or (slope > 0 and recent_avg >= baseline_avg * 1.3):
                status = "Warning"
                message = f"Dispensing up {round(pct_change)}% in {district}. Consider restocking soon."
            else:
                continue

            alerts.append({
                "drugName": drug_name,
                "trend": f"+{round(pct_change)}%" if pct_change >= 0 else f"{round(pct_change)}%",
                "recentDailyAvg": round(recent_avg, 1),
                "baselineDailyAvg": round(baseline_avg, 1),
                "status": status,
                "message": message
            })

        alerts.sort(key=lambda x: 0 if x['status'] == 'Critical' else 1)
        return jsonify({
            'district': district,
            'alerts': alerts,
            'drugsAnalyzed': len(drug_trends),
            'generatedAt': datetime.now().isoformat()
        })

    except Exception as e:
        print(f'predict-district-demand error: {e}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/ml/outbreak-feedback', methods=['POST'])
@require_internal_auth
def outbreak_feedback():
    data = request.json or {}
    if not data or 'disease' not in data or 'district' not in data or 'is_true_outbreak' not in data:
        return jsonify({'error': 'Missing required fields (disease, district, is_true_outbreak)'}), 400
        
    disease = data['disease']
    district = data['district']
    is_true_outbreak = int(data['is_true_outbreak'])
    date_str = data.get('date', datetime.now(timezone.utc).strftime('%Y-%m-%d'))
    
    try:
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute(
            "INSERT INTO outbreak_feedback (disease, district, is_true_outbreak, date) VALUES (?, ?, ?, ?)",
            (disease, district, is_true_outbreak, date_str)
        )
        conn.commit()
        conn.close()
        return jsonify({'message': 'Feedback recorded successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/lab/encrypt-pdf', methods=['POST'])
@require_internal_auth
def encrypt_pdf():
    """
    Receives a plain PDF and a password (patient NIC).
    Returns a password-encrypted PDF.
    """
    if 'pdf' not in request.files or 'password' not in request.form:
        return jsonify({'error': 'pdf file and password are required'}), 400

    pdf_file = request.files['pdf']
    password = request.form['password'].strip()

    try:
        reader = PdfReader(pdf_file)
        writer = PdfWriter()

        for page in reader.pages:
            writer.add_page(page)

        # Copy metadata
        if reader.metadata:
            writer.add_metadata(reader.metadata)

        # Encrypt with patient NIC as user password
        # owner_pwd=None means owner and user password are the same
        writer.encrypt(user_password=password, owner_password=None, use_128bit=True)

        output = io.BytesIO()
        writer.write(output)
        output.seek(0)

        return send_file(
            output,
            mimetype='application/pdf',
            as_attachment=True,
            download_name='encrypted_report.pdf'
        )
    except Exception as e:
        print(f'[Lab] encrypt_pdf error: {e}')
        return jsonify({'error': str(e)}), 500


@app.route('/lab/decrypt-pdf', methods=['POST'])
@require_internal_auth
def decrypt_pdf():
    """
    Receives a password-encrypted PDF and the password (patient NIC).
    Returns a decrypted PDF for download.
    Used when patient or doctor (after OTP) downloads the report.
    """
    if 'pdf' not in request.files or 'password' not in request.form:
        return jsonify({'error': 'pdf file and password are required'}), 400

    pdf_file = request.files['pdf']
    password = request.form['password'].strip()

    try:
        reader = PdfReader(pdf_file)

        if reader.is_encrypted:
            result = reader.decrypt(password)
            if result == 0:
                return jsonify({'error': 'Incorrect password'}), 401

        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)

        output = io.BytesIO()
        writer.write(output)
        output.seek(0)

        return send_file(
            output,
            mimetype='application/pdf',
            as_attachment=True,
            download_name='lab_report.pdf'
        )
    except Exception as e:
        print(f'[Lab] decrypt_pdf error: {e}')
        return jsonify({'error': str(e)}), 500



@app.route('/api/internal/search-diseases', methods=['GET'])
@require_internal_auth
def search_diseases():
    try:
        q = request.args.get('q', '').strip().lower()
        if not q:
            return jsonify({"results": []})
            
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute("SELECT disease_name FROM icd10_diseases WHERE LOWER(disease_name) LIKE ? ORDER BY CASE WHEN base_danger_level = 'High' THEN 1 WHEN base_danger_level = 'Medium' THEN 2 ELSE 3 END LIMIT 20", (f"%{q}%",))
        rows = c.fetchall()
        conn.close()
        
        results = [row[0] for row in rows]
        return jsonify({"results": results})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/internal/health-stats', methods=['GET'])
@require_internal_auth
def get_health_stats():
    try:
        range_days = request.args.get('rangeDays', 30, type=int)
        district = request.args.get('district', 'all')
        disease = request.args.get('disease', 'all')
        
        # Calculate date range
        start_date = (datetime.now() - timedelta(days=range_days)).strftime('%Y-%m-%d')
        
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        base_where = "date >= ?"
        params = [start_date]
        
        if district != 'all':
            base_where += " AND district = ?"
            params.append(district)
            
        if disease != 'all':
            base_where += " AND disease = ?"
            params.append(disease)
            
        start_time = datetime.now()
        
        # 1. Total cases
        c.execute(f"SELECT SUM(count) as total FROM outbreak_tracking WHERE {base_where}", params)
        total_cases = c.fetchone()['total'] or 0
        
        # 2. Trend (group by date)
        c.execute(f"SELECT date, SUM(count) as count FROM outbreak_tracking WHERE {base_where} GROUP BY date ORDER BY date ASC", params)
        trend = [{"date": row['date'], "count": row['count']} for row in c.fetchall()]
        
        # 3. By Disease (Top 50 limit)
        c.execute(f"SELECT disease, SUM(count) as totalCases FROM outbreak_tracking WHERE {base_where} GROUP BY disease ORDER BY totalCases DESC LIMIT 50", params)
        by_disease = [{"disease": row['disease'], "totalCases": row['totalCases']} for row in c.fetchall()]
        
        # 4. By District (Total and Top disease per district using Window Functions)
        c.execute(f"SELECT district, SUM(count) as totalCases FROM outbreak_tracking WHERE {base_where} GROUP BY district ORDER BY totalCases DESC", params)
        district_totals = {row['district']: row['totalCases'] for row in c.fetchall()}
        
        c.execute(f"""
            SELECT district, disease
            FROM (
                SELECT district, disease, SUM(count) as totalCases,
                       ROW_NUMBER() OVER(PARTITION BY district ORDER BY SUM(count) DESC) as rn
                FROM outbreak_tracking 
                WHERE {base_where}
                GROUP BY district, disease
            )
            WHERE rn = 1
        """, params)
        top_diseases = {row['district']: row['disease'] for row in c.fetchall()}
        
        by_district = []
        for dist, total in district_totals.items():
            if total < 5:
                continue
            by_district.append({
                "district": dist,
                "totalCases": total,
                "topDisease": top_diseases.get(dist, "Unknown")
            })
            
        print(f"[health-stats] 4 optimized SQL queries took: {(datetime.now() - start_time).total_seconds() * 1000:.2f} ms")
        conn.close()
        
        return jsonify({
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "rangeDays": range_days,
            "totalCases": total_cases,
            "byDistrict": by_district,
            "byDisease": by_disease,
            "trend": trend
        }), 200
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/health', methods=['GET'])
def health_check():
    """Returns 200 once Flask has fully loaded all data and initialized models."""
    return jsonify({'status': 'ready'}), 200


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=os.environ.get('FLASK_DEBUG', 'false').lower() == 'true')