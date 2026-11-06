# MediSync — OTP Workflow Audit

Stage A planning document. Refreshed: 2026-11-05 (Stage B1 Phase 1 Investigation on branch `stage-b1/fixes`)

Covers every OTP/consent flow: endpoints, rate limits, cool-down, UI feedback.
Root causes of U6 (429) and U7 (403) verified in codebase. Email quota accounting.

---

## OTP flows in the system

| Flow | Trigger | Endpoint | Role | Purpose |
|------|---------|----------|------|---------|
| Login OTP | Login step 2 | `POST /api/auth/verify-otp` | All | 2FA login |
| Password reset | Forgot password | `POST /api/auth/request-reset` | All | Reset link |
| Patient consent for lab | Hospital registers test | `POST /api/lab/hospital/request-otp` | Hospital | Patient consent |
| Doctor lab report download | Doctor requests PDF | `POST /api/lab/doctor/request-otp/:labTestId` | Doctor | Secure access |
| Patient lab report download | Patient requests PDF | `POST /api/lab/patient/request-otp/:reportId` | Patient | Secure access |
| Pharmacy patient retrieval | Dispensary lookup | `GET /api/pharmacy/prescriptions/pending/:nic` | Pharmacy | Patient consent token (`x-patient-access`) |

---

## Per-flow analysis

### 1. Login OTP

**Endpoint:** `POST /api/auth/verify-otp`  
**Rate limit:** yes — `checkOtpRequestThrottle` via Redis (`authController.js:650-675`).  
**Cool-down:** Redis TTL-based (60s cooldown); `retryAfterSeconds` returned on 429.  
**UI feedback:** login form shows OTP input after step 1. OTP is sent on step-1 success. Submission locks present on login (`useSubmissionLock.js`, commit `4d02303`).  
**Email cost:** 1 per login. With 5 roles × 1 login = 5 emails per full Stage E run.  
**Fire on mount?** No — fired once after successful credential step.  
**Issues:** none known for the login flow itself.

### 2. Password reset

**Endpoint:** `POST /api/auth/request-reset`  
**Rate limit:** yes — rate limiter on `authRoutes.js`.  
**Email cost:** 1 per request. For testing: 1 per role = 5 emails maximum.  
**Issues:** none known.

### 3. Patient consent for hospital lab (U6 — verified root cause)

**Endpoint:** `POST /api/lab/hospital/request-otp`  
**Rate limit:** yes — `checkOtpRequestThrottle({ accountKey: otpKey, ipKey: req.ip, attemptKey: otpKey })` in `server/src/controllers/labController.js:174-184`. Returns 429 with `retryAfterSeconds`.  
**Cool-down:** Redis cooldown = 60s (`redis.js:370-380`), account limit = 5 requests per 15 minutes (`redis.js:383-395`). OTP TTL = 600s (10 min).  
**Email cost:** 1 per consent request (sent to patient's registered email).

**Verified root cause of U6 (five 429s from one action):**

1. **Refutation of mount/re-render hypothesis**:
   Static code audit of `client/src/pages/hospital/LabManagement.jsx:45-132` (`RegisterNewTest`) demonstrates that the component contains **zero `useEffect` hooks**. Handler `handleSendOtp` is attached exclusively to `<form onSubmit={handleSendOtp}>` (line 168) and `<OtpInput onResend={handleSendOtp} />` (line 213). The endpoint does **NOT** fire on component mount or re-render.
2. **Missing UI concurrency lock & cooldown timer**:
   - In `client/src/pages/hospital/LabManagement.jsx:180-189`, the submit button relies solely on `disabled={loading || !nic.trim()}`. It maintains no submission concurrency lock (`isSubmittingRef`) and no cooldown countdown state.
   - In `client/src/pages/hospital/LabManagement.jsx:211`, `<OtpInput onSubmit={handleVerifyOtpCode} onResend={handleSendOtp} initialSeconds={120} />` is rendered WITHOUT passing `loading={loading}`. In `OtpInput.jsx:125-134`, the Resend button disabled condition is `disabled={loading}`. Because `loading` is omitted, it defaults to `false`, leaving "Resend OTP" clickable during pending HTTP dispatches.
   - When a user or test script clicks "Send Verification OTP" / "Resend OTP" multiple times in rapid succession, multiple requests hit the server concurrently.
   - The first request succeeds and activates the 60-second Redis cooldown (`recordOtpRequestSent`).
   - The subsequent rapid requests are rejected by `checkOtpRequestThrottle` with HTTP 429 (`reason: 'otp_resend_cooldown'`). After 5 attempts within 15 minutes, requests are blocked with HTTP 429 (`reason: 'otp_account_rate_limit'`).

**Implementation & Verification Status (U6 — COMPLETED OFFLINE):**
1. Reused `useSubmissionLock` hook (`client/src/hooks/useSubmissionLock.js`) in `client/src/pages/hospital/LabManagement.jsx:45-132` to lock synchronous rapid clicks on `handleSendOtp`.
2. Introduced `cooldownSeconds` state with `startCooldown(seconds)`. On successful dispatch or 429 response, initializes a countdown from `err.response?.data?.retryAfterSeconds || 60` with active interval timer. Added interval cleanup on component unmount.
3. Disabled the submit button during `loading || cooldownSeconds > 0`.
4. Rendered `"Wait {cooldownSeconds}s before resending"` on the button during active cooldown.
5. Displayed server 429 error via localized toast: `"Too many requests. Please wait {retryAfterSeconds} seconds."`.
6. Passed `loading={loading}` and `cooldownSeconds={cooldownSeconds}` to `<OtpInput>` (`client/src/components/ui/OtpInput.jsx:125-134`), disabling the resend button and rendering countdown feedback.
7. Added localized keys `lab.waitCooldown` and `lab.tooManyRequests` across `en.js`, `si.js`, and `ta.js` (verified 770 leaf keys per language).
8. Verified with 6/6 passing unit tests in `client/src/__master_offline__/hospital-lab-otp-u6.test.jsx`.

**Email cost after fix:** 1 per consent flow (down from up to 5).

### 4. Doctor lab report OTP

**Endpoint:** `POST /api/lab/doctor/request-otp/:labTestId`  
**Rate limit:** yes — same `checkOtpRequestThrottle` pattern.  
**Email cost:** 1 per download attempt.  
**Issues:** none reported; verify in Stage E.

### 5. Patient lab report OTP

**Endpoint:** `POST /api/lab/patient/request-otp/:reportId`  
**Rate limit:** yes.  
**Email cost:** 1 per download attempt.  
**Issues:** none reported; verify in Stage E (PDF not yet enabled — U4).

---

## U7 — Verified root cause & test conflict: GET /api/pharmacy/prescriptions/pending/<NIC> returns 403

**Endpoint:** `GET /api/pharmacy/prescriptions/pending/:nic`  
**Expected auth:** `dispensingAuth` (`['pharmacist', 'pharmacy_admin']`) + `patientConsent` middleware.  
**Observed:** 403 in browser console while prescription list still renders.

**Verified Code Facts (Hypothesis C + Client Probe-First Architecture):**

1. **Server Route Guard**:
   In `server/src/routes/pharmacyRoutes.js:32`:
   ```javascript
   router.get('/prescriptions/pending/:nic', dispensingAuth, require('../middleware/patientConsent'), pharmacyController.getPendingPrescriptions);
   ```
2. **Consent Middleware Requirement**:
   In `server/src/middleware/patientConsent.js:5-8`:
   The middleware checks for `x-patient-access` or `x-patient-access-token` header. If missing, it immediately returns HTTP 403 `{"error": "Patient consent required"}`.
3. **Client "Probe-First" Execution**:
   In `client/src/pages/pharmacy/Dashboard.jsx:87-90` (`handleSearch`):
   ```javascript
   const patientToken = forcedToken || (getPatientToken ? getPatientToken(lookupNic) : null);
   const headers = patientToken ? { 'x-patient-access': patientToken } : {};
   const { data } = await api.get('/pharmacy/prescriptions/pending/' + encodeURIComponent(lookupNic), { headers });
   ```
   On initial lookup, `patientToken` is null/undefined. The client issues an unauthenticated `GET` request with empty headers (`headers: {}`).
4. **Console 403 and Modal Recovery**:
   The server rejects this request with HTTP 403, which browser dev tools log as a red network failure.
   In `Dashboard.jsx:106-111`, the catch block detects `requiresPatientConsent(err)` and displays `<PatientAccessModal>`.
   Once the patient receives and verifies the consent OTP, line 348 executes `onSuccess={(token) => { ... handleSearch(null, token); }}`.
   This second request attaches `headers: { 'x-patient-access': token }`, succeeding with HTTP 200.
   The list renders successfully, but the console retains the 403 error from the speculative probe.

**Fix & Mutual Conflict with Existing Release Candidate Tests (BLOCKED / REVERTED):**
1. **Surgical Fix Developed**: In `Dashboard.jsx`, check `if (!patientToken) { setLoading(false); setShowConsentModal(true); return; }` before calling `api.get`. Authored new unit tests in `pharmacy-consent-u7.test.jsx` (3/3 passed).
2. **Mutual Conflict Discovered**: Existing release candidate suite `client/src/__master_offline__/pharmacy-consent-flow.test.jsx:32-43` (committed in `21d1d6d`) explicitly asserts the legacy probe-first behavior:
   - Line 41-42: Querying a new patient `QA-TWO` without token explicitly expects `expect(api.get.mock.calls[3][1].headers['x-patient-access']).toBeUndefined()`.
   - Lines 46, 67, 89: Assert that `query()` dispatches `api.get` without consent tokens.
3. **Safe Rollback**: Hard Boundary Rule 198 strictly prohibits editing existing tests. Section 5(f) requires reverting edits that cause regressions.
4. **Current Status**: `Dashboard.jsx` safely reverted to baseline. Marked **BLOCKED** awaiting operator approval to update `pharmacy-consent-flow.test.jsx`. Ready-to-apply patch and test documented in `docs/new/B1_BATCH2_REPORT.md`.

---

## Email quota accounting (Stage E / Live testing)

### Provider Quotas Verified on 5 Nov 2026:
- **Resend**: **15 / 100** daily emails verified from live Resend provider dashboard on 5 Nov (provider account daily ceiling: 100).
- **Brevo**: **300 / 300** daily emails available on provider account.

### Operator Safety Caps Distinction:
- **60 emails/day** and the **stop threshold at 50 emails** are **INTERNAL MEDISYNC OPERATOR SAFETY CAPS** designed to conserve testing quota and prevent runaway automation during test runs.
- They are **NOT** provider-enforced account limits.

### Email Cost Table per Full Test Run:

| Flow | Emails per run | Notes |
|------|---------------|-------|
| Login × 5 roles | 5 | One session per role; reuse for entire run |
| Password change test × 1 role | 0 | No email on password change itself |
| Patient consent for lab (U6 fixed) | 1 | Hospital test → patient email |
| Doctor lab report download | 1 | Doctor test → doctor email (OTP) |
| Patient lab report download | 1 | Patient test (after U4 enabled) |
| Password reset test | 1 | One role only |
| Outbreak notification | 0–3 | Depends on seed trigger; passive |
| **Total per full run** | **~10** | Well within internal operator safety cap (60/day) |

**Operator Stop Rule:** Stop test execution when cumulative daily sends reach **50** total and prompt operator for authorization.

---

## Proposed fixes summary

| Issue | Verified Code Root Cause | Fix | Effort |
|-------|-------------------------|-----|--------|
| **U6**: Hospital lab OTP 429 | Missing click concurrency lock (`isSubmittingRef`) and cooldown timer state in `LabManagement.jsx:180-189`; `<OtpInput>` missing `loading` prop | Add submission lock; add 60s countdown timer state on button; pass `loading={loading}` to `<OtpInput>` | S |
| **U7**: Pharmacy pending 403 | Client probe-first architecture in `Dashboard.jsx:87-90` dispatches unauthenticated GET before opening consent modal | Check `patientToken` upfront; if absent, open `PatientAccessModal` directly without failing HTTP 403 request | S |
| **All OTP UIs**: No visible countdown | UI buttons do not reflect backend Redis 60s cooldown | Add `{n}s` countdown after send, disable button during cooldown | S |
| **All OTP UIs**: 429 message unclear | Generic error toast shown instead of server retry advice | Display "Too many requests. Please wait {retryAfterSeconds} seconds" | S |
