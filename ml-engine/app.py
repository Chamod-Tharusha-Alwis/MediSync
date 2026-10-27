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
from reference_catalog import search_diseases as search_reference_diseases, reference_status, ReferenceDataError
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
ml_qa_mode = os.environ.get('MEDISYNC_ML_QA') == 'true'
CORS(app, supports_credentials=True, origins=(
    ['http://127.0.0.1:3100'] if ml_qa_mode else
    [os.environ.get('CLIENT_URL', 'http://localhost:3000'), 'http://127.0.0.1:3000']
))

# Load data into memory
data_dir = os.path.join(os.path.dirname(__file__), 'data')
symptom_data = []
interactions_data = []

# Paths for SQLite
db_path = os.environ.get('MEDISYNC_ML_DB_PATH') or os.path.join(os.path.dirname(__file__), 'medisync.db')
if ml_qa_mode:
    if not os.path.isabs(db_path) or os.path.basename(db_path) == 'medisync.db':
        raise RuntimeError('ML QA requires a separate absolute MEDISYNC_ML_DB_PATH')
    if not os.path.realpath(db_path).startswith(os.path.realpath(os.path.join(os.path.dirname(__file__), '..', 'scratch')) + os.sep):
        raise RuntimeError('ML QA SQLite path must be under scratch/')

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

# Load reference symptom dataset (4,920 rows, 41 disease labels; not clinically validated cases)
try:
    dataset_path = os.path.join(data_dir, 'dataset.csv')
    desc_path = os.path.join(data_dir, 'symptom_Description.csv')
    prec_path = os.path.join(data_dir, 'symptom_precaution.csv')
    sev_path = os.path.join(data_dir, 'Symptom-severity.csv')

    # 1. Symptom weights / severity
    sym_weights = {}
    if os.path.exists(sev_path):
        sev_df = pd.read_csv(sev_path)
        for _, r in sev_df.iterrows():
            sym_weights[str(r['Symptom']).strip().lower().replace('_', ' ')] = float(r.get('weight', 3))

    # 2. Descriptions
    desc_map = {}
    if os.path.exists(desc_path):
        desc_df = pd.read_csv(desc_path)
        desc_map = dict(zip(desc_df['Disease'].str.strip().str.lower(), desc_df['Description'].str.strip()))

    # 3. Precautions
    prec_map = {}
    if os.path.exists(prec_path):
        prec_df = pd.read_csv(prec_path)
        for _, r in prec_df.iterrows():
            d = str(r['Disease']).strip().lower()
            precs = [str(r[c]).strip() for c in prec_df.columns[1:] if pd.notna(r[c]) and str(r[c]).strip()]
            prec_map[d] = precs

    # 4. Standard ICD-10 Code Map for Clinical Diseases
    icd_map = {
        'peptic ulcer diseae': 'K27.9',
        'gastroenteritis': 'K52.9',
        'gerd': 'K21.9',
        'osteoarthristis': 'M19.9',
        'arthritis': 'M13.9',
        'bronchial asthma': 'J45.9',
        'pneumonia': 'J18.9',
        'heart attack': 'I21.9',
        'tuberculosis': 'A15.0',
        'dengue': 'A90',
        'malaria': 'B54',
        'typhoid': 'A01.0',
        'chicken pox': 'B01.9',
        'common cold': 'J00',
        'allergy': 'T78.4',
        'diabetes ': 'E11.9',
        'hypertension ': 'I10',
        'migraine': 'G43.9',
        'cervical spondylosis': 'M47.8',
        'paralysis (brain hemorrhage)': 'I61.9',
        'jaundice': 'R17',
        'hepatitis a': 'B15.9',
        'hepatitis b': 'B16.9',
        'hepatitis c': 'B17.1',
        'hepatitis d': 'B17.0',
        'hepatitis e': 'B17.2',
        'alcoholic hepatitis': 'K70.1',
        'chronic cholestasis': 'K83.1',
        'drug reaction': 'T88.7',
        'fungal infection': 'B35.9',
        'aids': 'B20',
        'dimorphic hemmorhoids(piles)': 'K64.9',
        'varicose veins': 'I83.9',
        'hypothyroidism': 'E03.9',
        'hyperthyroidism': 'E05.9',
        'hypoglycemia': 'E16.2',
        'urinary tract infection': 'N39.0',
        'psoriasis': 'L40.9',
        'impetigo': 'L01.0',
        'acne': 'L70.0',
        '(vertigo) paroymsal  positional vertigo': 'H81.1'
    }

    # Curated disease danger classification from ml-engine/scripts/seed_local_icd10.py (CORE_DISEASE_CONFIG).
    # Prevents generic symptom-weight averages from overriding curated public-health danger tiers.
    CURATED_CORE_DISEASE_DANGER = {
        'dengue': 'High',
        'malaria': 'High',
        'tuberculosis': 'High',
        'aids': 'High',
        'typhoid': 'High',
        'pneumonia': 'High',
        'cholera': 'High',
        'leptospirosis': 'High',
        'hepatitis a': 'High',
        'hepatitis b': 'High',
        'hepatitis c': 'High',
        'hepatitis d': 'High',
        'hepatitis e': 'High',
        'chicken pox': 'High',
        'heart attack': 'High',
        'gastroenteritis': 'Medium',
        'urinary tract infection': 'Medium',
        'gerd': 'Medium',
        'bronchial asthma': 'Medium',
        'diabetes': 'Medium',
        'hypertension': 'Medium',
        'migraine': 'Medium',
        'paralysis (brain hemorrhage)': 'Medium',
        'jaundice': 'Medium',
        'chronic cholestasis': 'Medium',
        'alcoholic hepatitis': 'Medium',
        'drug reaction': 'Medium',
        'peptic ulcer diseae': 'Medium',
        'hyperthyroidism': 'Medium',
        'hypothyroidism': 'Medium',
        'hypoglycemia': 'Medium',
        'common cold': 'Low',
        'allergy': 'Low',
        'allergic rhinitis': 'Low',
        'fungal infection': 'Low',
        'acne': 'Low',
        'psoriasis': 'Low',
        'impetigo': 'Low',
        'varicose veins': 'Low',
        'cervical spondylosis': 'Low',
        'arthritis': 'Low',
        'osteoarthristis': 'Low',
        '(vertigo) paroymsal  positional vertigo': 'Low',
        'dimorphic hemmorhoids(piles)': 'Low'
    }

    # 5. Aggregate unique symptoms per disease from dataset.csv
    if os.path.exists(dataset_path):
        df_ds = pd.read_csv(dataset_path)
        disease_symptoms_map = {}
        for _, row in df_ds.iterrows():
            disease = str(row['Disease']).strip()
            if disease not in disease_symptoms_map:
                disease_symptoms_map[disease] = set()
            for col in df_ds.columns[1:]:
                sym = row[col]
                if pd.notna(sym) and isinstance(sym, str) and sym.strip():
                    cleaned = sym.strip().replace('_', ' ').lower()
                    disease_symptoms_map[disease].add(cleaned)

        for disease, syms in disease_symptoms_map.items():
            d_clean = disease.strip()
            d_lower = d_clean.lower()
            syms_list = sorted(list(syms))
            # Calculate average severity from symptom weights (for clinical symptom triage only)
            weights = [sym_weights.get(s, 3.0) for s in syms_list]
            avg_sev = float(sum(weights) / max(1, len(weights)))
            curated_danger = CURATED_CORE_DISEASE_DANGER.get(
                d_lower,
                "High" if avg_sev >= 4.5 else ("Medium" if avg_sev >= 3.0 else "Low")
            )

            symptom_data.append({
                "disease": d_clean,
                "icd_code": icd_map.get(d_lower, 'R69'),
                "avg_severity": round(avg_sev, 2),
                "base_danger_level": curated_danger,
                "symptoms": syms_list,
                "description": desc_map.get(d_lower, f"Clinical diagnosis profile for {d_clean}."),
                "precautions": prec_map.get(d_lower, ["Consult a healthcare provider for comprehensive evaluation."])
            })
        print(f"Loaded {len(symptom_data)} clinical disease profiles with symptom mapping from dataset.csv")
except Exception as e:
    print("Warning: Could not load dataset.csv symptom profiles:", e)

# Set active disease profiles count
print(f"Total active clinical disease profiles in symptom_data: {len(symptom_data)}")

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
    d_lower = d_clean.lower()
    # Surveillance groups by normalized ICD identity, never by free-text diagnosis.
    # Reuse the existing reference mapping; do not invent new risk thresholds.
    if d_lower.startswith('icd10:'):
        code = d_lower.split(':', 1)[1].replace('.', '').upper()
        matches = [name for name, value in globals().get('icd_map', {}).items()
                   if value.replace('.', '').upper() == code]
        if len(matches) == 1:
            d_lower = matches[0].strip().lower()

    # 1. Explicit curated core disease classification takes highest precedence
    if 'CURATED_CORE_DISEASE_DANGER' in globals() and d_lower in CURATED_CORE_DISEASE_DANGER:
        return CURATED_CORE_DISEASE_DANGER[d_lower]

    # 2. Curated SQLite icd10_diseases catalog takes second precedence
    try:
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute("SELECT base_danger_level FROM icd10_diseases WHERE LOWER(disease_name) = ? LIMIT 1", (d_lower,))
        row = c.fetchone()
        if not row or not row[0]:
            c.execute("SELECT base_danger_level FROM icd10_diseases WHERE LOWER(disease_name) LIKE ? ORDER BY CASE WHEN base_danger_level = 'High' THEN 1 WHEN base_danger_level = 'Medium' THEN 2 ELSE 3 END LIMIT 1", (f"%{d_lower}%",))
            row = c.fetchone()
        conn.close()
        if row and row[0]:
            return row[0]
    except Exception as e:
        pass

    # 3. Fallback to symptom profile danger map or 'Medium'
    if d_lower in DISEASE_DANGER_MAP:
        return DISEASE_DANGER_MAP[d_lower]
    return 'Medium'

# Setup TF-IDF Vectorizer globally on clinical disease profiles
tfidf_vectorizer = None
tfidf_matrix = None
disease_docs = []

if SKLEARN_AVAILABLE and symptom_data:
    # Build rich symptom documents combining symptoms + disease name
    disease_docs = []
    for d in symptom_data:
        syms_text = " ".join(d.get('symptoms', []))
        d_name = d.get('disease', '')
        # Weight symptoms heavily so clinical symptom queries match diseases accurately
        doc = f"{d_name.lower()} {syms_text} {syms_text}"
        disease_docs.append(doc)
    tfidf_vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=1)
    tfidf_matrix = tfidf_vectorizer.fit_transform(disease_docs)

# Specialist Mapping based on ICD-10 chapters and clinical specialties
def get_specialist_for_disease(disease_name, icd_code):
    disease_name_lower = disease_name.lower()
    
    # Specific Clinical Disease Rules
    if any(k in disease_name_lower for k in ['osteoarthristis', 'arthritis', 'cervical spondylosis', 'joint']):
        return 'Rheumatologist'
    if any(k in disease_name_lower for k in ['peptic ulcer', 'gerd', 'gastroenteritis', 'cholestasis', 'stomach', 'acid']):
        return 'Gastroenterologist'
    if any(k in disease_name_lower for k in ['hepatitis', 'jaundice', 'liver', 'alcoholic hepatitis']):
        return 'Hepatologist'
    if any(k in disease_name_lower for k in ['asthma', 'pneumonia', 'tuberculosis', 'bronchial', 'cough', 'cold', 'tb']):
        return 'Pulmonologist'
    if any(k in disease_name_lower for k in ['heart attack', 'hypertension', 'cardiac', 'chest']):
        return 'Cardiologist'
    if any(k in disease_name_lower for k in ['diabetes', 'thyroid', 'hypoglycemia', 'endocrine']):
        return 'Endocrinologist'
    if any(k in disease_name_lower for k in ['dengue', 'malaria', 'typhoid', 'chicken pox', 'aids', 'infection', 'fungal']):
        return 'Infectious Disease Specialist'
    if any(k in disease_name_lower for k in ['migraine', 'paralysis', 'vertigo', 'brain', 'headache']):
        return 'Neurologist'
    if any(k in disease_name_lower for k in ['psoriasis', 'acne', 'impetigo', 'rash', 'skin', 'drug reaction']):
        return 'Dermatologist'
    if any(k in disease_name_lower for k in ['urinary', 'kidney', 'uti']):
        return 'Urologist'

    # Fallback by ICD-10 Chapter Code
    if icd_code.startswith(('A', 'B')):
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
    if icd_code.startswith(('N')):
        return 'Urologist'
        
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
    # Reject malformed authenticated requests before joining/lowercasing entries.
    # Empty/missing and unknown symptom sets retain their existing empty result.
    if data is not None and not isinstance(data, dict):
        return jsonify({'error': 'INVALID_SYMPTOMS'}), 400
    if isinstance(data, dict) and 'symptoms' in data:
        values = data['symptoms']
        if not (isinstance(values, str) or
                (isinstance(values, list) and all(isinstance(value, str) for value in values))):
            return jsonify({'error': 'INVALID_SYMPTOMS'}), 400
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
        
        candidates = []
        for idx, disease in enumerate(symptom_data):
            cos_score = float(similarities[idx])
            disease_syms = [s.lower() for s in disease.get('symptoms', [])]
            
            # Substring-aware matched symptom list
            matched = []
            for inp_s in input_symptoms_list:
                inp_clean = inp_s.strip().lower()
                if not inp_clean:
                    continue
                for d_sym in disease_syms:
                    if inp_clean in d_sym or d_sym in inp_clean:
                        matched.append(d_sym)
            
            matched = list(dict.fromkeys(matched))
            overlap_ratio = len(matched) / max(1, len(input_symptoms_list))
            
            # Combined score: 65% cosine similarity + 35% symptom coverage
            combined_score = (0.65 * cos_score) + (0.35 * overlap_ratio)
            
            if combined_score > 0.05 or cos_score > 0.10:
                # Check for "urgent" condition
                urgent = False
                disease_name_l = disease.get('disease', '').lower()
                if any(em in disease_name_l for em in ['heart attack', 'paralysis', 'pneumonia', 'aids', 'tuberculosis']):
                    urgent = True
                elif disease.get('avg_severity', 0) >= 4.5 and len(matched) >= 2:
                    urgent = True
                    
                specialist = get_specialist_for_disease(disease.get('disease', ''), disease.get('icd_code', ''))
                
                candidates.append({
                    'disease': disease.get('disease', ''),
                    'icd_code': disease.get('icd_code', ''),
                    'confidence': round(float(combined_score * 100), 2),
                    'score': float(combined_score),
                    'cosine_sim': round(float(cos_score * 100), 2),
                    'urgent': urgent,
                    'recommendedSpecialist': specialist,
                    'severity': disease.get('avg_severity', 5),
                    'matched_symptoms': matched,
                    'description': disease.get('description', ''),
                    'precautions': disease.get('precautions', [])
                })
        
        candidates.sort(key=lambda x: (x['confidence'], len(x['matched_symptoms']), x['cosine_sim']), reverse=True)
        predictions = candidates[:5]
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


# Startup must not train a forecasting model on fabricated historical data.
# Forecasting remains unavailable until an independently validated model is approved.
prophet_model = None
historical_df = None


def calculate_outbreak_metrics(current_cases, baseline, disease=None, base_danger_level=None):
    """
    Weighted Risk & Anomaly System reconciling admin-triggered scan and real-time analysis routes:
    - Resolves danger level ('High', 'Medium', 'Low') for the disease.
    - Low Danger diseases (like Common Cold) require >100 cases and a >=800% spike to trigger a capped 'Medium' alert.
    - Medium Danger diseases require >30 cases and >=300% spike.
    - High Danger diseases keep strict >10 cases and >=150% spike rules.

    Provenance Note:
    These rules are deterministic application-level engineering heuristics established in commit
    363bd1b51095779302c03e1a7a623005df57fe37 for the MediSync capstone specification (not externally
    validated clinical/epidemiological surveillance thresholds). Production defaults are immutable
    and cannot be lowered by any demo-sensitivity flag.
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

    # Composite Response Priority Matrix: Disease Danger Level x Outbreak Risk Level
    if danger_level == 'High' and risk_level == 'High':
        response_priority = 'P1-Critical'
    elif (danger_level == 'High' and risk_level == 'Medium') or (danger_level == 'Medium' and risk_level == 'High'):
        response_priority = 'P2-High'
    elif (danger_level == 'Medium' and risk_level == 'Medium') or (danger_level == 'High' and risk_level == 'Low'):
        response_priority = 'P3-Moderate'
    elif risk_level in ['Low', 'Medium']:
        response_priority = 'P4-Advisory'
    else:
        response_priority = 'P5-Routine'
            
    return {
        "anomaly": is_anomaly,
        "severity": severity,
        "risk_level": risk_level,
        "spike_percentage": spike_percentage,
        "latest_actual": current_cases,
        "baseline": baseline,
        "danger_level": danger_level,
        "response_priority": response_priority
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
                "danger_level": metrics["danger_level"],
                "response_priority": metrics["response_priority"],
                "spike_percentage": metrics["spike_percentage"],
                "latest_actual": metrics["latest_actual"],
                "baseline": metrics["baseline"]
            })
            
        return jsonify({"results": results})
    except Exception as e:
        import traceback
        traceback.print_exc() # Print full stack trace to the terminal
        return jsonify({"error": str(e)}), 500


import re as _re

REVIEWED_SYNONYMS_ML = {
    'amoxycillin': 'amoxicillin',
    'amoxicillin': 'amoxicillin',
    'paracetamol': 'acetaminophen',
    'acetaminophen': 'acetaminophen',
    'salbutamol': 'salbutamol',
    'albuterol': 'salbutamol',
    'levosalbutamol': 'levosalbutamol',
    'levalbuterol': 'levosalbutamol',
    'frusemide': 'furosemide',
    'furosemide': 'furosemide',
    'lignocaine': 'lidocaine',
    'lidocaine': 'lidocaine',
    'adrenaline': 'epinephrine',
    'epinephrine': 'epinephrine',
    'noradrenaline': 'norepinephrine',
    'norepinephrine': 'norepinephrine',
    'cyclosporin': 'cyclosporine',
    'ciclosporin': 'cyclosporine',
    'cyclosporine': 'cyclosporine',
    'cephalexin': 'cephalexin',
    'cefalexin': 'cephalexin',
    'cephradine': 'cefradine',
    'cefradine': 'cefradine',
    'indomethacin': 'indomethacin',
    'indometacin': 'indomethacin',
    'glibenclamide': 'glyburide',
    'glyburide': 'glyburide',
    'pethidine': 'meperidine',
    'meperidine': 'meperidine',
    'bendrofluazide': 'bendroflumethiazide',
    'bendroflumethiazide': 'bendroflumethiazide',
    'chlorphenamine': 'chlorpheniramine',
    'chlorpheniramine': 'chlorpheniramine',
    'dicyclomine': 'dicyclomine',
    'dicycloverine': 'dicyclomine',
    'dosulepin': 'dosulepin',
    'dothiepin': 'dosulepin',
    'hydroxyurea': 'hydroxyurea',
    'hydroxycarbamide': 'hydroxyurea',
    'mitozantrone': 'mitoxantrone',
    'mitoxantrone': 'mitoxantrone',
    'nicoumalone': 'acenocoumarol',
    'acenocoumarol': 'acenocoumarol',
    'phenobarbitone': 'phenobarbital',
    'phenobarbital': 'phenobarbital',
    'sulphamethoxazole': 'sulfamethoxazole',
    'sulfamethoxazole': 'sulfamethoxazole',
    'sulphasalazine': 'sulfasalazine',
    'sulfasalazine': 'sulfasalazine',
    'thyroxine': 'levothyroxine',
    'levothyroxine': 'levothyroxine',
    'trimeprazine': 'alimemazine',
    'alimemazine': 'alimemazine',
    'cholecalciferol': 'cholecalciferol',
    'colecalciferol': 'cholecalciferol',
    'aspirin': 'acetylsalicylic acid',
    'acetylsalicylic acid': 'acetylsalicylic acid',
    'doxofylline': 'doxofylline',
    'doxophylline': 'doxofylline',
    'isosorbide-5-mononitrate': 'isosorbide mononitrate',
    'isosorbide mononitrate': 'isosorbide mononitrate',
    'glyceryl trinitrate': 'nitroglycerin',
    'nitroglycerin': 'nitroglycerin',
    'rifampicin': 'rifampicin',
    'rifampin': 'rifampicin',
    'oestradiol': 'estradiol',
    'estradiol': 'estradiol',
    'norethisterone': 'norethisterone',
    'norethindrone': 'norethisterone',
    'vitamin b1 (thiamine)': 'thiamine',
    'thiamine': 'thiamine',
    'vitamin b6 (pyridoxine)': 'pyridoxine',
    'pyridoxine': 'pyridoxine',
    'vitamin c': 'ascorbic acid',
    'ascorbic acid': 'ascorbic acid',
}

COMMON_DRUGS_ML = [
    {'name': 'Fluconazole', 'genericName': 'Fluconazole', 'commonDosages': ['150mg']},
    {'name': 'Clotrimazole Cream', 'genericName': 'Clotrimazole', 'commonDosages': ['1%']},
    {'name': 'Cetirizine', 'genericName': 'Cetirizine', 'commonDosages': ['10mg']},
    {'name': 'Loratadine', 'genericName': 'Loratadine', 'commonDosages': ['10mg']},
    {'name': 'Omeprazole', 'genericName': 'Omeprazole', 'commonDosages': ['20mg', '40mg']},
    {'name': 'Ranitidine', 'genericName': 'Ranitidine', 'commonDosages': ['150mg', '300mg']},
    {'name': 'Ursodeoxycholic Acid', 'genericName': 'Ursodeoxycholic acid', 'commonDosages': ['300mg']},
    {'name': 'Cholestyramine', 'genericName': 'Cholestyramine', 'commonDosages': ['4g']},
    {'name': 'Chlorpheniramine', 'genericName': 'Chlorpheniramine', 'commonDosages': ['4mg']},
    {'name': 'Prednisolone', 'genericName': 'Prednisolone', 'commonDosages': ['5mg', '20mg']},
    {'name': 'Amoxicillin', 'genericName': 'Amoxicillin', 'commonDosages': ['500mg', '1000mg']},
    {'name': 'Tenofovir Disoproxil', 'genericName': 'Tenofovir disoproxil', 'commonDosages': ['300mg']},
    {'name': 'Cotrimoxazole', 'genericName': 'Trimethoprim + Sulfamethoxazole', 'commonDosages': ['960mg']},
    {'name': 'Metformin', 'genericName': 'Metformin', 'commonDosages': ['500mg', '850mg']},
    {'name': 'Gliclazide', 'genericName': 'Gliclazide', 'commonDosages': ['80mg']},
    {'name': 'Oral Rehydration Salts (ORS)', 'genericName': 'Sodium chloride + Potassium chloride + Sodium citrate + Dextrose', 'commonDosages': ['1 sachet']},
    {'name': 'Zinc Sulfate', 'genericName': 'Zinc sulfate', 'commonDosages': ['20mg']},
    {'name': 'Salbutamol Inhaler', 'genericName': 'Albuterol', 'commonDosages': ['100mcg/dose']},
    {'name': 'Fluticasone Inhaler', 'genericName': 'Fluticasone', 'commonDosages': ['110mcg']},
    {'name': 'Amlodipine', 'genericName': 'Amlodipine', 'commonDosages': ['5mg', '10mg']},
    {'name': 'Enalapril', 'genericName': 'Enalapril', 'commonDosages': ['5mg', '10mg']},
    {'name': 'Sumatriptan', 'genericName': 'Sumatriptan', 'commonDosages': ['50mg']},
    {'name': 'Naproxen', 'genericName': 'Naproxen', 'commonDosages': ['250mg', '500mg']},
    {'name': 'Ibuprofen', 'genericName': 'Ibuprofen', 'commonDosages': ['200mg', '400mg']},
    {'name': 'Pregabalin', 'genericName': 'Pregabalin', 'commonDosages': ['75mg', '150mg']},
    {'name': 'Mannitol', 'genericName': 'Mannitol', 'commonDosages': ['20%']},
    {'name': 'Silymarin', 'genericName': 'Silymarin', 'commonDosages': ['140mg']},
    {'name': 'Artemether + Lumefantrine', 'genericName': 'Artemether + Lumefantrine', 'commonDosages': ['80/480mg']},
    {'name': 'Chloroquine', 'genericName': 'Chloroquine', 'commonDosages': ['250mg', '500mg']},
    {'name': 'Acyclovir', 'genericName': 'Acyclovir', 'commonDosages': ['400mg', '800mg']},
    {'name': 'Calamine Lotion', 'genericName': 'Calamine', 'commonDosages': ['Topical']},
    {'name': 'Paracetamol', 'genericName': 'Acetaminophen', 'commonDosages': ['500mg', '1000mg']},
    {'name': 'Paracetamol (Low Dose)', 'genericName': 'Acetaminophen', 'commonDosages': ['500mg']},
    {'name': 'Ciprofloxacin', 'genericName': 'Ciprofloxacin', 'commonDosages': ['250mg', '500mg']},
    {'name': 'Ceftriaxone', 'genericName': 'Ceftriaxone', 'commonDosages': ['1g', '2g']},
    {'name': 'Metoclopramide', 'genericName': 'Metoclopramide', 'commonDosages': ['10mg']},
    {'name': 'Tenofovir Alafenamide', 'genericName': 'Tenofovir alafenamide', 'commonDosages': ['25mg']},
    {'name': 'Entecavir', 'genericName': 'Entecavir', 'commonDosages': ['0.5mg']},
    {'name': 'Sofosbuvir + Velpatasvir', 'genericName': 'Sofosbuvir + Velpatasvir', 'commonDosages': ['400/100mg']},
    {'name': 'Pegylated Interferon Alfa-2a', 'genericName': 'Peginterferon alfa-2a', 'commonDosages': ['180mcg']},
    {'name': 'Ribavirin', 'genericName': 'Ribavirin', 'commonDosages': ['200mg', '400mg']},
    {'name': 'Pentoxifylline', 'genericName': 'Pentoxifylline', 'commonDosages': ['400mg']},
    {'name': 'Rifampicin + Isoniazid + Pyrazinamide + Ethambutol (RHZE)', 'genericName': 'Rifampicin + Isoniazid + Pyrazinamide + Ethambutol', 'commonDosages': ['FDC']},
    {'name': 'Pyridoxine (Vitamin B6)', 'genericName': 'Pyridoxine', 'commonDosages': ['25mg']},
    {'name': 'Pseudoephedrine', 'genericName': 'Pseudoephedrine', 'commonDosages': ['60mg']},
    {'name': 'Amoxicillin + Clavulanate', 'genericName': 'Amoxicillin + Clavulanate', 'commonDosages': ['625mg']},
    {'name': 'Azithromycin', 'genericName': 'Azithromycin', 'commonDosages': ['250mg', '500mg']},
    {'name': 'Flavonoid (Micronized Purified Flavonoid Fraction)', 'genericName': 'Diosmin', 'commonDosages': ['500mg']},
    {'name': 'Hydrocortisone Suppository', 'genericName': 'Hydrocortisone', 'commonDosages': ['25mg']},
    {'name': 'Aspirin', 'genericName': 'Acetylsalicylic acid', 'commonDosages': ['75mg', '300mg']},
    {'name': 'Warfarin', 'genericName': 'Warfarin', 'commonDosages': ['1mg', '2mg', '5mg']},
    {'name': 'Clopidogrel', 'genericName': 'Clopidogrel', 'commonDosages': ['75mg']},
    {'name': 'Diosmin + Hesperidin', 'genericName': 'Diosmin + Hesperidin', 'commonDosages': ['500mg']},
    {'name': 'Levothyroxine', 'genericName': 'Levothyroxine', 'commonDosages': ['50mcg', '100mcg']},
    {'name': 'Carbimazole', 'genericName': 'Carbimazole', 'commonDosages': ['15mg']},
    {'name': 'Propranolol', 'genericName': 'Propranolol', 'commonDosages': ['40mg']},
    {'name': 'Glucose Tablets', 'genericName': 'Dextrose', 'commonDosages': ['15g']},
    {'name': 'Meloxicam', 'genericName': 'Meloxicam', 'commonDosages': ['7.5mg', '15mg']},
    {'name': 'Methotrexate', 'genericName': 'Methotrexate', 'commonDosages': ['2.5mg', '10mg']},
    {'name': 'Betahistine', 'genericName': 'Betahistine', 'commonDosages': ['16mg']},
    {'name': 'Cinnarizine', 'genericName': 'Cinnarizine', 'commonDosages': ['25mg']},
    {'name': 'Benzoyl Peroxide Gel', 'genericName': 'Benzoyl peroxide', 'commonDosages': ['5%']},
    {'name': 'Doxycycline', 'genericName': 'Doxycycline', 'commonDosages': ['100mg']},
    {'name': 'Nitrofurantoin', 'genericName': 'Nitrofurantoin', 'commonDosages': ['100mg']},
    {'name': 'Betamethasone Dipropionate Ointment', 'genericName': 'Betamethasone dipropionate', 'commonDosages': ['0.05%']},
    {'name': 'Coal Tar Ointment', 'genericName': 'Coal tar', 'commonDosages': ['5%']},
    {'name': 'Mupirocin Ointment', 'genericName': 'Mupirocin', 'commonDosages': ['2%']},
    {'name': 'Flucloxacillin', 'genericName': 'Flucloxacillin', 'commonDosages': ['500mg']},
]

FORMULATION_PATTERNS_ML = [
    (_re.compile(r'\bdry\s+syrup\b', _re.IGNORECASE), 'Dry Syrup'),
    (_re.compile(r'\boral\s+drops\b', _re.IGNORECASE), 'Oral Drops'),
    (_re.compile(r'\beye\s+drops\b', _re.IGNORECASE), 'Eye Drops'),
    (_re.compile(r'\bear\s+drops\b', _re.IGNORECASE), 'Ear Drops'),
    (_re.compile(r'\bnasal\s+spray\b', _re.IGNORECASE), 'Nasal Spray'),
    (_re.compile(r'\bnasal\s+drops\b', _re.IGNORECASE), 'Nasal Drops'),
    (_re.compile(r'\b(?:dt|dispersible\s+tablets?)\b', _re.IGNORECASE), 'Dispersible Tablet'),
    (_re.compile(r'\bfilm-coated\s+tablets?\b', _re.IGNORECASE), 'Film-Coated Tablet'),
    (_re.compile(r'\bchewable\s+tablets?\b', _re.IGNORECASE), 'Chewable Tablet'),
    (_re.compile(r'\beffervescent\s+tablets?\b', _re.IGNORECASE), 'Effervescent Tablet'),
    (_re.compile(r'\btablets?\b', _re.IGNORECASE), 'Tablet'),
    (_re.compile(r'\bcapsules?\b', _re.IGNORECASE), 'Capsule'),
    (_re.compile(r'\brotacaps?\b', _re.IGNORECASE), 'Rotacap'),
    (_re.compile(r'\bsmartules?\b', _re.IGNORECASE), 'Smartule'),
    (_re.compile(r'\brespules?\b', _re.IGNORECASE), 'Respules'),
    (_re.compile(r'\binhalers?\b', _re.IGNORECASE), 'Inhaler'),
    (_re.compile(r'\bexpectorants?\b', _re.IGNORECASE), 'Expectorant'),
    (_re.compile(r'\bsuspensions?\b', _re.IGNORECASE), 'Suspension'),
    (_re.compile(r'\bsyrups?\b', _re.IGNORECASE), 'Syrup'),
    (_re.compile(r'\binjections?\b', _re.IGNORECASE), 'Injection'),
    (_re.compile(r'\binfusions?\b', _re.IGNORECASE), 'Infusion'),
    (_re.compile(r'\bointments?\b', _re.IGNORECASE), 'Ointment'),
    (_re.compile(r'\bcreams?\b', _re.IGNORECASE), 'Cream'),
    (_re.compile(r'\blotions?\b', _re.IGNORECASE), 'Lotion'),
    (_re.compile(r'\bgels?\b', _re.IGNORECASE), 'Gel'),
    (_re.compile(r'\bsuppositor(?:y|ies)\b', _re.IGNORECASE), 'Suppository'),
    (_re.compile(r'\bsachets?\b', _re.IGNORECASE), 'Sachet'),
    (_re.compile(r'\bpowders?\b', _re.IGNORECASE), 'Powder'),
    (_re.compile(r'\bsolutions?\b', _re.IGNORECASE), 'Solution'),
    (_re.compile(r'\bdrops\b', _re.IGNORECASE), 'Drops'),
    (_re.compile(r'\bsprays?\b', _re.IGNORECASE), 'Spray'),
    (_re.compile(r'\bpatches\b|\bpatch\b', _re.IGNORECASE), 'Patch')
]

STRENGTH_TOKEN_RE_ML = _re.compile(
    r'\b\d+(?:\.\d+)?\s*(?:mg|gm|g|mcg|ug|ml|l|%|iu|units|meq|mmol|million\s+spores|spores|billions|lac|lakh)(?:\s*/\s*\d+(?:\.\d+)?\s*(?:mg|gm|g|mcg|ug|ml|l|dose))?',
    _re.IGNORECASE
)
FORM_STRIP_RE_ML = _re.compile(
    r"\b(?:dispersible\s+tablets?|film-coated\s+tablets?|chewable\s+tablets?|effervescent\s+tablets?|dry\s+syrup|oral\s+drops|eye\s+drops|ear\s+drops|nasal\s+spray|nasal\s+drops|tablets?|capsules?|rotacaps?|smartules?|respules?|inhalers?|expectorants?|suspensions?|syrups?|injections?|infusions?|ointments?|creams?|lotions?|gels?|suppositor(?:y|ies)|sachets?|powders?|solutions?|drops|sprays?|patches|\d+\s*'\s*s)\b",
    _re.IGNORECASE
)
NO_INTERACTION_MSG_ML = 'No interaction found in the available reference dataset.'
NO_INTERACTION_MESSAGE_ML = NO_INTERACTION_MSG_ML

_ml_catalog_drugs = []
_ml_canonical_set = set()
_ml_canonical_display = {}
_ml_pair_map = {}

def _init_ml_interaction_index():
    global interactions_data, _ml_catalog_drugs
    if _ml_canonical_set:
        return
    try:
        drugs_file = os.path.join(data_dir, 'drugs_clean.json')
        if os.path.exists(drugs_file):
            with open(drugs_file, 'r', encoding='utf-8') as fh:
                _ml_catalog_drugs = json.load(fh)
    except Exception:
        _ml_catalog_drugs = []

    if not interactions_data:
        try:
            with open(os.path.join(data_dir, 'interactions_clean.json'), 'r', encoding='utf-8') as fh:
                interactions_data = json.load(fh)
        except Exception:
            interactions_data = []

    for entry in interactions_data:
        r1 = (entry.get('drug1') or '').strip()
        r2 = (entry.get('drug2') or '').strip()
        if not r1 or not r2:
            continue
        k1 = r1.lower()
        k2 = r2.lower()
        _ml_canonical_set.add(k1)
        _ml_canonical_set.add(k2)
        if k1 not in _ml_canonical_display:
            _ml_canonical_display[k1] = r1
        if k2 not in _ml_canonical_display:
            _ml_canonical_display[k2] = r2
        pk = f"{k1}||{k2}" if k1 < k2 else f"{k2}||{k1}"
        if pk not in _ml_pair_map:
            _ml_pair_map[pk] = {
                'drug1': r1,
                'drug2': r2,
                'severity': entry.get('severity') or 'moderate',
                'description': entry.get('description') or ''
            }

def _extract_formulation_ml(text):
    if not text or not isinstance(text, str):
        return 'Unspecified'
    for pat, label in FORMULATION_PATTERNS_ML:
        if pat.search(text):
            return label
    return 'Unspecified'

def _find_catalog_match_ml(input_name):
    if not input_name or not isinstance(input_name, str):
        return None
    trimmed = input_name.strip()
    lower = trimmed.lower()
    for pool in (_ml_catalog_drugs, COMMON_DRUGS_ML):
        for d in pool:
            if d.get('name') == trimmed or d.get('brand') == trimmed:
                return d
    for pool in (_ml_catalog_drugs, COMMON_DRUGS_ML):
        for d in pool:
            if (d.get('name') or '').lower() == lower or (d.get('brand') or '').lower() == lower or (d.get('genericName') or '').lower() == lower:
                return d
    return None

def _parse_med_entry_ml(raw_input):
    orig_name = ''
    inp_dosage = ''
    if isinstance(raw_input, str):
        orig_name = raw_input.strip()
    elif isinstance(raw_input, dict):
        orig_name = str(raw_input.get('name') or raw_input.get('drugName') or '').strip()
        inp_dosage = str(raw_input.get('dosage') or raw_input.get('strength') or '').strip()

    if not orig_name or not _re.search(r'[a-zA-Z]', orig_name):
        return {
            'valid': False,
            'originalName': orig_name or str(raw_input if raw_input is not None else ''),
            'brand': '',
            'strength': inp_dosage or 'Unspecified',
            'formulation': 'Unspecified',
            'catalogMatched': False,
            'resolvedIngredients': [],
            'unresolvedIngredients': ['<malformed_or_empty_input>'],
            'allIngredientsNormalized': []
        }

    cat_doc = _find_catalog_match_ml(orig_name)
    brand_label = (cat_doc.get('brand') or cat_doc.get('name') if cat_doc else None) or orig_name
    gen_source = (cat_doc.get('genericName') if cat_doc else None) or orig_name

    prim = _re.sub(r'^Generic\s+Name\s+', '', str(gen_source), flags=_re.IGNORECASE).strip()
    if _re.search(r'\bAlso\s+Known\s+As\s*:', prim, flags=_re.IGNORECASE):
        prim = _re.split(r'\bAlso\s+Known\s+As\s*:', prim, maxsplit=1, flags=_re.IGNORECASE)[0].strip()

    raw_slots = [s.strip() for s in prim.split('+') if s.strip()]
    resolved_ings = []
    unresolved_ings = []
    all_norm = []
    extracted_strengths = []

    for slot in raw_slots:
        st_matches = [_re.sub(r'\s+', ' ', m.group(0)).strip() for m in STRENGTH_TOKEN_RE_ML.finditer(slot)]
        extracted_strengths.extend(st_matches)
        without_st = STRENGTH_TOKEN_RE_ML.sub(' ', slot)
        prelim = _re.sub(r'\s+', ' ', without_st).strip().lower()
        if prelim not in _ml_canonical_set and prelim not in REVIEWED_SYNONYMS_ML:
            without_st = FORM_STRIP_RE_ML.sub(' ', without_st)
        cleaned = _re.sub(r'\s+', ' ', without_st).strip(' -/,.:;').lower()
        if not cleaned or not _re.search(r'[a-zA-Z]', cleaned):
            unresolved_ings.append(slot or orig_name)
            continue
        canon = None
        if cleaned in _ml_canonical_set:
            canon = cleaned
        elif cleaned in REVIEWED_SYNONYMS_ML and REVIEWED_SYNONYMS_ML[cleaned] in _ml_canonical_set:
            canon = REVIEWED_SYNONYMS_ML[cleaned]

        if canon:
            if not any(r['canonical'] == canon for r in resolved_ings):
                resolved_ings.append({
                    'raw': cleaned,
                    'canonical': canon,
                    'display': _ml_canonical_display.get(canon, canon)
                })
            if canon not in all_norm:
                all_norm.append(canon)
        else:
            if cleaned not in unresolved_ings:
                unresolved_ings.append(cleaned)
            if cleaned not in all_norm:
                all_norm.append(cleaned)

    if not raw_slots:
        unresolved_ings.append(orig_name.lower())

    cat_dosages = ', '.join(cat_doc.get('commonDosages') or []) if cat_doc else ''
    name_strengths = ' + '.join(_re.sub(r'\s+', ' ', m.group(0)).strip() for m in STRENGTH_TOKEN_RE_ML.finditer(brand_label))
    strength = ' + '.join(extracted_strengths) or cat_dosages or name_strengths or inp_dosage or 'Unspecified'
    formulation = _extract_formulation_ml(brand_label)
    if formulation == 'Unspecified':
        formulation = _extract_formulation_ml(orig_name)

    return {
        'valid': True,
        'originalName': orig_name,
        'brand': brand_label,
        'strength': strength,
        'formulation': formulation,
        'catalogMatched': bool(cat_doc),
        'resolvedIngredients': resolved_ings,
        'unresolvedIngredients': unresolved_ings,
        'allIngredientsNormalized': all_norm
    }


def analyze_medication_safety_ml(drugs):
    _init_ml_interaction_index()
    if not isinstance(drugs, list):
        return {
            'hasInteraction': False,
            'verificationIncomplete': True,
            'statusMessage': 'Automated interaction checking is incomplete: medication list is missing or malformed.',
            'referenceDisclaimer': NO_INTERACTION_MSG_ML,
            'interactions': [],
            'warnings': [],
            'duplicateIngredients': [],
            'unresolvedDrugs': [],
            'unresolvedIngredients': ['<malformed_input>']
        }

    parsed_meds = [_parse_med_entry_ml(item) for item in drugs]
    valid_meds = [m for m in parsed_meds if m['valid']]
    malformed_count = len(parsed_meds) - len(valid_meds)

    unresolved_drugs = []
    unresolved_ings_list = []

    for med in parsed_meds:
        if (not med['valid']) or med['unresolvedIngredients']:
            for u in med['unresolvedIngredients']:
                if u not in unresolved_ings_list:
                    unresolved_ings_list.append(u)
            unresolved_drugs.append({
                'drug': med['originalName'] or '<malformed_input>',
                'brand': med['brand'] or med['originalName'] or '<malformed_input>',
                'strength': med['strength'],
                'formulation': med['formulation'],
                'unresolvedIngredients': med['unresolvedIngredients'],
                'message': f"Automated interaction checking is incomplete for \"{med['originalName'] or '<malformed_input>'}\" (unresolved ingredient(s): {', '.join(med['unresolvedIngredients'])})."
            })

    warnings = []
    duplicate_ingredients = []

    for i in range(len(valid_meds)):
        for j in range(i + 1, len(valid_meds)):
            med_a = valid_meds[i]
            med_b = valid_meds[j]

            shared = [ing for ing in med_a['allIngredientsNormalized'] if ing in med_b['allIngredientsNormalized']]
            for sh in shared:
                disp_sh = _ml_canonical_display.get(sh, sh)
                dup_desc = f"Duplicate active ingredient ({disp_sh}) present in both \"{med_a['originalName']}\" [{med_a['strength']}, {med_a['formulation']}] and \"{med_b['originalName']}\" [{med_b['strength']}, {med_b['formulation']}]."
                dup_entry = {
                    'type': 'duplicate_ingredient',
                    'drug1': med_a['originalName'],
                    'drug1Brand': med_a['brand'],
                    'drug1Strength': med_a['strength'],
                    'drug1Formulation': med_a['formulation'],
                    'drug2': med_b['originalName'],
                    'drug2Brand': med_b['brand'],
                    'drug2Strength': med_b['strength'],
                    'drug2Formulation': med_b['formulation'],
                    'interactingIngredients': [disp_sh, disp_sh],
                    'ingredient': disp_sh,
                    'severity': 'high',
                    'description': dup_desc,
                    'message': dup_desc
                }
                duplicate_ingredients.append(dup_entry)
                warnings.append(dup_entry)

            seen_pk = set()
            for ing_a in med_a['resolvedIngredients']:
                for ing_b in med_b['resolvedIngredients']:
                    c1 = ing_a['canonical']
                    c2 = ing_b['canonical']
                    if c1 == c2:
                        continue
                    pk = f"{c1}||{c2}" if c1 < c2 else f"{c2}||{k1}" if False else (f"{c1}||{c2}" if c1 < c2 else f"{c2}||{c1}")
                    if pk in seen_pk:
                        continue
                    seen_pk.add(pk)
                    ref_hit = _ml_pair_map.get(pk)
                    if ref_hit:
                        msg = f"{med_a['originalName']} [{med_a['strength']}, {med_a['formulation']}] + {med_b['originalName']} [{med_b['strength']}, {med_b['formulation']}] ({ref_hit['drug1']} + {ref_hit['drug2']}): {ref_hit['description']}"
                        warnings.append({
                            'type': 'drug_interaction',
                            'drug1': med_a['originalName'],
                            'drug1Brand': med_a['brand'],
                            'drug1Strength': med_a['strength'],
                            'drug1Formulation': med_a['formulation'],
                            'drug2': med_b['originalName'],
                            'drug2Brand': med_b['brand'],
                            'drug2Strength': med_b['strength'],
                            'drug2Formulation': med_b['formulation'],
                            'interactingIngredients': [ref_hit['drug1'], ref_hit['drug2']],
                            'severity': ref_hit['severity'],
                            'description': ref_hit['description'],
                            'message': msg
                        })

    insufficient = len(valid_meds) < 2
    verification_incomplete = bool(unresolved_ings_list) or (malformed_count > 0) or insufficient

    status_msg = NO_INTERACTION_MSG_ML
    if warnings and verification_incomplete:
        status_msg = f"Interaction or duplicate-ingredient warnings detected. Automated interaction checking is also incomplete for unresolved ingredient(s): {', '.join(unresolved_ings_list) or 'malformed/insufficient input'}."
    elif warnings:
        status_msg = 'Interaction or duplicate-ingredient warnings found in the available reference dataset.'
    elif verification_incomplete:
        if unresolved_ings_list:
            status_msg = f"Automated interaction checking is incomplete. Unresolved ingredient(s): {', '.join(unresolved_ings_list)}. Do not assume this combination is safe."
        else:
            status_msg = 'Automated interaction checking is incomplete: at least two valid medications are required for pairwise interaction checking.'

    return {
        'hasInteraction': len(warnings) > 0,
        'verificationIncomplete': verification_incomplete,
        'statusMessage': status_msg,
        'referenceDisclaimer': NO_INTERACTION_MSG_ML,
        'interactions': warnings,
        'warnings': warnings,
        'duplicateIngredients': duplicate_ingredients,
        'unresolvedDrugs': unresolved_drugs,
        'unresolvedIngredients': unresolved_ings_list
    }


@app.route('/api/ml/check-interactions', methods=['POST'])
@require_internal_auth
def check_interactions():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or 'drugs' not in data or not isinstance(data.get('drugs'), list):
        return jsonify(analyze_medication_safety_ml(None)), 400
    return jsonify(analyze_medication_safety_ml(data.get('drugs', [])))


@app.route('/model-status', methods=['GET'])
@require_internal_auth
def model_status():
    """Return ML engine health and training status."""
    return jsonify({
        'status': 'active',
        'lastTrained': None,
        'dataPoints': len(symptom_data),
        'dataPointUnit': 'reference disease profiles',
        'clinicalValidation': 'not established',
        'models': {
            'diseasePrediction': 'TF-IDF + Cosine Similarity' if SKLEARN_AVAILABLE else 'Intersection Fallback',
            'outbreakForecasting': 'unavailable',
            'interactionChecker': f'{len(interactions_data):,} reference drug pairs (not clinical certification)'
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
    from risk_input import validate_patient_risk_input, RiskInputError
    from werkzeug.exceptions import BadRequest, UnsupportedMediaType
    try:
        data = request.get_json()
    except (BadRequest, UnsupportedMediaType):
        return jsonify({'error': 'Invalid risk request'}), 400
    if not data:
        return jsonify({'error': 'Request body is required'}), 400
    try:
        age, chronic_conditions, consult_count, active_rx = validate_patient_risk_input(data)
    except RiskInputError:
        return jsonify({'error': 'Invalid risk request'}), 400

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
        results = search_reference_diseases(request.args.get('q', ''), data_dir)
        return jsonify({'results': results}), 200
    except ValueError:
        return jsonify({'error': 'Invalid disease query'}), 400
    except ReferenceDataError:
        return jsonify({'error': 'Disease reference unavailable'}), 503


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
    """Readiness requires delivered reference files and loaded symptom profiles."""
    try:
        if not symptom_data:
            raise ReferenceDataError()
        references = reference_status(data_dir)
        return jsonify({'status': 'ready', 'references': references}), 200
    except ReferenceDataError:
        return jsonify({'status': 'unavailable', 'error': 'Reference data unavailable'}), 503


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    if ml_qa_mode and port != 5101:
        raise RuntimeError('ML QA must use port 5101')
    host = '0.0.0.0' if not ml_qa_mode and os.environ.get('MEDISYNC_ML_ALLOW_REMOTE_BIND') == 'true' else '127.0.0.1'
    app.run(host=host, port=port,
            debug=False if ml_qa_mode else os.environ.get('FLASK_DEBUG', 'false').lower() == 'true')
