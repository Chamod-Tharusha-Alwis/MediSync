# Chapter 13: Appendices & Reference Ledgers

## Appendix A: Evidence Traceability Ledger
Every quantitative assertion in this technical report traces directly to verified code files, automated test suites, or execution scripts within the repository:

| Claimed Metric / Characteristic | Verifiable Repository Source | Verification Command / Script |
|---|---|---|
| **3,465 Tests Passed / 0 Failed** | 207 Test Suites in `server/tests/`, `client/tests/`, `ml-engine/tests/` | `node scripts/run_offline_tests.js` |
| **ML Process RSS: 196.82 MB Peak** | `docs/report/data/ml_resource_measurements.json` | `python scripts/benchmark_ml_resources.py` |
| **ML Inference Latency: 0.77 ms Mean** | `docs/report/data/ml_resource_measurements.json` | `python scripts/benchmark_ml_resources.py` |
| **Project Inventory: 1,129 Files / 3.43M LOC**| `docs/report/data/project_inventory.json` | `node scripts/generate_project_inventory.js` |
| **191 REST Endpoints Documented** | `docs/report/API_REFERENCE.md` | `python scripts/extract_routes.py` |
| **29 Mongoose Schemas** | `docs/report/DATA_MODEL.md` | `server/src/models/*.js` |
| **14 Publication Figures (F01–F14)** | `docs/report/figures/*.png` | `python ml-engine/evaluation/generate_report_figures.py` |
| **9 Formal Mermaid Diagrams (D01–D09)**| `docs/report/diagrams/*.mmd` | Visualized in Mermaid CLI / Live |
| **15-File Protected Ledger (15/15 Valid)**| `docs/release/PROTECTED_HASHES.json` | `node scripts/run_offline_tests.js` |

---

## Appendix B: Protected File Hash Ledger (Release Invariants)
The table below quotes the exact SHA-256 digests validated during the Sub-Project 5 preflight and release gate:

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
- **Figure F01**: Tier 1 Held-Out Confusion Matrix & Per-Class Metrics (`docs/report/figures/f01_confusion_matrix.png`)
- **Figure F02**: Tier 1 ROC and Precision-Recall Curves (`docs/report/figures/f02_roc_pr_curves.png`)
- **Figure F03**: KB Edge-Probability Distribution Histogram & Cutoff (`docs/report/figures/f03_kb_edge_probabilities.png`)
- **Figure F04**: KB Curation Funnel (801 Parsed $\to$ 174 Mapped Active) (`docs/report/figures/f04_kb_ingestion_funnel.png`)
- **Figure F05**: Knowledge Base Quarantine Reasons Distribution (`docs/report/figures/f05_quarantine_reasons.png`)
- **Figure F06**: ICD-10-CM Catalog Chapter Distribution (`docs/report/figures/f06_icd_catalog_composition.png`)
- **Figure F07**: Diagnostic Coverage by Clinical Chapter (`docs/report/figures/f07_diagnostic_coverage.png`)
- **Figure F08**: Tiered Matcher Self-Consistency (Top-1, Top-3, Top-5) (`docs/report/figures/f08_tiered_matcher_accuracy.png`)
- **Figure F09**: Measured OS Process Memory (RSS) & Latency (`docs/report/figures/f09_ml_resource_footprint.png`)
- **Figure F10**: Outbreak Detection Scenarios & Gate Suppression (`docs/report/figures/f10_outbreak_scenarios.png`)
- **Figure F11**: 12-Disease Surveillance Benchmark Matrix (`docs/report/figures/f11_disease_surveillance_matrix.png`)
- **Figure F12**: 14-Day Statistical Projection Trajectories (`docs/report/figures/f12_statistical_projections.png`)
- **Figure F13**: Automated Verification Test Pyramid (`docs/report/figures/f13_test_pyramid.png`)
- **Figure F14**: Trilingual Interface Key Parity (EN/SI/TA) (`docs/report/figures/f14_trilingual_parity.png`)

### Architectural Diagrams (Authored in Mermaid format)
- **Diagram D01**: System Architecture (`docs/report/diagrams/d01_system_architecture.mmd`)
- **Diagram D02**: Cloud Deployment Topology (`docs/report/diagrams/d02_deployment_infrastructure.mmd`)
- **Diagram D03**: Consultation to Dispensing Sequence (`docs/report/diagrams/d03_consultation_prescription_dispensing.mmd`)
- **Diagram D04**: QR Verification & NIC Gate Sequence (`docs/report/diagrams/d04_qr_verification_nic_gate.mmd`)
- **Diagram D05**: Outbreak Detection Pipeline Flow (`docs/report/diagrams/d05_outbreak_detection_pipeline.mmd`)
- **Diagram D06**: Dual-Tier ML Triage Flow (`docs/report/diagrams/d06_tiered_matcher_flow.mmd`)
- **Diagram D07**: Authentication & Session Flow (`docs/report/diagrams/d07_authentication_flow.mmd`)
- **Diagram D08**: Medicine Safety Decision Logic (`docs/report/diagrams/d08_medicine_safety_flow.mmd`)
- **Diagram D09**: Entity-Relationship Schema Model (`docs/report/diagrams/d09_entity_relationship_diagram.mmd`)

---

## Appendix D: Owner Placeholders for Final Academic Submission
The following items are reserved for institutional customization by the student owner:
- `[OWNER: Insert University Logo, Faculty Name, and Department Details]`
- `[OWNER: Insert Student Registration Number, Index Number, and Supervisor Names]`
- `[OWNER: Insert Official Ministry of Health Annual Health Bulletin 2023 / 2024 Citations]`
- `[OWNER: Insert High-Resolution Screenshots of Live UI Views from SCREENSHOT_CHECKLIST.md]`
- `[OWNER: Verify BNF 86 Section Citations in docs/report/MEDICINE_LIMITS_VERIFICATION.md]`
