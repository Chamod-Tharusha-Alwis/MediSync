# Patient authorization hotfix — 6 November 2026

## Scope and baseline

The operator's production-hotfix attachment supersedes the earlier docs-only
scope for this run. Work starts at main/origin/main
`c5434228635254423f011f49b1e1e983201aee3d`, then proceeds on
`hotfix/patient-auth`. No direct push to main, protected-file edit, live database
connection, email-code edit, seed, detector, Redis operation or data repair.

The exact eight requested commits (`e1dc51b`, `f367702`, `f773227`, `e123b82`,
`8375a54`, `bdf12a7`, `ae65fb7`, `5861452`) are ancestors of fetched origin/main
(each merge-base command exit 0). S1 is in PR #10 merge `a25098d` but not that
merge's first parent (ancestor exits 0 and 1 respectively). PR #11 `c543422`
therefore inherited S1; it did not first introduce it.

Actual local baseline `node scripts/run_offline_tests.js`: **3,322 PASS, 0 FAIL**,
all seven profiles, source frozen, 15/15 pins, `notRun: []`.
Receipt: `scratch/clinical-offline-mwsP3d/summary.json`; console:
`scratch/CODEX_PATIENT_HOTFIX_BASELINE_20261106.log`.

| Profile | PASS | FAIL |
| --- | ---: | ---: |
| backend | 2,532 | 0 |
| client | 641 | 0 |
| email-pdf | 31 | 0 |
| ml-scoring | 40 | 0 |
| ml-flask | 31 | 0 |
| root lifecycle | 40 | 0 |
| ml-status-contract | 7 | 0 |

GitHub current-main required checks both succeeded:
[Clinical](https://github.com/Chamod-Tharusha-Alwis/MediSync/actions/runs/42173290923),
[Security](https://github.com/Chamod-Tharusha-Alwis/MediSync/actions/runs/42173290942).
Last ten returned main runs all succeeded. A separate design-review check is
neutral, not a test PASS. The only returned existing open PR was #4, unrelated.
The reported 52 security/quality alerts and severity inventory are **NOT VERIFIED**:
the connector disallows the code-scanning read, and public REST returns 401.
Classic branch protection read returns 403; an empty ruleset list does not prove
protection absent. No secrets or secret-scanning values were retrieved.

Read-only Vercel metadata: existing `medi-sync` Production is READY at `c543422`,
deployment `dpl_9NzG2f1s6Ne68UnBjiZcxNTbjABY`. Render deployment identity, backend
error logs and post-deploy 4xx/5xx counts are **NOT VERIFIED**: no authenticated
Render connector/log surface is available. No absence-of-logs inference is made.

## Confirmed cause

This is a client/API identity-contract regression, not a failed canonical JWT
guard. The real login returns the stable patient account ID as `subId` and the
NIC separately (`server/src/controllers/authController.js:461,524-525`); OTP
completion follows the same contract (`:685,758-759`). Before this fix,
`client/src/pages/patient/Login.jsx:27,37` discarded the latter and stored the
account ID as `localStorage.nic`. The dashboard uses that value in profile and
timeline URLs (`client/src/pages/patient/Dashboard.jsx:380,388-389`).

The first server denials are the NIC-format checks at
`server/src/controllers/patientController.js:161,364-365,492-493`. They occur
before its existing compatible resolver, which already loads the patient's
stored NIC by authenticated account ID (`:140-150`). Therefore an ID-only JWT
with the correct owner-NIC URL already works. The incident requires reproducing
the actual client-generated account-ID URL; changing token assertions alone
cannot prove the real page flow.

## Narrow repair

- Patient login/OTP completion consumes response `nic`, with the stable ID as a
  fallback. JWT claims, recipients, cookies and authentication traffic unchanged.
- `server/src/middleware/patientRouteIdentity.js` resolves only a patient-role
  path ID equal to the authenticated account ID. It checks the returned account
  ID and stored NIC, then leaves all existing downstream checks in place.
- The adapter runs **after** actual authentication/account checks in patient,
  prescription alias and test-order routes. Other roles/NIC paths are unchanged.
  Other patient ID is 403; absent owner 404; incompatible identity/store failure
  503. No patient-controlled ID becomes a general lookup permission.
- S1 stays enabled: no NIC restored to token claims. No protected file changed.

## Regression design and measured red evidence

New backend tests run actual routers, canonical auth, verified account checks,
controllers, bcrypt and JWT. Repository/provider boundaries are inert; real
login, OTP completion and refresh issue the tested tokens. They test owner-NIC
and actual account-ID URLs separately, plus other-patient/RBAC/no-token/expiry/
revocation/ban negatives. No live lockout or provider operation.

Original router red: **8 PASS / 6 FAIL**, exit 1, with owner account-ID requests
returning 403 instead of 200; owner-NIC requests pass. Receipt:
`scratch/CODEX_PATIENT_ROUTE_RED_0SiJKf/results.json`. Earlier fixture-setup
failures are retained separately and do not count as the reproduced incident.

Real client login/OTP red: **4 PASS / 2 FAIL**. After the small client change,
new identity tests plus existing submission locks: **21 PASS / 0 FAIL**, exit 0.
Final integrated local gate: **3,349 PASS / 0 FAIL / 0 SKIP**, all seven profiles,
15/15 protected pins, source frozen, `notRun: []`, exit 0. Receipt:
`scratch/clinical-offline-wXZ5ap/summary.json` and
`scratch/CODEX_PATIENT_HOTFIX_GATE_R2_20261106.log`. Profiles: backend 2,553,
client 647, email-pdf 31, ML scoring 40, ML Flask 31, lifecycle 40, ML status 7.

First full candidate run retained **3,348 PASS / 1 FAIL**, exit 1, in
`scratch/clinical-offline-xkW4Hn`. Existing consent-route inventory harness
`agentBEndpointAdmission.test.js` rejected the newly imported adapter before its
assertions. Its allowlist now imports the real pure adapter; all role assertions
remain unchanged. No guard was weakened to obtain green.

Strict local client build exit 0, clinical-production, 118 reachable modules,
no demo import: `scratch/CODEX_PATIENT_HOTFIX_BUILD_sSjtrU/build-result.json`.
Repository diff scanner returned 232 heuristic findings across its historical
release-branch-to-HEAD scope; it is not a current-candidate-only or history-clean
proof. Findings are reported without values; secret history remains NOT VERIFIED.
New candidate tests use only synthetic credentials, with inert provider tripwires.

PR/CI/deployment and live results remain pending at this checkpoint; no clinical
acceptance is inferred from mocks or a successful build.

## Other patient surfaces — static trace, not live PASS

| Surface | Contract evidence |
| --- | --- |
| Profile/timeline/prescriptions and legacy profile PUT | NIC route guards above; new adapter supports only the same authenticated ID. |
| Self-service profile PUT | Patient by authenticated ID, patientController `:825-830`. |
| Consultation rating/report | Stored NIC plus consultation owner (`:549-554`); patient by ID (`:796`). |
| Lab list/OTP/report access | Stored patient resolver `labController.js:55-68`, list `:850-853`, OTP `:873-887`, report ownership `:988-990`. No OTP/report executed. |
| Prescription PDF | Stored patient ID lookup `prescriptionController.js:52`, NIC and patientId checks `:80`; hold remains. No PDF executed. |
| Test-order patient reads | `testController.js:57-68`; adapter handles same-owner ID URLs. |
| Support/reviews | `supportController.js:25,42`, `reviewService.js:11-18`: stable authenticated ID. |
| Clinician patient-consent token | `patientConsentService.js:5-13`: actor ID plus separate consent token, not patient-login sub. Patient callers remain role-denied. |

`server/src/app.js:204` already sets trust proxy to 1. No speculative proxy patch.

## Remaining gated work

No live patient login has run. Fresh operator remaining quotas were Resend 99/100
and Brevo 300/300: combined sent 1. Stop threshold 50 of the approved 60/day cap;
reserve two per login, maximum three patient attempts. No admin login,
live lockout, OTP, clinical save, dispense or write probe is permitted.

U18 baseline warnings occur in five existing tests: drug-search-stress,
drug-search-input, drug-search-dropdown-u1, website-notifications and
pharmacy-profile-modal-accessibility. App/history recovery logs are explicitly
asserted by `app-recovery-states.test.jsx:47` and
`history-recovery-privacy.test.jsx:15`; do not remove asserted behavior or change
those assertions without the requested review. Phase 4 starts only after the
hotfix is live/green. Security-alert triage needs scoped read access or sanitized
rule/severity/path evidence. No new clinical group acceptance; historical 2/14.
