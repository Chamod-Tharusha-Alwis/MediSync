import pandas as pd
import json
import re
import os

print("Starting MediSync dataset preprocessing...")

# ─────────────────────────────────────────────────────
# 1. MEDICINES → drugs_clean.json
# ─────────────────────────────────────────────────────
print("\n[1/4] Processing medicines.csv...")

df_med = pd.read_csv('data/medicines.csv', encoding='latin-1', low_memory=False)

# Clean med_name: remove dosage info in brackets for the base name
df_med = df_med[['med_name', 'generic_name', 'disease_name', 'drug_content', 'drug_manufacturer']].dropna(subset=['med_name'])

# Remove duplicate drug names
df_med['med_name_clean'] = df_med['med_name'].str.strip()
df_med['generic_name_clean'] = df_med['generic_name'].fillna('').str.strip()

# Extract dosage from med_name (e.g. "Amoxicillin 500mg" → dosage = "500mg")
def extract_dosage(name):
    matches = re.findall(r'\d+\.?\d*\s*(?:mg|mcg|ml|g|iu|IU|%)', str(name), re.IGNORECASE)
    return matches[:3] if matches else []

# Build drug list - one entry per unique drug name
drugs_dict = {}
for _, row in df_med.iterrows():
    name = str(row['med_name_clean'])
    base_name = re.sub(r'\s+\d+\.?\d*\s*(?:mg|mcg|ml|g|iu|IU|%)[^\s]*', '', name).strip()
    
    if base_name not in drugs_dict:
        drugs_dict[base_name] = {
            'name': base_name,
            'genericName': str(row['generic_name_clean']) if row['generic_name_clean'] else base_name,
            'brand': name,
            'category': 'other',
            'commonDosages': extract_dosage(name),
            'interactions': [],
            'sideEffects': [],
            'icdCodes': [],
            'diseaseIndication': str(row['disease_name']).replace(r'\(\d+\)', '').strip()
        }
    else:
        # Add dosage if new
        new_dosages = extract_dosage(name)
        existing = drugs_dict[base_name]['commonDosages']
        for d in new_dosages:
            if d not in existing and len(existing) < 5:
                existing.append(d)

drugs_list = list(drugs_dict.values())[:3000]  # Keep top 3000

# Add category based on indication keywords
category_map = {
    'antibiotic': ['infection', 'bacterial', 'antibiotic', 'sepsis', 'pneumonia', 'tuberculosis', 'tb'],
    'antiviral': ['viral', 'virus', 'hiv', 'herpes', 'influenza', 'hepatitis', 'covid'],
    'antifungal': ['fungal', 'fungus', 'candida', 'tinea'],
    'antiparasitic': ['malaria', 'parasite', 'worm', 'dengue'],
    'antihypertensive': ['hypertension', 'blood pressure', 'cardiac', 'heart', 'angina'],
    'antidiabetic': ['diabetes', 'diabetic', 'insulin', 'glucose', 'blood sugar'],
    'analgesic': ['pain', 'analgesic', 'ache', 'headache', 'migraine', 'arthritis'],
    'antipyretic': ['fever', 'temperature', 'pyretic'],
    'antidepressant': ['depression', 'anxiety', 'mental', 'psychiatric', 'bipolar'],
    'antihistamine': ['allergy', 'allergic', 'histamine', 'urticaria', 'rhinitis'],
    'antacid': ['acid', 'gastric', 'ulcer', 'reflux', 'gerd', 'stomach'],
    'anticoagulant': ['blood thinner', 'clot', 'thrombosis', 'anticoagulant'],
    'vitamin': ['vitamin', 'mineral', 'supplement', 'deficiency', 'nutrition'],
    'respiratory': ['asthma', 'copd', 'respiratory', 'bronchial', 'inhaler', 'cough'],
}

for drug in drugs_list:
    indication = drug.get('diseaseIndication', '').lower()
    name_lower = drug['name'].lower()
    combined = indication + ' ' + name_lower
    for cat, keywords in category_map.items():
        if any(k in combined for k in keywords):
            drug['category'] = cat
            break

# Save
with open('data/drugs_clean.json', 'w', encoding='utf-8') as f:
    json.dump(drugs_list, f, ensure_ascii=False, indent=2)

print(f"  ✅ Saved {len(drugs_list)} drugs to data/drugs_clean.json")

# ─────────────────────────────────────────────────────
# 2. DRUG INTERACTIONS → interactions_clean.json
# ─────────────────────────────────────────────────────
print("\n[2/4] Processing db_drug_interactions.csv...")

df_inter = pd.read_csv('data/db_drug_interactions.csv', encoding='latin-1', low_memory=False)
df_inter.columns = df_inter.columns.str.strip()
df_inter = df_inter[['Drug 1', 'Drug 2', 'Interaction Description']].dropna()

# Determine severity from description keywords
HIGH_KEYWORDS = [
    'fatal', 'death', 'serious', 'severe', 'life-threatening', 
    'bleeding', 'toxicity', 'toxic', 'serotonin syndrome', 
    'respiratory depression', 'cardiac arrest', 'QT prolongation',
    'lactic acidosis', 'hepatotoxicity', 'nephrotoxicity'
]

def get_severity(desc):
    desc_lower = str(desc).lower()
    if any(k in desc_lower for k in HIGH_KEYWORDS):
        return 'high'
    return 'moderate'

interactions = []
for _, row in df_inter.iterrows():
    interactions.append({
        'drug1': str(row['Drug 1']).strip(),
        'drug2': str(row['Drug 2']).strip(),
        'description': str(row['Interaction Description']).strip()[:300],
        'severity': get_severity(row['Interaction Description'])
    })

with open('data/interactions_clean.json', 'w', encoding='utf-8') as f:
    json.dump(interactions, f, ensure_ascii=False, indent=2)

print(f"  ✅ Saved {len(interactions)} drug interactions to data/interactions_clean.json")

# ─────────────────────────────────────────────────────
# 3. ICD-10 CODES → icd10_clean.json
# ─────────────────────────────────────────────────────
print("\n[3/4] Processing ICD10codes.csv...")

df_icd = pd.read_csv(
    'data/ICD10codes.csv', 
    encoding='latin-1', 
    header=None,
    low_memory=False
)

print(f"  ICD10 shape: {df_icd.shape}, columns: {df_icd.shape[1]}")

# Based on the sample: [A00, 0, A000, description_full, description_alt, category]
# Columns: 0=main_code, 1=sub_num, 2=full_code, 3=description, 4=desc_alt, 5=category

icd_list = []
seen_codes = set()

for _, row in df_icd.iterrows():
    try:
        # Full code is column 2, description is column 3
        code = str(row.iloc[2]).strip() if pd.notna(row.iloc[2]) else str(row.iloc[0]).strip()
        desc = str(row.iloc[3]).strip() if pd.notna(row.iloc[3]) else ''
        
        if not code or code == 'nan' or not desc or desc == 'nan':
            continue
        if code in seen_codes:
            continue
        if len(code) < 3:
            continue
            
        seen_codes.add(code)
        icd_list.append({
            'code': code,
            'description': desc
        })
    except Exception:
        continue

with open('data/icd10_clean.json', 'w', encoding='utf-8') as f:
    json.dump(icd_list, f, ensure_ascii=False, indent=2)

print(f"  ✅ Saved {len(icd_list)} ICD-10 codes to data/icd10_clean.json")

# ─────────────────────────────────────────────────────
# 4. SYMPTOM DATASET → symptom_map.json
# ─────────────────────────────────────────────────────
print("\n[4/4] Processing symptom datasets...")

df_sym = pd.read_csv('data/dataset.csv', encoding='latin-1')

# Symptom columns
symptom_cols = [c for c in df_sym.columns if c.startswith('Symptom_')]

# Build disease → symptoms mapping
disease_map = {}
for _, row in df_sym.iterrows():
    disease = str(row['Disease']).strip()
    symptoms = []
    for col in symptom_cols:
        val = row[col]
        if pd.notna(val) and str(val).strip() and str(val).strip() != 'nan':
            # Clean underscore format → readable
            clean = str(val).strip().replace('_', ' ').title()
            if clean not in symptoms:
                symptoms.append(clean)
    
    if disease not in disease_map:
        disease_map[disease] = set()
    disease_map[disease].update(symptoms)

# Load severity file if exists
severity_map = {}
try:
    df_sev = pd.read_csv('data/Symptom-severity.csv', encoding='latin-1')
    df_sev.columns = df_sev.columns.str.strip()
    print(f"  Severity columns: {df_sev.columns.tolist()}")
    # Typical columns: Symptom, weight
    col_sym = df_sev.columns[0]
    col_wt  = df_sev.columns[1]
    for _, row in df_sev.iterrows():
        s = str(row[col_sym]).strip().replace('_', ' ').title()
        try:
            severity_map[s] = int(row[col_wt])
        except Exception:
            severity_map[s] = 3
    print(f"  Loaded {len(severity_map)} symptom severities")
except Exception as e:
    print(f"  Severity file note: {e}")

# Load description file if exists
desc_map = {}
try:
    df_desc = pd.read_csv('data/symptom_Description.csv', encoding='latin-1')
    df_desc.columns = df_desc.columns.str.strip()
    print(f"  Description columns: {df_desc.columns.tolist()}")
    col_d = df_desc.columns[0]
    col_de = df_desc.columns[1]
    for _, row in df_desc.iterrows():
        d = str(row[col_d]).strip()
        desc = str(row[col_de]).strip()
        desc_map[d] = desc
    print(f"  Loaded {len(desc_map)} disease descriptions")
except Exception as e:
    print(f"  Description file note: {e}")

# Load precaution file
precaution_map = {}
try:
    df_pre = pd.read_csv('data/symptom_precaution.csv', encoding='latin-1')
    df_pre.columns = df_pre.columns.str.strip()
    print(f"  Precaution columns: {df_pre.columns.tolist()}")
    for _, row in df_pre.iterrows():
        disease = str(row.iloc[0]).strip()
        precautions = [str(row.iloc[i]).strip() for i in range(1, min(5, len(row))) 
                      if pd.notna(row.iloc[i]) and str(row.iloc[i]).strip() != 'nan']
        precaution_map[disease] = precautions
    print(f"  Loaded {len(precaution_map)} disease precautions")
except Exception as e:
    print(f"  Precaution file note: {e}")

# ICD-10 manual mapping for common diseases from this dataset
DISEASE_ICD_MAP = {
    'Fungal infection': 'B49',
    'Allergy': 'T78.4',
    'GERD': 'K21.0',
    'Chronic cholestasis': 'K83.0',
    'Drug Reaction': 'T88.7',
    'Peptic ulcer disease': 'K27.9',
    'AIDS': 'B24',
    'Diabetes': 'E11.9',
    'Gastroenteritis': 'A09',
    'Bronchial Asthma': 'J45.9',
    'Hypertension': 'I10',
    'Migraine': 'G43.9',
    'Cervical spondylosis': 'M47.8',
    'Paralysis (brain hemorrhage)': 'I61.9',
    'Jaundice': 'R17',
    'Malaria': 'B54',
    'Chicken pox': 'B01.9',
    'Dengue': 'A90',
    'Typhoid': 'A01.0',
    'hepatitis A': 'B15.9',
    'Hepatitis B': 'B16.9',
    'Hepatitis C': 'B17.1',
    'Hepatitis D': 'B17.0',
    'Hepatitis E': 'B17.2',
    'Alcoholic hepatitis': 'K70.1',
    'Tuberculosis': 'A15.0',
    'Common Cold': 'J06.9',
    'Pneumonia': 'J18.9',
    'Dimorphic hemmorhoids(piles)': 'K64.9',
    'Heart attack': 'I21.9',
    'Varicose veins': 'I83.9',
    'Hypothyroidism': 'E03.9',
    'Hyperthyroidism': 'E05.9',
    'Hypoglycemia': 'E16.0',
    'Osteoarthritis': 'M19.9',
    'Arthritis': 'M06.9',
    '(vertigo) Paroxysmal  Positional Vertigo': 'H81.1',
    'Acne': 'L70.0',
    'Urinary tract infection': 'N39.0',
    'Psoriasis': 'L40.0',
    'Impetigo': 'L01.0',
}

# Build final symptom map
symptom_map = []
for disease, symptoms in disease_map.items():
    symptom_list = sorted(list(symptoms))
    
    # Calculate average severity
    avg_severity = 5
    if severity_map:
        weights = [severity_map.get(s, 3) for s in symptom_list]
        avg_severity = sum(weights) / len(weights) if weights else 5
    
    entry = {
        'disease': disease,
        'icd_code': DISEASE_ICD_MAP.get(disease, 'R69'),
        'symptoms': symptom_list,
        'symptom_count': len(symptom_list),
        'avg_severity': round(avg_severity, 2),
        'description': desc_map.get(disease, ''),
        'precautions': precaution_map.get(disease, [])
    }
    symptom_map.append(entry)

with open('data/symptom_map.json', 'w', encoding='utf-8') as f:
    json.dump(symptom_map, f, ensure_ascii=False, indent=2)

print(f"  ✅ Saved {len(symptom_map)} disease-symptom mappings to data/symptom_map.json")

# ─────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────
print("\n" + "="*50)
print("✅ PREPROCESSING COMPLETE")
print("="*50)
print(f"  drugs_clean.json        → {len(drugs_list)} drugs")
print(f"  interactions_clean.json → {len(interactions)} interactions")
print(f"  icd10_clean.json        → {len(icd_list)} ICD-10 codes")
print(f"  symptom_map.json        → {len(symptom_map)} diseases")
print("\nNext step: run  python load_into_flask.py  then  npm run seed")