import sqlite3
import random
from datetime import datetime, timedelta
import os
import csv

# Config
DB_PATH = os.path.join(os.path.dirname(__file__), '../medisync.db')
DAYS = 90

# 25 Sri Lankan Districts with relative population weights (1 to 10)
DISTRICTS = {
    'Colombo': 10, 'Gampaha': 9, 'Kurunegala': 7, 'Kandy': 6, 'Kalutara': 5,
    'Ratnapura': 5, 'Galle': 4, 'Anuradhapura': 4, 'Badulla': 4, 'Matara': 4,
    'Puttalam': 3, 'Kegalle': 3, 'Ampara': 3, 'Nuwara Eliya': 3, 'Jaffna': 3,
    'Batticaloa': 2, 'Hambantota': 2, 'Matale': 2, 'Trincomalee': 2, 'Moneragala': 2,
    'Polonnaruwa': 1, 'Vavuniya': 1, 'Mannar': 1, 'Kilinochchi': 1, 'Mullaitivu': 1
}

# Diseases to exclude because they aren't communicable/trackable outbreaks
EXCLUDED_DISEASES = {
    'Allergy', 'GERD', 'Acne', 'Arthritis', 'Migraine', 'Diabetes', 
    'Hypertension', 'Fungal infection', 'Osteoarthristis', '(vertigo) Paroymsal  Positional Vertigo',
    'Heart attack', 'Cervical spondylosis', 'Paralysis (brain hemorrhage)', 'Hypothyroidism',
    'Hyperthyroidism', 'Hypoglycemia', 'Varicose veins', 'Dimorphic hemmorhoids(piles)',
    'Alcoholic hepatitis', 'Psoriasis', 'Impetigo', 'Drug Reaction', 'Peptic ulcer diseae'
}

def get_diseases():
    csv_path = os.path.join(os.path.dirname(__file__), '../../docs/disease_rankings_full.csv')
    valid_diseases = []
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                d_name = row.get('disease_name', '')
                if not d_name or d_name in EXCLUDED_DISEASES:
                    continue
                valid_diseases.append({
                    'disease': d_name,
                    'icd_code': row.get('icd_code', ''),
                    'base_danger_level': row.get('base_danger_level', 'Medium'),
                    'communicable': row.get('communicable', 'no').lower(),
                    'avg_severity': float(row.get('avg_severity', 5.0))
                })
    except Exception as e:
        print(f"Failed to load disease_rankings_full.csv: {e}")
    return valid_diseases

DISEASES = get_diseases()

def generate_seed_data():
    if not os.path.exists(DB_PATH):
        print(f"Error: Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Clear old data for idempotency
    c.execute("DELETE FROM outbreak_tracking")
    
    end_date = datetime.now()
    start_date = end_date - timedelta(days=DAYS)
    
    rows_inserted = 0

    print(f"Starting seed generation across {len(DISEASES)} diseases. This will take a moment...")

    # Base case generation
    for i in range(DAYS):
        current_date = (start_date + timedelta(days=i)).strftime('%Y-%m-%d')
        
        for district, weight in DISTRICTS.items():
            for d in DISEASES:
                disease = d['disease']
                icd = d['icd_code']
                danger = d['base_danger_level']
                comm = d['communicable']
                sev = d['avg_severity']

                # Sparse seeding strategy
                if danger == 'High' and comm == 'yes':
                    prob = 0.05
                elif danger == 'High':
                    prob = 0.01
                elif danger == 'Medium' and comm == 'yes':
                    prob = 0.005
                elif danger == 'Medium':
                    prob = 0.002
                elif danger == 'Low' and comm == 'yes':
                    prob = 0.001
                else:
                    prob = 0.0005
                
                # Boost common diseases so they always show up
                if disease in ["Common Cold", "Gastroenteritis", "Dengue"]:
                    prob = 1.0
                
                if random.random() > prob:
                    continue

                if disease in ["Common Cold", "Gastroenteritis", "Dengue"]:
                    base = weight * random.uniform(1.0, 3.0)
                else:
                    # Severity drives volume when it does happen
                    base = weight * random.uniform(0.1, 0.5) * (sev / 5.0)
                
                cases = int(base)
                if cases == 0 and random.random() < 0.5:
                    cases = 1
                
                # SPIKE LOGIC: Dengue in Colombo over the last 7 days
                if district == "Colombo" and disease == "Dengue" and i >= (DAYS - 7):
                    cases = int(cases * random.uniform(5.0, 8.0)) + 50
                
                if cases > 0:
                    c.execute('''
                        INSERT INTO outbreak_tracking (district, disease, icd_code, count, date) 
                        VALUES (?, ?, ?, ?, ?)
                    ''', (district, disease, icd, cases, current_date))
                    rows_inserted += 1
                    
        # Commit every day to save memory
        conn.commit()
                    
    conn.close()
    
    print("=" * 40)
    print("Outbreak Data Seeded Successfully!")
    print(f"Total Rows Inserted: {rows_inserted}")
    print(f"Date Range: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
    print("Spike Injected: Dengue in Colombo (Last 7 Days)")
    print("=" * 40)

if __name__ == "__main__":
    generate_seed_data()
