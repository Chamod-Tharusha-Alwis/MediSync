# MediSync: Master Deliverables & Documentation Index

**Repository Branch**: `feat/sub5-submission-pack`  
**Submission Deadline**: 20 November 2026  
**Baseline Quality Gate**: 3,768 Tests Passed / 0 Failed | 15/15 Protected Ledger Pins Locked  

This directory serves as the unified submission and defense kit for the MediSync undergraduate software engineering capstone. Every document, figure, dataset, and architectural diagram is indexed below with its relative path and purpose.

---

## 1. Primary Academic & Submission Deliverables

| Deliverable Document | Relative Path | Purpose & Target Audience |
|---|---|---|
| **Executive Project Overview** | [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md) | Plain-language guide explaining MediSync for all 6 user roles, workflows, and clinical data flows. |
| **Comprehensive Technical Report** | [`TECHNICAL_REPORT.md`](./TECHNICAL_REPORT.md) | Complete 83 KB academic thesis / capstone technical report (14 consolidated chapters with evidence ledger). |
| **Report Chapters (Modular Source)** | [`chapters/`](./chapters/) | Individual chapter sources: [Abstract](./chapters/00_abstract.md), [Introduction](./chapters/01_introduction.md), [Objectives](./chapters/02_objectives_scope.md), [Requirements](./chapters/03_requirements.md), [Architecture](./chapters/04_architecture.md), [Implementation](./chapters/05_implementation.md), [Machine Learning](./chapters/06_machine_learning.md), [Security](./chapters/07_security_privacy.md), [Testing](./chapters/08_testing_verification.md), [Deployment](./chapters/09_deployment_operations.md), [Results](./chapters/10_results.md), [Limitations](./chapters/11_limitations_future_work.md), [Conclusion](./chapters/12_conclusion.md), [Appendices](./chapters/13_appendices.md). |
| **Document Export Guide** | [`export/CONVERSION_GUIDE.md`](./export/CONVERSION_GUIDE.md) | Step-by-step instructions for converting the technical report to Word (DOCX) and PDF using VS Code, Pandoc, or Word. |

---

## 2. Examination, Demo & Viva Voce Kit

| Deliverable Document | Relative Path | Purpose & Target Audience |
|---|---|---|
| **Viva Voce Defense Guide** | [`VIVA_QA.md`](./VIVA_QA.md) | 32 authoritative examiner questions and evidence-based answers covering clinical validity, ML tiers, security, and trade-offs. |
| **Live Demonstration Script** | [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md) | 12-minute structured walkthrough across all 6 roles, pre-flight cloud warming commands, and offline contingency fallbacks. |
| **Presentation Slides Outline** | [`SLIDES_OUTLINE.md`](./SLIDES_OUTLINE.md) | 19 slide outlines with visual suggestions, bullet points, and verbatim speaker notes for the oral defense. |
| **UI Screenshot Checklist** | [`SCREENSHOT_CHECKLIST.md`](./SCREENSHOT_CHECKLIST.md) | 25 prioritized UI screen captures across desktop and mobile viewports for slides and report figures. |

---

## 3. Engineering Specifications & Technical Audits

| Deliverable Document | Relative Path | Purpose & Target Audience |
|---|---|---|
| **Feature Existence Matrix** | [`FEATURE_EXISTENCE_MATRIX.md`](./FEATURE_EXISTENCE_MATRIX.md) | Comprehensive docs-vs-code reconciliation matrix auditing all 16 claimed features against routes, controllers, and tests. |
| **System Architecture Guide** | [`PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md) | Annotated directory tree covering all 67 repository directories with a single-line architectural purpose. |
| **REST API Reference** | [`API_REFERENCE.md`](./API_REFERENCE.md) | Comprehensive reference for all 191 endpoints (187 Express + 4 ML Engine) with RBAC guards and rate limits. |
| **Data Model & Cryptography Schema**| [`DATA_MODEL.md`](./DATA_MODEL.md) | Complete specification of all 29 Mongoose schemas, AES-256-GCM field encryption, blind indexes, and TTLs. |
| **Tracked File Guide** | [`FILE_GUIDE.md`](./FILE_GUIDE.md) | Complete guide covering all 1,129 tracked files (3.43M LOC) with component classification and protected ledger pins. |
| **Project Quality & Security Scan** | [`QUALITY_SCAN.md`](./QUALITY_SCAN.md) | 1,129-file deterministic inventory, npm audit, secret scan (219 audited hits, 0 leaks), licenses, and TODO catalog. |
| **Claims & Truthfulness Audit** | [`CLAIMS_AUDIT.md`](./CLAIMS_AUDIT.md) | Systematic audit correcting historical documentation claims (memory RSS, census data, forecasting labels). |
| **Medicine Limits Verification** | [`MEDICINE_LIMITS_VERIFICATION.md`](./MEDICINE_LIMITS_VERIFICATION.md) | BNF 86 and WHO guideline audit for all therapeutic dosage ceilings and drug-drug interactions. |
| **Synonyms & Licensing Audit** | [`SYNONYMS_LICENSING_AUDIT.md`](./SYNONYMS_LICENSING_AUDIT.md) | Audit verifying all 32 clinical synonyms map to US public domain CMS/CDC ICD-10-CM 2024 Alphabetic Index. |
| **ML Methodology & Protocol** | [`ML_METHODOLOGY.md`](./ML_METHODOLOGY.md) | Detailed documentation of training provenance, sparse knowledge-base ingestion, and tiered matching protocols. |
| **ML Design Parameters Ledger** | [`ML_DESIGN_PARAMETERS.md`](./ML_DESIGN_PARAMETERS.md) | Formal inventory of all 11 hand-set heuristics with explicit design choice vs. clinical review classification. |

---

## 4. Architectural Diagrams (Mermaid Format in [`diagrams/`](./diagrams/))

- **D01**: [System Architecture](./diagrams/d01_system_architecture.mmd)
- **D02**: [Cloud Deployment Infrastructure](./diagrams/d02_deployment_infrastructure.mmd)
- **D03**: [Consultation to Dispensing Sequence](./diagrams/d03_consultation_prescription_dispensing.mmd)
- **D04**: [QR Verification & NIC Identity Gate](./diagrams/d04_qr_verification_nic_gate.mmd)
- **D05**: [Outbreak Detection Pipeline](./diagrams/d05_outbreak_detection_pipeline.mmd)
- **D06**: [Dual-Tier ML Matcher Flow](./diagrams/d06_tiered_matcher_flow.mmd)
- **D07**: [Authentication & Session Flow](./diagrams/d07_auth_otp_session_flow.mmd)
- **D08**: [Medicine Safety Decision Flow](./diagrams/d08_medicine_safety_decision_flow.mmd)
- **D09**: [Entity-Relationship Schema Diagram](./diagrams/d09_entity_relationship_diagram.mmd)

---

## 5. Publication Figures (Deterministic PNGs in [`figures/`](./figures/))

- **Figure Catalog**: [`figures/FIGURES.md`](./figures/FIGURES.md) (provenance, generation scripts, and limitations)
- **F01**: [Tier 1 Confusion Matrix](./figures/f01_tier1_confusion_matrix.png)
- **F02**: [Tier 1 ROC & PR Curves](./figures/f02_roc_pr_curves.png)
- **F03**: [KB Edge Probability Histogram](./figures/f03_kb_probability_histogram.png)
- **F04**: [KB Curation Funnel](./figures/f04_kb_curation_funnel.png)
- **F05**: [KB Quarantine Reasons](./figures/f05_quarantine_reasons.png)
- **F06**: [ICD-10-CM Catalog Composition](./figures/f06_icd_chapter_composition.png)
- **F07**: [Diagnostic Coverage by Chapter](./figures/f07_coverage_specialties.png)
- **F08**: [Tiered Matcher Accuracy (Top-1, Top-3, Top-5)](./figures/f08_tiered_matcher_accuracy.png)
- **F09**: [Measured OS Process Memory (RSS) & Latency](./figures/f09_ml_resource_measurements.png)
- **F10**: [Outbreak Detection Scenarios S1–S8](./figures/f10_outbreak_detector_benchmark.png)
- **F11**: [12-Disease Surveillance Matrix](./figures/f11_surveillance_12_diseases.png)
- **F12**: [14-Day Statistical Projections](./figures/f12_statistical_projection_bands.png)
- **F13**: [Automated Verification Test Pyramid](./figures/f13_verification_test_pyramid.png)
- **F14**: [Trilingual Key Parity (EN/SI/TA)](./figures/f14_trilingual_key_parity.png)

---

## 6. Machine-Readable Datasets & Measurements (in [`data/`](./data/))

- [`data/ml_resource_measurements.json`](./data/ml_resource_measurements.json): Real OS process RSS memory (196.82 MB peak) and inference latency measurements across 200 iterations.
- [`data/sanity_symptom_results.json`](./data/sanity_symptom_results.json): Verification outputs for 15 standardized clinical symptom query cases (`SC-01` through `SC-15`).
- [`data/project_inventory.json`](./data/project_inventory.json): Complete deterministic scan of all 1,129 repository files, LOC counts, and component groupings.

---

## 7. Execution Logs & Progress Trackers

- [`PROGRESS_SUB5.md`](./PROGRESS_SUB5.md): Phase-by-phase execution tracking, task commitments, and gate results.
- [`DECISIONS_SUB5.md`](./DECISIONS_SUB5.md): Autonomous engineering and architectural decisions ledger.
- `MORNING_REPORT.md`: Final morning handover report and prioritized owner checklist (Phase S8).
