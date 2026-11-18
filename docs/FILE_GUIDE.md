# File guide (key files)

This is a short guide to the files a reader or examiner is most likely to open, at commit `f5337833`. For
the folder layout see [`PROJECT_STRUCTURE.md`](PROJECT_STRUCTURE.md). The older 129 KB generated guide is
still in `docs/report/FILE_GUIDE.md` (dated history).

**Hash-protected:** the 15 files listed in `docs/release/PROTECTED_HASHES.json` must stay byte-identical. The
gate stops if one changes. Below they are marked **(protected)**.

## Outbreak early-warning system

| File | What it contains |
|---|---|
| `server/src/services/surveillanceService.js` | Case selection (verified episodes), the detector rule (`evaluateOutbreakCriteria`), alert creation (`runAnalysis`) |
| `server/src/services/alertProjection72h.js` | 72-hour previous / actual / projected numbers and the 10th-90th percentile range |
| `server/src/services/outbreakDetailedDelivery.js` | Alert email: kill switch, demonstration allowlist, daily cap |
| `server/src/services/alertReminderService.js` | One-time reminder for pending High/Critical alerts |
| `server/src/services/scanJobs.js` | Manual scan as a background job (202 + polling) |
| `server/src/controllers/adminController.js` | Scan trigger, alert approval, test email |
| `server/src/utils/cronJobs.js` | Daily 02:00 scan and other scheduled jobs |
| `client/src/pages/admin/OutbreakMonitor.jsx` | Admin outbreak monitor (scan, approve, reminder, email result) |
| `client/src/pages/public/PublicHealth.jsx` | Public page: approved alerts, district table with inline drill-down |
| `client/src/utils/outbreakForecasting.js` | Dashboard trend projection (JavaScript OLS with prediction interval) |

## Security and clinical workflow

| File | What it contains |
|---|---|
| `server/src/middleware/auth.js` **(protected)** | JWT verification, stored-session check, role check (`protect([...])`) |
| `server/src/middleware/patientConsent.js`, `server/src/services/patientConsentService.js` | Patient OTP consent token check |
| `server/src/security/passwordAttemptPolicy.js` | 5 failed passwords per 900 s → 429 |
| `server/src/config/redis.js` | OTP throttling and lockout (5 attempts, 15 min, 60 s cooldown) |
| `server/src/controllers/authController.js` | Login, OTP, token issue (15 min access, 7 day refresh) |
| `server/src/controllers/doctorController.js` **(protected)** | Doctor endpoints |
| `server/src/services/dispensingService.js` | Dispensing in one transaction; one receipt per release; repeat-course check |
| `server/src/utils/prescriptionDuration.js` | Prescription duration validation (`INVALID_DURATION`) |
| `server/src/models/Consultation.js`, `Patient.js` **(protected)** | Core clinical records |
| `server/src/utils/versionedEncryption.js` **(protected)** | Field encryption with key versions |
| `server/src/config/dbGuard.js` **(protected)** | Database connection safety checks |

## ML service and evaluation

| File | What it contains |
|---|---|
| `ml-engine/app.py` **(protected)** | Flask service: TF-IDF symptom matcher, interaction checker, outbreak signal helper, health |
| `ml-engine/evaluate_symptom_model.py` **(protected)** | Symptom model evaluation |
| `ml-engine/preprocess_datasets.py` | Builds `drugs_clean.json`, `interactions_clean.json`, `icd10_clean.json` from raw CSVs |
| `ml-engine/data_pipeline/ingest_disease_symptom_kb_v2.py` | Builds the SymCAT knowledge base and quarantine ledger |
| `ml-engine/evaluation/run_outbreak_backtest.py` | Detector and projection back-test on OpenDengue |
| `ml-engine/evaluation/study/run_study.py` | Offline study (forecast benchmark, detector sweep, symptom study) |
| `ml-engine/evaluation/fetch_datasets.py` | Re-downloads the public evaluation datasets and writes the manifest |

## Tests and gate

| File | What it contains |
|---|---|
| `scripts/run_offline_tests.js` | The offline gate (all test profiles + protected-hash and frozen-source checks) |
| `docs/release/PROTECTED_HASHES.json` | The 15-file hash ledger |
| `server/clinical.offline.jest.cjs` | The fixed list of backend test files the gate runs |
| `server/tests/` | Backend tests (267 files tracked) |
| `client/src/__master_offline__/` | Client tests run by the gate |

## Documentation

See [`INDEX.md`](INDEX.md).

Last verified: 2026-11-18 at commit f5337833.
