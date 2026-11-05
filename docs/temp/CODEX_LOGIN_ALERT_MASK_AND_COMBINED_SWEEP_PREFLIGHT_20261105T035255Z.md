# Login-alert body masking and combined-sweep preflight

Source gate at 2026-11-05T03:52:55.836361+00:00; baseHEAD a0e56e67e8c5e2ba4636c447ee34627231f7de35. No real identifiers or credentials inspected. New tests use synthetic fixtures and an inert capture transport;0provider requests,0logins,0directAtlas/Redis connections. No data/storage/key changes.

## Body-only change

`server/src/utils/emailService.js` adds one pure helper import and replaces only the rendered Identifier interpolation with HTML-escaped masked output. Recipient `to`, name, device, subject, timestamp, stored fields and existing maskEmail/sanitizeErrorForLog remain unchanged. National IDs in either accepted format keep first4/last3 and mask the intervening characters. Email identifiers show first Unicode character + three stars + full domain. Staff/doctor/hospital/pharmacy registration identifiers keep at most3prefix/2suffix characters; short, missing, non-string or malformed-email input is fully hidden. This is a display helper, never an authentication/lookup/storage input.

`server/tests/loginAlertIdentifierMasking.test.js`:45new checks cover new/oldV/oldX national ID formats, email, doctor ID, hospital/pharmacy registration and staff ID, EN/SI/TA actual rendered mail, unchanged recipients, no attachments, escaped HTML edges, malformed/short input, Unicode and unchanged existing log masking. Focused masking+SriLanka-time suites79PASS/0FAIL,exit0. Initial fixture run30FAIL/49PASS exposed four incorrect expected star counts, a destination rejected by the existing .invalid-address guard, and an incorrect expected legacy log mask. Corrected fixtures use the synthetic .local capture address; recipient validation/log masking were not changed.

Full offline gate:2953PASS/0FAIL/0SKIP,exit0,sourceFrozen=true,15pins intact (`scratch/clinical-offline-vApLio/summary.json`). +45checks from2908baseline; backend2279/client536/emailPDF31/MLscoring40/isolatedFlask27/root40. LocalNodev26.4.0; CI requiresNode24. Client buildexit0,116modules/demoImported=false,existingwarnings only. Syntax checks and diff whitespace gate exit0. Exact source binding: `docs/temp/CODEX_LOGIN_ALERT_IDENTIFIER_MASK_OFFLINE_20261105T035255Z.json`.

## Combined live sweep: not started

The operator authorized one login/logout per role after deployment, but supplied only [N] email-count placeholders. Actual current Resend/Brevo/combined counts are required before any login; cap25. Do not reuse the closed prior-day7count or existing consumed attempt markers. No new attempt marker has been created. Future login-alert sent counts and body masking must be confirmed by the operator; HTTP200 alone does not prove delivery.

| Requested check | Current admission/limitation |
| --- | --- |
| Admin/patient/doctor/hospital/pharmacy dashboard, console, notification transport | Authorized after deployment and actual current email counts; one login/logout each, exact-path authenticated socket control frames only. Not run. |
| Admin ML status/category | Endpoint may honestly be available or unavailable; never fabricate an outage or force a failure to obtain a log. Read actual200DTO; operator supplies fixed log category when a failure occurs. |
| Initial consultation wizard | Source mount initializes local state only, with empty prescriptions and no patient access; no automatic server command on opening. No live assertion yet. |
| Lab dropdown in real clinical wizard | BLOCKED under current no-OTP scope. NewConsultation searchPatient opens PatientAccessModal; modal mount automatically POSTs /patient/request-access (`PatientAccessModal.jsx:37,62`), creating an OTP request/email. Later steps require an authorized patient token (`usePatientConsent.js`). Do not inject a grant, fake an API response or bypass the gate. No patient identifier read or used. |
| Drug search | GET /api/drugs/search is a read, but the actual medication selector is behind the same patient-consent wizard. UI coverage not established by a direct API query. |
| Interaction warning | Actual UI invokes POST /api/drugs/interactions (`DrugSearchInput.jsx:223`, `NewConsultation.jsx:276`). Handler reads Drug.find and computes reference warnings (`drugController.js:207-232`), but this POST is outside the approved existing session/notification allowlist. Keep denied; no silent allowlist expansion. |
| Lighthouse accessibility main pages | Package/CLI absent in repository/global/knownQA locations; no dependencies installed. Do not substitute a DOM/axe check or login-page score for authenticated Lighthouse. Tooling/access method must be resolved before claiming this check. |

No seeded data, patient-lookup values, OTP submission, clinical save, dispense, ingest, trigger, seed, cache clearing or ML data alteration is authorized. Clinical realE2E remains2/14. Screenshots, if later authorized, remain outside repo and OneDrive. Report any unexecuted check BLOCKED/NOT_VERIFIED, never PASS.
