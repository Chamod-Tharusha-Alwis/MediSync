# MediSync REST API & Endpoint Reference Manual

> **Base URL (Backend)**: `https://medisync-wabc.onrender.com` (Production) / `http://localhost:5000` (Local)  
> **Base URL (ML Engine)**: `https://medisync-ml.onrender.com` (Production) / `http://localhost:5001` (Local)  
> **Authentication**: JSON Web Token (JWT) Bearer header (`Authorization: Bearer <token>`) with role-based claims.  
> **Patient Consent Header**: `x-patient-access` containing OTP-derived consent token for medical record and dispensing access.  
> **Internal Service Authentication**: HMAC-SHA256 signature (`x-internal-key`).  

---

## 1. Authentication & Security Endpoints (`/api/auth`, `/api/devices`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register new user (Patient, Doctor, Pharmacy Staff). Enforces password strength rules. |
| `POST` | `/api/auth/login` | Public | Authenticate with credentials. Rate limited (5 failed attempts $\to$ lockout). |
| `POST` | `/api/auth/verify-otp` | Public | Verify 6-digit OTP code against `OTPSession` (300 s TTL). Fails closed in production. |
| `POST` | `/api/auth/resend-otp` | Public | Request new OTP token. Rate-limited cooldown. |
| `POST` | `/api/auth/refresh-token`| Public / Bearer | Refresh expired access JWT using secure session token. |
| `POST` | `/api/auth/logout` | Bearer (Any) | Invalidate active session token. |
| `POST` | `/api/auth/forgot-password` | Public | Issue recovery token to registered email (900 s TTL). |
| `POST` | `/api/auth/reset-password` | Public | Set new password using verified recovery token. |
| `GET` | `/api/auth/me` | Bearer (Any) | Retrieve authenticated user profile with role permissions. |
| `POST` | `/api/devices/register` | Bearer (Any) | Register trusted browser or mobile device fingerprint. |
| `GET` | `/api/devices` | Bearer (Any) | List all registered devices for the current account. |
| `DELETE`| `/api/devices/:id` | Bearer (Any) | Revoke trust for a previously registered device. |

---

## 2. Doctor Portal Endpoints (`/api/doctor`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `GET` | `/api/doctor/stats` | Doctor | Retrieve summary stats: today's consultations, total encounters, facility status. |
| `GET` | `/api/doctor/profile` | Doctor | Retrieve doctor medical registration number (SLMC), specialization, and affiliations. |
| `PUT` | `/api/doctor/profile` | Doctor | Update professional profile and contact details. |
| `POST` | `/api/doctor/consultation` | Doctor | **Create Clinical Consultation**: Persists encounter, validates duration limits, evaluates drug interactions, encrypts covered clinical notes through the legacy CBC field plugin. |
| `GET` | `/api/doctor/consultations` | Doctor | List historical consultations authored by authenticated clinician. |
| `GET` | `/api/doctor/consultation-command/:key` | Doctor | Retrieve status of idempotent clinical command execution. |
| `PUT` | `/api/doctor/consultation/:id/followup` | Doctor | Update follow-up review schedule and clinical follow-up notes. |
| `POST` | `/api/doctor/predict-disease` | Doctor | Query ML Engine for symptom-to-disease suggestions. 60 s timeout for cold starts. |
| `GET` | `/api/doctor/predict-disease/health` | Doctor | Check connectivity and cold start status of the Python ML engine. |
| `GET` | `/api/doctor/patients-directory` | Doctor | Search patient directory by NIC blind index (`patientNic_bi`). |

---

## 3. Patient Portal Endpoints (`/api/patient`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `POST` | `/api/patient/register` | Public | Self-registration for citizens. Generates encrypted record with blind indexing. |
| `POST` | `/api/patient/login` | Public | Patient authentication via NIC/email and password with OTP challenge. |
| `PUT` | `/api/patient/profile` | Patient | Update contact details, emergency contacts, or language preference (`en`, `si`, `ta`). |
| `GET` | `/api/patient/:nic` | Patient / Doctor / Admin | Retrieve decrypted demographic profile. Requires patient identity or active consent token. |
| `PUT` | `/api/patient/:nic` | Patient | Update personal medical preferences and demographic details. |
| `GET` | `/api/patient/:nic/timeline` | Patient / Doctor | Retrieve chronological medical history (consultations, lab tests, prescriptions). |
| `GET` | `/api/patient/:nic/prescriptions` | Patient / Doctor | List issued, pending, and dispensed prescriptions for the patient. |
| `POST` | `/api/patient/consultation/:id/rate` | Patient | Submit rating and feedback for a completed doctor consultation. |
| `POST` | `/api/patient/consultation/:id/resend-summary` | Patient | Request resend of encrypted consultation summary email. |
| `POST` | `/api/patient/request-access` | Doctor / Pharmacist | Request OTP consent token sent to patient's registered contact. |
| `POST` | `/api/patient/verify-access` | Doctor / Pharmacist | Verify patient OTP and issue temporary `x-patient-access` token. |
| `POST` | `/api/patient/report` | Patient | Report clinical concern or privacy violation. |

---

## 4. Pharmacy & Dispensing Endpoints (`/api/pharmacy`, `/api/prescriptions`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `GET` | `/api/pharmacy/stats` | Pharmacy Staff | Retrieve today's and this month's total dispensing transaction volume. |
| `GET` | `/api/pharmacy/prescriptions/pending/:nic` | Pharmacist | Fetch active, non-dispensed e-prescriptions for a patient. Gated by `x-patient-access` token. |
| `POST` | `/api/pharmacy/dispense` | Pharmacist | **Dispense Medication**: Atomically validates prescription status, checks patient allergies, updates status to `dispensed`, and records receipt. Rejects duplicates with `ALREADY_DISPENSED`. |
| `POST` | `/api/pharmacy/dispense-otc` | Pharmacist | Record direct over-the-counter pharmacy dispensing with allergy and dosage checks. |
| `GET` | `/api/pharmacy/history` | Pharmacy Staff | View historical dispensing log with receipt numbers, timestamps, and dispensed drugs. |
| `GET` | `/api/pharmacy/receipt/:receiptNo` | Pharmacy Staff | Retrieve individual dispensing receipt details. |
| `GET` | `/api/pharmacy/district-demand` | Pharmacy Staff | Retrieve epidemiological district disease burdens and top dispensed pharmaceuticals. |
| `GET` | `/api/pharmacy/analytics/dispensing` | Pharmacy Staff | Dispensing volume trends over the preceding 30-day window. |
| `GET` | `/api/pharmacy/staff` | Pharmacy Admin | Manage pharmacy staff accounts (pharmacists, assistants). |
| `POST` | `/api/prescriptions/check-safety` | Doctor / Pharmacist | Evaluate dosage ceilings, duration limits, allergies, DDIs, and active prescription supersession notices; returns severity-tiered warnings (`info`, `moderate`, `severe`, `critical`) and required clinician acknowledgment payload. |
| `GET` | `/api/prescriptions/download/:refId` | Patient | Download digital prescription slip. Gated by `PDF_EXPORT_ENABLED`. |
| `GET` | `/api/prescriptions/consultations/:id/export-pdf` | Patient / Doctor | **Download Consultation Summary PDF**: Generates WinAnsi-safe document buffer with embedded QR code. Gated by `PDF_EXPORT_ENABLED`. |

---

## 5. Epidemiological Surveillance & Public Health (`/api/alerts`, `/api/public`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `GET` | `/api/alerts/active` | Public | Return active and confirmed outbreak alerts for public banner display. |
| `GET` | `/api/alerts/district/:id` | Public | Return district-specific outbreak status and public guidance. |
| `GET` | `/api/public/health-summary` | Public | Island-wide communicable disease summary: 25 districts, rolling 7-day counts, Gate 1–2 evaluation. |
| `GET` | `/api/public/health-map` | Public | GeoJSON-compatible district case densities and outbreak coordinates. |
| `GET` | `/api/public/stats` | Public | Anonymized platform health metrics (participating facilities, verified consultations). |

---

## 6. Public QR Authenticity & History Verification (`/api/verify`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `GET` | `/api/verify/:token` | Public | **Public QR Authenticity Check**: Verifies SHA-256 capability token against `VerificationToken` model (90-day TTL). Returns hospital, doctor name, and timestamp with **zero patient PII**. |
| `GET` | `/api/verify/:token` | Public | **Public Authenticity Card**: Returns issuance metadata (hospital, doctor, date, status, zero patient PII). |
| `POST` | `/api/verify/request-otp` | Public / Rate-Limited (10/15m) | **OTP Request**: Dispatches 6-digit dynamic OTP to patient's registered email address. |
| `POST` | `/api/verify/unlock` | Public / Rate-Limited (15/15m) | **OTP Unlock**: Verifies 6-digit OTP code and returns unlocked clinical consultation details and medicine release summary. |
| `POST` | `/api/verify/:token/consultation-pdf` | Public / Rate-Limited (5/15m) | **Consultation Report PDF Download**: Returns encrypted, single-encounter consultation report PDF for active verification session (`/history-pdf` supported as alias). Scoped strictly to the token encounter; zero patient history. |
| `GET` | `/api/verify/:token/lab-tests` | Public / Session-Gated | **Encounter Lab Tests**: Returns ordered diagnostic laboratory tests linked strictly to this consultation encounter. |
| `GET` | `/api/verify/:token/lab-tests/:labTestId/download` | Public / Session-Gated | **Lab Report Download**: Serves verified diagnostic lab report PDF for completed tests belonging to this encounter. |
| `POST` | `/api/verify/:token/revoke` | Protected (Doctor/Admin) | **Revocation**: Marks token as revoked with clinical justification. | 
| `POST` | `/api/verify/:token/revoke` | Authorized / Admin | Explicitly revoke a compromised or erroneous verification token capability. |

---

## 7. Formularies, Drug Catalog & Clinical Catalogs (`/api/drugs`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `GET` | `/api/drugs/search` | Doctor / Pharmacy | Search drug formulary by brand name or generic active ingredient. |
| `GET` | `/api/drugs/symptoms` | Doctor | Return list of ML-canonical symptom tokens indexed for auto-complete. |
| `GET` | `/api/drugs/icd/search` | Doctor | **ICD Search**: Search the 71,704 validated concepts catalog by code or description. Supports `version` query parameter (`all`, `icd10`, `icd11`) with dynamic ICD-11 syntax detection (`6A70`). |
| `GET` | `/api/drugs/icd/status` | Doctor / Admin | Check catalog version, leaf concept count, and readiness status. |
| `POST` | `/api/drugs/interactions` | Doctor / Pharmacy | Evaluate pairwise drug interactions across candidate prescriptions against `interactions_clean.json`. |
| `POST` | `/api/drugs/recommendations` | Doctor | Retrieve evidence-based pharmaceutical recommendations for confirmed diagnoses. |
| `GET` | `/api/drugs/suggestions` | Doctor | Contextual medication suggestions based on active clinical diagnosis. |

---

## 8. Super Admin Management & Audit Logs (`/api/admin`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `GET` | `/api/admin/analytics/dashboard` | Super Admin | System-wide operational dashboard: total users, active outbreaks, consultation trends. |
| `GET` | `/api/admin/analytics/diseases/search` | Admin, Super Admin, Health Officer | Autocomplete search over ICD-10 (71k concepts) and WHO ICD-11 core catalog with debounced matching, localized synonyms (Sinhala/Tamil), and max 20 results. |
| `GET` | `/api/admin/analytics/diseases/:code` | Admin, Super Admin, Health Officer | Aggregated epidemiological surveillance metrics for selected ICD code across time range (?from=&to=&bucket=): summary tiles (total, affected districts, change vs previous period, peak day), zero-filled time series, 25-district breakdown with DCS incidence & share, province breakdown, and island-wide totals. |
| `GET` | `/api/admin/system-health` | Super Admin | Database, Redis cache, and ML service connectivity telemetry. |
| `GET` | `/api/admin/users` | Super Admin | List all registered platform accounts with status and roles. |
| `PUT` | `/api/admin/users/toggle-status` | Super Admin | Suspend or activate user account standing. |
| `GET` | `/api/admin/audit-logs` | Super Admin | Paginated immutable audit trail; filters by actor, action type, date range, and actor or target email address. |
| `GET` | `/api/admin/surveillance/review` | Super Admin | List syndromic consultations awaiting epidemiological review with district, disease, and date range filters. |
| `PUT` | `/api/admin/surveillance/review` | Super Admin | Verify or reject individual or bulk consultations for syndromic surveillance inclusion. |
| `POST` | `/api/admin/outbreak/trigger` | Super Admin | Manually trigger full epidemiological scan across all 25 districts. |
| `GET` | `/api/admin/outbreak/growth` | Super Admin | 72-hour epidemiological growth telemetry (cases last 72h vs prior 72h, absolute change, percent change with "new" for 0 previous cases, 7-day daily trend, DCS incidence) for all districts and island total. Supports `?window=72h`. |
| `GET` | `/api/admin/outbreak/:id/recipients-preview` | Super Admin | Preview eligible recipient counts by notification scope (`none`, `district`, `national`) before approval. |
| `PUT` | `/api/admin/outbreak/:id/approve` | Super Admin | Confirm a pending outbreak alert with scoped notifications (`none`, `district`, `national` with confirmation disease). Promotes to active public broadcast. |
| `PUT` | `/api/admin/outbreak/:id/resolve` | Super Admin | Resolve confirmed outbreak alert. Requires mandatory justification note ($\ge 5$ chars). |
| `GET` | `/api/admin/ml-status` | Super Admin | Inspect ML engine deployment status, cold start health, and catalog concept count. |

---

## 9. Machine Learning Microservice (`ml-engine/app.py`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `POST` | `/predict_disease` | Internal / Doctor | **Dual-Tier Symptom Matching**: Accepts array of symptoms. Returns Tier 1 match (41 profiles) if confidence $\ge 40.0\%$, else Tier 2 sparse retrieval (174 KB profiles). Disclaimed with `clinicalValidation: not_established`. |
| `GET` | `/health` | Public | Returns service status (`ready`), reference dataset count (7 files), and ICD-10 concept count (71,704). |
| `GET` | `/metrics` | Public | Returns uptime, total processed inference queries, and memory RSS telemetry. |
| `POST` | `/evaluate` | Internal / Admin | Batch evaluation runner for synthetic test suites and consistency scoring. |

### Pharmacy stock and outbreak publication

- `GET /api/pharmacy/inventory` is **DECOMMISSIONED** (returns 410 Gone with `INVENTORY_MANAGEMENT_DECOMMISSIONED`). MediSync does not do inventory/stock management; pharmacists verify and dispense directly against verified prescriptions.
- `GET /api/public/outbreak-alerts` returns allowlisted fields from approved, active, real OutbreakAlert records. District case counts never create advisory entries. `GET /api/admin/outbreak/alerts` exposes current real pending and active records under verified admin authorization. Simulation remains separate.
