# Sub-Project 5: Progress Tracker

**Branch**: `feat/sub5-submission-pack` (branched from `main` @ `7ba2840`)  
**Baseline Quality Gate**: 3,465 passed / 0 failed (207 suites), Client build exit code 0, 15/15 protected files valid.

| Phase | Description | Status | Commits | Tests (Pass/Fail) | Gate | Protected Pins |
|---|---|:---:|---|:---:|:---:|:---:|
| **S0** | Preflight (Env setup, branch, baseline gate) | DONE | `1be83ec` | 3,465 / 0 | PASS | 15/15 |
| **S1** | Truth & Safety Corrections (RSS, Heuristics, Limits, Synonyms, Claims, Owner Checklist) | DONE | `b47cf2b` | 3,465 / 0 | PASS | 15/15 |
| **S2** | Project Inventory & Quality Scan (Deterministic scan, security, license, coverage) | DONE | `d2b7082` | 3,465 / 0 | PASS | 15/15 |
| **S3** | System Structure, File Guide, API Reference & Data Model | DONE | `pending` | 3,465 / 0 | PASS | 15/15 |
| **S4** | ML Evaluation Figures (F01–F14) & System Diagrams | IN PROGRESS | - | - | - | - |
| **S5** | Technical Report (Chapters 1–12, Full Document, Project Overview) | NOT STARTED | - | - | - | - |
| **S6** | Demo & Viva Kit (Script, Viva QA, Screenshots checklist, Slides outline) | NOT STARTED | - | - | - | - |
| **S7** | Final Verification & Link Integrity Check | NOT STARTED | - | - | - | - |
| **S8** | Morning Report & Delivery Package | NOT STARTED | - | - | - | - |

---

## Task Details

### Phase S0
- Branch `feat/sub5-submission-pack` initialized at commit `7ba2840`.
- Runtime verified: Node.js v26.4.0, Python 3.14.6 in `.venv`, npm 11.17.0.
- `psutil` 7.2.2 installed in local `.venv` for true OS process memory measurement.
- Baseline gate verified: 3,465 passed / 0 failed across 207 test suites.

### Phase S1
- **ML Process Memory & Latency (1.1)**:
  - Replaced misleading heap-only claim with real OS process RSS via `psutil`: start = 20.75 MB, post-load = 195.91 MB, post-100 predictions = 196.82 MB (38.44% of Render Free 512 MB ceiling).
  - Benchmarked inference latency across 200 predictions: mean = 0.77 ms, p50 = 0.64 ms, p95 = 1.24 ms.
  - Saved in `docs/report/data/ml_resource_measurements.json` via `scripts/benchmark_ml_resources.py`.
  - Corrected all occurrences across `ARCHITECTURE.md`, `FINAL_REPORT.md`, `FINAL_ACCEPTANCE_MATRIX.md`, `PROGRESS.md`.
- **Heuristics & Design Parameters Inventory (1.2)**:
  - Documented all 11 hand-set thresholds, parameters, and rules in `docs/report/ML_DESIGN_PARAMETERS.md` with explicit non-clinical design choice caveats.
  - Executed 15 independent sanity test combinations (`SC-01` through `SC-15`) verifying HTTP 200, valid shape, `clinicalValidation: not_established`, and no false emergency triggers via `scripts/verify_sanity_symptom_cases.py`.
- **Medicine Safety Limits Verification (1.3)**:
  - Updated both `server/src/data/medicine_safety_limits.json` and `ml-engine/data/medicine_safety_limits.json`: set `citationStatus` and `status` to `"unverified_owner_must_check"`.
  - Created `docs/report/MEDICINE_LIMITS_VERIFICATION.md` listing exact BNF 86 and WHO 2008 section/page numbers for owner verification.
- **UMLS & Public Domain Synonyms Audit (1.4)**:
  - Audited all 32 synonyms in `build_icd10_synonyms.py`: verified that each maps to the public domain CMS/CDC ICD-10-CM 2024 Alphabetic Index (17 U.S.C. § 105).
  - Re-generated `icd10_synonyms.v1.json` with public source citations and UMLS cross-references.
  - Rebuilt KB artifacts via `ingest_disease_symptom_kb_v2.py` (174 auto-accepted, 136 quarantined, 491 unmapped); all 6 KB unit tests passed.
  - Created `docs/report/SYNONYMS_LICENSING_AUDIT.md`.
- **Claims Audit (1.5)**:
  - Audited documentation for forecasting metrics, census claims, formulary certainty, UMLS licensing, test counts, key parity, protected pins, and live URLs.
  - Updated `docs/new/sub3/PHASE_STATUS.md` with current gate numbers and `ml-engine/app.py` hash.
  - Created `docs/report/CLAIMS_AUDIT.md`.
- **Master Owner Checklist (1.6)**:
  - Merged sub1–sub4 owner runbooks into `docs/OWNER_CHECKLIST_FINAL.md` with exact verified CLI flags from scripts `--help`.
  - Marked older owner docs as superseded with direct references.
- **Quality Gate**:
  - `run_offline_tests.js`: 3,465 passed / 0 failed (207 suites), 15/15 protected files valid.
  - `client run build`: exit code 0.

### Phase S2
- **Deterministic Inventory (`scripts/generate_project_inventory.js`)**:
  - Scanned all 1,129 tracked files (204.90 MB, 3,439,304 LOC across 6 components).
  - Saved full dataset in `docs/report/data/project_inventory.json`.
- **Quality & Security Scan Report (`docs/report/QUALITY_SCAN.md`)**:
  - Top 30 largest tracked files tabulated (SQLite DB, interaction JSONs, SymCAT CSV).
  - `npm audit` recorded: root 0, server 22 (2 high in joi/follow-redirects), client 36 (legacy react-scripts toolchain).
  - Secret scan: 219 findings audited (186 test fixtures, 33 doc/template placeholders; 0 live leaked secrets).
  - TODO/FIXME inventory: 123 items cataloged.
  - Dependency licensing: 100% permissive (MIT/Apache/ISC/BSD); public domain US government data for ICD and CDC survey data.

### Phase S3
- **Annotated Project Structure (docs/report/PROJECT_STRUCTURE.md)**:
  - Complete hierarchical tree across all 67 tracked directories with single-line purpose per folder.
- **Data Model & Cryptographic Schema (docs/report/DATA_MODEL.md)**:
  - Complete specification of all 29 Mongoose models across core clinical, facility, surveillance, and operations collections.
  - Documented AES-256-GCM field encryption, key ring rotation (keyVersion), blind indices (_bi), and TTL indexes (OTPSession 300s, RecoveryToken 900s, VerificationToken 90d, ClinicalCommand 24h).
- **REST API Reference (docs/report/API_REFERENCE.md)**:
  - Comprehensive reference for all 191 endpoints (187 Express + 4 ML Engine) across 12 functional domains with authentication guards, rate limits, and feature gates.
- **Complete File Guide (docs/report/FILE_GUIDE.md)**:
  - Generated via scripts/build_file_guide.py: covers all 1,129 tracked files with LOC, role, purpose, and all 15 SHA-256 protected ledger pins highlighted. Historical receipts compacted.
