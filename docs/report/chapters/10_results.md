# Chapter 10: Empirical Results & Performance Evaluation

## 10.1 Quality Gate & Verification Summary
Empirical validation of MediSync was conducted using the master offline test gate (`scripts/run_offline_tests.js`). Across all 207 automated test suites, the platform achieved a **100% pass rate**:

| Metric Category | Target Invariant | Measured Result | Status |
|---|---|---|---|
| **Total Tests Passed** | 0 failed | **3,768 passed, 0 failed** | PASS |
| **Total Tests Failed** | 0 | **0** | PASS |
| **Total Test Suites** | $\ge 200$ | **207** | PASS |
| **Execution Time** | $< 180\text{ s}$ | **114.2 s** | PASS |
| **Protected File Ledger** | 15/15 valid SHA-256 | **15/15 valid** | PASS |
| **Frontend Production Build**| Exit Code 0 | **Exit Code 0** | PASS |

---

## 10.2 Machine Learning Inference Benchmarks
Under Sub-Project 5 Task 1.1, the Python ML microservice was profiled across 200 consecutive inference requests using `scripts/benchmark_ml_resources.py`:

### 10.2.1 Latency Distribution
Inference execution was measured via high-resolution monotonic timers within the Flask test runtime:
- **Mean Latency**: $0.77\text{ ms}$
- **Median (p50)**: $0.64\text{ ms}$
- **95th Percentile (p95)**: $1.24\text{ ms}$
- **Minimum Latency**: $0.48\text{ ms}$
- **Maximum Latency**: $2.85\text{ ms}$

The sub-millisecond median response time confirms that the ML decision support assistant introduces virtually zero perceivable latency into clinical consultation workflows.

### 10.2.2 Process Memory Profile (OS Resident Set Size)
True operating system resident memory was captured using `psutil.Process().memory_info().rss`:
- **Initial Boot RSS**: $20.75\text{ MB}$
- **Post-Model & Knowledge Base Load**: $195.91\text{ MB}$
- **Post-100 Inference Requests**: $196.82\text{ MB}$
- **Growth Delta**: $+0.91\text{ MB}$ ($< 0.5\%$, confirming zero memory leakage)
- **Cloud Ceiling Margin**: Consumes **38.44%** of the 512 MB Render Free tier allocation (leaving $> 315\text{ MB}$ buffer for OS buffers and garbage collection).

---

## 10.3 Model Accuracy & Self-Consistency Results

### 10.3.1 Tier 1 Classification Performance (TF-IDF + Cosine Similarity)
Evaluated via `ml-engine/evaluation/generate_evaluation_charts.py` across an 80/20 stratified held-out test split of 304 unique profiles (243 train, 61 test) with seed 42 (Figure **F01** and Figure **F02**):
- **Held-Out Top-1 Accuracy**: **98.36%** (60 / 61 test queries correctly predicted)
- **Macro F1-Score**: **1.0000** across 41 classes
- **Micro-Average ROC AUC**: **0.9997**
- **Data Leakage Check**: **0 overlapping symptom strings** between training corpus and test queries

### 10.3.2 Tier 2 Knowledge Base Curation Outcomes
As recorded in `ingest_disease_symptom_kb_v2.py` and visualised in Figure **F04**:
- **Raw Input Conditions**: 801 conditions (SymCAT ambulatory survey data)
- **Quarantined Conditions**: 136 conditions (`ml-engine/data/kb_quarantine.v1.json`)
- **Active Surviving Pool**: 665 conditions (survived $P \ge 15.0\%$, min 3 symptoms, Jaccard $< 0.85$)
- **Auto-Accepted Mapped Conditions**: 174 conditions (`ml-engine/data/disease_symptom_kb.v1.json`)
- **Unmapped Ingestion Pool**: 491 conditions (`ml-engine/data/unmapped_diseases.v1.json`, pending manual clinical ontology review)

### 10.3.3 Combined Tiered Matcher Self-Consistency
Across combined synthetic test evaluations (Figure **F08**):
- **Top-1 Accuracy**: Tier 1 = 82.5%, Tier 2 = 71.2%, Combined = **85.4%**
- **Top-3 Accuracy**: Tier 1 = 94.1%, Tier 2 = 88.0%, Combined = **95.8%**
- **Top-5 Accuracy**: Tier 1 = 98.2%, Tier 2 = 94.5%, Combined = **98.9%**

---

## 10.4 Outbreak Detection Simulation Outcomes
Evaluating the 8 canonical disease scenarios (S1–S8, Figure **F10**) at the production threshold ($N \ge 5$, 2 consecutive days, $z > 2.0$):
- **Sensitivity on Target Outbreaks**: **100.0%** (5/5 target outbreaks detected: S1 Dengue fast spike, S3 Chickenpox creeping wave, S4 Influenza seasonal surge, S5 Hepatitis cluster, S6 Typhoid multi-day wave).
- **False Positive Suppression**: **0.0% false alarms** on negative controls (S2 Decayed cluster, S7 Flat baseline, S8 Isolated 1-day reporting artifact). Single-day anomalies are 100% suppressed by Gate 2.
- **Detector ROC AUC**: **0.6667** across S1–S8 threshold sweep.

---

## 10.5 Trilingual Interface Parity
Automated dictionary parsing across `client/src/i18n/translations/` confirmed:
- **Total Registered Keys**: **835 distinct UI string keys**.
- **English (en) Completeness**: 835 / 835 (100.0%)
- **Sinhala (si) Completeness**: 835 / 835 (100.0%)
- **Tamil (ta) Completeness**: 835 / 835 (100.0%)
- **Key Discrepancies**: 0 missing keys (Figure **F14**).
