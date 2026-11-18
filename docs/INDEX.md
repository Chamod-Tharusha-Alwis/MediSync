# Documentation index

Start here. This index covers every documentation folder at commit `f5337833` plus the clean-up branch.
"Current" documents were checked against the code on 2026-11-18. "History" documents are dated working
records: their counts and URLs describe the day they were written.

## Current: start here

| Document | What it is for |
|---|---|
| [`../README.md`](../README.md) | What MediSync is, live links, architecture, how to run, roles, outbreak system, limitations |
| [`PROJECT_STRUCTURE.md`](PROJECT_STRUCTURE.md) | Folder tree with file counts |
| [`FILE_GUIDE.md`](FILE_GUIDE.md) | Key files and what they contain (protected files marked) |
| [`LOCAL_DEVELOPMENT_QUICKSTART.md`](LOCAL_DEVELOPMENT_QUICKSTART.md) | Verified local commands: offline gate, mock UI, full local stack |
| [`ENVIRONMENT.md`](ENVIRONMENT.md) | Every environment variable name (names only) |
| [`RELEASE_ENV_CONTRACT.md`](RELEASE_ENV_CONTRACT.md) | Production environment checks per variable (Render/Vercel) |
| [`OUTBREAK_DETECTION.md`](OUTBREAK_DETECTION.md) | Detector rule, 72-hour projection, approval, email kill switch and allowlist, with code line references |
| [`DATASETS.md`](DATASETS.md) | Every dataset: source, licence, derivation, redistribution |
| [`TEMP_TEST_HARNESS.md`](TEMP_TEST_HARNESS.md) | Test OTP harness notes (read by a test) |
| [`PROJECT_AUDIT.md`](PROJECT_AUDIT.md) | Full project audit of 28 Oct, with corrections noted at the top |

## Report and viva (`report/`)

| Document | What it is for |
|---|---|
| [`report/INDEX.md`](report/INDEX.md) | Index of the submission pack |
| [`report/TECHNICAL_REPORT.md`](report/TECHNICAL_REPORT.md), [`report/chapters/`](report/chapters/) | Report text (14 chapters) |
| [`report/PROJECT_OVERVIEW.md`](report/PROJECT_OVERVIEW.md) | Plain-language overview |
| [`report/VIVA_QA.md`](report/VIVA_QA.md), [`report/DEMO_SCRIPT.md`](report/DEMO_SCRIPT.md), [`report/SLIDES_OUTLINE.md`](report/SLIDES_OUTLINE.md), [`report/SCREENSHOT_CHECKLIST.md`](report/SCREENSHOT_CHECKLIST.md) | Viva and demo preparation |
| [`report/OUTBREAK_DETECTION.md`](report/OUTBREAK_DETECTION.md) | Scalability benchmark and ICD coverage proof for the detector |
| [`report/study/RESULTS.md`](report/study/RESULTS.md), [`report/study/PROTOCOL.md`](report/study/PROTOCOL.md), [`report/study/MODEL_CARDS.md`](report/study/MODEL_CARDS.md), [`report/study/DATA_SHEET.md`](report/study/DATA_SHEET.md) | Offline data-science study (forecast benchmark, detector sweep, symptom study) |
| [`report/AI_EVALUATION.md`](report/AI_EVALUATION.md), [`report/VALIDATION_LIMITS.md`](report/VALIDATION_LIMITS.md), [`report/ML_EVALUATION.md`](report/ML_EVALUATION.md), [`report/ML_METHODOLOGY.md`](report/ML_METHODOLOGY.md), [`report/ML_DESIGN_PARAMETERS.md`](report/ML_DESIGN_PARAMETERS.md), [`report/ML_ENGINE_INVENTORY.md`](report/ML_ENGINE_INVENTORY.md), [`report/alert72h_backtest.md`](report/alert72h_backtest.md) | ML evaluation and limits |
| [`report/API_REFERENCE.md`](report/API_REFERENCE.md), [`report/DATA_MODEL.md`](report/DATA_MODEL.md), [`report/FEATURE_EXISTENCE_MATRIX.md`](report/FEATURE_EXISTENCE_MATRIX.md) | Reference material |
| [`report/CLAIMS_AUDIT.md`](report/CLAIMS_AUDIT.md), [`report/HARDCODE_AUDIT.md`](report/HARDCODE_AUDIT.md), [`report/QUALITY_SCAN.md`](report/QUALITY_SCAN.md), [`report/MEDICINE_LIMITS_VERIFICATION.md`](report/MEDICINE_LIMITS_VERIFICATION.md), [`report/SYNONYMS_LICENSING_AUDIT.md`](report/SYNONYMS_LICENSING_AUDIT.md) | Audits |
| [`report/figures/FIGURES.md`](report/figures/FIGURES.md), [`report/export/CONVERSION_GUIDE.md`](report/export/CONVERSION_GUIDE.md), [`report/REPORT_EVIDENCE_INDEX.md`](report/REPORT_EVIDENCE_INDEX.md) | Figures, export, evidence |
| [`report/FILE_GUIDE.md`](report/FILE_GUIDE.md), [`report/PROJECT_STRUCTURE.md`](report/PROJECT_STRUCTURE.md), [`report/MORNING_REPORT.md`](report/MORNING_REPORT.md), [`report/PROGRESS_SUB5.md`](report/PROGRESS_SUB5.md), [`report/DECISIONS_SUB5.md`](report/DECISIONS_SUB5.md) | History (superseded by the current files above) |

## Demo runbooks (`demo/`)

[`demo/DEMO_RUNBOOK.md`](demo/DEMO_RUNBOOK.md), [`demo/SEED_DESIGN.md`](demo/SEED_DESIGN.md),
[`demo/ALERT_UPGRADE_RUNBOOK.md`](demo/ALERT_UPGRADE_RUNBOOK.md), [`demo/FIXPACK_RUNBOOK.md`](demo/FIXPACK_RUNBOOK.md),
[`demo/FIXPACK2_RUNBOOK.md`](demo/FIXPACK2_RUNBOOK.md) (+ `_B`, `_C`), [`demo/FIXPACK3_RUNBOOK.md`](demo/FIXPACK3_RUNBOOK.md):
these hold the viva click paths, merge order and rollback for each fix pack, with screenshots in `demo/*/`.

## Other folders

| Folder | Contents |
|---|---|
| [`ml-evaluation/REPORT.md`](ml-evaluation/REPORT.md) | Earlier ML evaluation figures |
| [`security/`](security/) | Blind-index specification; security risk register |
| [`release/`](release/) | `PROTECTED_HASHES.json`, the 15-file hash ledger checked by the gate |
| `screenshots/` | Live-site screenshots used in the report |

## History (not maintained)

| Folder | Contents |
|---|---|
| [`archive/`](archive/) | 26 superseded documents moved on 2026-11-18 (see its README) |
| `final/` | Phase reports and status documents (several are read by tests: keep) |
| `new/` | Planning and progress notes for sub-projects 1-5 (read by tests: keep) |
| `agent-work/` | Working notes and the test matrix |

Last verified: 2026-11-18 at commit f5337833.
