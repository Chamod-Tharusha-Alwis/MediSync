# MediSync synthetic-only release smoke test

This is an operator checklist, not a record of a completed deployment. Every result below is **expected**, pending a captured run. Real-patient clinical production remains NO-GO. Follow `GATE3_OPERATOR_RUNBOOK.md` for preparation, merge/deployment sequencing and rollback; this checklist does not authorize any of those operations.

## Before the smoke test

- Record the merged Git SHA and the actual Vercel, backend Render and ML Render deployment IDs/SHAs. All three must identify the intended release. Old commit `64abeaa` cannot validate the new health endpoints or operator-key startup policy.
- Check ML `/health`, then backend `/health`, after the new deployments finish. Record actual status/body and source deployment identity; a not-found response from old code is not a new-release health failure or a readiness pass.
- Use only the operator-provisioned synthetic records in `medisync_prod`. Do not use operational database `test`, real patient data or unrelated records.
- Use separately provisioned passwords; never put passwords, tokens, connection strings or clinical records in screenshots, logs or this document.
- Open a fresh browser profile for each role. The newly provisioned accounts default to `twoFactorEnabled: false`; ordinary password login is the smoke path. There is no OTP-entry step in this checklist. If authentication requires an unavailable factor, stop and investigate the account/device state; do not bypass it.
- Default `*.synth@medisync.synthetic` addresses cannot receive email. Do not enable email-dependent authentication on them. Existing records skipped by bootstrap must have their state verified separately; bootstrap does not reset existing accounts.

## Checklist

Default synthetic identifiers (only after separately approved bootstrap and key-consistency verification; existence/login NOT VERIFIED):

| Role | Identifier | Login URL |
|---|---|---|
| Super-admin | admin.synth@medisync.synthetic | https://medisync.chamodtharusha.com.lk/admin/login |
| Doctor, personal login | doctor.synth@medisync.synthetic | https://medisync.chamodtharusha.com.lk/doctor/login |
| Patient | patient.synth@medisync.synthetic | https://medisync.chamodtharusha.com.lk/patient/login |
| Pharmacist | pharmacist.synth@medisync.synthetic | https://medisync.chamodtharusha.com.lk/pharmacy/login |
| Hospital administrator | hospital.synth@medisync.synthetic | https://medisync.chamodtharusha.com.lk/hospital/login |

No passwords. BOOTSTRAP_*_EMAIL overrides require the reviewed actual identifiers. Synthetic mailboxes cannot receive mail. PHARM-SYNTH-001 is an organization identifier, not the Pharmacist's login. Never use the old .local examples.

Record PASS/FAIL/BLOCKED and a sanitized captured-run reference for each row. Browser rendering alone does not prove database persistence or atomicity.

| Check | Operator action | Expected result | Actual result / captured run |
|---|---|---|---|
| Five-role login | Use `/admin/login`, `/doctor/login`, `/patient/login`, `/pharmacy/login` and `/hospital/login` with the five provisioned identities; sign out between roles. | Expected: each correct role dashboard opens, protected session behavior is valid, no credentials or tokens appear in logs. | NOT RUN |
| Role protection | While signed in as the Patient, navigate to an Admin-only page and inspect the corresponding API denial without changing records. Repeat a relevant cross-role denial. | Expected: access denied; no protected data disclosed and no mutation. | NOT RUN |
| Symptom/reference tools | Use the actual symptom-checker control in the application with synthetic symptoms. | Expected: a bounded, valid ML response or an honest unavailable/error state; no unsupported diagnosis/safety claim. A prediction is not clinical validation. | NOT RUN |
| Public health | Open `/public-health` and the public directories `/doctors`, `/hospitals`, `/pharmacies`. | Expected: map/reference views and permitted synthetic directory entries render; provider/network errors are visible and handled. Data provenance must match the release scope. | NOT RUN |
| Languages and layout | Switch EN/SI/TA on desktop and a narrow mobile viewport; use keyboard navigation. | Expected: navigation, prototype notice, principal workflow labels and disabled-export explanation translate; no overflow blocks actions or focus. | NOT RUN |
| Consultation/prescription | Within the explicitly authorized synthetic scope, create one Doctor consultation/prescription for the owned Patient and view it as that Patient. Record only sanitized run-owned IDs. | Expected: the authorized record is persisted once and only the intended Patient can access it. Persistence requires actual server/DB evidence. | NOT RUN |
| Dispensing/retry | Dispense that owned prescription as Pharmacist, then repeat the same intended retry using the supported idempotency path. | Expected: one logical dispense, correct stock decrement, receipt and no duplicate effect. Do not infer this from a success toast. | NOT RUN |
| Laboratory view | View the provisioned owned laboratory record from the relevant Hospital/Patient workflow. | Expected: authorized details render with correct linkage; foreign-role/foreign-record access is denied. Do not upload files or create additional records outside the approved scope. | NOT RUN |
| PDF/export contract | Inspect disabled export controls in EN/SI/TA. Do not call PDF delivery endpoints under this checklist. | Expected from actual source: prescription generation hits `SECURITY_HOLD` and its catch returns HTTP **500** `{"error":"Failed to generate PDF"}` (`server/src/controllers/prescriptionController.js:123-125`; `server/src/utils/pdfGenerator.js:306-307`). Patient/doctor lab downloads return HTTP **503** with `{"message":"Stored laboratory report unavailable"}` for no report path, or `{"message":"Lab report unavailable. Please try again later."}` for storage failure; their outer catches return 500 (`server/src/controllers/labController.js:1052-1075,1264-1287`). Authorized stored lab PDFs can still be delivered when retrieval succeeds; disabled UI is not a universal API hold. No uniform `PDF_EXPORT_UNAVAILABLE` response exists. PDF delivery requires separate review/authorization. | NOT RUN |
| Session expiry/logout | Log out, revisit a protected page and retry the old authenticated request without publishing its token. | Expected: the old session cannot continue authorized access; expiry/logout errors are handled visibly. | NOT RUN |

## Email-dependent features

Real deliverable, operator-controlled addresses and an independently verified sender/provider configuration are required to test email OTP/2FA, password reset/recovery, invitations, email verification, temporary-password delivery, patient-record consent/access OTP, laboratory consent/report-access OTP, consent/access-request mail, laboratory availability notices, appointment reminders, prescription/dispensing notifications and security/login alerts. These are **BLOCKED for default synthetic mailboxes**; successful password login does not verify mail delivery. A revoked-device challenge may also require email; do not weaken the challenge to complete a smoke test.

## Stop and rollback

Stop on unauthorized access, real data exposure, duplicate mutations, schema/admission failures or source/deployment mismatch. Suspend the Render services and select the previously verified Vercel deployment as described in the operator runbook. Do not assume old Render code is a safe rollback or promise an unmeasured recovery time. Do not drop/restore a database or deactivate/delete accounts without the separately reviewed scope. Preserve evidence first; never touch `test` during rollback.
