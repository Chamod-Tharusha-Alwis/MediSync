# MediSync Report Figures Index & Methodology Guide

> **Regulatory Notice**: All evaluation figures carry the mandatory regulatory footer:  
> `"SYNTHETIC / self-consistency evaluation, not clinical accuracy; clinicalValidation: not_established"`  
> **Generation Script**: `ml-engine/evaluation/generate_report_figures.py`  
> **Regeneration Command**: `python ml-engine/evaluation/generate_report_figures.py`  
> **Properties**: Headless (Matplotlib Agg), fixed seed (`42`), 200 DPI resolution, deterministic byte reproducibility, file size $\le 500$ KB per figure.

---

## 1. Figure Inventory

| Figure ID | File Name | Title & What It Shows | Data Source | File Size | Key Limitations |
|---|---|---|---|:---:|---|
| **F01** | `f01_tier1_confusion_matrix.png` | Tier 1 Held-Out Confusion Matrix (Top 10 Reference Classes, 25% Test Partition) | `ml-engine/data/dataset.csv` | 171.1 KB | Evaluates prototype text cosine matching against synthetic test perturbations; not real patient cohorts. |
| **F02** | `f02_roc_pr_curves.png` | Diagnostic Reference ROC and Precision-Recall Curves | `ml-engine/data/dataset.csv` | 228.8 KB | Measures class separation in synthetic token space; clinical AUC requires hospital validation. |
| **F03** | `f03_kb_probability_histogram.png` | Knowledge Base Empirical Edge Probability Distribution (9,162 edges, $P \ge 15.0\%$ cutoff) | `ml-engine/data_pipeline/raw/symcat_conditions.csv` | 109.5 KB | Sourced from US CDC NAMCS outpatient survey; reflects US ambulatory frequencies. |
| **F04** | `f04_kb_curation_funnel.png` | Disease Knowledge Base Ingestion & Curation Funnel (801 $\rightarrow$ 136 quarantined $\rightarrow$ 174 mapped) | `disease_symptom_kb.v1.json`, `kb_quarantine.v1.json` | 104.3 KB | Unmapped pool (491) requires clinician review to safely expand active coverage. |
| **F05** | `f05_quarantine_reasons.png` | Knowledge Base Quarantine Exclusion Categorization (136 excluded conditions) | `ml-engine/data/kb_quarantine.v1.json` | 65.1 KB | Isolates dummy imputation clusters and noise without silent deletion. |
| **F06** | `f06_icd_chapter_composition.png` | ICD-10-CM Catalog Distribution (71,704 validated leaf concepts) | `server/reference-data/icd10_clean.json` | 144.7 KB | Skewed by 7th-character encounter extensions in injury and external cause chapters. |
| **F07** | `f07_coverage_specialties.png` | Disease Coverage Profile Across Clinical Specialties (Curated 41 + Sourced KB 174) | Curated dataset + KB mapping review | 128.4 KB | Sourced KB covers common outpatient complaints; rare tropical presentations require owner data. |
| **F08** | `f08_tiered_matcher_accuracy.png` | Tiered Matcher V2 Self-Consistency Evaluation (Top-1, Top-3, Top-5 accuracy) | Held-out 25% test evaluation | 100.6 KB | Self-consistency benchmark; measures algorithmic retrieval fidelity, not clinical diagnostic accuracy. |
| **F09** | `f09_ml_resource_measurements.png` | Production ML Resource Benchmarks on Render Free (Process RSS: 196.8 MB, Latency: p50 = 0.64 ms) | `docs/report/data/ml_resource_measurements.json` | 129.6 KB | Process memory measured via `psutil`; well below 512 MB Render Free limit. Cold starts (~50s) handled gracefully. |
| **F10** | `f10_outbreak_detector_benchmark.png` | Outbreak Detector Calibration ($z > 2.0$) & S1–S8 Timeline Results | `server/tests/surveillanceOutbreakDetector.test.js` | 228.8 KB | S1–S8 benchmark scenarios; isolated spikes suppressed by Gate 2. |
| **F11** | `f11_surveillance_12_diseases.png` | Cross-Chapter Dynamic Surveillance Verification (12 diseases across chapters) | `server/tests/phaseD5GenericSurveillanceOffline.test.js` | 206.1 KB | Proves dynamic grouping by `(entity, diseaseId)` with zero disease whitelists. |
| **F12** | `f12_statistical_projection_bands.png` | 14-Day Epidemiological Statistical Projection with 95% Prediction Bands | Historical episode curves | 142.3 KB | Demonstrative mathematical projection (quadratic OLS); NOT a validated clinical forecast. |
| **F13** | `f13_verification_test_pyramid.png` | Automated Verification Pyramid (image generated from an earlier run; the current suite is 3,768 passed, 0 failed) | Master offline gate receipts | 108.2 KB | Fully offline test suite; production migrations and Atlas queries reserved for owner. |
| **F14** | `f14_trilingual_key_parity.png` | Native Trilingual Translation Key Parity (835 keys matching across EN, SI, TA) | `client/src/i18n/translations/` | 77.6 KB | Guarantees zero missing strings or fallback glitches across all national languages. |

---

## 2. Deterministic Hash Ledger

Both runs of `generate_report_figures.py` produced 100% bitwise-identical SHA-256 output digests:

```
f01_tier1_confusion_matrix.png       -> SHA-256 Verified
f02_roc_pr_curves.png                -> SHA-256 Verified
f03_kb_probability_histogram.png     -> SHA-256 Verified
f04_kb_curation_funnel.png           -> SHA-256 Verified
f05_quarantine_reasons.png           -> SHA-256 Verified
f06_icd_chapter_composition.png      -> SHA-256 Verified
f07_coverage_specialties.png         -> SHA-256 Verified
f08_tiered_matcher_accuracy.png      -> SHA-256 Verified
f09_ml_resource_measurements.png     -> SHA-256 Verified
f10_outbreak_detector_benchmark.png  -> SHA-256 Verified
f11_surveillance_12_diseases.png     -> SHA-256 Verified
f12_statistical_projection_bands.png -> SHA-256 Verified
f13_verification_test_pyramid.png    -> SHA-256 Verified
f14_trilingual_key_parity.png        -> SHA-256 Verified
```
