# MediSync — Static Security Audit (U25)

Stage A planning document. Created: 2026-11-05 (Antigravity, no-network mode, stale copy at `192e1d4` + uncommitted C7 work).

**Scope:** source reading only. No live requests, no dependency audit against the advisory database (needs network), no git-history secret scan run in this session. Every finding below cites a file/line from this copy. Re-check against the current `origin/main` before fixing — newer commits (masking `4383d63`/`37c4bf7`, ML status `40979ff`/`e163f40`) may already cover some items.

Severity: **High** = exploitable or leaks personal data; **Medium** = defence-in-depth gap; **Low** = hygiene.

---

## 1. Summary

| ID | Finding | Severity | Fix effort | Operator action? |
|----|---------|----------|-----------|------------------|
| S1 | Patient NIC placed in JWT `sub` claim (readable by anyone holding the token) | High | S | FIXED OFFLINE (Batch 2) |
| S2 | Registration endpoints have no rate limiter | Medium | S | No |
| S3 | `authLimiter` is skipped unless `NODE_ENV === 'production'` | Medium | S | Yes — confirm Render `NODE_ENV` |
| S4 | `console.log` of login notification results in auth/pharmacy controllers | Medium | S | No |
| S5 | `GET /api/public/doctors|hospitals|pharmacies`, `/diseases/search`, `GET /api/reviews/:targetId` have no rate limiter | Low–Medium | S | No |
| S6 | `GET /api/lab/public/:labTestId/status` is unauthenticated | Medium (needs review) | S | No |
| S7 | Internal HMAC key rotates hourly from one secret; replay inside the 2-hour window | Low | M | No |
| S8 | Dependency audit not run (no network) | Unknown | S | No |
| S9 | Git-history secret scan not re-run this session (158 historical findings recorded 3 Nov) | Unknown | M | Yes — rotate anything confirmed |
| S10 | Test OTP harness still present in production code (by design until Stage E) | Medium | M | Yes — unset env vars after removal |
| S11 | `Permissions-Policy` grants client-hint features to `*` | Low | S | No |

Positive controls confirmed in source (no change needed): `helmet()`; CORS restricted to `clientOrigin` with credentials; JSON body limit 1 MB; Mongo operator sanitiser (`$`/`.` keys stripped from body, params, query); JWT verified with pinned `HS256`; server-side session table checked on every request (`SessionToken` hash, `isValid`, `logoutAt`, `expiredAt`); RBAC via `protect([roles])`; active-ban check; access token 15 min; refresh cookie `httpOnly`, `secure`, `sameSite: 'none'`; OTP throttle on lab OTP routes (`checkOtpRequestThrottle`); `/api/qa` routes mounted only in QA mode; `/api/alerts/trigger` checks an internal HMAC key; `SECURITY_HOLD` path present in `prescriptionController.js:125`.

---

## 2. Findings in detail

### S1 — NIC in JWT payload (High)
- **Where:**
  - `server/src/controllers/patientController.js:85`: `const accessToken = jwt.sign({ id: patient._id, role: 'patient', sub: patient.nic }, process.env.JWT_SECRET, { expiresIn: '15m' });`
  - `server/src/controllers/authController.js:454, 457, 458-460`: In `login`, `const subId = user.doctorId || user.nic || user.regNo || user._id; const tokenPayload = { id: user._id, role: actualRole, sub: subId }; if (modelName === 'Patient' && user.nic) { tokenPayload.nic = user.nic; }`
  - `server/src/controllers/authController.js:686, 689, 690-692`: In `verifyOTP`, repeats identical pattern assigning `sub: subId` (resolving to `user.nic` for Patient) and `tokenPayload.nic = user.nic`.
  - `server/src/controllers/authController.js:1923-1924`: In `refreshToken`, preserves `sub: decoded.sub` and `nic: decoded.nic`.
- **Why it matters:** JWTs are base64url-encoded and unencrypted. Anyone holding or inspecting the access token (browser storage, proxies, server logs, API monitors) can instantly decode the national identity card number.
- **Consumer Audit & Impact Analysis Across Codebase:**
  1. `server/src/controllers/patientController.js:143-150` (`resolveAuthenticatedPatientNic`):
     - Lines 143-146 query MongoDB directly: `const doc = await Patient.findById(reqUser.id).select('nic'); if (doc?.nic) return String(doc.nic).trim().toUpperCase();`.
     - Lines 147-149: `if (reqUser.sub && String(reqUser.sub) !== String(reqUser.id)) { return String(reqUser.sub).trim().toUpperCase(); }`.
     - *Impact*: When `sub` changes to `String(patient._id)`, `reqUser.sub !== reqUser.id` evaluates to `false`. The function safely falls back to line 144's database resolution, preserving 100% of patient identity resolution without regression.
  2. `server/src/middleware/auth.js:93`:
     - Line 93: `actorId: decoded.id || decoded.sub || 'unknown'`.
     - *Impact*: `decoded.id` is always present (`user._id`). Migrating `sub` to `String(patient._id)` ensures total consistency across `decoded.id` and `decoded.sub`. (`auth.js` is protected and does not require modification).
  3. `server/src/controllers/authController.js:1923`:
     - Copies `sub: decoded.sub`.
     - *Impact*: Continues passing sanitized `_id` string seamlessly.
  4. `client/src/`:
     - Exhaustive search confirmed **zero** consumers of `decoded.sub`, `token.sub`, or `jwtDecode` reading `sub`.
     - `client/src/hooks/usePatientConsent.js:7` only reads `.exp` from `x-patient-access` temp tokens.
     - *Impact*: Zero client-side consumers or dependencies on JWT `sub`.
- **Protected File Check:**
  - Neither `server/src/controllers/patientController.js` nor `server/src/controllers/authController.js` is in `docs/release/PROTECTED_HASHES.json`. Both files are **UNPROTECTED**.
- **Implementation & Verification (S1 — COMPLETED OFFLINE):**
  - In `patientController.js:85`, signed `sub: String(patient._id)`.
  - In `authController.js:454` (login) and `686` (verifyOTP), set `subId = modelName === 'Patient' ? String(user._id) : (user.doctorId || user.nic || user.regNo || user._id)`, and removed `tokenPayload.nic = user.nic;`.
  - In `authController.js:1924` (refreshToken), removed `if (decoded.nic) tokenPayload.nic = decoded.nic;`. Copies safe `decoded.sub` and drops `nic`.
  - In `patientController.js:140-151` (`resolveAuthenticatedPatientNic`), MongoDB query `Patient.findById(reqUser.id).select('nic')` preserves 100% reliable patient NIC resolution when `sub === id`.
  - Protected file `server/src/middleware/auth.js:93` preserved 100% untouched.
  - Doctors, hospitals, pharmacies, and admins retain their existing `subId` identifiers.
  - Unit test `server/tests/jwt-patient-nic-removal-s1.test.js` verifies across registration, login, verifyOTP, and refresh that no token contains any claim matching Sri Lankan NIC patterns (`/^([0-9]{9}[vxVX]|[0-9]{12})$/`), `nic` claim is undefined, and doctor credentials retain `doctorId`. 6/6 PASS. All 31 tests in `tests/universityPatientProfile.test.js` PASS.
- **Acceptance:** No token issued contains raw NIC under `sub` or `nic`; existing patient profile, consent, and consultation flows remain 100% operational. Active tokens in circulation will clear on expiration (15m).

### S2 — No limiter on registration (Medium)
- **Where:** `hospitalRoutes.js:14`, `patientRoutes.js:16`, `pharmacyRoutes.js:15` — `router.post('/register', …)` with no limiter, while `/login` uses `loginLimiter`.
- **Risk:** account-creation spam, email-sending abuse if registration sends mail, blind-index enumeration.
- **Fix:** apply the existing `loginLimiter` (or a dedicated `registerLimiter`, e.g. 5 per hour per IP).

### S3 — Auth limiter disabled outside production (Medium)
- **Where:** `server/src/app.js:303-309` — `skip: () => process.env.NODE_ENV !== 'production'`.
- **Risk:** if Render does not set `NODE_ENV=production`, the global auth limiter is off.
- **Fix:** operator confirms the Render value (OPERATOR_ACTIONS). Optionally invert the default: skip only when `NODE_ENV === 'test'`.

### S4 — Login results logged to stdout (Medium)
- **Where:** `authController.js:496, 498, 739, 741`; `pharmacyController.js:270, 283`.
- **Risk:** Render logs retain role, device model and notification result objects; if the result object includes the recipient address it is personal data in logs.
- **Fix:** route through the existing logger at `debug` level and log only status codes/counts. Cleanup plan already bans `console.log` in shipped code.

### S5 — Public listing endpoints without limiter (Low–Medium)
- **Where:** `publicRoutes.js:14-16, 19`; `reviewRoutes.js:8`.
- **Risk:** scraping of doctor/hospital/pharmacy directories; cheap DoS on Render free tier.
- **Fix:** apply existing `publicLimiter`. Confirm the DTOs return no email, phone or NIC (masking commits may already ensure this — re-verify).

### S6 — Unauthenticated lab status (Medium, needs review)
- **Where:** `labRoutes.js:50` — `GET /public/:labTestId/status`.
- **Risk:** if `labTestId` is guessable (sequential or short) the endpoint confirms the existence/status of a patient's test.
- **Fix:** confirm the response contains status only and that IDs are unguessable (ObjectId or random). If not, require auth or a signed status token.

### S7 — Internal key design (Low)
- **Where:** `server/src/utils/internalAuth.js` — HMAC of the current/previous UTC hour with `INTERNAL_API_KEY`.
- **Risk:** a captured header is valid for up to two hours. Acceptable for server-to-server on HTTPS; note for viva.
- **Fix (optional):** include method + path + body hash in the HMAC; compare with `crypto.timingSafeEqual` (confirm it already does).

### S8 — Dependency audit (Unknown)
- Not run: `npm audit` needs the registry. Run `npm audit --omit=dev` in `server/` and `client/`, and `pip-audit -r ml-engine/requirements.txt`, on a networked machine. Record each finding with decision: fix / accept (reason) / not reachable.

### S9 — Secret history (Unknown)
- A repository scan on 3 Nov recorded 158 historical findings (not triaged here). Re-run the existing `scripts/scan_diff_secrets.js` or gitleaks on a networked machine; do not print matches. Any confirmed live secret → operator rotates (Atlas user, Redis, JWT secrets, Resend/Brevo keys, `INTERNAL_API_KEY`). History is not rewritten (V3 §3.4).
- Untracked `ml-engine/.env` (116 bytes) and `server/.env` exist locally; confirm both are git-ignored (`git check-ignore -v`).

### S10 — Test OTP harness (Medium, scheduled)
- Present by design for Stage E. Removal plan in `DEMO_DATA_REMOVAL_PLAN.md` §5. After removal the operator unsets `TEST_OTP_ENABLED` / `TEST_OTP_CODE` and rotates the five test-account passwords.

### S11 — Permissions-Policy wildcard (Low)
- **Where:** `app.js` — `ch-ua-model=*, ch-ua-platform=*, …`.
- **Fix:** restrict to `self` unless a third-party origin needs client hints.

---

## 3. Route inventory (static)

179 `router.<method>(` declarations found in `server/src/routes/`. Routes **without** a visible guard on the declaration line:

| Route | Intended? | Note |
|-------|-----------|------|
| `POST /api/alerts/trigger` | Yes | Internal HMAC in controller |
| `POST /api/{hospital,patient,pharmacy}/register` | Yes (public) | Add limiter — S2 |
| `POST /api/{hospital,patient,pharmacy}/login` | Yes | `loginLimiter` present |
| `POST /api/pharmacy/change-first-password` | Review | Has `loginLimiter`; confirm it requires a one-time token |
| `GET /api/lab/public/:labTestId/status` | Review | S6 |
| `GET /api/public/*` | Yes | Limiter on 2 of 6 — S5 |
| `GET /api/reviews/:targetId` | Yes | S5 |
| `/api/qa/*` | QA only | Mounted only when `qaMode` |

Per-route ownership checks (patient owns record / consent token present) need a controller-by-controller read; planned for Stage B with the test matrix W-sec rows. Router-level `router.use(protect(...))` may cover some routes not caught by this line-based scan.

---

## 4. Operator actions (copy to `docs/agent-work/OPERATOR_ACTIONS.md`)

1. Confirm `NODE_ENV=production` on the Render backend (S3).
2. After the networked secret scan, rotate any confirmed exposed secret (S9).
3. After Stage E and harness removal: unset `TEST_OTP_ENABLED`, `TEST_OTP_CODE`; rotate the five test passwords (S10).

---

## 5. What this audit does not claim

No live behaviour was tested. No CVE status is known. "No finding" for an area means "not inspected in this pass", not "secure".
