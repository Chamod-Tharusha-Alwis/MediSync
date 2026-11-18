# 03 Validation inventory

Commit `f5337833` (main). Everything here was read from the code; nothing was executed against production.

**The full table of all 228 API routes** (method, path, role, middleware, handler, and the 4xx responses
found in each handler) is generated into **`03_validation_routes.md`** by
`node report-evidence/scripts/validation_inventory.cjs`. It also covers the Flask endpoints and the client
form attributes.

## Important correction: there are no Joi schemas

`joi@^18.1.2` is declared in `server/package.json`, but **no file under `server/src` imports it** (checked
with `git grep -nE "require\(['\"]joi['\"]\)|from ['\"]joi['\"]|\bJoi\." -- server/src`, which finds no match). The task asked for "Joi schema fields". The
honest answer is that validation is hand-written, in five layers. If the report says "Joi", change it
(DISCREPANCY V-1).

## The five validation layers

| Layer | Where | Rule | Failure |
|---|---|---|---|
| 1. Body size | `server/src/app.js:247` | `express.json({ limit: '1mb' })` | 413 from Express |
| 2. Operator injection | `server/src/app.js:266-299` | Removes any key that starts with `$` or contains `.` from body, query and params (MongoDB operator injection) | Key silently removed |
| 3. Route middleware | e.g. `server/src/utils/prescriptionDuration.js:3-21` (snippet S8) | `durationDays` must be a positive safe integer; the legacy `duration` field is rejected | 400 `INVALID_DURATION` |
| 4. Controller and service checks | e.g. `server/src/services/dispensingService.js:80-98` (`validateItems`) | 1 to 50 items; the medicine name is required; quantity is a positive whole number; partial status only in partial mode; idempotency key `^[A-Za-z0-9:_-]{8,128}$` | 400 `INVALID_ITEM`, `INVALID_QUANTITY`, `INVALID_IDEMPOTENCY_KEY`, `PARTIAL_DISPENSE_REQUIRES_REVIEW` |
| 5. Mongoose schemas | `server/src/models/*.js` | 98 `required: true` fields, 36 `enum`, 4 `min`, 3 `max`, 1 `maxlength` (counted with grep) | Save fails; the controller returns 400/500 |

## Representative field rules

| Input | Rule | File : line | Failure (status + code) |
|---|---|---|---|
| Sri Lankan NIC | `^(?:[0-9]{12}\|[0-9]{9}[VX])$` after trim and upper-case | `server/src/security/nicBlindIndex.js:6-7` | throws `NIC_FORMAT_INVALID` (the caller returns 400) |
| Password (new) | Strength score ≥ 3 before hashing | `server/src/utils/passwordUtils.js:45-56` | `PASSWORD_POLICY_REJECTED` |
| Login | Identifier and password required; 5 failures per 900 s | `server/src/controllers/authController.js:336-358`, `server/src/security/passwordAttemptPolicy.js:2` | 400 "Email/identifier and password are required", 401 "Invalid credentials", 429 "Too many password attempts" |
| OTP request / verify | 5 failed verifications → 15-minute lock (900 s); 60 s resend cooldown; 5 per account and 15 per IP per 15 minutes | `server/src/config/redis.js:309-337` | 429 `otp_attempts_locked` with `retryAfterSeconds: 900` |
| Prescription duration | `durationDays` positive integer | `server/src/utils/prescriptionDuration.js:7-8` | 400 `INVALID_DURATION` |
| Dispense items | see layer 4 | `server/src/services/dispensingService.js:80-98, 100-110` | 400 `INVALID_ITEM` / `INVALID_QUANTITY` / `INVALID_PATIENT` / `INVALID_PRESCRIPTION`; 409 `REPEAT_COURSE_ACTIVE`; 400 `ALREADY_DISPENSED` |
| Joint release (fix pack 3) | 2-20 medicines, one consultation, idempotency key required, no substitution | `server/src/services/dispensingService.js` (`dispenseSelection`) | 400 `INVALID_SELECTION`, `IDEMPOTENCY_KEY_REQUIRED`, `ALTERNATIVE_NOT_SUPPORTED` |
| Patient consent | Signed patient-access token bound to the requester, role, NIC and an unrevoked, unexpired OTP session | `server/src/services/patientConsentService.js:4-23` | 403 "Patient consent required" |
| Public health filters | Only `rangeDays`, `district`, `disease` query keys are allowed | `server/src/controllers/publicController.js` (`getHealthStats`) | 400 `INVALID_HEALTH_FILTER` |

## Flask ML service inputs (`ml-engine/app.py`)

| Endpoint | Check | Failure |
|---|---|---|
| `POST /api/ml/predict-disease` (line 526) | Body must be an object; `symptoms` must be a string or a list of strings (lines 532-538) | 400 `INVALID_SYMPTOMS`; an empty or missing list returns an empty prediction list |
| `POST /ingest` (726) | Tracking snapshot shape | 400 `INVALID_TRACKING_SNAPSHOT` |
| `POST /patient-risk` (1436) | Body required | 400 "Request body is required" / "Invalid risk request" |
| `POST /lab/encrypt-pdf`, `/lab/decrypt-pdf` (1667, 1710) | PDF file and password required | 400; 401 "Incorrect password" |
| `GET /api/internal/search-diseases` (1752) | Query string checked | 400 "Invalid disease query" |

The other Flask routes have no 4xx checks in their function bodies; the full list is in
`03_validation_routes.md`.

## Client-side checks

- The client uses HTML constraint attributes (`required`, `pattern`, `minLength`/`maxLength`, `min`/`max`,
  typed inputs) plus checks in event handlers before a request is sent. An example is the pharmacy screen's
  "Enter a positive whole quantity for every medicine." (`client/src/pages/pharmacy/Dashboard.jsx`). The
  per-file counts are in `03_validation_routes.md`.
- Client checks are only for convenience: every rule above is enforced again on the server.

## Five lines to say in the viva

1. "Every request goes through three server checks before business logic: a 1 MB body limit, removal of
   MongoDB operator keys, and the route's own middleware such as role checks and input rules."
2. "Validation is hand-written, close to the rule it protects. For example, a prescription without a
   positive whole-number duration is rejected with 400 INVALID_DURATION before the controller runs."
3. "Errors are machine-readable: each failure returns an HTTP status and a stable code, such as
   ALREADY_DISPENSED, REPEAT_COURSE_ACTIVE or INVALID_SYMPTOMS, so the UI can show a precise message."
4. "Brute force is limited at two levels: 5 wrong passwords in 15 minutes lock that login, and 5 wrong OTPs
   lock OTP requests for 15 minutes, with a 60-second resend cooldown."
5. "The client validates for convenience, but the server never trusts it; the same rules are enforced again
   on the API and in the Mongoose schemas."
