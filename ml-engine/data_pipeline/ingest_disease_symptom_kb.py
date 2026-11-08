"""
MediSync Disease-Symptom Knowledge Base Ingestion Pipeline (Phase D2)
Ingests verified open-source clinical symptom-disease associations from CDC NAMCS
(National Ambulatory Medical Care Survey) via SymCAT data exports.

Strict Non-Fabrication Rule:
- Every symptom list is strictly extracted from empirical outpatient presentation data.
- Unmapped diseases are flagged with mappingConfidence: 'none' and kept separated.
- ZERO hallucinated medical data.
- Medical Disclaimer: Academic simulation reference only. clinicalValidation: not_established.
"""

import csv
import json
import os
import re
import sys
from datetime import datetime, timezone

RAW_DATA_PATH = os.path.join(os.path.dirname(__file__), "raw", "symcat_conditions.csv")
ICD10_DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "server", "reference-data", "icd10_clean.json")
OUTPUT_KB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "disease_symptom_kb.v1.json")
OUTPUT_UNMAPPED_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "unmapped_diseases.v1.json")

SOURCE_METADATA = {
    "source": "CDC NAMCS / NHAMCS Outpatient Survey via SymCAT (teliov/symcat-to-synthea)",
    "url": "https://raw.githubusercontent.com/teliov/symcat-to-synthea/master/symcat/symcat-801-diseases.csv",
    "license": "Public Domain (CDC NAMCS data, 17 U.S.C. § 105) / MIT License (parser)",
    "retrievedAt": "2026-11-08T14:40:19Z"
}

DISCLAIMER = "Reference knowledge base for academic simulation only. clinicalValidation: not_established."

# Curated high-confidence outpatient clinical mappings for common conditions where
# ICD-10-CM uses qualified phrasing (e.g. 'Essential (primary) hypertension' vs 'Hypertension')
CURATED_CLINICAL_MAP = {
    "abdominal aortic aneurysm": ("I71.4", "I714", "broader"),
    "abdominal hernia": ("K46.9", "K469", "broader"),
    "abscess of nose": ("J34.0", "J340", "exact"),
    "abscess of the lung": ("J85.2", "J852", "exact"),
    "abscess of the pharynx": ("J39.1", "J391", "exact"),
    "acanthosis nigricans": ("L83", "L83", "exact"),
    "acariasis": ("B88.0", "B880", "exact"),
    "achalasia": ("K22.0", "K220", "exact"),
    "acne": ("L70.9", "L709", "broader"),
    "actinic keratosis": ("L57.0", "L570", "exact"),
    "acute bronchiolitis": ("J21.9", "J219", "broader"),
    "acute bronchitis": ("J20.9", "J209", "broader"),
    "acute kidney failure": ("N17.9", "N179", "broader"),
    "acute kidney injury": ("N17.9", "N179", "broader"),
    "acute otitis media": ("H66.90", "H6690", "broader"),
    "acute pancreatitis": ("K85.90", "K8590", "broader"),
    "acute respiratory distress syndrome (ards)": ("J80", "J80", "exact"),
    "acute sinusitis": ("J01.90", "J0190", "broader"),
    "adhesive capsulitis of the shoulder": ("M75.00", "M7500", "broader"),
    "alcohol abuse": ("F10.10", "F1010", "broader"),
    "alcoholic liver disease": ("K70.9", "K709", "broader"),
    "allergic rhinitis": ("J30.9", "J309", "broader"),
    "alopecia": ("L65.9", "L659", "broader"),
    "alzheimer's disease": ("G30.9", "G309", "broader"),
    "alzheimer disease": ("G30.9", "G309", "broader"),
    "amblyopia": ("H53.009", "H53009", "broader"),
    "amyotrophic lateral sclerosis (als)": ("G12.21", "G1221", "exact"),
    "anal fissure": ("K60.2", "K602", "broader"),
    "anemia": ("D64.9", "D649", "broader"),
    "angina": ("I20.9", "I209", "broader"),
    "ankylosing spondylitis": ("M45.9", "M459", "broader"),
    "anxiety": ("F41.9", "F419", "broader"),
    "aphthous ulcer": ("K12.0", "K120", "exact"),
    "aplastic anemia": ("D61.9", "D619", "broader"),
    "appendicitis": ("K37", "K37", "broader"),
    "arrhythmia": ("I49.9", "I499", "broader"),
    "asthma": ("J45.909", "J45909", "broader"),
    "atopic dermatitis": ("L20.9", "L209", "broader"),
    "atrial fibrillation": ("I48.91", "I4891", "broader"),
    "atrophic vaginitis": ("N95.2", "N952", "exact"),
    "bacterial pneumonia": ("J15.9", "J159", "broader"),
    "bell's palsy": ("G51.0", "G510", "exact"),
    "benign prostatic hyperplasia (bph)": ("N40.0", "N400", "broader"),
    "bipolar disorder": ("F31.9", "F319", "broader"),
    "bladder cancer": ("C67.9", "C679", "broader"),
    "blepharitis": ("H01.009", "H01009", "broader"),
    "boil": ("L02.92", "L0292", "broader"),
    "breast cancer": ("C50.919", "C50919", "broader"),
    "bronchiectasis": ("J47.9", "J479", "broader"),
    "bronchitis": ("J40", "J40", "exact"),
    "bursitis": ("M71.9", "M719", "broader"),
    "candidiasis": ("B37.9", "B379", "broader"),
    "carpal tunnel syndrome": ("G56.00", "G5600", "broader"),
    "cataract": ("H26.9", "H269", "broader"),
    "cellulitis": ("L03.90", "L0390", "broader"),
    "cervical cancer": ("C53.9", "C539", "broader"),
    "chickenpox": ("B01.9", "B019", "broader"),
    "cholecystitis": ("K81.9", "K819", "broader"),
    "cholelithiasis": ("K80.20", "K8020", "broader"),
    "chronic kidney disease": ("N18.9", "N189", "broader"),
    "chronic obstructive pulmonary disease (copd)": ("J44.9", "J449", "broader"),
    "chronic sinusitis": ("J32.9", "J329", "broader"),
    "cirrhosis": ("K74.60", "K7460", "broader"),
    "colon cancer": ("C18.9", "C189", "broader"),
    "common cold": ("J00", "J00", "exact"),
    "congestive heart failure": ("I50.9", "I509", "broader"),
    "conjunctivitis": ("H10.9", "H109", "broader"),
    "constipation": ("K59.00", "K5900", "broader"),
    "contact dermatitis": ("L25.9", "L259", "broader"),
    "corneal abrasion": ("S05.00XA", "S0500XA", "broader"),
    "coronary artery disease": ("I25.10", "I2510", "broader"),
    "crohn's disease": ("K50.90", "K5090", "broader"),
    "croup": ("J05.0", "J050", "exact"),
    "cushing's syndrome": ("E24.9", "E249", "broader"),
    "cystitis": ("N30.90", "N3090", "broader"),
    "deep vein thrombosis (dvt)": ("I82.409", "I82409", "broader"),
    "dehydration": ("E86.0", "E860", "exact"),
    "dementia": ("F03.90", "F0390", "broader"),
    "dengue fever": ("A90", "A90", "exact"),
    "depression": ("F32.9", "F329", "broader"),
    "diabetes mellitus type 1": ("E10.9", "E109", "broader"),
    "diabetes mellitus type 2": ("E11.9", "E119", "broader"),
    "diabetic ketoacidosis": ("E11.10", "E1110", "broader"),
    "diabetic neuropathy": ("E11.40", "E1140", "broader"),
    "diarrhea": ("R19.7", "R197", "exact"),
    "diverticulitis": ("K57.92", "K5792", "broader"),
    "diverticulosis": ("K57.90", "K5790", "broader"),
    "dry eye syndrome": ("H04.129", "H04129", "broader"),
    "dysmenorrhea": ("N94.6", "N946", "broader"),
    "dyspepsia": ("K30", "K30", "exact"),
    "dysphagia": ("R13.10", "R1310", "broader"),
    "earwax blockage": ("H61.20", "H6120", "broader"),
    "eczema": ("L30.9", "L309", "broader"),
    "emphysema": ("J43.9", "J439", "broader"),
    "endometriosis": ("N80.9", "N809", "broader"),
    "epilepsy": ("G40.909", "G40909", "broader"),
    "epistaxis (nosebleed)": ("R04.0", "R040", "exact"),
    "esophagitis": ("K20.9", "K209", "broader"),
    "fibromyalgia": ("M79.7", "M797", "exact"),
    "folliculitis": ("L73.9", "L739", "broader"),
    "food poisoning": ("A05.9", "A059", "broader"),
    "gastritis": ("K29.70", "K2970", "broader"),
    "gastroenteritis": ("K52.9", "K529", "broader"),
    "gastroesophageal reflux disease (gerd)": ("K21.9", "K219", "broader"),
    "genital herpes": ("A60.9", "A609", "broader"),
    "genital warts": ("A63.0", "A630", "exact"),
    "glaucoma": ("H40.9", "H409", "broader"),
    "glomerulonephritis": ("N05.9", "N059", "broader"),
    "gout": ("M10.9", "M109", "broader"),
    "graves' disease": ("E05.00", "E0500", "broader"),
    "guillain-barre syndrome": ("G61.0", "G610", "exact"),
    "hashimoto's thyroiditis": ("E06.3", "E063", "exact"),
    "heart attack": ("I21.9", "I219", "broader"),
    "heart failure": ("I50.9", "I509", "broader"),
    "hematuria": ("R31.9", "R319", "exact"),
    "hemorrhoids": ("K64.9", "K649", "broader"),
    "hepatitis a": ("B15.9", "B159", "broader"),
    "hepatitis b": ("B16.9", "B169", "broader"),
    "hepatitis c": ("B19.20", "B1920", "broader"),
    "hiatal hernia": ("K44.9", "K449", "broader"),
    "hiv/aids": ("B20", "B20", "broader"),
    "hodgkin's lymphoma": ("C81.90", "C8190", "broader"),
    "hypercalcemia": ("E83.52", "E8352", "exact"),
    "hypercholesterolemia": ("E78.00", "E7800", "broader"),
    "hyperglycemia": ("R73.9", "R739", "exact"),
    "hyperkalemia": ("E87.5", "E875", "exact"),
    "hyperlipidemia": ("E78.5", "E785", "exact"),
    "hypertension": ("I10", "I10", "exact"),
    "hyperthyroidism": ("E05.90", "E0590", "broader"),
    "hypocalcemia": ("E83.51", "E8351", "exact"),
    "hypoglycemia": ("E16.2", "E162", "exact"),
    "hypokalemia": ("E87.6", "E876", "exact"),
    "hypotension": ("I95.9", "I959", "broader"),
    "hypothyroidism": ("E03.9", "E039", "broader"),
    "impetigo": ("L01.00", "L0100", "broader"),
    "infectious mononucleosis": ("B27.90", "B2790", "broader"),
    "influenza": ("J11.1", "J111", "broader"),
    "inguinal hernia": ("K40.90", "K4090", "broader"),
    "insomnia": ("G47.00", "G4700", "broader"),
    "iron deficiency anemia": ("D50.9", "D509", "broader"),
    "irritable bowel syndrome (ibs)": ("K58.9", "K589", "broader"),
    "jaundice": ("R17", "R17", "exact"),
    "kidney stone": ("N20.0", "N200", "broader"),
    "laryngitis": ("J04.0", "J040", "broader"),
    "leukemia": ("C95.90", "C9590", "broader"),
    "liver cirrhosis": ("K74.60", "K7460", "broader"),
    "low back pain": ("M54.50", "M5450", "broader"),
    "lung cancer": ("C34.90", "C3490", "broader"),
    "lyme disease": ("A69.20", "A6920", "broader"),
    "lymphedema": ("I89.0", "I890", "broader"),
    "macular degeneration": ("H35.30", "H3530", "broader"),
    "major depressive disorder": ("F32.9", "F329", "broader"),
    "malaria": ("B54", "B54", "broader"),
    "mastoiditis": ("H70.90", "H7090", "broader"),
    "measles": ("B05.9", "B059", "broader"),
    "melanoma": ("C43.9", "C439", "broader"),
    "meningitis": ("G03.9", "G039", "broader"),
    "menopause": ("N95.1", "N951", "broader"),
    "migraine": ("G43.909", "G43909", "broader"),
    "mitral valve prolapse": ("I34.1", "I341", "exact"),
    "multiple myeloma": ("C90.00", "C9000", "broader"),
    "multiple sclerosis": ("G35", "G35", "exact"),
    "mumps": ("B26.9", "B269", "broader"),
    "myasthenia gravis": ("G70.00", "G7000", "broader"),
    "myocardial infarction": ("I21.9", "I219", "broader"),
    "myocardial infarction (heart attack)": ("I21.9", "I219", "broader"),
    "nasal polyps": ("J33.9", "J339", "broader"),
    "nausea and vomiting": ("R11.2", "R112", "exact"),
    "nephrolithiasis": ("N20.0", "N200", "exact"),
    "neuropathy": ("G62.9", "G629", "broader"),
    "non-hodgkin's lymphoma": ("C85.90", "C8590", "broader"),
    "nosebleed": ("R04.0", "R040", "exact"),
    "obesity": ("E66.9", "E669", "broader"),
    "obsessive-compulsive disorder (ocd)": ("F42.9", "F429", "broader"),
    "osteoarthritis": ("M19.90", "M1990", "broader"),
    "osteomyelitis": ("M86.9", "M869", "broader"),
    "osteoporosis": ("M81.0", "M810", "broader"),
    "otitis externa": ("H60.90", "H6090", "broader"),
    "otitis media": ("H66.90", "H6690", "broader"),
    "ovarian cancer": ("C56.9", "C569", "broader"),
    "ovarian cyst": ("N83.209", "N83209", "broader"),
    "panic disorder": ("F41.0", "F410", "exact"),
    "pancreatitis": ("K85.90", "K8590", "broader"),
    "parkinson's disease": ("G20", "G20", "exact"),
    "pelvic inflammatory disease (pid)": ("N73.9", "N739", "broader"),
    "peptic ulcer": ("K27.9", "K279", "broader"),
    "peptic ulcer disease": ("K27.9", "K279", "broader"),
    "pericarditis": ("I30.9", "I309", "broader"),
    "peripheral artery disease": ("I73.9", "I739", "broader"),
    "peripheral neuropathy": ("G62.9", "G629", "broader"),
    "peritonitis": ("K65.9", "K659", "broader"),
    "pharyngitis": ("J02.9", "J029", "broader"),
    "plantar fasciitis": ("M72.2", "M722", "exact"),
    "pleurisy": ("R09.1", "R091", "exact"),
    "pneumonia": ("J18.9", "J189", "broader"),
    "pneumothorax": ("J93.9", "J939", "broader"),
    "polycystic ovary syndrome (pcos)": ("E28.2", "E282", "exact"),
    "polymyalgia rheumatica": ("M35.3", "M353", "exact"),
    "post-traumatic stress disorder (ptsd)": ("F43.10", "F4310", "broader"),
    "prostate cancer": ("C61", "C61", "exact"),
    "prostatitis": ("N41.9", "N419", "broader"),
    "psoriasis": ("L40.9", "L409", "broader"),
    "psoriatic arthritis": ("L40.50", "L4050", "broader"),
    "pulmonary embolism": ("I26.99", "I2699", "broader"),
    "pulmonary fibrosis": ("J84.10", "J8410", "broader"),
    "pyelonephritis": ("N12", "N12", "broader"),
    "rash": ("R21", "R21", "exact"),
    "raynaud's phenomenon": ("I73.00", "I7300", "broader"),
    "restless legs syndrome": ("G25.81", "G2581", "exact"),
    "rheumatoid arthritis": ("M06.9", "M069", "broader"),
    "rosacea": ("L71.9", "L719", "broader"),
    "rotator cuff tear": ("M75.100", "M75100", "broader"),
    "rubella": ("B06.9", "B069", "broader"),
    "scabies": ("B86", "B86", "exact"),
    "schizophrenia": ("F20.9", "F209", "broader"),
    "sciatica": ("M54.30", "M5430", "broader"),
    "scoliosis": ("M41.9", "M419", "broader"),
    "seborrheic dermatitis": ("L21.9", "L219", "broader"),
    "sepsis": ("A41.9", "A419", "broader"),
    "shingles (herpes zoster)": ("B02.9", "B029", "broader"),
    "sinusitis": ("J32.9", "J329", "broader"),
    "sjogren's syndrome": ("M35.00", "M3500", "broader"),
    "sleep apnea": ("G47.30", "G4730", "broader"),
    "sprain": ("S93.409A", "S93409A", "broader"),
    "strep throat": ("J02.0", "J020", "exact"),
    "streptococcal pharyngitis": ("J02.0", "J020", "exact"),
    "streptococcal pharyngitis (strep throat)": ("J02.0", "J020", "exact"),
    "stroke": ("I63.9", "I639", "broader"),
    "subarachnoid hemorrhage": ("I60.9", "I609", "broader"),
    "syncope": ("R55", "R55", "exact"),
    "systemic lupus erythematosus (sle)": ("M32.9", "M329", "broader"),
    "tachycardia": ("R00.0", "R000", "exact"),
    "temporal arteritis": ("M31.6", "M316", "broader"),
    "tendinitis": ("M77.9", "M779", "broader"),
    "tension headache": ("G44.209", "G44209", "broader"),
    "testicular torsion": ("N44.00", "N4400", "broader"),
    "tetanus": ("A35", "A35", "exact"),
    "thrombocytopenia": ("D69.6", "D696", "exact"),
    "thyroiditis": ("E06.9", "E069", "broader"),
    "tinea corporis (ringworm)": ("B35.4", "B354", "exact"),
    "tinea pedis (athlete's foot)": ("B35.3", "B353", "exact"),
    "tinnitus": ("H93.19", "H9319", "broader"),
    "tonsillitis": ("J03.90", "J0390", "broader"),
    "transient ischemic attack (tia)": ("G45.9", "G459", "exact"),
    "trigeminal neuralgia": ("G50.0", "G500", "exact"),
    "tuberculosis": ("A15.0", "A150", "broader"),
    "typhoid fever": ("A01.00", "A0100", "broader"),
    "ulcerative colitis": ("K51.90", "K5190", "broader"),
    "urinary tract infection (uti)": ("N39.0", "N390", "broader"),
    "urticaria (hives)": ("L50.9", "L509", "broader"),
    "varicose veins": ("I83.90", "I8390", "broader"),
    "vertigo": ("R42", "R42", "exact"),
    "viral hepatitis": ("B19.9", "B199", "broader"),
    "viral meningitis": ("A87.9", "A879", "broader"),
    "viral pneumonia": ("J12.9", "J129", "broader"),
    "vitiligo": ("L80", "L80", "exact"),
    "wheezing": ("R06.2", "R062", "exact"),
    "whooping cough (pertussis)": ("A37.90", "A3790", "broader"),
}


def slugify(text: str) -> str:
    s = text.strip().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def format_icd_dot(code: str) -> str:
    if not code:
        return ""
    code = code.strip().upper()
    if "." in code:
        return code
    if len(code) > 3:
        return f"{code[:3]}.{code[3:]}"
    return code


def load_raw_symcat(path: str):
    """Parses raw SymCAT conditions CSV returning dictionary of conditions."""
    pairs = [(2, 5), (27, 30), (52, 56), (77, 81), (102, 105), (127, 130), (152, 155)]
    condition_map = {}

    with open(path, mode="r", newline="", encoding="utf-8", errors="ignore") as fp:
        reader = csv.reader(fp)
        next(reader)  # Header
        for row in reader:
            for d_idx, s_idx in pairs:
                if d_idx < len(row) and s_idx < len(row):
                    d = row[d_idx].strip()
                    s = row[s_idx].strip()
                    if d and s and len(d) > 2 and len(s) > 2 and not d.startswith("<") and not s.startswith("<"):
                        slug = slugify(d)
                        if slug not in condition_map:
                            condition_map[slug] = {
                                "diseaseId": slug,
                                "name": d,
                                "symptoms": []
                            }
                        s_norm = s.strip().lower()
                        if s_norm not in condition_map[slug]["symptoms"]:
                            condition_map[slug]["symptoms"].append(s_norm)

    return condition_map


def load_icd10_catalog(path: str):
    with open(path, mode="r", encoding="utf-8") as f:
        catalog = json.load(f)

    exact_desc = {}
    norm_desc = {}
    unspecified_map = {}

    for item in catalog:
        code = item["code"]
        desc = item["description"]
        exact_desc[desc.lower().strip()] = code
        norm = re.sub(r"[^a-z0-9 ]", "", desc.lower()).strip()
        if norm and norm not in norm_desc:
            norm_desc[norm] = code

        # Canonical clinical un-specified mappings
        for suffix in [", unspecified", ", unspecified site", ", unspecified organism", " without complications"]:
            if suffix in desc.lower():
                base = desc.lower().split(suffix)[0].strip()
                if base and base not in unspecified_map:
                    unspecified_map[base] = code

    return catalog, exact_desc, norm_desc, unspecified_map


def run_ingestion():
    print("=" * 70)
    print("MediSync Knowledge Base Ingestion Pipeline (SymCAT -> disease_symptom_kb.v1.json)")
    print("=" * 70)

    if not os.path.isfile(RAW_DATA_PATH):
        print(f"ERROR: Raw source file not found at {RAW_DATA_PATH}", file=sys.stderr)
        sys.exit(1)

    print(f"Loading raw SymCAT conditions from {RAW_DATA_PATH}...")
    raw_conditions = load_raw_symcat(RAW_DATA_PATH)
    print(f"Extracted {len(raw_conditions)} distinct conditions.")

    print(f"Loading ICD-10-CM catalog from {ICD10_DATA_PATH}...")
    catalog, exact_desc, norm_desc, unspecified_map = load_icd10_catalog(ICD10_DATA_PATH)
    print(f"Loaded {len(catalog):,} ICD-10-CM concepts.")

    mapped_diseases = []
    unmapped_diseases = []

    exact_count = 0
    broader_count = 0

    for slug, entry in sorted(raw_conditions.items(), key=lambda x: x[1]["name"]):
        name = entry["name"]
        name_lower = name.lower().strip()
        clean_name = re.sub(r"\s*\([A-Za-z0-9/ -]+\)", "", name_lower).strip()
        name_norm = re.sub(r"[^a-z0-9 ]", "", name_lower).strip()
        clean_norm = re.sub(r"[^a-z0-9 ]", "", clean_name).strip()
        symptoms = sorted(entry["symptoms"])

        icd_code = None
        confidence = "none"

        # 1. Curated high-confidence outpatient map
        if name_lower in CURATED_CLINICAL_MAP:
            dot_code, raw_code, conf = CURATED_CLINICAL_MAP[name_lower]
            icd_code = dot_code
            confidence = conf

        elif clean_name in CURATED_CLINICAL_MAP:
            dot_code, raw_code, conf = CURATED_CLINICAL_MAP[clean_name]
            icd_code = dot_code
            confidence = conf

        # 2. Literal exact match against ICD10 description
        elif name_lower in exact_desc:
            raw_code = exact_desc[name_lower]
            icd_code = format_icd_dot(raw_code)
            confidence = "exact"

        elif clean_name in exact_desc:
            raw_code = exact_desc[clean_name]
            icd_code = format_icd_dot(raw_code)
            confidence = "exact"

        # 3. Punctuation-normalized exact match
        elif name_norm in norm_desc:
            raw_code = norm_desc[name_norm]
            icd_code = format_icd_dot(raw_code)
            confidence = "exact"

        elif clean_norm in norm_desc:
            raw_code = norm_desc[clean_norm]
            icd_code = format_icd_dot(raw_code)
            confidence = "exact"

        # 4. Canonical unspecified suffix match
        elif name_lower in unspecified_map:
            raw_code = unspecified_map[name_lower]
            icd_code = format_icd_dot(raw_code)
            confidence = "broader"

        elif clean_name in unspecified_map:
            raw_code = unspecified_map[clean_name]
            icd_code = format_icd_dot(raw_code)
            confidence = "broader"

        # Record disease record
        record = {
            "diseaseId": slug,
            "name": name,
            "icd10": icd_code,
            "mappingConfidence": confidence,
            "symptoms": symptoms,
            "provenance": {
                "source": SOURCE_METADATA["source"],
                "url": SOURCE_METADATA["url"],
                "license": SOURCE_METADATA["license"],
                "retrievedAt": SOURCE_METADATA["retrievedAt"]
            }
        }

        if icd_code and confidence in ("exact", "broader"):
            mapped_diseases.append(record)
            if confidence == "exact":
                exact_count += 1
            else:
                broader_count += 1
        else:
            unmapped_diseases.append(record)

    # Build primary KB output artifact
    kb_payload = {
        "version": "1.0.0",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": f"{SOURCE_METADATA['source']} ({SOURCE_METADATA['license']})",
        "disclaimer": DISCLAIMER,
        "metrics": {
            "totalParsedConditions": len(raw_conditions),
            "mappedDiseasesCount": len(mapped_diseases),
            "unmappedDiseasesCount": len(unmapped_diseases),
            "exactMatches": exact_count,
            "broaderMatches": broader_count,
            "mappingRatePercent": round((len(mapped_diseases) / len(raw_conditions)) * 100, 2)
        },
        "diseases": mapped_diseases
    }

    # Build separate unmapped artifact
    unmapped_payload = {
        "version": "1.0.0",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": f"{SOURCE_METADATA['source']} ({SOURCE_METADATA['license']})",
        "disclaimer": "Unmapped conditions from raw source without established ICD-10 link. Strictly separated.",
        "count": len(unmapped_diseases),
        "diseases": unmapped_diseases
    }

    os.makedirs(os.path.dirname(OUTPUT_KB_PATH), exist_ok=True)

    with open(OUTPUT_KB_PATH, "w", encoding="utf-8") as f:
        json.dump(kb_payload, f, indent=2)
    print(f"Wrote mapped KB ({len(mapped_diseases)} diseases) to {OUTPUT_KB_PATH}")

    with open(OUTPUT_UNMAPPED_PATH, "w", encoding="utf-8") as f:
        json.dump(unmapped_payload, f, indent=2)
    print(f"Wrote unmapped records ({len(unmapped_diseases)} diseases) to {OUTPUT_UNMAPPED_PATH}")

    print("\nIngestion Summary:")
    print(f"  Total conditions parsed: {len(raw_conditions)}")
    print(f"  Mapped to ICD-10:        {len(mapped_diseases)} ({kb_payload['metrics']['mappingRatePercent']}%)")
    print(f"    - Exact matches:       {exact_count}")
    print(f"    - Broader matches:     {broader_count}")
    print(f"  Unmapped conditions:     {len(unmapped_diseases)}")
    print("=" * 70)


if __name__ == "__main__":
    run_ingestion()
