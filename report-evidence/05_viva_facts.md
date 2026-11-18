# 05 Viva fact sheet

Every fact cites a file and line at commit `f5337833` (main). Numbers come from the code or from the saved
evaluation outputs listed in `02_outbreak_ml.md`.

## 1. Authentication

- Passwords are hashed with **bcrypt, cost factor 12**, and a password must reach strength score 3 before it
  is hashed (`server/src/utils/passwordUtils.js:46, 53-56`).
- Login allows **5 wrong passwords per 900 s** per account; then it returns HTTP 429. Failures are counted in
  Redis (`server/src/security/passwordAttemptPolicy.js:2, 21-22`; `server/src/controllers/authController.js:336, 354-358`).
- A successful login issues a **15-minute access JWT** and a **7-day refresh JWT**, each with a unique `jti`
  (`authController.js:493-495`).
- Every request re-checks the token against a **stored session** (SHA-256 of the token). Logout or expiry
  invalidates it at once, even if the JWT itself is still valid (`server/src/middleware/auth.js:25-37`).
- One-time passwords are bcrypt-hashed. **5 failed verifications lock OTP requests for 15 minutes**, with a
  **60 s resend cooldown** and per-account and per-IP limits (`server/src/config/redis.js:309-337`).
- Suspended (banned) accounts are refused even with a valid token (`auth.js:48-60`).
- **Not implemented:** age-based password expiry. Only temporary passwords must be changed at first login
  (`mustChangePassword`, `authController.js:518`).

## 2. Authorization

- **Role-based access:** each route declares its allowed roles with `protect([...])`; other roles get 403
  "Access denied" (`server/src/middleware/auth.js:8, 43-46`).
- **Roles in use:** admin, super_admin, doctor, patient, hospital_admin, pharmacist, pharmacy_admin and
  assistant (route files; see `01_facts.md`).
- **Patient consent:** a doctor or pharmacist can open a patient's records only with a patient-access token,
  issued after the patient approves by OTP. The token is bound to that requester, role and NIC, and is checked
  against an unrevoked, unexpired session (`server/src/services/patientConsentService.js:4-23`;
  `server/src/middleware/patientConsent.js:2-8`).
- **Dispensing:** limited to pharmacist and pharmacy_admin. Assistants can view but not dispense
  (`server/src/routes/pharmacyRoutes.js:28-29, 45`).
- **Alert approval:** only admin, super_admin or health_officer can approve an outbreak alert
  (`server/src/routes/adminRoutes.js:39`).
- **Privacy at the boundary:** public pages receive aggregates only. Counts below 5 are shown as "<5", and a
  district with fewer than 5 verified cases is "Not disclosed (<5)"
  (`client/src/components/public/DistrictDrilldown.jsx`, `drilldownRows`).

## 3. Code structure

- **Three services:**
  - React client (`client/`, Create React App, React 19);
  - Express API (`server/`, Express 5 and Mongoose 9);
  - Flask ML service (`ml-engine/app.py`, Flask 3.1).
- **Server layering:** routes (`server/src/routes`) → middleware (`server/src/middleware`) → controllers
  (`server/src/controllers`) → services (`server/src/services`) → Mongoose models (`server/src/models`).
- **Size:** 228 API routes, pinned by a test (`server/tests/testMatrixInventory.test.js:46`).
- **Outbreak logic:**
  - detector: `server/src/services/surveillanceService.js:398-520`;
  - 72-hour numbers: `server/src/services/alertProjection72h.js`;
  - alert email: `server/src/services/outbreakDetailedDelivery.js`.
- **15 protected files are hash-locked** (`docs/release/PROTECTED_HASHES.json`); the gate checks them on
  every run (15/15 on 18 Nov).
- **Offline test gate:** 3,812 tests passed, 0 failed on 18 Nov 2026 (`scripts/run_offline_tests.js`).
- **Client pages are code-split:** 27 `React.lazy` routes (`client/src/App.js`).

## 4. Workflow (prescribe → dispense → alert → email)

1. **Prescribe:** `POST /api/doctor/consultation` runs the duration check, then the doctor role, then clinical
   write authorization, then the controller (`server/src/routes/doctorRoutes.js:11`). Each medicine needs a
   positive whole `durationDays` (`server/src/utils/prescriptionDuration.js:7-8`).
2. **Dispense:** `POST /api/pharmacy/dispense` requires the pharmacist role and patient consent
   (`pharmacyRoutes.js:45`). It runs in **one MongoDB transaction**:
   - a conditional claim, so two pharmacies at once give exactly **one receipt per item**;
   - an idempotent retry returns the same receipt;
   - allergy, interaction and repeat-course checks.

   (`server/src/services/dispensingService.js:116-217`.) Medicines released together share one receipt (fix
   pack 3).
3. **Detect:** a scheduled scan runs daily at **02:00** in the timezone set by `MEDISYNC_CRON_TIMEZONE`, which
   defaults to UTC (`server/src/utils/cronJobs.js:13, 223-225`). The same scan runs from the admin "Force
   System Scan". It uses **verified** consultation episodes only (`surveillanceService.js:47`).
4. **Alert:** a triggered result is stored as an OutbreakAlert with status **Pending** and severity from the
   z-bands: Watch 2-3, High 3-4, Critical ≥4 (`surveillanceService.js:110-159, 387-396`). The id is a hash, so
   re-scans update the same alert.
5. **Approve:** `PUT /api/admin/outbreak/:id/approve` (`adminRoutes.js:39`, `adminController.js:1007`). Only
   approved alerts become public.
6. **Email:** on approval, the detailed email goes through the kill switch
   (`OUTBREAK_EMAIL_DELIVERY_ENABLED`), the demo allowlist and the daily cap
   (`outbreakDetailedDelivery.js:66-85`). The UI shows Sent (provider id), Skipped (reason) or Failed (reason).
7. **Reminder:** after each scan, pending High/Critical alerts are reminded once by bell notification and one
   email (`cronJobs.js:226-227`).

## 5. Validation

- No Joi: validation is hand-written. The `joi` package is declared but never imported (see
  `03_validation.md`).
- Every request: 1 MB JSON limit (`server/src/app.js:247`). Keys starting with `$` or containing `.` are
  removed (`app.js:266-299`).
- **NIC format:** `^(?:[0-9]{12}|[0-9]{9}[VX])$` (`server/src/security/nicBlindIndex.js:7`).
- **Dispense input:** 1-50 items with a positive whole quantity, and an idempotency key matching
  `^[A-Za-z0-9:_-]{8,128}$` (`dispensingService.js:80-108`).
- **Public endpoints:** unknown query parameters are rejected with 400 `INVALID_HEALTH_FILTER`
  (`server/src/controllers/publicController.js:21`).
- **Flask:** symptom input must be a string or a list of strings, else 400 `INVALID_SYMPTOMS`
  (`ml-engine/app.py:532-538`).
- **Error codes:** every failure returns a status and a stable code, so the client shows a precise message.

## 6. Optimization

- **Public aggregates are cached for 300 s** in Redis, with an in-memory fallback
  (`publicController.js:77, 352`; `server/src/config/redis.js:98, 112`).
- **Measured live, 18 Nov 13:18:** API health median 290 ms; public health-stats median 449 ms (cached);
  public outbreak alerts median 747 ms (`04_optimization.md`). Free-tier cold start 46.6 s.
- **Indexes:**
  - 7 compound or TTL indexes, e.g. OTP sessions auto-delete at expiry (`OTPSession.js:52`);
  - 35 field-level indexed or unique fields.
- **Paged lists:** admin lists are paginated, with `limit` capped at 100 (`adminController.js:137, 282`).
- **Long scans:** the scan can run off the request path; the API answers 202 at once and the page polls every
  2 s.
- **Rate limits:** 16 rate limiters, e.g. public API 60 requests per minute (`publicRoutes.js:7-9`).
- **Not implemented:** HTTP compression; caps on two `limit` parameters.

## 7. Justification

- **Why MERN:** one language (JavaScript) on client and server; a document model fits varied clinical
  records; and MongoDB transactions give the all-or-nothing dispensing the pharmacy needs
  (`dispensingService.js:34-77`).
- **Why a separate Flask service:** the Python data stack (scikit-learn TF-IDF, pandas, statsmodels for the
  offline study) is mature there. Keeping it separate means an ML failure never blocks prescribing or
  dispensing; the API uses timeouts and falls back (`surveillanceService.js:102`).
- **Why simple, explainable models:** a z-score with a case floor and 2-day persistence can be explained to a
  health officer line by line. On simulated data the 2-day rule cut false alarms from 6.06 to 0.92 per year
  versus raw EARS C2 (`docs/report/results_ml_eval.json`).
- **Honest limits of that choice:**
  - on the real OpenDengue series the rule found 70% of epidemic weeks, with 5 false-alarm episodes;
  - a fixed 95th-percentile threshold scored higher (F1 0.79 vs 0.55), so the report presents the detector
    as decision support with human approval, not automatic alerting.
- **Why "repeat the last 72 hours" for the projection:** on OpenDengue the last-value forecast had the lowest
  error at every horizon (1-week MAE 185 vs 346 for the trend projection, `evaluation_results.json`). So the
  product labels its numbers "projection, not a forecast" (`alertProjection72h.js:27`).
- **Why Prophet is offline only:** in the study, Prophet's 1-week MAE was 487.5, against SARIMA 221.0 and
  naive 212.1, and it was significantly worse than SARIMA (DM p < 0.001)
  (`docs/report/study/forecast_metrics.csv`, `RESULTS.md`). It adds a heavy dependency (cmdstanpy) for no
  accuracy gain.
- **Why humans approve every alert:** no component has clinical validation
  (`"clinicalValidation": "not_established"` in every evaluation output), so every alert starts as Pending.
