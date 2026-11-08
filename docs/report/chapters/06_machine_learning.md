# Chapter 6: Machine Learning Methodology, Evaluation & Benchmarking

## 6.1 Clinical Role and Regulatory Positioning
The machine learning subsystem in MediSync is engineered as a **clinical decision support assistant** designed to aid medical officers during high-volume outpatient triage in rural and district-level base hospitals. It does not perform autonomous diagnosis, nor does it replace the clinical judgment of a licensed practitioner. 

In strict adherence to regulatory boundaries, every response emitted by the ML microservice incorporates the immutable system attribute:
```json
"clinicalValidation": "not_established"
```
Furthermore, the client user interface renders prominent amber advisory banners accompanying all differential outputs, reminding clinicians that predictions represent statistical pattern matching against synthetic training distributions rather than clinically validated diagnoses.

---

## 6.2 Dual-Tier Inference Architecture
To reconcile high classification accuracy on prevalent conditions with broad coverage across rarer clinical presentations without exceeding cloud memory limits, MediSync implements a **Dual-Tier Triage Pipeline** (Diagram **D06**):

```
       [ Clinician Symptom Input (Vector / Tags) ]
                           |
                           v
           +-------------------------------+
           |    Tier 1: Random Forest      |
           |  (41 Curated Disease Classes) |
           +---------------+---------------+
                           |
         Confidence >= 0.35?
              /         \
            YES          NO (or low confidence)
            /             \
           v               v
  [ Tier 1 Result ]    +-------------------------------+
                       |    Tier 2: Sparse KB Matcher  |
                       |  (174 Active SymCAT Profiles) |
                       +---------------+---------------+
                                       |
                                       v
                             [ Tier 2 Match / Fallback ]
```

### 6.2.1 Tier 1: Calibrated Random Forest Classifier
- **Model Specification**: An ensemble of 100 decision trees implemented via `scikit-learn`, trained across 41 curated disease profiles representing frequent communicable and non-communicable conditions in South Asia (including Dengue fever, Leptospirosis, Typhoid fever, Malaria, Viral Hepatitis, Bronchial Asthma, and Type 2 Diabetes).
- **Feature Space**: 132 binary symptom indicators derived from standardized clinical presentations.
- **Cardinal Symptom Heuristics**: Embedded clinical safeguards verify essential cardinal symptoms. For example, a diagnosis of Typhoid fever requires the explicit presence of persistent high-grade step-ladder fever or rose spots; absence triggers automated confidence penalties.
- **Evaluation Performance**: As illustrated in Figure **F01** (Confusion Matrix) and Figure **F02** (ROC and Precision-Recall Curves), Tier 1 achieves high synthetic self-consistency on held-out test splits (Macro F1 = 0.94, Micro F1 = 0.96 across synthetic test matrices).

### 6.2.2 Tier 2: Sparse Knowledge Base Retrieval Engine
- **Data Provenance**: Ingested from the open-source SymCAT ambulatory clinical survey dataset (derived from CDC National Ambulatory Medical Care Survey data).
- **Curation and Quarantine Pipeline**:
  - The raw dataset comprised 801 disease profiles with 17,400 symptom-disease co-occurrence edges.
  - As detailed in Figure **F03** (Probability Histogram) and Figure **F04** (KB Ingestion Funnel), raw co-occurrence edges below $p < 0.15$ were pruned as noise.
  - Profiles with high Jaccard similarity ($\ge 0.80$) or fewer than 3 surviving distinct symptoms were isolated into `kb_quarantine.v1.json` (136 quarantined profiles, analyzed in Figure **F05**).
  - 174 clinically distinct profiles were successfully mapped to standard public-domain ICD-10-CM codes and admitted to the active knowledge base (`disease_symptom_kb_v2.json`).
- **Matching Algorithm**: Evaluates query symptoms against the sparse knowledge base using probability-weighted Jaccard overlap, computing normalized relevance scores.

### 6.2.3 Tiered Blending Protocol
Inference evaluates Tier 1 first. If Tier 1 confidence satisfies the threshold ($\ge 0.35$), the top-3 predictions are returned. If Tier 1 confidence falls below 0.35 or reports an unconfident classification, the engine automatically falls back to Tier 2 sparse retrieval, ensuring continuous diagnostic coverage without dead ends. Figure **F08** demonstrates the top-1, top-3, and top-5 self-consistency accuracy across Tier 1, Tier 2, and combined inference modes.

---

## 6.3 Design Parameters & Heuristics Inventory
All 11 hand-set heuristics governing the ML engine were audited and recorded in `docs/report/ML_DESIGN_PARAMETERS.md`:

| Parameter Identifier | Value | Architectural Purpose | Classification |
|---|---|---|---|
| `TIER1_CONFIDENCE_THRESHOLD` | 0.35 | Gate between Tier 1 ML and Tier 2 KB retrieval | Non-clinical design choice |
| `KB_EDGE_PROBABILITY_FLOOR` | 0.15 | Prunes low-confidence noise edges from SymCAT data | Non-clinical design choice |
| `KB_MIN_SYMPTOMS_PER_DISEASE` | 3 | Minimum distinct symptoms required for KB admission | Quality threshold |
| `KB_JACCARD_DEDUPLICATION` | 0.80 | Quarantine threshold for redundant disease profiles | Deduplication filter |
| `MAX_PREDICTIONS_RETURNED` | 3 | Limits cognitive load on reviewing medical officer | Usability choice |
| `TYPHOID_CARDINAL_CHECK` | True | Enforces fever/chills requirement for Typhoid | Clinical heuristic (needs review) |
| `DENGUE_PLATELET_ALERT` | $\le 100\text{k}$ | Triggers urgent warning on thrombocytopenia | Clinical guideline rule |
| `EWMA_SMOOTHING_ALPHA` | 0.30 | Moving average weighting for outbreak baselines | Epidemiological parameter |
| `OUTBREAK_ZSCORE_THRESHOLD` | +2.50 | Standard deviation cutoff for anomaly alerts | Statistical parameter |
| `OUTBREAK_MIN_CASES_GATE` | 5 | Minimum daily absolute volume to suppress noise | Non-clinical design choice |
| `OUTBREAK_MIN_DAYS_GATE` | 3 | Consecutive anomalous days required before alert | Non-clinical design choice |

---

## 6.4 Resource Profiling & Cloud Footprint
Under Sub-Project 5 Task 1.1, real operating system process resident memory (RSS) was benchmarked using `psutil` within the Python runtime (`scripts/benchmark_ml_resources.py`):

| Measurement Stage | OS Process RSS | % of 512 MB Render Free Limit | Measured Mean Latency |
|---|---|---|---|
| **Fresh Process Boot** | 20.75 MB | 4.05% | - |
| **Post-Model & KB Load** | 195.91 MB | 38.26% | - |
| **Post-100 Inferences** | 196.82 MB | 38.44% | 0.77 ms (p50: 0.64 ms, p95: 1.24 ms) |

As visualized in Figure **F09**, the peak resident memory of 196.82 MB demonstrates substantial safety margin below the 512 MB cloud container ceiling, preventing out-of-memory (OOM) fatal kills.

---

## 6.5 Epidemiological Surveillance Evaluation
The outbreak detection engine was evaluated across 8 synthetic epidemiological scenarios (S1–S8) across 12 target diseases (Figure **F10** and Figure **F11**):
- **Scenario S1 (Sharp Dengue Spike)**: Detected at Day 3 (z-score = +3.82, volume = 14 cases), successfully passing all three suppression gates.
- **Scenario S2 (Gradual Leptospirosis Rise)**: Detected via C-SUM accumulation at Day 5.
- **Scenario S3 (Single-Day Food Poisoning Outlier)**: Successfully suppressed by the Duration Gate ($< 3$ consecutive days), preventing false public panic.
- **Scenario S4 (Low Baseline Noise)**: Successfully suppressed by the Volume Gate ($< 5$ cases).

Figure **F12** illustrates the 14-day statistical projection curves, confirming appropriate bounding intervals during non-linear incidence surges.
