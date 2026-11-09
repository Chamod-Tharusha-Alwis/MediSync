# Chapter 13: Appendices & Reference Ledgers

## Appendix A: Evidence Traceability Ledger (Claim -> File:Line or Command Output)
Every quantitative and technical assertion in this technical report traces directly to verified code files, automated test suites, or execution command outputs within the repository:

| Technical Claim / Invariant | Documented Value | Verifiable File:Line / Artifact | Verification Command / Output |
|---|---|---|---|
| **Tier 1 Algorithm** | TF-IDF + Cosine Similarity (not Random Forest) | `ml-engine/app.py:23-24, 308-319, 481-506` | Code inspection: `TfidfVectorizer(ngram_range=(1,2))`, `cosine_similarity()` |
| **Tier Switch Threshold** | Confidence $\ge 40.0\%$ (score $\ge 0.40$) | `ml-engine/app.py:553` | Code inspection: `candidates[0]['confidence'] >= 40.0` |
| **Typhoid Cardinal Rule** | Step-ladder fever check / $0.55\times$ penalty | `ml-engine/app.py:511-514` | Code inspection: `combined_score = combined_score * 0.55` if no fever/chills |
| **Outbreak Gate 1: Volume** | $N \ge 5$ distinct episodes in 7-day window | `server/src/services/surveillanceService.js:136, 185` | Code inspection: `if (N < 5) return 'CASE_FLOOR_NOT_MET'` |
| **Outbreak Baseline** | 56 calendar days prior to observation window | `server/src/services/surveillanceService.js:137, 148` | Code inspection: `baselineDays = 56` |
| **Outbreak Gate 2: Persistence** | $\ge 2$ consecutive calendar days with $z > 2.0$ | `server/src/services/surveillanceService.js:140, 236` | Code inspection: `maxConsecutive >= 2` |
| **Outbreak Gate 3: Deviation** | Strict $z > 2.0$ ($z_k = (c_k - \mu) / \sigma$) | `server/src/services/surveillanceService.js:139, 228` | Code inspection: `dailyZ[i] > 2.0 && dailyCounts[i] > 0` |
| **Outbreak Severity Tiers** | Watch $[2,3)$, Alert $[3,4)$, Critical $\ge 4$ | `server/src/services/surveillanceService.js:141, 242-252` | Code inspection: `maxZ >= 4.0 ? 'Critical' : maxZ >= 3.0 ? 'Alert' : 'Watch'` |
| **Tier 1 Accuracy** | 98.36% Top-1, 1.0000 Macro F1, 0.9997 ROC AUC | `docs/ml-evaluation/REPORT.md:13-15` | `python ml-engine/evaluation/generate_evaluation_charts.py` |
| **Data Leakage Safeguard** | 0 overlapping symptom strings | `docs/ml-evaluation/REPORT.md:16` | `python ml-engine/evaluation/generate_evaluation_charts.py` |
| **KB Raw Conditions** | 801 distinct conditions | `ml-engine/data/disease_symptom_kb.v1.json` | `python ml-engine/data_pipeline/ingest_disease_symptom_kb_v2.py` |
| **KB Edge Probability Cutoff**| $P \ge 15.0\%$ | `ingest_disease_symptom_kb_v2.py:28` | Code inspection: `PROB_THRESHOLD = 15.0` |
| **KB Min Surviving Symptoms** | 3 symptoms | `ingest_disease_symptom_kb_v2.py:29` | Code inspection: `MIN_SURVIVING_SYMPTOMS = 3` |
| **KB Dummy Cluster Filter** | Jaccard $\ge 0.70$ with fallback set | `ingest_disease_symptom_kb_v2.py:179` | Code inspection: `dummy_jaccard >= 0.70` |
| **KB Duplicate Profile Filter**| Jaccard $\ge 0.85$ on surviving symptoms | `ingest_disease_symptom_kb_v2.py:220` | Code inspection: `jaccard >= 0.85` |
| **KB Quarantined Count** | 136 conditions | `ml-engine/data/kb_quarantine.v1.json` | `quarantinedCount: 136` |
| **KB Active Filtered Count** | 665 conditions | `ml-engine/data/disease_symptom_kb.v1.json` | `activeFilteredConditions: 665` |
| **KB Mapped Auto-Accepted** | 174 conditions | `ml-engine/data/disease_symptom_kb.v1.json` | `mappedDiseasesCount: 174` |
| **KB Unmapped Review Count** | 491 conditions | `ml-engine/data/unmapped_diseases.v1.json` | `unmappedDiseasesCount: 491` |
| **ML Process RSS Boot** | 20.75 MB | `docs/report/data/ml_resource_measurements.json` | `python scripts/benchmark_ml_resources.py` |
| **ML Process RSS Post-Load** | 195.91 MB | `docs/report/data/ml_resource_measurements.json` | `python scripts/benchmark_ml_resources.py` |
| **ML Process RSS Peak** | 196.82 MB (38.44% of 512 MB ceiling) | `docs/report/data/ml_resource_measurements.json` | `python scripts/benchmark_ml_resources.py` |
| **ML Inference Latency** | Mean: 0.77 ms, p50: 0.64 ms, p95: 1.24 ms | `docs/report/data/ml_resource_measurements.json` | `python scripts/benchmark_ml_resources.py` |
| **Total Test Count** | 3,465 passed, 0 failed across 207 suites | Master test runner receipts | `node scripts/run_offline_tests.js` |
| **Protected File Ledger** | 15/15 files valid SHA-256 | `docs/release/PROTECTED_HASHES.json` | `node scripts/run_offline_tests.js` |
| **Frontend Production Build** | Exit code 0, 119 modules compiled | Client build output | `npm --prefix client run build` |
| **Documentation Links** | 95 relative links, 0 broken (100% OK) | `scripts/check_report_links.py` | `python scripts/check_report_links.py` |
| **Trilingual Key Parity** | 835 keys exact match (EN, SI, TA) | `client/src/i18n/translations/*.js` | Automated key counting script |
| **Production Backend URL** | `https://medisync-wabc.onrender.com` | `README.md:7`, `ARCHITECTURE.md:8` | Verified repository deployment configuration |
| **Demo Outbreak Batch** | `DEMO_OUTBREAK_2026_V1` | `scripts/remove_demo_batch.js:14` | Default batch flag in `--help` |
| **Protected Production Seed** | `SEED_2026_11_A` | `scripts/remove_demo_batch.js:15` | Explicitly protected constant in script |

---

## Appendix B: Protected File Hash Ledger (Release Invariants)
The table below quotes the exact SHA-256 digests validated during the Sub-Project 5 release gate:

| # | File Relative Path | Approved SHA-256 Digest | Status |
|---|---|---|:---:|
| 1 | `server/src/middleware/auth.js` | `92e99e0afded8de06b4d74abebe851b02c4f0c303a191530f39bee72f1256a88` | LOCKED |
| 2 | `server/src/controllers/doctorController.js` | `919129116095dc8301866fc0ea3d804e8bde645ec1de210deb2f1b2350d081c2` | LOCKED |
| 3 | `ml-engine/app.py` | `0500ddf7db3bb3bb5af945a44adacf5b1a920facdf37d32d665cca40caab1a37` | LOCKED |
| 4 | `ml-engine/evaluate_symptom_model.py` | `6999cf2984b341b7dfbf32939d8fc39d7d0743899d8321e7b73d9fa704e2d96d` | LOCKED |
| 5 | `client/src/components/SymptomTagInput.jsx` | `1a9fce8726f9cc8adfa501a2d3bf9664bfa6160c5dc78650d3f4b35ac2bbdc5d` | LOCKED |
| 6 | `server/tests/ir04BackendIntegration.test.js` | `e40d7c7bf993d3cd8ecc7bea7365740d7d824501c6f460b38e2962245a8ab9ae` | LOCKED |
| 7 | `server/tests/patientProfileOwnedIntegration.test.js` | `7335e2a5190d740d2ee7856fe26d2ba5edb7a204a4872d3fa081d52b345345c5` | LOCKED |
| 8 | `server/tests/prescriptionDurationOwnedIntegration.test.js` | `562ba59f307e2081214f40ff2d674fd3546c82f9828a53b8195796f2d637cbc6` | LOCKED |
| 9 | `server/tests/lab.test.js` | `227e2faf5424e53f836e5364fa592790d387206011e8264e72bb1cc88d19800c` | LOCKED |
| 10 | `server/tests/universityDemoSeedVerify.test.js` | `fc472f5707f96b2514d8ec50097da6a6eb7433ff427200f6d6649452ce463695` | LOCKED |
| 11 | `client/tests/ir04-isolated-five-role-e2e.spec.js` | `496dbcc2337f2cc48d15fc5af217181c948fdd6d4251f301057e2121c7d9d2ee` | LOCKED |
| 12 | `server/src/config/dbGuard.js` | `1b62d44cd4e11c269def41160333f3425279f2aa625f117aafbe2fc4bbb9c082` | LOCKED |
| 13 | `server/src/models/Consultation.js` | `3538ea856a26def834d30f9d463331012ee27132d7c1bc99504acdd3ceaa1e99` | LOCKED |
| 14 | `server/src/models/Patient.js` | `14b60b7c198df9f9ba561e77bcfadec275243a3ad5b46ba499315e462997481d` | LOCKED |
| 15 | `server/src/utils/versionedEncryption.js` | `5dd15b2e05c12490c401185251a0a78c82c8184ead6a822fffb8fce3b8772bfd` | LOCKED |

---

## Appendix C: Publication Figures & Architectural Diagrams Catalog

### Publication Figures (Generated via `generate_report_figures.py`)
- **Figure F01**: Tier 1 Held-Out Confusion Matrix (`docs/report/figures/f01_tier1_confusion_matrix.png`)
- **Figure F02**: Tier 1 ROC and Precision-Recall Curves (`docs/report/figures/f02_roc_pr_curves.png`)
- **Figure F03**: KB Edge-Probability Distribution Histogram (`docs/report/figures/f03_kb_probability_histogram.png`)
- **Figure F04**: KB Curation Funnel (801 Parsed $\to$ 174 Mapped Active) (`docs/report/figures/f04_kb_curation_funnel.png`)
- **Figure F05**: Knowledge Base Quarantine Reasons Distribution (`docs/report/figures/f05_quarantine_reasons.png`)
- **Figure F06**: ICD-10-CM Catalog Chapter Distribution (`docs/report/figures/f06_icd_chapter_composition.png`)
- **Figure F07**: Diagnostic Coverage Across Specialties (`docs/report/figures/f07_coverage_specialties.png`)
- **Figure F08**: Tiered Matcher Accuracy (Top-1, Top-3, Top-5) (`docs/report/figures/f08_tiered_matcher_accuracy.png`)
- **Figure F09**: Measured OS Process Memory (RSS) & Latency (`docs/report/figures/f09_ml_resource_measurements.png`)
- **Figure F10**: Outbreak Detection Scenarios & Gate Calibration (`docs/report/figures/f10_outbreak_detector_benchmark.png`)
- **Figure F11**: Cross-Chapter 12-Disease Surveillance Verification (`docs/report/figures/f11_surveillance_12_diseases.png`)
- **Figure F12**: 14-Day Statistical Projection Trajectories (`docs/report/figures/f12_statistical_projection_bands.png`)
- **Figure F13**: Automated Verification Test Pyramid (`docs/report/figures/f13_verification_test_pyramid.png`)
- **Figure F14**: Trilingual Interface Key Parity (835 keys in EN/SI/TA) (`docs/report/figures/f14_trilingual_key_parity.png`)

### Architectural Diagrams (Authored in Mermaid format)
- **Diagram D01**: System Architecture (`docs/report/diagrams/d01_system_architecture.mmd`)
- **Diagram D02**: Cloud Deployment Topology (`docs/report/diagrams/d02_deployment_infrastructure.mmd`)
- **Diagram D03**: Consultation to Dispensing Sequence (`docs/report/diagrams/d03_consultation_prescription_dispensing.mmd`)
- **Diagram D04**: QR Verification & NIC Gate Sequence (`docs/report/diagrams/d04_qr_verification_nic_gate.mmd`) 
- **Diagram D05**: Outbreak Detection Pipeline Flow (`docs/report/diagrams/d05_outbreak_detection_pipeline.mmd`)
- **Diagram D06**: Dual-Tier ML Triage Flow (`docs/report/diagrams/d06_tiered_matcher_flow.mmd`)
- **Diagram D07**: Authentication & Session Flow (`docs/report/diagrams/d07_auth_otp_session_flow.mmd`)
- **Diagram D08**: Medicine Safety Decision Logic (`docs/report/diagrams/d08_medicine_safety_decision_flow.mmd`)
- **Diagram D09**: Entity-Relationship Schema Model (`docs/report/diagrams/d09_entity_relationship_diagram.mmd`)

---

## Appendix D: Owner Placeholders for Final Academic Submission
The following items are reserved for institutional customization by the student owner:
- `[OWNER: Insert University Logo, Faculty Name, and Department Details]`
- `[OWNER: Insert Student Registration Number, Index Number, and Supervisor Names]`
- `[OWNER: Insert Official Ministry of Health Annual Health Bulletin Citations]`
- `[OWNER: Insert High-Resolution Screenshots of Live UI Views from SCREENSHOT_CHECKLIST.md]`
- `[OWNER: Locate BNF Section Citations in docs/report/MEDICINE_LIMITS_VERIFICATION.md]`
