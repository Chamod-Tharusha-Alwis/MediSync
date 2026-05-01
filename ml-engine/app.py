import os
import json
import sqlite3
from datetime import datetime
from flask import Flask, request, jsonify
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
CORS(app, supports_credentials=True, origins=["http://localhost:3000", "http://127.0.0.1:3000"])

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
    conn.commit()
    conn.close()

init_db()

try:
    with open(os.path.join(data_dir, 'symptom_map.json'), 'r', encoding='utf-8') as f:
        symptom_data = json.load(f)
    print("Loaded symptom_map.json")
except Exception as e:
    print("Warning: Could not load symptom_map.json:", e)

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

@app.route('/api/ml/predict-disease', methods=['POST'])
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


@app.route('/api/ml/predict-outbreak', methods=['GET', 'POST'])
def predict_outbreak():
    """
    Predicts outbreaks using Prophet based on ingested SQLite data.
    """
    if request.method == 'POST':
        data = request.json or {}
    else:
        data = request.args

    district = data.get('district')
    disease = data.get('disease')
    days_ahead = int(data.get('days_ahead', 14))

    if not district or not disease:
        return jsonify({'error': 'Both district and disease are required'}), 400

    try:
        conn = sqlite3.connect(db_path)
        df = pd.read_sql_query('''
            SELECT date as ds, sum(count) as y 
            FROM outbreak_tracking 
            WHERE district=? AND disease=? 
            GROUP BY date
            ORDER BY date
        ''', conn, params=(district, disease))
        conn.close()

        # Check if we have enough data
        if len(df) < 5:
            # Return basic mock if not enough data
            return jsonify({
                'warning': 'Not enough data points for accurate forecasting. Returning estimates.',
                'district': district,
                'disease': disease,
                'forecast': [
                    {'date': (datetime.now() + pd.Timedelta(days=i)).strftime('%Y-%m-%d'), 'predicted_cases': 1, 'z_score': 0} 
                    for i in range(1, days_ahead+1)
                ]
            })

        if not PROPHET_AVAILABLE:
            # Fallback naive forecast (moving average) if Prophet isn't installed
            avg = df['y'].mean()
            std = df['y'].std() if len(df) > 1 else 1.0
            std = max(0.1, std) # prevent div by zero
            
            forecast = []
            for i in range(1, days_ahead+1):
                dt = (datetime.now() + pd.Timedelta(days=i)).strftime('%Y-%m-%d')
                z_score = (avg - df['y'].mean()) / std
                forecast.append({
                    'date': dt,
                    'predicted_cases': max(0, int(avg)),
                    'z_score': float(z_score)
                })
            
            return jsonify({
                'warning': 'Prophet library not installed. Using Naive Moving Average.',
                'district': district,
                'disease': disease,
                'forecast': forecast
            })

        # Run Prophet
        m = Prophet(daily_seasonality=False, weekly_seasonality=True, yearly_seasonality=False)
        m.fit(df)
        
        future = m.make_future_dataframe(periods=days_ahead)
        forecast_df = m.predict(future)
        
        # Calculate z-score based on historical residuals
        historical_mean = df['y'].mean()
        historical_std = df['y'].std() if len(df) > 1 else 1.0
        historical_std = max(0.1, historical_std)
        
        # Filter only future dates
        future_forecast = forecast_df.tail(days_ahead)
        
        results = []
        for _, row in future_forecast.iterrows():
            pred_y = max(0, row['yhat'])
            z_score = (pred_y - historical_mean) / historical_std
            
            results.append({
                'date': row['ds'].strftime('%Y-%m-%d'),
                'predicted_cases': int(round(pred_y)),
                'z_score': float(z_score)
            })

        return jsonify({
            'district': district,
            'disease': disease,
            'forecast': results
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/ml/check-interactions', methods=['POST'])
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

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)