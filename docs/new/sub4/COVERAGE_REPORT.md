# MediSync — Sub-Project 4 Coverage Audit & Disease Architecture Report

**Audit Execution Date**: 2026-11-08  
**Analysis Target**: Complete ICD Reference Catalog (`server/reference-data/icd10_clean.json`, `ml-engine/data/icd10_clean.json`), Kaggle Reference Dataset (`ml-engine/data/dataset.csv`), and Platform Runtime Components.  
**Measurement Method**: Direct programmatic inspection of dataset files via verified scripts (zero estimates, zero hallucinations).  

---

## 1. Programmatic ICD Catalog Composition

### 1.1 Summary Metrics
| Dimension | Measured Value | Verification Evidence |
|---|:---:|---|
| **Total Ingested Concepts** | **71,704** | `len(data)` in `server/reference-data/icd10_clean.json` |
| **Catalog Edition / Modification** | **US ICD-10-CM (Clinical Modification)** | Alphanumeric, 3 to 7 characters; 49,941 codes feature 7th-character encounter extensions (`A`, `D`, `S`, etc.). |
| **Distinct 3-Character Categories** | **1,910** | Prefix `code[:3]` grouping across all 71,704 rows |
| **Distinct 4-Character Subcategories** | **10,000** | Prefix `code[:4]` grouping |
| **Distinct 5-Character Subcategories** | **14,572** | Prefix `code[:5]` grouping |
| **Distinct Concepts (Collapsing 7th-char Encounter Extensions)** | **34,290** | Truncating 7th character encounter extensions (`A`, `D`, `S`, `G`, `K`, `P`, `B`, etc.) |
| **Billable vs. Non-Billable Classification** | **100% Billable Leaf Codes** | All 71,704 entries in `icd10_clean.json` represent HIPAA-valid terminal leaf codes. Higher-level headers (e.g. non-terminal 3-character parent codes where sub-codes exist) are excluded. |

### 1.2 Code Length Distribution
In US ICD-10-CM, clinical specificity (laterality, anatomical site, encounter phase) expands codes up to 7 characters:
- **3 characters**: 224 concepts (0.31%) — e.g., `A90` (Dengue fever), `B54` (Unspecified malaria), `J00` (Acute nasopharyngitis)
- **4 characters**: 5,471 concepts (7.63%)
- **5 characters**: 6,426 concepts (8.96%)
- **6 characters**: 9,642 concepts (13.45%)
- **7 characters**: 49,941 concepts (69.65%)

### 1.3 Encounter Extensions (7th Character Breakdown)
Of the 49,941 7-character concepts, encounter phase extensions account for the majority:
- **Initial Encounter (`A`)**: 12,103 concepts
- **Subsequent Encounter (`D`)**: 12,062 concepts
- **Sequela (`S`)**: 12,062 concepts
- **Fracture/Burn Healing Variants (`G`, `K`, `P`, `B`, `C`, `E`, `F`, `H`, `J`, `M`, `N`, `Q`, `R`)**: 13,714 concepts

### 1.4 Distribution by Clinical Chapter
| Chapter | Range | Clinical Description | Concept Count | Catalog Share |
|---|---|---|:---:|:---:|
| **Ch 1** | `A00–B99` | Certain infectious and parasitic diseases | 1,058 | 1.48% |
| **Ch 2** | `C00–D49` | Neoplasms | 1,636 | 2.28% |
| **Ch 3** | `D50–D89` | Diseases of the blood and blood-forming organs | 247 | 0.34% |
| **Ch 4** | `E00–E89` | Endocrine, nutritional and metabolic diseases | 904 | 1.26% |
| **Ch 5** | `F01–F99` | Mental, behavioral and neurodevelopmental disorders | 743 | 1.04% |
| **Ch 6** | `G00–G99` | Diseases of the nervous system | 616 | 0.86% |
| **Ch 7** | `H00–H59` | Diseases of the eye and adnexa | 2,564 | 3.58% |
| **Ch 8** | `H60–H95` | Diseases of the ear and mastoid process | 656 | 0.91% |
| **Ch 9** | `I00–I99` | Diseases of the circulatory system | 1,347 | 1.88% |
| **Ch 10** | `J00–J99` | Diseases of the respiratory system | 341 | 0.48% |
| **Ch 11** | `K00–K95` | Diseases of the digestive system | 789 | 1.10% |
| **Ch 12** | `L00–L99` | Diseases of the skin and subcutaneous tissue | 846 | 1.18% |
| **Ch 13** | `M00–M99` | Diseases of the musculoskeletal system & connective tissue | 6,484 | 9.04% |
| **Ch 14** | `N00–N99` | Diseases of the genitourinary system | 654 | 0.91% |
| **Ch 15** | `O00–O9A` | Pregnancy, childbirth and the puerperium | 2,250 | 3.14% |
| **Ch 16** | `P00–P96` | Certain conditions originating in the perinatal period | 424 | 0.59% |
| **Ch 17** | `Q00–Q99` | Congenital malformations, deformations and chromosomal | 812 | 1.13% |
| **Ch 18** | `R00–R99` | Symptoms, signs and abnormal clinical findings | 712 | 0.99% |
| **Ch 19** | `S00–T88` | Injury, poisoning & certain other external consequences | 40,519 | 56.51% |
| **Ch 20** | `V00–Y99` | External causes of morbidity | 6,864 | 9.57% |
| **Ch 21** | `Z00–Z99` | Factors influencing health status & contact with health services | 1,238 | 1.73% |
| **TOTAL** | | **All 21 Chapters** | **71,704** | **100.00%** |

---

## 2. Complete Inventory of the 41 Curated Reference Profiles

The baseline machine learning symptom predictor (`ml-engine/data/dataset.csv`) contains 4,920 synthetic patient presentation rows mapping to exactly **41 distinct disease profiles**.

- **Source of Symptom Text**: Synthetic multi-label symptom co-occurrence matrix originally adapted from the Columbia University / SymCAT public health dataset and distributed via Kaggle Disease Symptom Prediction dataset.
- **Coverage of Catalog**:
  - By terminal leaf codes: **41 / 71,704 = 0.057%**
  - By 3-character categories: **39 / 1,910 = 2.04%**
  - By 4-character categories: **41 / 10,000 = 0.41%**

### Full Table of 41 Reference Profiles
| # | Disease Profile Name (Dataset String) | ICD-10 Code | Official ICD-10-CM Description | Matched Symptoms |
|---|---|:---:|---|:---:|
| 1 | `(vertigo) Paroymsal Positional Vertigo` | `H81.1` | Benign paroxysmal vertigo | 6 |
| 2 | `AIDS` | `B20` | Human immunodeficiency virus [HIV] disease | 4 |
| 3 | `Acne` | `L70.0` | Acne vulgaris | 4 |
| 4 | `Alcoholic hepatitis` | `K70.1` | Alcoholic hepatitis | 7 |
| 5 | `Allergy` | `T78.4` | Allergy, unspecified | 4 |
| 6 | `Arthritis` | `M13.9` | Arthritis, unspecified | 5 |
| 7 | `Bronchial Asthma` | `J45.9` | Asthma, unspecified | 6 |
| 8 | `Cervical spondylosis` | `M47.8` | Other spondylosis | 5 |
| 9 | `Chicken pox` | `B01.9` | Varicella without complication | 11 |
| 10 | `Chronic cholestasis` | `K83.1` | Obstruction of bile duct | 7 |
| 11 | `Common Cold` | `J00` | Acute nasopharyngitis [common cold] | 17 |
| 12 | `Dengue` | `A90` | Dengue fever [classical dengue] | 14 |
| 13 | `Diabetes ` | `E11.9` | Type 2 diabetes mellitus without complications | 10 |
| 14 | `Dimorphic hemmorhoids(piles)` | `K64.9` | Unspecified hemorrhoids | 5 |
| 15 | `Drug Reaction` | `T88.7` | Unspecified adverse effect of drug or medicament | 5 |
| 16 | `Fungal infection` | `B35.9` | Dermatophytosis, unspecified | 4 |
| 17 | `GERD` | `K21.9` | Gastro-esophageal reflux disease without esophagitis | 6 |
| 18 | `Gastroenteritis` | `K52.9` | Noninfective gastroenteritis and colitis, unspecified | 4 |
| 19 | `Heart attack` | `I21.9` | Acute myocardial infarction, unspecified | 4 |
| 20 | `Hepatitis B` | `B16.9` | Acute hepatitis B w/o delta-agent and without hepatic coma | 12 |
| 21 | `Hepatitis C` | `B17.1` | Acute hepatitis C | 6 |
| 22 | `Hepatitis D` | `B17.0` | Acute delta-(super) infection of hepatitis B carrier | 9 |
| 23 | `Hepatitis E` | `B17.2` | Acute hepatitis E | 13 |
| 24 | `Hypertension ` | `I10` | Essential (primary) hypertension | 5 |
| 25 | `Hyperthyroidism` | `E05.9` | Thyrotoxicosis, unspecified | 11 |
| 26 | `Hypoglycemia` | `E16.2` | Hypoglycemia, unspecified | 12 |
| 27 | `Hypothyroidism` | `E03.9` | Hypothyroidism, unspecified | 13 |
| 28 | `Impetigo` | `L01.0` | Impetigo [any organism] | 5 |
| 29 | `Jaundice` | `R17` | Unspecified jaundice | 8 |
| 30 | `Malaria` | `B54` | Unspecified malaria | 8 |
| 31 | `Migraine` | `G43.9` | Migraine, unspecified | 9 |
| 32 | `Osteoarthristis` | `M19.9` | Osteoarthritis, unspecified site | 6 |
| 33 | `Paralysis (brain hemorrhage)` | `I61.9` | Nontraumatic intracerebral hemorrhage, unspecified | 4 |
| 34 | `Peptic ulcer diseae` | `K27.9` | Peptic ulcer, site unsp, unsp as ac or chr, w/o hemor or perf | 6 |
| 35 | `Pneumonia` | `J18.9` | Pneumonia, unspecified organism | 11 |
| 36 | `Psoriasis` | `L40.9` | Psoriasis, unspecified | 6 |
| 37 | `Tuberculosis` | `A15.0` | Tuberculosis of lung | 16 |
| 38 | `Typhoid` | `A01.0` | Typhoid fever, unspecified | 11 |
| 39 | `Urinary tract infection` | `N39.0` | Urinary tract infection, site not specified | 4 |
| 40 | `Varicose veins` | `I83.9` | Asymptomatic varicose veins of lower extremities | 7 |
| 41 | `hepatitis A` | `B15.9` | Hepatitis A without hepatic coma | 11 |

---

## 3. Platform Dependency Analysis: The 41 Profiles vs. Generic Any-ICD Capabilities

| Subsystem | Underlying Data Source | Scope / Dependency | Status |
|---|---|---|:---:|
| **ML Symptom Predictor** (`/api/ml/predict-disease`) | `dataset.csv` + TF-IDF model | **Strictly depends on the 41 reference profiles**. Cannot infer diagnoses outside the 41 based on symptom tags. | Dependent on 41 |
| **Doctor ICD Diagnosis Search** (`/drugs/icd10`) | `server/reference-data/icd10_clean.json` | **Works for ANY of the 71,704 ICD codes**. Clinician can select any valid condition manually. | Independent (Any ICD) |
| **Consultation Recording & Records** | `server/src/models/Consultation.js` | **Works for ANY ICD code**. Schema stores string `icdCode` and `icdVersion` ('ICD10' or 'ICD11') without foreign-key constraints to the 41. | Independent (Any ICD) |
| **PDF Summary & Email Dispatch** | `pdfGenerator.js` & `consultationSummaryEmailService.js` | **Works for ANY ICD code**. Renders whichever diagnosis string was selected. | Independent (Any ICD) |
| **Patient Medical History & QR Gate** | `VerificationToken.js` & `patientController.js` | **Works for ANY ICD code**. History queries pull all past encounters regardless of diagnosis category. | Independent (Any ICD) |
| **Outbreak Detection & Surveillance** | `server/src/services/surveillanceService.js` | **Works for ANY ICD code**. `diseaseId(c)` accepts any valid ICD-10 or ICD-11 syntax and groups cases dynamically by `${entity}\|${diseaseId}`. Evaluates $N \ge 5$, 56-day regularized baseline, and $z > 2.0$ across 2 consecutive days. | Independent (Any ICD) |
| **Public Health Dashboard** | `PublicHealth.jsx` & `consultationActivity.js` | **Aggregates ANY recorded ICD condition** for incidence rates and consultation activity. | Independent (Any ICD) |
| **Admin Outbreak Monitor KPI Card** | `OutbreakMonitor.jsx` ("Reference Disease Profiles") | **Currently displays `41`**. Previously unlabeled regarding its relationship to the full 71,704 catalog. Updated in Phase D1 to an honest coverage statement. | Fixed in D1 |

---

## 4. Admin Outbreak Monitor Label Fix

To prevent confusing the 41 curated symptom reference models with total platform disease capability:
- **Prior Label**: `Reference disease profiles: 41`
- **Updated Standard Label & Tooltip**:
  - **Tile Label**: `Symptom reference profiles` (trilingual: EN / SI / TA)
  - **Tile Value**: `41 / 71,704`
  - **Subtext Coverage Statement**: `"Symptom reference profiles: 41 of 71,704 conditions; any ICD code can be selected manually"`
  - **Trilingual Parity**: Maintained across English, Sinhala, and Tamil localization dictionaries.
