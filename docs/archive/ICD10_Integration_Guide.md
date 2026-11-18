# ICD-10 Global Disease Integration & Weighted Anomaly System Guide

This document provides the definitive architectural guide and step-by-step implementation roadmap for upgrading MediSync to support the global **ICD-10 disease directory (71,700+ codes)** while deploying a **Weighted Risk & Anomaly System** in the ML Engine to eliminate false outbreak alarms for common, non-critical illnesses.

---

## Step 1: Data Parsing & Smart Categorization

### 1.1 Source Data Parsing
MediSync utilizes the World Health Organization (WHO) ICD-10 clinical modification dataset located at `ml-engine/data/icd10_clean.json` (and `ICD10codes.csv`), containing **71,704 diagnostic codes**. 
During ingestion, each raw entry is mapped to the standardized MediSync disease schema:
* `disease_name`: Standard clinical description (e.g., *"Cholera due to Vibrio cholerae 01, biovar cholerae"* or short common names for core diseases like *"Dengue"*).
* `icd_code`: The alphanumeric ICD-10 code (e.g., `A00.0`, `J00`, `B24`).
* `avg_severity`: Numerical clinical severity score ($1.0 \text{ to } 5.0$) assigned based on mortality/morbidity risk.
* `communicable`: Boolean flag (`yes`/`no`) indicating person-to-person or vector-borne epidemic transmission potential.
* `base_danger_level`: Categorical risk classification (`High`, `Medium`, `Low`) governing real-time outbreak sensitivity.

### 1.2 Smart Categorization via ICD-10 Chapters
To prevent system overwhelm and ensure clinical accuracy, diseases are dynamically assigned a `base_danger_level` and `communicable` status by analyzing their alphanumeric ICD-10 code prefix against established WHO diagnostic chapters:

| ICD-10 Chapter / Code Range | Clinical Category Description | Assigned `base_danger_level` | Communicable Status | Outbreak Sensitivity |
| :--- | :--- | :--- | :--- | :--- |
| **A00–B99** | Certain infectious and parasitic diseases (e.g., Cholera `A00`, TB `A15`, Dengue `A90`, Malaria `B50`, HIV `B20`) | **High** | `yes` | **Maximum Sensitivity** (Strict guardrails, early warning alerts) |
| **J00–J06** | Acute upper respiratory infections (e.g., Common Cold `J00`, Acute Sinusitis `J01`, Pharyngitis `J02`) | **Low** | `yes` | **Suppressed Sensitivity** (High volume guardrail, capped severity) |
| **J09–J18** | Influenza and Pneumonia (`J09–J11` Flu, `J12–J18` Pneumonia) | **High** | `yes` | **Maximum Sensitivity** (Epidemic respiratory tracking) |
| **J40–J47** | Chronic lower respiratory diseases (e.g., Bronchial Asthma `J45`, Chronic Bronchitis `J42`) | **Low** | `no` | **Non-Epidemic** (Chronic disease monitoring only) |
| **L00–L99** | Diseases of the skin and subcutaneous tissue (e.g., Impetigo `L01`, Psoriasis `L40`, Dermatitis `L20`) | **Low** | `no` / `yes` (if bacterial) | **Suppressed Sensitivity** |
| **M00–M99** | Diseases of the musculoskeletal system and connective tissue (e.g., Arthritis `M13`, Cervical Spondylosis `M47`) | **Low** | `no` | **Non-Epidemic** |
| **E00–E90** | Endocrine, nutritional, and metabolic diseases (e.g., Diabetes `E10–E14`, Hypothyroidism `E03`, Hypoglycemia `E16`) | **Low** | `no` | **Non-Epidemic** |
| **I00–I99** | Diseases of the circulatory system (e.g., Hypertension `I10`, Heart Attack / AMI `I21`, Varicose Veins `I83`) | **Medium** (High for I21) | `no` | **Non-Epidemic** |
| **K00–K95** | Diseases of the digestive system (e.g., GERD `K21`, Peptic Ulcer `K25`, Hemorrhoids `K64`, Cholestasis `K83`) | **Medium** | `no` (except infectious diarrhea) | **Standard Sensitivity** |
| **All Other Codes** | General clinical diagnoses, injuries, symptoms, and unclassified conditions | **Medium** | `no` (unless matched) | **Standard Sensitivity** |

---

## Step 2: Database Update Architecture

To support 71,700+ diseases without degrading real-time application performance, MediSync employs a dual-tiered data persistence strategy updating both the SQLite relational database (`medisync.db`) and the fast JSON reference map (`symptom_map.json`).

### 2.1 SQLite Database (`medisync.db`) Ingestion
A dedicated table named `icd10_diseases` is created and populated within `ml-engine/medisync.db`:

```sql
CREATE TABLE IF NOT EXISTS icd10_diseases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    disease_name TEXT UNIQUE,
    icd_code TEXT,
    avg_severity REAL,
    communicable TEXT,
    base_danger_level TEXT
);
CREATE INDEX IF NOT EXISTS idx_icd_code ON icd10_diseases(icd_code);
CREATE INDEX IF NOT EXISTS idx_disease_name ON icd10_diseases(disease_name);
CREATE INDEX IF NOT EXISTS idx_danger_level ON icd10_diseases(base_danger_level);
```

* **Purpose:** Acts as the comprehensive global reference directory for all 71,704 ICD-10 codes.
* **Indexing:** Indexed on `disease_name`, `icd_code`, and `base_danger_level` to ensure sub-millisecond SQL lookups during clinical reporting, hospital EHR integration, and outbreak background aggregation.

### 2.2 Fast Reference Map (`symptom_map.json`) Enrichment
The primary ML dataset (`ml-engine/data/symptom_map.json`) was completely deprecated. The engine now uses the `icd10_diseases` SQLite table to power diagnostic symptom checkers and core outbreak tracking:
1. Every existing disease record (the core 41 diseases) is enriched with explicit `base_danger_level` and `communicable` fields derived from our smart chapter categorization.
2. For example, `Dengue`, `Malaria`, `Tuberculosis`, and `AIDS` are stamped with `"base_danger_level": "High"` and `"communicable": "yes"`. Conversely, `Common Cold`, `Allergy`, and `Acne` are stamped with `"base_danger_level": "Low"`.
3. Keeping the SQLite table clean and structured ensures that frontend autocompletes and AI prediction models can instantly inspect disease severity.

---

## Step 3: Weighted Outbreak Thresholds in ML Engine

### 3.1 The False Alarm Problem
In traditional public health monitoring systems, a fixed percentage-spike threshold (e.g., a $>150\%$ increase over baseline) triggers a public health alert regardless of the disease type. In a national healthcare system, common endemic illnesses like the **Common Cold** or seasonal allergies naturally experience massive seasonal volume fluctuations (e.g., jumping from 10 cases to 100 cases in a rainy week, representing a $900\%$ spike). 
Triggering a red alert for a Common Cold surge dilutes public health responsiveness and causes alert fatigue, whereas a similar spike in **Dengue** or **Cholera** constitutes a genuine medical emergency.

### 3.2 The Weighted Risk Algorithm (`calculate_outbreak_metrics`)
To eliminate false positives, the outbreak calculation engine in `ml-engine/app.py` is upgraded to dynamically adjust its anomaly thresholds and severity caps based on the disease's `base_danger_level`:

```python
def calculate_outbreak_metrics(current_cases, baseline, disease=None, base_danger_level=None):
    # 1. Resolve Danger Level from explicit arg or in-memory map
    danger_level = base_danger_level or DISEASE_DANGER_MAP.get(disease, 'Medium')
    
    # 2. Calculate percentage spike over baseline
    spike_pct = round(((current_cases - baseline) / baseline) * 100) if baseline > 0 else (999 if current_cases > 0 else 0)
    
    # 3. Apply Weighted Thresholds & Severity Caps
    if danger_level == 'Low':
        # LOW DANGER (e.g., Common Cold, Allergies, Skin Rashes)
        # Requires massive case volume (>100) and extreme spike (>800%)
        is_anomaly = (current_cases > 100) and (spike_pct >= 800 or (baseline == 0 and current_cases > 100))
        # CAP SEVERITY: Never allow 'High' panic alarms for low-danger diseases
        severity = 'medium' if (is_anomaly and spike_pct >= 800) else 'low'
        risk_level = 'Medium' if severity == 'medium' else 'Normal'
        
    elif danger_level == 'Medium':
        # MEDIUM DANGER (e.g., Gastrointestinal, General Infections)
        # Moderate guardrail (>30 cases) and significant spike (>300%)
        is_anomaly = (current_cases > 30) and (spike_pct >= 300 or (baseline == 0 and current_cases > 30))
        severity = 'high' if (is_anomaly and spike_pct >= 600) else ('medium' if is_anomaly else 'low')
        risk_level = severity.capitalize() if is_anomaly else 'Normal'
        
    else:
        # HIGH DANGER (e.g., Dengue, Cholera, Malaria, TB, Pneumonia)
        # Strict guardrail (>10 cases) and early warning sensitivity (>150%)
        is_anomaly = (current_cases > 10) and (spike_pct >= 150 or (baseline == 0 and current_cases > 10))
        if not is_anomaly:
            severity, risk_level = 'low', 'Normal'
        elif spike_pct >= 600 or baseline == 0:
            severity, risk_level = 'high', 'High'
        elif spike_pct >= 300:
            severity, risk_level = 'medium', 'Medium'
        else:
            severity, risk_level = 'low', 'Low' # Early warning anomaly
```

### 3.3 Comparative Outbreak Threshold Matrix

| Disease Example | Assigned Danger Level | Min. Weekly Cases Guardrail | Anomaly Spike Threshold | Max. Allowed Severity Cap | Clinical Rationale & System Behavior |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Dengue / Cholera** | **High** | `> 10 cases` | `> 150%` spike | **Uncapped (`High`)** | High epidemic lethality. Early detection is vital; even a modest 150% surge triggers warnings, and >600% triggers high-priority district alerts. |
| **Gastroenteritis** | **Medium** | `> 30 cases` | `> 300%` spike | **Uncapped (`High`)** | Requires moderate case volume before alerting. Prevents isolated food poisoning clusters from alarming the dashboard while catching real waterborne epidemics. |
| **Common Cold / Allergy** | **Low** | `> 100 cases` | `> 800%` spike | **Capped at `Medium`** | Prevents seasonal weather changes from causing panic. A cold outbreak must exceed 100 cases AND jump by 800% just to register a capped `Medium` notice. |

---

## Step 4: UI Protection & Frontend Dropdown Optimization

### 4.1 The DOM Overload Risk
Attempting to render **71,704 options** inside a standard HTML `<select>` dropdown or React combobox component (such as in the Doctor Consultation Wizard, EHR diagnosis selector, or Admin Analytics filters) will instantly freeze the browser thread. Rendering 71,000 DOM nodes consumes upwards of 500MB of client memory, causes severe layout thrashing, and results in browser "Page Unresponsive" crashes.

### 4.2 Server-Side Filtering & Pagination Architecture
To guarantee smooth UI performance (sub-16ms frame rendering) while providing access to the entire global ICD-10 directory, MediSync implements a **Debounced Server-Side Search Pattern**:

1. **API Endpoint Pagination & Searching (`/api/drugs/diseases` or `/api/admin/icd10`):**
   The backend query endpoint does not return the full disease list. Instead, it accepts query parameters for search string and pagination limits:
   ```http
   GET /api/internal/diseases/search?q=chol&limit=20&page=1
   ```
2. **SQL Indexed Filtering:**
   The Express backend queries the indexed SQLite `icd10_diseases` table (or MongoDB equivalent using `LIKE` or regex indexing):
   ```sql
   SELECT disease_name, icd_code, base_danger_level 
   FROM icd10_diseases 
   WHERE disease_name LIKE '%chol%' OR icd_code LIKE '%chol%'
   LIMIT 20 OFFSET 0;
   ```
3. **React Debounced Combobox Component (`DiseaseCombobox.jsx`):**
   * **Debounce Timer:** When a doctor types in the diagnosis search box, input events are debounced by **300ms** to prevent flooding the backend with network requests on every keystroke.
   * **Virtualization & Capping:** The UI dropdown only renders a maximum of **20–50 suggestions** at any given time.
   * **Instant Local Fallback:** For empty queries (`q=""`), the dropdown instantly shows a pre-loaded list of the top **15 most common local Sri Lankan diseases** (from `symptom_map.json`), ensuring instantaneous access for routine consultations while seamlessly searching the global 71,700+ database on demand.
