# Phase 5 Implementation Report: ML Coverage Improvement & Resource Audit

**Phase**: Phase 5 — ML Coverage Improvement (Time-Boxed, Honest)  
**Date**: 2026-11-09  
**Branch**: `final/p5-ml-coverage`  
**Status**: COMPLETE (Documented Honest Outcome)  

---

## 1. Executive Summary

In accordance with Phase 5 guidelines, an exhaustive, conservative audit of the 491 conditions in `ml-engine/data/unmapped_diseases.v1.json` was conducted against the 71,704-concept ICD-10-CM reference catalog (`server/reference-data/icd10_clean.json`).

### Documented Outcome: No Safe Additional Clinical Mappings Without Physician Review
- **Direct Catalog Overlap**: Exact normalized name matching yielded **0 additional clinical entities** beyond the 174 already accepted into Tier 2.
- **Near-Matches Require Clinical Disambiguation**: High-overlap candidate conditions (e.g., *Abdominal aortic aneurysm* matching `I71.3` [ruptured] vs `I71.4` [without rupture]; *Sensorineural hearing loss* matching `H90.3` [bilateral] vs `H90.5` [unspecified]) require chart-level clinical context and physician judgment. Auto-assigning specific billing codes would introduce clinical misclassification.
- **Typographic Variants**: Minor punctuation/hyphenation variations (*Cat-scratch disease* vs *Cat scratch disease*; *Guillain-Barre syndrome* vs *Guillain Barre syndrome*) exist, but do not warrant expanding catalog noise without human clinical sign-off.
- **Coverage Stability**: Total condition coverage remains locked at:
  - **Tier 1 (Curated Priority Profiles)**: 41 diseases (including Dengue, Malaria, Typhoid, Tuberculosis, Diabetes, COVID-19/Respiratory entities).
  - **Tier 2 (Sourced Knowledge Base)**: 174 vetted conditions (1,770 probability-weighted symptom edges, $P \ge 15\%$, min 3 symptoms/disease).
  - **Combined Model Differential Coverage**: 215 conditions.
  - **Clinician Manual Diagnosis Coverage**: 71,704 ICD-10-CM conditions searchable via full-text index.

---

## 2. Resource & Memory Footprint Verification

A fresh execution of `scripts/benchmark_ml_resources.py` was conducted using Python 3.14 (`.venv`) measuring actual OS process Resident Set Size (RSS) via `psutil`:

| Metric Stage | Resident Set Size (RSS) | % of 512 MB Render Free Tier Limit |
|---|:---:|:---:|
| **Fresh Process Boot** | 20.73 MB | 4.05% |
| **Post-Model & Knowledge Base Load** | 196.50 MB | 38.38% |
| **Post-100 Synthetic Inferences** | 197.37 MB | 38.55% |
| **Available Headroom** | **314.63 MB** | **61.45%** |

### Latency Profile (200 Inferences)
- **Mean Latency**: 0.78 ms
- **Median (p50)**: 0.635 ms
- **95th Percentile (p95)**: 1.226 ms
- **Max Latency**: 4.028 ms

The resident memory footprint of 197.37 MB confirms a 314.63 MB (61.45%) safety cushion below the 512 MB container ceiling, eliminating risk of out-of-memory (OOM) process termination on Render's free tier.

---

## 3. Tier 2 Noise Caveat & Sri Lankan Priority Shielding

The Tier 2 knowledge base derived from CDC NAMCS outpatient survey data contains non-specific symptom co-occurrences. MediSync enforces strict architectural isolation:
1. **Sri Lankan Priority Disease Shield**: Priority tropical and communicable conditions (Dengue, Typhoid, Leptospirosis, Malaria, Cholera, Tuberculosis, Viral Hepatitis) are quarantined from Tier 2 ingestion and handled exclusively by Tier 1 curated profiles.
2. **Cardinal Symptom Guards**: Step-ladder fever requirement and non-fever penalty factor (0.55x) protect against enteric fever mispredictions.
3. **Emergency Red-Flag Parallel Screen**: Implemented in Phase 4 (`server/src/utils/emergencyAdvisory.js`), ensuring critical presentations trigger advisory alerts regardless of lexical similarity scores.
4. **Regulatory Invariant**: `clinicalValidation: not_established` remains strictly disclaimed across all API outputs and clinical screens.

---

## 4. Quality Gates & Ledger Status

- **Offline Test Runner**: 3,465 passed / 0 failed (207 test suites).
- **Protected Ledger**: 15 / 15 files locked with verified SHA-256 hashes (`docs/release/PROTECTED_HASHES.json`).
- **Client Production Build**: Exit code 0 (`npm --prefix client run build`).
- **Report Links Integrity**: 96 / 96 relative links valid (100% OK).
