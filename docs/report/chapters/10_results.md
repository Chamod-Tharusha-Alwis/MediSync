# Chapter 10: Empirical Results & Performance Evaluation

## 10.1 Quality Gate & Verification Summary
Empirical validation of MediSync was conducted using the master offline test gate (`scripts/run_offline_tests.js`). Across all 207 automated test suites, the platform achieved a **100% pass rate**:

| Metric Category | Target Invariant | Measured Result | Status |
|---|---|---|---|
| **Total Tests Passed** | $\ge 3,400$ | **3,465** | PASS |
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

### 10.3.1 Tier 1 Classification Performance
Evaluated across a stratified held-out test split of 1,230 synthetic multi-symptom profiles (Figure **F01** and Figure **F02**):
- **Macro Precision**: 0.95
- **Macro Recall**: 0.94
- **Macro F1-Score**: 0.94
- **Micro / Overall Accuracy**: 0.96
- **ROC Area Under Curve (AUC)**: 0.99 (Macro average across 41 classes)

### 10.3.2 Tier 2 Knowledge Base Curation Outcomes
As recorded in `ingest_disease_symptom_kb_v2.py` and visualised in Figure **F04**:
- **Raw Input Profiles**: 801 conditions (SymCAT ambulatory survey)
- **Auto-Accepted Profiles**: 174 conditions mapped to verified ICD-10-CM codes
- **Quarantined Profiles**: 136 conditions (redundant, $<3$ symptoms, or low evidence)
- **Unmapped Ingestion Profiles**: 491 conditions (retained in quarantine pending manual clinical ontology mapping)

### 10.3.3 Combined Tiered Matcher Self-Consistency
Across combined synthetic test evaluations (Figure **F08**):
- **Top-1 Accuracy**: 89.2%
- **Top-3 Accuracy**: 96.8%
- **Top-5 Accuracy**: 99.1%

---

## 10.4 Outbreak Detection Simulation Outcomes
Evaluating the 8 synthetic disease scenarios (S1–S8, Figure **F10**):
- **True Positive Alerts**: Outbreaks in Scenarios S1 (Dengue), S2 (Leptospirosis), and S7 (Dysentery) were correctly detected with an average alert lead-time of 3.2 days.
- **False Positive Suppression**: Single-day spike anomalies (Scenario S3) and low-volume fluctuations (Scenario S4) were 100% suppressed by the Duration and Volume gates, demonstrating resilience against alert fatigue.

---

## 10.5 Trilingual Interface Parity
Automated dictionary parsing across `client/src/locales/` confirmed:
- **Total Registered Keys**: 482 distinct UI string keys.
- **English (en) Completeness**: 482 / 482 (100.0%)
- **Sinhala (si) Completeness**: 482 / 482 (100.0%)
- **Tamil (ta) Completeness**: 482 / 482 (100.0%)
- **Key Discrepancies**: 0 missing keys (Figure **F14**).
