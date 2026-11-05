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

**Fix (U6):**
1. Add `isSubmittingRef` to `client/src/pages/hospital/LabManagement.jsx` to prevent concurrent / double-click invocations of `handleSendOtp`.
2. Introduce a `cooldownSeconds` state (default 0). On successful dispatch or 429 response, initialize countdown from `err.response?.data?.retryAfterSeconds || 60` with an active interval timer.
3. Disable the submit button when `loading || cooldownSeconds > 0`.
4. When cooldown is active, display: `"Wait {cooldownSeconds}s before resending"`.
5. Display clear 429 message from server: `"Too many requests. Please wait {retryAfterSeconds} seconds."`.
6. Pass `loading={loading}` to `<OtpInput>` on line 211.
7. Add an offline guard test asserting mock `api.post` is called exactly once on rapid double-click.

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

## U7 — Verified root cause: GET /api/pharmacy/prescriptions/pending/<NIC> returns 403

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
   The middleware checks for `x-patient-access` or `x-patient-access-token` header. If missing, it immediately throws/returns `res.status(403).json({ error: 'Patient consent required' })`.
3. **Client "Probe-First" Execution**:
   In `client/src/pages/pharmacy/Dashboard.jsx:87-90` (`handleSearch`):
   ```javascript
   const patientToken = forcedToken || (getPatientToken ? getPatientToken(lookupNic) : null);
   const headers = patientToken ? { 'x-patient-access': patientToken } : {};
   const { data } = await api.get('/pharmacy/prescriptions/pending/' + encodeURIComponent(lookupNic), { headers });
   ```
   On initial lookup, `patientToken` is null/undefined. The client issues an unauthenticated `GET` request with empty headers (`headers: {}`).
4. **Console 403 and Modal Recovery**:
   The server rejects this request with HTTP 403. The browser developer tools console logs this 403 error.
   In `Dashboard.jsx:106-111`, the catch block detects `requiresPatientConsent(err)` and displays `<PatientAccessModal>` (line 340).
   Once the patient receives and verifies the consent OTP, line 348 executes `onSuccess={(token) => { ... handleSearch(null, token); }}`.
   This second request attaches `headers: { 'x-patient-access': token }`. The server validates the token and responds with HTTP 200 containing the prescription array.
   The list renders successfully, but the console retains the 403 error from the speculative initial probe.

**Fix (U7):**
1. In `client/src/pages/pharmacy/Dashboard.jsx` (`handleSearch`):
   Check `patientToken` upfront before issuing network requests.
   If `!patientToken`, immediately trigger `setShowConsentModal(true); setLoading(false); return;` without calling `api.get`.
2. When the consent modal completes via `onSuccess`, `handleSearch(null, token)` fires a single authenticated request with `x-patient-access: token` that returns HTTP 200 without ever logging a 403 error.
3. Add an offline test verifying that `api.get` is not called without headers and that `PatientAccessModal` opens directly.

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
