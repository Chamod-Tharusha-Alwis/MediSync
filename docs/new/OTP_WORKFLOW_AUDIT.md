# MediSync — OTP Workflow Audit

Stage A planning document. Created: 2026-11-05 (Antigravity no-network, branch `antigravity/stage-a`)

Covers every OTP/consent flow: endpoints, rate limits, cool-down, UI feedback.
Root cause of U6 (429) and U7 (403). Email cost per flow.

---

## OTP flows in the system

| Flow | Trigger | Endpoint | Role | Purpose |
|------|---------|----------|------|---------|
| Login OTP | Login step 2 | `POST /api/auth/verify-otp` | All | 2FA login |
| Password reset | Forgot password | `POST /api/auth/request-reset` | All | Reset link |
| Patient consent for lab | Hospital registers test | `POST /api/lab/hospital/request-otp` | Hospital | Patient consent |
| Doctor lab report download | Doctor requests PDF | `POST /api/lab/doctor/request-otp/:labTestId` | Doctor | Secure access |
| Patient lab report download | Patient requests PDF | `POST /api/lab/patient/request-otp/:reportId` | Patient | Secure access |
| Pharmacy patient retrieval | (via auth — no OTP currently) | `GET /api/pharmacy/prescriptions/pending/:nic` | Pharmacy | U7 |

---

## Per-flow analysis

### 1. Login OTP

**Endpoint:** `POST /api/auth/verify-otp`  
**Rate limit:** yes — `checkOtpRequestThrottle` via Redis (observed pattern in `authController.js`).  
**Cool-down:** Redis TTL-based; `retryAfterSeconds` returned on 429.  
**UI feedback:** login form shows OTP input after step 1. OTP is sent on step-1 success.  
**Email cost:** 1 per login. With 5 roles × 1 login = 5 emails per full Stage E run.  
**Fire on mount?** No — fired once after successful credential step.  
**Issues:** none known for the login flow itself.

### 2. Password reset

**Endpoint:** `POST /api/auth/request-reset`  
**Rate limit:** yes — rate limiter on `authRoutes.js`.  
**Email cost:** 1 per request. For testing: 1 per role = 5 emails maximum.  
**Issues:** none known.

### 3. Patient consent for hospital lab (U6 — root cause)

**Endpoint:** `POST /api/lab/hospital/request-otp`  
**Rate limit:** yes — `checkOtpRequestThrottle({ accountKey, ipKey, attemptKey })`. Returns 429 with `retryAfterSeconds`.  
**Cool-down:** OTP_TTL_SECONDS = 600 (10 min).  
**Email cost:** 1 per consent request (sent to patient's registered email).

**Root cause of U6 (five 429s from one action):**

The hospital lab UI component appears to call `POST /api/lab/hospital/request-otp`
automatically — either on component mount, on each render triggered by state change,
or on a repeated effect dependency. When the hospital navigates to the lab registration
form, the effect fires before the user clicks "Send OTP", and fires again on each
re-render (e.g. when form fields change). The throttle allows the first request; the
next 4 return 429. All 5 show up in the browser network log before the user has clicked.

**Evidence:** V3 §1 states "HTTP 429 five times in a row from one action". The throttle
exists (`checkOtpRequestThrottle`), so the problem is UI-side.

**Fix (U6):**
1. Remove the OTP request from any `useEffect` without user interaction.
2. Fire OTP **only** in the click handler of the "Send OTP" / "Verify" button.
3. Disable the button after click until `retryAfterSeconds` elapses (countdown timer).
4. Show: "OTP sent. Wait {n}s before resending." with a live countdown.
5. Display clear 429 message: "Too many requests. Please wait {n} seconds."
6. Add a guard test: mock the endpoint; assert it is called exactly once per button click.

**Email cost after fix:** 1 per consent flow (down from up to 5).

### 4. Doctor lab report OTP

**Endpoint:** `POST /api/lab/doctor/request-otp/:labTestId`  
**Rate limit:** yes — same throttle pattern.  
**Email cost:** 1 per download attempt.  
**Issues:** none reported; verify in Stage E.

### 5. Patient lab report OTP

**Endpoint:** `POST /api/lab/patient/request-otp/:reportId`  
**Rate limit:** yes.  
**Email cost:** 1 per download attempt.  
**Issues:** none reported; verify in Stage E (PDF not yet enabled — U4).

---

## U7 — Root cause: GET /api/pharmacy/prescriptions/pending/<NIC> returns 403

**Endpoint:** `GET /api/pharmacy/prescriptions/pending/:nic`  
**Expected auth:** `pharmacyAuth` middleware (pharmacy staff JWT).  
**Observed:** 403 in browser console while list still renders.

**Likely causes (verify by reading pharmacyController.js with network access):**

| Hypothesis | Likely? | Test |
|-----------|---------|------|
| A: The pharmacy dispense view calls this endpoint before the staff is authenticated (no token or expired token) | Medium | Check token lifecycle; does the page call it on mount before auth check resolves? |
| B: The route requires a specific sub-role claim (`dispensingStaff`, not generic `pharmacyStaff`) | Medium | Read `pharmacyAuth` and the route's role check |
| C: The patient consent token is required as a header/query param and is not supplied | Lower | Read controller for consent check |
| D: NIC encoding issue — special characters in NIC URL param not escaped | Lower | Try with a known simple NIC |

**Fix path:**
1. After network is available, read `pharmacyController.js` → `getPendingPrescriptions`.
2. Confirm which of A–D is the cause.
3. If A: ensure page waits for auth before fetching.
4. If B: adjust role claim or route guard to allow `pharmacyStaff`.
5. If C: determine if consent is needed for this endpoint and adjust flow.
6. Add a test that asserts 200 for a valid pharmacy staff token.

**Why the list appears despite 403:** likely a stale state from a prior navigation or
a parallel successful request. The 403 path may be for a different NIC lookup.

---

## Email cost table (per Stage E test run)

| Flow | Emails per run | Notes |
|------|---------------|-------|
| Login × 5 roles | 5 | One session per role; reuse for entire run |
| Password change test × 1 role | 0 | No email on password change itself |
| Patient consent for lab (U6 fixed) | 1 | Hospital test → patient email |
| Doctor lab report download | 1 | Doctor test → doctor email (OTP) |
| Patient lab report download | 1 | Patient test (after U4 enabled) |
| Password reset test | 1 | One role only |
| Outbreak notification | 0–3 | Depends on seed trigger; passive |
| **Total per full run** | **~10** | Within D7 limit (60/day) |

**Stop rule:** stop at 50 total for the day and ask the operator.  
Current balance on 5 Nov: 8 used, 52 remaining, 50 is the stop threshold.

---

## Proposed fixes summary

| Issue | Fix | Effort |
|-------|-----|--------|
| U6: OTP fired on mount (5× 429) | Move OTP call to click handler; add cooldown timer; clear 429 message | S |
| U7: 403 in console | Determine cause (A–D above); fix root; add test | S |
| All OTP UIs: no visible countdown | Add `{n}s` countdown after send, disable button | S |
| All OTP UIs: 429 message unclear | Show "Please wait {n} seconds" using `retryAfterSeconds` | S |
