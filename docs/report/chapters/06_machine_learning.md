# Chapter 6: Machine Learning Methodology, Evaluation & Benchmarking

## 6.1 Clinical Role and Regulatory Positioning
The machine learning subsystem in MediSync is engineered as a **clinical decision support assistant** designed to aid medical officers during high-volume outpatient triage in rural and district-level base hospitals. It does not perform autonomous diagnosis, nor does it replace the clinical judgment of a licensed medical practitioner.

In strict adherence to regulatory boundaries, every response emitted by the ML microservice incorporates the immutable system attribute:
```json
"clinicalValidation": "not_established"
```
Furthermore, the client user interface renders prominent amber advisory banners accompanying all differential outputs, reminding clinicians that predictions represent statistical pattern matching against synthetic training distributions rather than clinically validated diagnoses.

---

## 6.2 Dual-Tier Inference Architecture
To reconcile high classification accuracy on prevalent conditions with broad coverage across rarer clinical presentations without exceeding cloud memory limits, MediSync implements a **Dual-Tier Triage Pipeline** (`ml-engine/app.py:481-601`, Diagram **D06**):

```
       [ Clinician Symptom Input (Vector / Free-Text Tokens) ]
                                 |
                                 v
                 +-------------------------------+
                 |  Tier 1: TF-IDF + Cosine Sim  |
                 |  (41 Curated Disease Classes) |
                 +---------------+---------------+
                                 |
               Top Confidence >= 40.0% (Score >= 0.40)?
                    /                         \
                  YES                          NO (or low confidence)
                  /                             \
                 v                               v
        [ Tier 1 Results (Top 5) ]    +-------------------------------+
                                      |  Tier 2: Sparse KB Retrieval  |
                                      |  (174 Active SymCAT Profiles) |
                                      +---------------+---------------+
                                                      |
                                                      v
                                        [ Tier 2 Match / Fallback ]
```

### 6.2.1 Tier 1: Curated Clinical Symptom Matcher (TF-IDF + Cosine Similarity)
- **Model Specification**: Implemented in `ml-engine/app.py:308-319, 481-544`. Uses scikit-learn `TfidfVectorizer(ngram_range=(1, 2), min_df=1)` fit across 41 curated clinical disease documents constructed from `ml-engine/data/dataset.csv`.
- **Scoring Formulation**: Evaluates candidate disease documents against query symptom tokens using a weighted hybrid score combining vector cosine similarity with exact symptom token coverage:
  $$\text{combined\_score} = 0.65 \times \text{cosine\_similarity} + 0.35 \times \left(\frac{|\text{matched\_symptoms}|}{\max(1, |\text{input\_symptoms}|)}\right)$$
  $$\text{confidence} = \text{round}(\text{combined\_score} \times 100, 2)$$
- **Admission Threshold**: Candidates must satisfy `combined_score > 0.05` or `cosine_similarity > 0.10` to enter consideration.
- **Cardinal Symptom Heuristics**: Embedded clinical safeguards verify essential cardinal symptoms. Specifically, Typhoid fever (`ml-engine/app.py:511-514`) is an enteric fever whose hallmark presentation requires high fever or chills; if a query contains localized symptoms without fever or chills, the score is penalized:
  $$\text{combined\_score}_{\text{typhoid}} = \text{combined\_score} \times 0.55$$
- **Evaluation Performance**: As evaluated by `ml-engine/evaluation/generate_evaluation_charts.py` on an 80/20 stratified train/test split (seed 42, 61 test queries, zero data leakage):
  - **Held-Out Top-1 Accuracy**: **98.36%** (60/61 test queries correctly predicted)
  - **Macro F1-Score**: **1.0000** across 41 classes
  - **Micro-Average ROC AUC**: **0.9997** (Figure **F01** and Figure **F02**)

### 6.2.2 Tier 2: Sourced Knowledge Base Sparse Retrieval
- **Data Provenance**: Ingested from the open-source SymCAT ambulatory clinical survey dataset (derived from CDC National Ambulatory Medical Care Survey data) via `ml-engine/data_pipeline/ingest_disease_symptom_kb_v2.py`.
- **Curation and Quarantine Pipeline**:
  - The raw dataset comprised **801 distinct disease conditions** across 20,576 co-occurrence edges.
  - **Dummy Imputation Filter**: Excluded conditions sharing Jaccard similarity $\ge 0.70$ with a 12-symptom synthetic imputation fallback set.
  - **Edge Probability Filter**: Pruned low-evidence co-occurrence edges with empirical outpatient probability $P < 15.0\%$ (Figure **F03**).
  - **Symptom Count Threshold**: Excluded conditions retaining fewer than 3 surviving symptoms above the 15% threshold.
  - **Duplicate Condition Filter**: Quarantined conditions sharing Jaccard overlap $\ge 0.85$ on surviving symptoms.
  - **Quarantine Outcome**: 136 conditions quarantined into `ml-engine/data/kb_quarantine.v1.json` (Figure **F05**).
  - **Active Surviving Pool**: 665 conditions survived quality filtering (Figure **F04**).
  - **ICD-10 Mapping Outcome**:
    - **174 conditions** auto-accepted via exact normalized match against `server/reference-data/icd10_clean.json` and versioned synonyms (`ml-engine/data/disease_symptom_kb.v1.json`).
    - **491 conditions** retained in `ml-engine/data/unmapped_diseases.v1.json` (`needs_owner_review`) with candidate ICD proposals.
- **Retrieval Formulation**: Tier 2 vectors weighted symptom terms where each term is repeated proportional to empirical probability ($N = \text{round}(P / 10)$). Cosine similarity and overlap ratio are combined via the same $65\% / 35\%$ formula.

### 6.2.3 Tiered Blending Protocol
Inference evaluates Tier 1 first (`ml-engine/app.py:545-601`):
- If Tier 1 top candidate confidence $\ge 40.0\%$ (score $\ge 0.40$), Tier 1 returns its top-5 predictions.
- If Tier 1 top candidate confidence $< 40.0\%$, the engine queries Tier 2. If Tier 2 returns a candidate with confidence greater than or equal to Tier 1, Tier 2 candidates are returned; otherwise, Tier 1 candidates are preserved.
- Figure **F08** illustrates the self-consistency Top-1, Top-3, and Top-5 retrieval fidelity across Tier 1, Tier 2, and combined inference modes.

---

## 6.3 Ground-Truth Design Parameters & Heuristics Inventory
All 11 hand-set heuristics governing the ML and surveillance engines were audited directly against source code and recorded in `docs/report/ML_DESIGN_PARAMETERS.md`:

| Parameter / Heuristic | Ground-Truth Value | Code Location | Engineering Classification |
|---|:---:|---|---|
| **Tier Switch Confidence Floor** | `40.0%` (score $\ge 0.40$) | `ml-engine/app.py:553` | Non-clinical design choice |
| **Typhoid Non-Fever Penalty Factor** | `0.55x` multiplier | `ml-engine/app.py:514` | Clinical heuristic (needs review) |
| **Minimum Overlap Guard** | `matched >= 1` token | `ml-engine/app.py:571` | Non-clinical design choice |
| **Score Admission Floor** | `score > 0.05` or `cos > 0.10` | `ml-engine/app.py:516` | Retrieval filter |
| **KB Edge Probability Cutoff** | `P >= 15.0%` | `ingest_disease_symptom_kb_v2.py:28` | Quality filter |
| **KB Minimum Surviving Symptoms** | `3` symptoms | `ingest_disease_symptom_kb_v2.py:29` | Quality filter |
| **Dummy Cluster Jaccard Threshold** | `Jaccard >= 0.70` | `ingest_disease_symptom_kb_v2.py:179` | Noise quarantine |
| **Duplicate Profile Jaccard Threshold**| `Jaccard >= 0.85` | `ingest_disease_symptom_kb_v2.py:220` | Deduplication quarantine |
| **Outbreak Gate 1: Episode Floor** | `N >= 5` episodes | `surveillanceService.js:185` | Noise suppression floor |
| **Outbreak Gate 2: Persistence** | `2` consecutive days ($z > 2.0$) | `surveillanceService.js:236` | Temporal persistence gate |
| **Outbreak Gate 3: Standard Deviation**| `z > 2.0` ($z = (c_k - \mu)/\sigma$) | `surveillanceService.js:228` | Statistical anomaly cutoff |

---

## 6.4 Resource Profiling & Cloud Footprint
Real operating system process resident memory (RSS) was benchmarked using `psutil` within the Python runtime (`scripts/benchmark_ml_resources.py`):

| Measurement Stage | OS Process RSS | % of 512 MB Render Free Limit | Measured Latency Metric |
|---|---|---|---|
| **Fresh Process Boot** | 20.75 MB | 4.05% | - |
| **Post-Model & KB Load** | 195.91 MB | 38.26% | - |
| **Post-100 Inferences** | 196.82 MB | 38.44% | **Mean: 0.77 ms**, Median: 0.64 ms, p95: 1.24 ms |

As visualized in Figure **F09**, the peak resident memory of 196.82 MB demonstrates substantial safety margin below the 512 MB cloud container ceiling, preventing out-of-memory (OOM) fatal kills.

---

## 6.5 Epidemiological Surveillance Evaluation
The outbreak detection engine (`server/src/services/surveillanceService.js:130-260`) enforces a 7-day observation window compared against a 56-day baseline:
- **Baseline Regularization**: If baseline standard deviation $\sigma_{\text{base}} < 0.5$, $\sigma_{\text{base}} = \max(0.5, \sqrt{\mu_{\text{base}}})$. If baseline mean $\mu_{\text{base}} = 0$, defaults to $\mu = 0.1, \sigma = 0.5$.
- **Operating Threshold**: Operating cutoff of $z > 2.0$ across 2 consecutive calendar days with $N \ge 5$ was evaluated across canonical Scenarios S1–S8 (`ml-engine/evaluation/generate_evaluation_charts.py`):
  - **Sensitivity**: **100.0%** (5/5 true outbreaks detected: S1 Dengue fast spike, S3 Chickenpox creeping wave, S4 Influenza spike, S5 Hepatitis cluster, S6 Typhoid wave).
  - **False Alarm Rate**: **0.0%** on negative controls (S2 Decayed cluster, S7 Flat baseline, S8 Isolated 1-day reporting artifact).
  - **Detector ROC AUC**: **0.6667** across S1–S8 operating curve (Figure **F10**).
- Figure **F11** documents cross-chapter dynamic surveillance across 12 distinct diseases confirming zero disease whitelists.
- Figure **F12** illustrates 14-day statistical projection curves with 95% Student's t prediction bounds ($df = 12$).
