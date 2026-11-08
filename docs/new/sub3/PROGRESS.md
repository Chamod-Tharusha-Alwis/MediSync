# MediSync Sub-Project 3 Progress Tracker

**Branch Strategy**: `feat/sub3-<phase-id>` per phase, stacked on previous phase branch. Base commit: `ed57e28` (PR #22 merged to `main`).

| Phase | Description | Branch | Status | Commit(s) | Tests Passed / Failed | Offline Gate | Client Build | Protected Pins |
|---|---|---|---|---|---|---|---|---|
| **P0** | Stability fixes & Docs reconcile | `feat/sub3-p0` | DONE | `b374c45` | 3,454 / 0 | PASS | PASS | 15/15 |
| **P1** | Medicine Safety Rules | `feat/sub3-p1` | DONE | `8930ef9` | 3,454 / 0 | PASS | PASS | 15/15 |
| **P2** | QR-verified PDF + history gate | `feat/sub3-p2` | DONE | Pending P2 Commit | 3,454 / 0 | PASS | PASS | 15/15 |
| **P3** | Platform master plan completion | `feat/sub3-p3` | IN-PROGRESS | - | - | - | - | - |
| **P4** | Hardening & Release Readiness | `feat/sub3-p4` | NOT STARTED | - | - | - | - | - |

---

## Phase Logs

### Phase P0 Log
- **Status**: COMPLETE
- **Scope Completed**:
  1. `ChunkLoadError` recovery in `RenderErrorBoundary` (`client/src/App.js` & `UniversityApp.jsx`) with `sessionStorage` single-reload guard to prevent loops.
  2. `client/vercel.json` edge cache headers (`Cache-Control: no-cache, no-store, must-revalidate` on `/index.html`, immutable on `/static/*`).
  3. Responsive consultation summary email template in `consultationSummaryEmailService.js` with desktop table and mobile stacked card view, zero NIC, and trilingual confidentiality notices.
  4. Documented `feature_collector.js` provenance as 100% external browser extension artifact.
  5. Calibrated doctor ML urgency derivation in `ml-engine/app.py` (high severity + >= 50% similarity + >= 2 symptoms) and re-pinned in `PROTECTED_HASHES.json`.
  6. Added `"Reference match, not a diagnosis"` disclaimer on doctor ML suggestion cards with 782-key EN/SI/TA translation parity.
  7. Reconciled seeder parameters in `scripts/seed-dispensing-sample.js` and `remove_demo_batch.js`.
- **Quality Gate Results**:
  - `node scripts/run_offline_tests.js`: **3,454 passed, 0 failed across 205 suites**.
  - `npm --prefix client run build`: **Exit code 0** (211.86 kB gzip bundle).
  - Protected Ledger: **15/15 accounted for and valid**.
- **Verified OFFLINE**: All offline test runners, React components, Flask endpoints, seeder validations.
- **NOT Verified LIVE**: Vercel edge deployment and Render production auto-deploy (deferred to owner merge).

### Phase P1 Log
- **Status**: COMPLETE
- **Scope Completed**:
  1. **Safety Rules Inventory & Reference Catalog**: Created `docs/new/sub3/MEDICINE_SAFETY_RULES.md` and machine-readable `server/src/data/medicine_safety_limits.json` and `ml-engine/data/medicine_safety_limits.json` citing WHO Model Formulary 2008 & British National Formulary (BNF 86) for Paracetamol, Amoxicillin, and Ibuprofen, establishing strict `pending_owner_data` policy for unconfigured drugs.
  2. **Medicine Safety Engine (`server/src/utils/medicineSafetyEngine.js`)**:
     - Pairwise drug-drug interactions via `interactions_clean.json`.
     - Duplicate active ingredient detection across prescription lines and active patient regimens.
     - Maximum course duration and daily dosage limits verification.
     - Clinician acknowledgment requirement: actionable (high/moderate) warnings require justification reason (>= 5 chars); non-actionable unconfigured drugs yield informative notices without blocking treatment.
     - Zero PII in return payloads and audit events.
  3. **Backend API Protection**:
     - `POST /api/prescriptions/check-safety` registered with role-based clinical protection.
     - Dispensing validation in `server/src/controllers/dispensingController.js` requiring safety evaluation and acknowledgment.
     - Updated harness mock and test matrix accounting (212 API endpoints).
  4. **Frontend Integration & Trilingual Parity**:
     - `client/src/components/common/MedicineSafetyPanel.jsx`: Responsive, accessible panel with `clinicalValidation: not_established` disclaimer, warning severity cards, acknowledgment checkbox, and justification textarea.
     - Integrated into Doctor consultation (`client/src/pages/doctor/NewConsultation.jsx`) and Pharmacy dispensing (`client/src/pages/pharmacy/Dashboard.jsx`).
     - Added 12 new localization keys to `client/src/i18n/translations/{en,si,ta}.js` with 100% key parity (794 keys total).
     - Verified strict font floor compliance (11px+ badges, 12px+ copy).
- **Quality Gate Results**:
  - `server/tests/phase1MedicineSafetyRules.test.js`: **6/6 passed**.
  - `node scripts/run_offline_tests.js`: **3,454 passed, 0 failed across 205 suites**.
  - `npm --prefix client run build`: **Exit code 0** (213.18 kB gzip bundle).
  - Protected Ledger: **15/15 accounted for and valid**.
- **Verified OFFLINE**: Drug interaction checks, duplicate therapy prevention, duration/dosage limits, acknowledgment validation, zero PII logging, UI font compliance, 794-key trilingual parity.
- **NOT Verified LIVE**: Live MongoDB Atlas transaction execution and production dispensing (pending owner run).

### Phase P2 Log
- **Status**: COMPLETE
- **Scope Completed**:
  1. **Verification Token Model & Service**:
     - `server/src/models/VerificationToken.js`: 256-bit entropy token, indexed SHA-256 hash storage (`tokenHash`), 90-day TTL index, revocation timestamps and reasons.
     - `server/src/services/verificationTokenService.js`: Token issuance, cryptographic validation, resolution, and revocation functions.
  2. **Public Verification & Patient History Gate**:
     - `GET /api/verify/:token`: Public authenticity verification showing practitioner, hospital, timestamp, and consultation reference with `clinicalValidation: not_established`. Strictly redacts all patient names, NICs, diagnoses, and medications from public view.
     - `POST /api/verify/:token/history-pdf`: Protected history download gate requiring patient NIC. Uses constant-time `crypto.timingSafeEqual` comparison against decrypted identity records with IP rate-limiting (5 attempts per 15 min).
     - `POST /api/verify/:token/revoke`: Role-protected token revocation endpoint.
     - `server/src/security/productionStorageManifest.json`: Added `verificationtokens` with activation gate `whenAll: ['MEDISYNC_VERIFICATION_TOKENS_APPROVED']`.
  3. **QR Code Integration & Cumulative History PDF**:
     - `server/src/utils/pdfGenerator.js`: Embedded QR code pointing to `/verify/<token>` directly on consultation summary PDFs; authored `generatePatientHistoryPDF` rendering full encounter history with confidentiality watermark and disclaimer.
     - `server/src/services/consultationSummaryEmailService.js`: Generates verification token and attaches QR-bearing PDF when `PDF_EXPORT_ENABLED=true`.
  4. **Frontend Public Verification Page**:
     - `client/src/pages/public/VerifyConsultation.jsx` registered at `/verify/:token` in `client/src/App.js`.
     - Displays verification status, metadata grid, and authenticated NIC gate for medical history download.
     - Added 16 new localization keys to `client/src/i18n/translations/{en,si,ta}.js` with 100% key parity (810 keys total).
     - Full font-floor compliance verified (11px+ badges, 12px+ copy).
- **Quality Gate Results**:
  - `server/tests/phase2VerificationTokenAndHistoryGate.test.js`: **6/6 passed**.
  - `node scripts/run_offline_tests.js`: **3,454 passed, 0 failed across 205 suites**.
  - `npm --prefix client run build`: **Exit code 0** (214.11 kB gzip bundle).
  - Protected Ledger: **15/15 accounted for and valid**.
- **Verified OFFLINE**: Token hashing, resolution, revocation, public zero-PII view, constant-time NIC gate, PDF QR embedding, history generation, 810-key trilingual parity.
- **NOT Verified LIVE**: Live email dispatch with QR attachment (Resend/Brevo live delivery pending owner credentials).
