# MediSync — Online Test Plan

> **Current operator override — no live execution.** This is a future plan only.
> No login, email, endpoint call, Atlas/Redis read/write, ingest, seed, trigger or
> cache clear is authorized. No code, test, guard or harness change is permitted
> outside `docs/new/`. Uncited imported outcomes remain NOT VERIFIED. Read
> `TRACKER_RECONCILIATION.md` and
> `MEDISYNC_MASTER_PROMPT_V3_ADDENDUM_ANTIGRAVITY.md` before using any steps below.
> The old standing approval and email budget do not apply. S1–S8 are unexecuted
> proposals; the N=5 plus two complete elevated-day rule needs operator approval.

Stage A planning document. Created: 2026-11-05 (Antigravity no-network, branch `antigravity/stage-a`)

Covers future V3 §9 planning. There is no standing live approval in this task.

---

## Accounts and sessions

| Role | Account | Email | NIC (masked) |
|------|---------|-------|-------------|
| Admin | admin test account | operator-controlled | — |
| Doctor | doctor test account | operator-controlled | — |
| Patient | patient test account | operator-controlled | NIC in TEST_CREDENTIALS.local.md |
| Hospital | hospital test account | operator-controlled | — |
| Pharmacy | pharmacy test account | operator-controlled | — |
| Public | unauthenticated | none | — |

No credential source is read or qualified in this task. Any future credential
mechanism, single-login budget and session scope must be explicitly approved;
this plan must not cause credentials or identifiers to be copied into documents.

---

## Runner

The previously suggested `full-function-live` mode is **NOT VERIFIED** and was
not added. No new tooling is authorized. Current verification tools are the
existing `scripts/run_offline_tests.js`, its protected-hash check against
`docs/release/PROTECTED_HASHES.json`, and the app's actual NIC-format validator at
`server/src/controllers/patientController.js:45-47`.

**Proposed future request scope — NOT currently allowed:**
- All `GET` requests to known application API paths.
- `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/verify-otp`.
- `POST /api/doctor/consultations` (create consultation with seeded patient data).
- `POST /api/lab/hospital/request-otp` (one per test run).
- `GET /api/pharmacy/prescriptions/pending/:nic`.
- `POST /api/pharmacy/dispense` (against seeded prescription).
- Other write endpoints defined explicitly in the plan below.

**Blocked in `full-function-live`:**
- Class X endpoints: delete, ban, reset, trigger outbreak, cache-clear.
- Seed/ingest/ML-write endpoints.
- Any host that is not `medisync-wabc.onrender.com` or `medisync-ml.onrender.com`.
- Any method/path not listed in this plan.

Any later live scope needs separate review of the actual existing guard. The
lists above do not enable requests, relax consent or authorize new tooling.

---

## Email cost table

| Test flow | Emails | Recipient |
|-----------|--------|-----------|
| Login × 5 roles | 5 | Each role's registered email (operator-controlled) |
| Patient consent OTP (hospital lab test) | 1 | Patient email |
| Doctor lab report download OTP | 1 | Doctor email |
| Patient lab report download OTP (after U4) | 1 | Patient email |
| Password reset (1 role only) | 1 | That role's email |
| Outbreak notifications (passive) | 0–3 | Admin/hospital in-app only; no email |
| **Total per full Stage E run** | **~9–12** | |

**Current rule:** no live login or email. The last operator-confirmed count was
8 combined of a 25-email cap; it is not a fresh dashboard count. No remaining
budget is granted by this document. Cost estimates above are NOT VERIFIED for
the proposed future flows; obtain fresh numeric totals and explicit scope before
any future email-producing phase. Do not apply the older 60/50 proposal.

---

## Coverage matrix: TEST_MATRIX.md classes

| Class | Description | Mode |
|-------|-------------|------|
| R (560 rows) | Read-only flows | `full-function-live` |
| W-low (78) | Low-risk writes (consultation notes, settings) | `full-function-live` |
| W-clin (41) | Clinical writes (consultation, prescription, dispense) | `full-function-live` |
| W-sec (99) | Security writes (password, OTP, session) | `full-function-live` |
| W-adm (37) | Admin writes (broadcast, approve, suspend) | `full-function-live` |
| X (31) | Destructive (delete, ban, cache-clear, trigger) | Offline only |

---

## Per-role test coverage

### Public (unauthenticated)

| Page | Languages | Viewports | Checks |
|------|-----------|-----------|--------|
| Home / landing | EN, SI, TA | 320, 375, 1440 | Renders; no demo banners; nav works |
| Public Health v2 | EN, SI, TA | 320, 375, 1440 | Cases correct from seeded data; map shows risk tiers; forecast present or "insufficient data" |
| Consultation activity tab | EN, SI, TA | 375, 1440 | Recorded visits show; no old health-stats 503 |
| Unknown route (404) | EN, SI, TA | 375 | Trilingual recovery page renders |
| Select Role page | EN | 375, 1440 | All 5 role login links present |

### Patient

| Flow | Checks |
|------|--------|
| Login + OTP | 200; dashboard loads; no demo banners |
| Medical timeline | Consultations listed; dates in IST; PDF download button present (after U4) |
| PDF download | Valid token; PDF downloads with correct content; audit log entry |
| Prescription status | Pending/dispensed status correct |
| Settings / password | Strength bar visible (U3); change password → 200 |
| Logout | 200; session cleared |

### Doctor

| Flow | Checks |
|------|--------|
| Login + OTP | 200; dashboard loads |
| New consultation (seeded patient) | AI suggestion loads or cold-start retry shown; no duplicate safety alerts (U2); medication search dropdown above table (U1); lab order does not fire OTP on mount (U6) |
| Save consultation | 201; prescription created; no 409 |
| View past consultation | History tab shows new record |
| Outbreak banner | Visible if patient's district has active alert (S1) |
| Logout | 200 |

### Hospital

| Flow | Checks |
|------|--------|
| Login | 200; lab queue page loads |
| "Send Verification OTP" button | Shows localized text (not raw `{t(...)}`) (U5) |
| Lab test OTP request | Exactly 1 OTP email; no 429 (U6 fix) |
| Verify OTP → register lab test | 200; test order created |
| Upload result | 200; result stored |
| Outbreak banner | Visible if hospital's district has active alert |
| Notification dropdown | No left-edge clip (U8) |
| Logout | 200 |

### Pharmacy

| Flow | Checks |
|------|--------|
| Login | 200; dashboard loads |
| Lookup pending prescriptions by NIC | 200; no 403 in console (U7) |
| Grouped prescription view | Medications grouped by consultation (U9); no inventory prompt (U10) |
| Dispense | Record created; no inventory selection required (U10) |
| OTC walk-in dispense | Record created without prescription ID |
| District demand page (U11) | Most-sold medications listed from seeded data; district capitalized (U19) |
| Analytics — time ranges (U12) | All 8 ranges selectable; counts correct |
| Logout | 200 |

### Admin

| Flow | Checks |
|------|--------|
| Login | 200; overview loads |
| Overview health chips | 4 real checks shown (MongoDB, Redis, Email, ML) (U16) |
| Users list | Single list with role filter; no toggle (U13); hospital accounts visible |
| User detail panel | Opens on row click; sessions, devices, security events shown (U14) |
| Outbreak Monitor | Alerts for S1–S6 visible; S7/S8 not alerted |
| Broadcast | Send a broadcast; confirm in notification log |
| Session monitor | Active sessions listed |
| Ban management | Ban list visible (view only — Class X, no action) |
| Support tickets | Queue visible |
| Admin accounts | List visible |
| Nav: no "ML Alerts" item (U15) | Absent from nav |
| Nav: no "Identity" item (U14) | Absent from nav |
| Logout | 200 |

---

## Outbreak oracle (Stage E)

After seeding is confirmed:

1. Run detection: `POST /api/admin/outbreak/detect` (admin auth).
2. Query `OutbreakAlert` collection; verify S1–S8 results match expectations from `SEED_DATA_PLAN.md`.
3. Check public health page renders alerts correctly.
4. Verify S8 (single-day spike) produces NO alert.

---

## Accessibility checks

| Check | Tool | Threshold |
|-------|------|-----------|
| Colour contrast | axe-core (Playwright inject) | WCAG AA |
| Font size | Manual + U22 audit | ≥ 11 px for labels, ≥ 12 px for body |
| Keyboard navigation | Manual Playwright | All interactive elements reachable by Tab |
| Screen reader labels | axe-core | No critical/serious violations |
| Lighthouse | Only if operator allows local install | ≥ 90 performance, ≥ 90 accessibility |

---

## Cold-start behavior

Render free tier services sleep after inactivity. For each service:
- Backend: ping `GET /health`; wait up to 50 s for 200 before starting tests.
- ML: ping `GET https://medisync-ml.onrender.com/health`; wait up to 60 s.
- Document cold-start duration in evidence.

---

## Console and network error scan

For every page visit:
- Collect all `console.error` and `console.warn` messages.
- Collect all network requests returning 4xx or 5xx.
- Document: any new errors are defects; known guarded socket GETs (N currently) are noted.
- Fix any app-owned error before marking a page PASS.

---

## Sri Lanka time checks

| Check | Method |
|-------|--------|
| Emails show IST | Operator confirms received alert timestamp |
| Consultation timestamps | UI shows "YYYY-MM-DD HH:MM AM/PM IST" |
| Public health "data updated" label | Shows IST |
| Pharmacy analytics "this month" | Correct calendar month in IST |
| Day buckets in charts | Labelled with IST dates |

---

## Evidence recording

Per page and per flow:
- URL visited, role, language, viewport, result (PASS/FAIL/NOT_VERIFIED).
- Console errors (list each).
- Blocked requests (count and category).
- Email count after (cumulative total).
- Screenshots: saved outside repo and OneDrive (operator saves locally).

Update `FINAL_ACCEPTANCE_MATRIX.md` after every page — no blank cells at end of Stage E.

---

## User engagement quality notes

For each role, record:
- Number of clicks and page loads for the top 3 tasks.
- Any confusing text or missing feedback.
- Any screen that takes > 3 s on a standard connection.
- File as tracker items; fix in Stage F if minor, or as a new defect if blocking.

---

## FINAL_ACCEPTANCE_MATRIX.md structure

| Feature | Role | Language | Viewport | Result | Evidence | Email count |
|---------|------|----------|----------|--------|----------|-------------|
| Public health v2 | Public | EN | 1440 | — | — | — |
| Public health v2 | Public | SI | 375 | — | — | — |
| ... | | | | | | |

One row per feature × role × language × viewport combination.
