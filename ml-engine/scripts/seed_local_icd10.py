import os
import json
import sqlite3
import csv

# Explicit danger level mapping for MediSync's core 41 diseases
CORE_DISEASE_CONFIG = {
    'Dengue': {'danger': 'High', 'comm': 'yes'},
    'Malaria': {'danger': 'High', 'comm': 'yes'},
    'Tuberculosis': {'danger': 'High', 'comm': 'yes'},
    'AIDS': {'danger': 'High', 'comm': 'yes'},
    'Typhoid': {'danger': 'High', 'comm': 'yes'},
    'Pneumonia': {'danger': 'High', 'comm': 'yes'},
    'Gastroenteritis': {'danger': 'Medium', 'comm': 'yes'},
    'hepatitis A': {'danger': 'High', 'comm': 'yes'},
    'Hepatitis B': {'danger': 'High', 'comm': 'yes'},
    'Hepatitis C': {'danger': 'High', 'comm': 'yes'},
    'Hepatitis D': {'danger': 'High', 'comm': 'yes'},
    'Hepatitis E': {'danger': 'High', 'comm': 'yes'},
    'Chicken pox': {'danger': 'High', 'comm': 'yes'},
    
    'Common Cold': {'danger': 'Low', 'comm': 'yes'},
    'Allergy': {'danger': 'Low', 'comm': 'no'},
    'Fungal infection': {'danger': 'Low', 'comm': 'no'},
    'Acne': {'danger': 'Low', 'comm': 'no'},
    'Psoriasis': {'danger': 'Low', 'comm': 'no'},
    'Impetigo': {'danger': 'Low', 'comm': 'no'},
    'Varicose veins': {'danger': 'Low', 'comm': 'no'},
    'Cervical spondylosis': {'danger': 'Low', 'comm': 'no'},
    'Arthritis': {'danger': 'Low', 'comm': 'no'},
    'Osteoarthristis': {'danger': 'Low', 'comm': 'no'},
    '(vertigo) Paroymsal  Positional Vertigo': {'danger': 'Low', 'comm': 'no'},
    'Dimorphic hemmorhoids(piles)': {'danger': 'Low', 'comm': 'no'},
    
    'Urinary tract infection': {'danger': 'Medium', 'comm': 'no'},
    'GERD': {'danger': 'Medium', 'comm': 'no'},
    'Bronchial Asthma': {'danger': 'Medium', 'comm': 'no'},
    'Diabetes': {'danger': 'Medium', 'comm': 'no'},
    'Hypertension': {'danger': 'Medium', 'comm': 'no'},
    'Migraine': {'danger': 'Medium', 'comm': 'no'},
    'Heart attack': {'danger': 'High', 'comm': 'no'},
    'Paralysis (brain hemorrhage)': {'danger': 'Medium', 'comm': 'no'},
    'Jaundice': {'danger': 'Medium', 'comm': 'no'},
    'Chronic cholestasis': {'danger': 'Medium', 'comm': 'no'},
    'Alcoholic hepatitis': {'danger': 'Medium', 'comm': 'no'},
    'Drug Reaction': {'danger': 'Medium', 'comm': 'no'},
    'Peptic ulcer diseae': {'danger': 'Medium', 'comm': 'no'},
    'Hyperthyroidism': {'danger': 'Medium', 'comm': 'no'},
    'Hypothyroidism': {'danger': 'Medium', 'comm': 'no'},
    'Hypoglycemia': {'danger': 'Medium', 'comm': 'no'}
}

def categorize_icd10_code(code, name=""):
    """
    Step 1: Smart categorization based on ICD-10 chapters and clinical prefixes.
    Returns (base_danger_level, communicable, avg_severity)
    """
    code_upper = str(code).strip().upper()
    
    # Check if code belongs to A00-B99 (Infectious and parasitic diseases)
    if code_upper.startswith(('A', 'B')):
        return ('High', 'yes', 4.5)
        
    # Check J00-J06 (Acute upper respiratory like Common Cold)
    if code_upper.startswith(('J00', 'J01', 'J02', 'J03', 'J04', 'J05', 'J06')):
        return ('Low', 'yes', 2.5)
        
    # Check J09-J18 (Influenza and Pneumonia)
    if code_upper.startswith(('J09', 'J10', 'J11', 'J12', 'J13', 'J14', 'J15', 'J16', 'J17', 'J18')):
        return ('High', 'yes', 4.5)
        
    # Check L00-L99 (Skin and subcutaneous)
    if code_upper.startswith('L'):
        return ('Low', 'no', 2.0)
        
    # Check M00-M99 (Musculoskeletal)
    if code_upper.startswith('M'):
        return ('Low', 'no', 2.5)
        
    # Check E00-E90 (Endocrine/metabolic)
    if code_upper.startswith('E'):
        return ('Low', 'no', 3.0)
        
    # Check I00-I99 (Circulatory) - Heart attack I21 is High
    if code_upper.startswith('I21'):
        return ('High', 'no', 4.8)
    if code_upper.startswith('I'):
        return ('Medium', 'no', 4.0)
        
    # Check K00-K95 (Digestive)
    if code_upper.startswith('K'):
        return ('Medium', 'no', 3.5)
        
    # Default fallback
    return ('Medium', 'no', 3.0)

def run_seeder():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    symptom_map_path = os.path.join(base_dir, 'data', 'symptom_map.json')
    icd_json_path = os.path.join(base_dir, 'data', 'icd10_clean.json')
    icd_csv_path = os.path.join(base_dir, 'data', 'ICD10codes.csv')
    db_path = os.path.join(base_dir, 'medisync.db')
    
    print("--- Starting ICD-10 Integration & Database Seeding ---")
    
    # 1. Update symptom_map.json with base_danger_level and communicable
    print(f"Step 2a: Updating {symptom_map_path}...")
    with open(symptom_map_path, 'r', encoding='utf-8') as f:
        symptom_map = json.load(f)
        
    updated_count = 0
    for item in symptom_map:
        d_name = item.get('disease', '')
        if d_name in CORE_DISEASE_CONFIG:
            item['base_danger_level'] = CORE_DISEASE_CONFIG[d_name]['danger']
            item['communicable'] = CORE_DISEASE_CONFIG[d_name]['comm']
        else:
            danger, comm, _ = categorize_icd10_code(item.get('icd_code', ''), d_name)
            item['base_danger_level'] = danger
            item['communicable'] = comm
        updated_count += 1
        
    with open(symptom_map_path, 'w', encoding='utf-8') as f:
        json.dump(symptom_map, f, indent=2)
    print(f"Updated {updated_count} core diseases in symptom_map.json with base_danger_level.")
    
    # 2. Ingest 71,700+ ICD-10 codes into medisync.db SQLite database
    print(f"Step 2b: Ingesting global ICD-10 directory into SQLite: {db_path}...")
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    c.execute("""
    CREATE TABLE IF NOT EXISTS icd10_diseases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        disease_name TEXT UNIQUE,
        icd_code TEXT,
        avg_severity REAL,
        communicable TEXT,
        base_danger_level TEXT
    );
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_icd_code ON icd10_diseases(icd_code);")
    c.execute("CREATE INDEX IF NOT EXISTS idx_disease_name ON icd10_diseases(disease_name);")
    c.execute("CREATE INDEX IF NOT EXISTS idx_danger_level ON icd10_diseases(base_danger_level);")
    
    c.execute("DELETE FROM icd10_diseases;")
    
    rows_to_insert = []
    seen_names = set()
    
    # Insert core 41 diseases first so their common names have priority
    for item in symptom_map:
        name = item.get('disease', '').strip()
        if name and name not in seen_names:
            seen_names.add(name)
            rows_to_insert.append((
                name,
                item.get('icd_code', ''),
                float(item.get('avg_severity', 3.0)),
                item.get('communicable', 'no'),
                item.get('base_danger_level', 'Medium')
            ))
            
    # Load raw ICD-10 codes from JSON (or CSV fallback)
    raw_icd_count = 0
    if os.path.exists(icd_json_path):
        with open(icd_json_path, 'r', encoding='utf-8', errors='ignore') as f:
            icd_data = json.load(f)
            for entry in icd_data:
                code = str(entry.get('code', '')).strip()
                desc = str(entry.get('description', '')).strip()
                if desc and desc not in seen_names:
                    seen_names.add(desc)
                    danger, comm, sev = categorize_icd10_code(code, desc)
                    rows_to_insert.append((desc, code, sev, comm, danger))
                    raw_icd_count += 1
    elif os.path.exists(icd_csv_path):
        with open(icd_csv_path, 'r', encoding='utf-8', errors='ignore') as f:
            reader = csv.reader(f)
            for row in reader:
                if len(row) >= 4:
                    code = str(row[2]).strip()
                    desc = str(row[3]).strip()
                    if desc and desc not in seen_names:
                        seen_names.add(desc)
                        danger, comm, sev = categorize_icd10_code(code, desc)
                        rows_to_insert.append((desc, code, sev, comm, danger))
                        raw_icd_count += 1

    print(f"Prepared {len(rows_to_insert)} total records (Core: {updated_count}, ICD-10: {raw_icd_count}). Inserting...")
    
    c.executemany("""
    INSERT OR IGNORE INTO icd10_diseases 
    (disease_name, icd_code, avg_severity, communicable, base_danger_level) 
    VALUES (?, ?, ?, ?, ?);
    """, rows_to_insert)
    
    conn.commit()
    
    c.execute("SELECT base_danger_level, COUNT(*) FROM icd10_diseases GROUP BY base_danger_level;")
    stats = c.fetchall()
    conn.close()
    
    print(f"Successfully seeded SQLite icd10_diseases table!")
    print("Distribution by base_danger_level:")
    for level, cnt in stats:
        print(f"  - {level}: {cnt:,} diseases")
    print("--- Integration Complete ---")

if __name__ == '__main__':
    run_seeder()
