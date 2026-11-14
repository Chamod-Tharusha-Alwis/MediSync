# MediSync Analytical & ML Engine Inventory

**Date of Audit:** 13 November 2026  
**Auditor:** Release Engineering Team  
**Scope:** Complete codebase inspection across client, server, and ml-engine components.

---

## 1. Executive Summary

This inventory establishes the truthful architectural status of all analytical, statistical, and algorithmic components in MediSync. In accordance with clinical honesty guidelines and viva examination requirements, components are categorized strictly into:
1. **Rule-Based Systems**: Deterministic graph traversals, lookups, and heuristics.
2. **Statistical Methods**: Parametric time-series monitoring, variance estimators, and regressions.
3. **Trained Machine Learning Models**: Supervised, self-supervised, or unsupervised parametric models fitted to training data.

> [!IMPORTANT]
> MediSync does **not** employ a Random Forest classifier, Support Vector Machine (SVM), Artificial Neural Network (ANN), or naive bayes ensemble in production. Any historical mentions of these algorithms in draft documentation were legacy placeholders and have been excised. The symptom suggestion engine uses lexical vector similarity (TF-IDF + Cosine Similarity), not trained parametric classification.

---

## 2. Component Inventory Table

| Component Name | System Location | Method Classification | Core Algorithm | Training Data / Corpus | Input Data | Output Data | Is "ML" Accurate? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Symptom Suggestion Service** | `ml-engine/app.py` | **Knowledge-Based / Lexical Vector Retrieval** | TF-IDF n-gram vectorizer (`ngram_range=(1,2)`) + Cosine Similarity | 41 curated reference profiles derived from Kaggle symptom-disease dataset | Free-text symptom strings or symptom tags | Ranked list of matched conditions with similarity scores (0.0 to 1.0) | **Partially (Lexical IR / Vector Space Model)**. Not trained deep learning or classifier. |
| **Outbreak Detection Service** | `server/src/services/surveillanceService.js` | **Statistical Surveillance** | Modified EARS C2 ($z = \frac{y - \bar{y}}{s}$, 7-day baseline) with Dual-Gate Filtering | None (in-process streaming calculation on consultation metadata) | Daily district-disease consultation counts for the last 56 days | Pending outbreak alerts with severity (`Critical`, `High`, `Warning`), z-scores, and telemetry | **No (Statistical Surveillance / Epidemiology)** |
| **14-Day Epidemiological Projection** | `server/src/utils/outbreakForecasting.js` | **Statistical Regression** | Ordinary Least Squares (OLS) Linear Trend Regression with Student's t 95% Prediction Bands | None (fitted dynamically to the last 14–30 days of clean observations) | Daily confirmed case counts over 14–30 complete calendar days | 14-day future point predictions, lower bounds ($\ge 0$), upper bounds, and $R^2$ | **No (Parametric Statistical Regression)** |
| **Drug Interaction & Safety Engine** | `server/src/utils/ingredientResolver.js`, `ml-engine/data/interactions_clean.json` | **Rule-Based Knowledge Graph** | Bipartite interaction pair matching, dosage range validation, and ingredient deduplication | Curated interaction pair database (DrugBank/FDA cross-references) | Prescription medication names, dosages, and patient active medication list | Detected drug-drug interactions, severity levels (`severe`, `moderate`, `minor`), and dosage limit warnings | **No (Deterministic Rule-Based Knowledge Base)** |
| **Doctor Triage Urgency Assessment** | `server/src/controllers/consultationController.js` | **Rule-Based Clinical Heuristic** | Deterministic thresholding on vital signs (HR, BP, SpO2, Temp) and red-flag symptom matching | None (standard emergency triage guidelines) | Patient vital signs and chief complaints | Triage priority level (`Immediate`, `Urgent`, `Routine`) | **No (Deterministic Clinical Heuristic)** |

---

## 3. Truthful Analysis per Component

### 3.1 Symptom Suggestion Service (`ml-engine/app.py`)
- **Truthful Architecture**: The service fits a `TfidfVectorizer` over a corpus of 41 curated disease symptom descriptions. When a user inputs symptoms, the query is vectorized and compared against the corpus using cosine similarity. Exact token overlaps are boosted by a weighted score.
- **Why it is not Random Forest / SVM**: Random Forest and SVM require training a decision tree ensemble or finding hyperplanes separating labeled multidimensional feature vectors with regularized optimization. No such training or `.pkl` weight files exist.
- **Viva Defense**: "The symptom suggestion engine is an information retrieval (IR) vector space model using TF-IDF and cosine similarity over 41 curated reference profiles. It acts as an autocomplete and reference lookup for medical officers, not an autonomous diagnostic classifier."

### 3.2 Outbreak Detector (`surveillanceService.js`)
- **Truthful Architecture**: Implements the Centers for Disease Control and Prevention (CDC) Early Aberration Reporting System (EARS) C2 algorithm, enhanced with two strict safety gates:
  1. **Gate 1 (Case Floor)**: Requires at least 5 cases in the active 7-day window ($N \ge 5$).
  2. **Gate 2 (Persistence Gate)**: Requires anomalous elevation ($z \ge 2.0$) on at least 2 consecutive complete days.
- **Why it is not ML**: The detector does not learn patterns from labeled historical training runs; it evaluates explicit parametric standard deviation thresholds on real-time consultation counts.
- **Viva Defense**: "The detector is a dual-gated statistical anomaly detector based on CDC EARS C2. Our ablation benchmark proves that adding the 2-day persistence gate and 5-case floor reduces simulated false alarms from 6.06 to 0.92 per year while maintaining a 1.0-day median detection delay."

### 3.3 14-Day Outbreak Projection (`outbreakForecasting.js`)
- **Truthful Architecture**: Fits an Ordinary Least Squares (OLS) trend line to complete daily historical observations, calculating variance prediction terms via:
  $$SE_{pred} = SE \cdot \sqrt{1 + \frac{1}{n} + \frac{(x - \bar{x})^2}{S_{xx}}}$$
  It projects Student's t 95% prediction intervals forward 14 days, clamped strictly at zero.
- **Why it is not an ML Forecast**: It is a statistical trend projection, not a SEIR/SIR dynamic compartmental model or recurrent neural network (LSTM).
- **Viva Defense**: "The chart is labeled honestly as a 'Statistical trend projection (linear regression with a 95% prediction band). Not a validated epidemic forecast.' In our rolling-origin backtest across 200 series, it achieves 94.9%–95.5% empirical coverage for its 95% prediction intervals."

---

## 4. Verification Proof

- Git commit hash: Recorded in `docs/report/results_ml_eval.json`.
- All figures generated at 200 dpi in `docs/report/figures/ml/`.
- No lingering references to "Random Forest", "SVM", or "ANN" exist in user-facing UI or clinical documentation.
