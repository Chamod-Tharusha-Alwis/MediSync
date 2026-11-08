# MediSync Sub-Project 4: Final Acceptance Matrix

This document maps all architectural, clinical, and data requirements across Phases D0 through D5 to exact, verifiable test commands and offline outcomes executed during this engineering cycle.

## 1. Traceability & Acceptance Matrix

| Requirement ID | Phase | Feature / Component | Verification Command | Offline Pass Status | Evidence / Notes |
|---|:---:|---|---|:---:|---|
| **REQ-D0-1** | D0 | Fail-Closed TEST_OTP Policy | `npm --prefix server test tests/testOtpRemovalOffline.test.js` | PASS (6/6) | Fails closed on production boot; bypasses rejected |
| **REQ-D0-2** | D0 | Script CLI Help Contracts | `node scripts/seed-dispensing-sample.js --help; node scripts/remove_demo_batch.js --help` | PASS (Exit 0) | Exact usage parameters printed; no unconfirmed mutation |
| **REQ-D0-3** | D0 | Census 2024 Population Sourcing | `npm --prefix server test tests/phase5PopulationIncidence.test.js` | PASS (8/8) | All 25 districts set to `null` (`pending_owner_data`); UI renders safe notice |
| **REQ-D0-4** | D0 | Forecasting Suppression | `node scripts/run_offline_tests.js` | PASS | Forecast suppressed under `clinicalValidation: not_established` |
| **REQ-D0-5** | D0 | Protected Hash Ledger | `node scripts/run_offline_tests.js` | PASS (15/15) | SHA-256 ledger quotes exact file digests with documented reasons |
| **REQ-D1-1** | D1 | ICD-10 Catalog Audit | `npm --prefix server test tests/phaseD1CoverageOffline.test.js` | PASS (4/4) | 71,704 validated leaf concepts; 41 curated profiles documented |
| **REQ-D1-2** | D1 | Admin UI Honest Labeling | `npm --prefix client test src/__master_offline__/admin-ml-status.test.jsx` | PASS (8/8) | "Symptom reference profiles: 41 of 71,704 conditions; any ICD code can be selected manually" |
| **REQ-D1-3** | D1 | Trilingual Coverage Parity | `npm --prefix client test src/__master_offline__/translations.test.js` | PASS | 811 keys across EN, SI, TA with zero mismatches |
| **REQ-D2-1** | D2 | Sourced Knowledge Base Schema | `pytest ml-engine/test_disease_symptom_kb.py` | PASS (6/6) | Versioned JSON schema, non-empty symptoms, valid ICD syntax |
| **REQ-D2-2** | D2 | Offline KB Ingestion Gate | `npm --prefix server test tests/phaseD2DiseaseSymptomKbOffline.test.js` | PASS (6/6) | JSON loading, schema compliance, and unmapped separation verified |
| **REQ-D2b-1** | D2b | Empirical Probability Preservation | `pytest ml-engine/test_disease_symptom_kb.py` | PASS | Every symptom edge contains `{ name, probability }` |
| **REQ-D2b-2** | D2b | Edge Quality Filtering | `python ml-engine/data_pipeline/ingest_disease_symptom_kb.py` | PASS | Probability threshold $P \ge 15.0\%$ removes noise; min 3 symptoms |
| **REQ-D2b-3** | D2b | Quarantine Isolation | `pytest ml-engine/test_disease_symptom_kb.py` | PASS | 136 noisy/dummy cluster conditions isolated in `kb_quarantine.v1.json` |
| **REQ-D2b-4** | D2b | SL Priority Disease Protection | `pytest ml-engine/test_disease_symptom_kb.py` | PASS | Dengue, Malaria, Typhoid, Leptospirosis protected from KB contamination |
| **REQ-D3-1** | D3 | Tiered Retrieval Architecture | `pytest ml-engine/test_tiered_matcher.py` | PASS (7/7) | Tier 1 curated wins at $\ge 40\%$; Tier 2 queries probability-weighted TF-IDF |
| **REQ-D3-2** | D3 | ML RSS Memory Budget | `pytest ml-engine/test_tiered_matcher.py` | PASS | Peak inference memory ~0.22 MB RSS (well within 512 MB Render Free limit) |
| **REQ-D3-3** | D3 | Cardinal Symptom Guards | `pytest ml-engine/test_tiered_matcher.py` | PASS | Typhoid requires step-ladder fever; pure pain discounts enteric fever |
| **REQ-D3-4** | D3 | Negative & Degraded Cases | `pytest ml-engine/test_tiered_matcher.py` | PASS | Pure pain query doesn't suggest Typhoid; empty query returns 200 without crash |
| **REQ-D3-5** | D3 | Protected Pin Update | `node scripts/run_offline_tests.js` | PASS (15/15) | `ml-engine/app.py` SHA-256 updated and accounted for |
| **REQ-D4-1** | D4 | Non-Profiled Doctor Consultation | `npm --prefix server test tests/phaseD4NonProfiledConsultationOffline.test.js` | PASS (3/3) | Any of 71,704 ICD codes selectable; consultation saved successfully |
| **REQ-D4-2** | D4 | Doctor UI Coverage Badge | `npm --prefix client test src/__master_offline__/d4-any-disease-coverage.test.jsx` | PASS (1/1) | Badge rendered: "41 reference symptom profiles curated; 71,704 ICD-10 conditions available for manual diagnosis." |
| **REQ-D4-3** | D4 | Patient History ICD Display | `npm --prefix client test src/__master_offline__/d4-any-disease-coverage.test.jsx` | PASS | ICD code badge rendered in consultation timeline header |
| **REQ-D4-4** | D4 | PDF Generation Security Hold | `npm --prefix server test tests/phaseD4NonProfiledConsultationOffline.test.js` | PASS | Produces `%PDF-` buffer when enabled; returns typed `SECURITY_HOLD` when disabled |
| **REQ-D4-5** | D4 | Trilingual Parity (813 keys) | `npm --prefix client test src/__master_offline__/translations.test.js` | PASS | Exact 813 keys across EN, SI, TA |
| **REQ-D5-1** | D5 | Dynamic Surveillance Engine | `npm --prefix server test tests/phaseD5GenericSurveillanceOffline.test.js` | PASS (3/3) | Dynamic grouping by `(entity, diseaseId)`; no hardcoded disease whitelists |
| **REQ-D5-2** | D5 | Multi-Chapter Surveillance | `npm --prefix server test tests/phaseD5GenericSurveillanceOffline.test.js` | PASS | 12 diseases across infectious, chronic, endocrine chapters trigger on valid spikes |
| **REQ-D5-3** | D5 | Statistical Detector Gates | `npm --prefix server test tests/surveillanceOutbreakDetector.test.js` | PASS (15/15) | Gate 1 ($N \ge 5$), Gate 2 (2 consecutive days), Gate 3 ($z > 2.0$) enforced |

---

## 2. Quality Gate Summary

- **Master Offline Gate**: `node scripts/run_offline_tests.js`
  - Total tests passed: **3,465**
  - Total tests failed: **0**
  - Suites executed: **207**
- **Client Production Build**: `npm --prefix client run build`
  - Exit code: **0**
  - Gzip bundle size: **214.59 kB**
- **Protected File Ledger**: `docs/release/PROTECTED_HASHES.json`
  - Accounts for: **15/15 files valid**
