# MediSync live QA repair report

11 November 2026. Operator QA was reported against `5397953`. Findings and repairs below refer to the local candidate. No live retest is claimed.

| Blocker | Result | Evidence and remaining check |
| --- | --- | --- |
| B1. Consultation safety acknowledgment | FIXED OFFLINE | The original preview used lean active prescription rows and a different active-record query. The write path hydrated and filtered those rows before hashing. The consent-scoped preview and write now use the same medication reader, canonical analyzer and finding hash. See `prescriptionController.js:378`, `currentMedicationSafety.js:5`, and `consultationCommandService.js:40`. The focused tests compare a custom entry plus an active-medication interaction, require a valid reason and reject a tampered hash. The precise production failure instance still needs a controlled save. |
| B2. Empty stock selector | PARTIAL | The client called a missing inventory route. `pharmacyRoutes.js` now registers a verified staff route and `pharmacyController.js:962` scopes it to staff membership. The seed plan explicitly had empty inventory. The owner-run stock tool appends only missing items on manifest-owned pharmacies and preserves stock already present. |
| B3. OTC checkout fails | PARTIAL | The unconfigured stock hypothesis does not explain the reported generic failure. The old service skipped inventory when empty and swallowed failed decrements. The candidate enforces conditional stock updates when a checkout uses stock, distinguishes missing stock and reconciliation failures, and keeps existing transient/unknown-commit handling. `otcAtomicRetry.test.js` covers success, stock conflict, missing stock and replay. The live failure still needs a sanitized cause and a controlled test. |
| B4. PDF control and lab status | PARTIAL | The consultation button uses `REACT_APP_PDF_EXPORT_ENABLED`. Hospital ready/delivered rows now offer the stored-report action through the existing role and hospital-scoped endpoint. The endpoint authenticates stored bytes through `labReportStorage`. A delivered row shows the released label, while a ready row retains the release action. The seed already uses the canonical lab status vocabulary. The reported CBC row and original blob need owner-side verification. |
| B5. Audit search | PARTIAL | Email lookup covers all five account collections and maps IDs to the stored string type. The old aggregation grouped all events by actor and attempted ObjectId lookups for arbitrary actor IDs. The candidate returns event rows, filters account enrichment to ObjectIds and masks labels. Sessions use a 15-minute activity threshold. Historical event attribution and the exact zero-results incident remain unverified. |
| B6. Surveillance review queue | PARTIAL | The review APIs existed and the Outbreak Monitor had no queue. The candidate adds a panel with filters, selection, and reviewed confirm/reject actions. The real queue excludes synthetic data. The seeded ten rows cannot be used as production clinical-review fixtures under that policy. |
| B7. QR verification link | OWNER-ACTION | The operator tool creates one random 32-byte token and tracks only its digest and record ID. It prints the capability once after commit. The optional revoke action is restricted to a previous tool-minted link for the same owned encounter. The offline test resolves the token through the real public verification controller with a mocked store. The consultation PDF and summary paths already issue verification tokens. Token minting directly within consultation-save responses remains out of scope for this candidate. |
| B8. Patient account verification | OWNER-ACTION | The seeded markers are intentionally denied by `accountState.js:7`. `verifiedAuth.js:8–20` also denies invalid session identity, role, expiry and current account state. The real seed shapes for all five requested personas reproduce the production account denial even when activation/verification flags are present. No safe missing-flag update exists. The screenshot alone cannot distinguish account denial from session denial for the particular logged-in account. |

## Other reported items

| Item | Result | Evidence |
| --- | --- | --- |
| Public synthetic advisories | FIXED OFFLINE | `PublicHealth.jsx` previously generated advisories and severity bands from district totals whenever the active feed was empty. It now renders only the approved real feed, and an unavailable feed has its own state. Admin uses a separate verified endpoint for pending and active real alerts. Seeded S-A/S-D alerts are excluded from public reporting and require a separate synthetic admin rehearsal. |
| ICD label | FIXED OFFLINE | `publicHealthStats.js` maps the reported ICD code to its readable name. The public alert DTO uses the same catalogue label. |
| Drug catalogue coverage | FIXED OFFLINE | The referenced drug already exists in the curated resolver catalogue. The search controller now returns an exact curated reference match when the database has no usable row, with unverified limit status. |
| Consultation vitals | DOCUMENTED | Removed the unsupported structured-vitals step and flow diagram claim. |
| Duplicated warnings and encoded labels | PARTIAL | The consultation wizard has one review panel and the canonical preview loads decrypted medication names. Other surfaces using the legacy medication preview still need separate review. |
| Emergency advisory repetition | PARTIAL | The consultation wizard suppresses a duplicate advisory sentence when it exactly matches its title. Paraphrased repetition remains a content review item. |
| Unavailable doctor labels and unknown hospital district | OWNER-ACTION | The plan assigns doctor IDs and hospital districts. Production record linkage, populated projections and actual stored values were not verified. |
| Pending prescription directions | FIXED OFFLINE | The table read only nested medication fields. Single-drug records store directions at the prescription level. The table now reads the nested fields and falls back to the prescription fields. |
| Report-ready status and release action | PARTIAL | The ready and delivered actions are distinct in the hospital queue. The known seed statuses match the model enum. No manifest repair is proposed for a status already correct in the planner. |
| History filters | FIXED OFFLINE | Prescription and lab filters flatten the relevant nested items into their own cards. The consultation filter retains encounter cards. Existing navigation tests now assert record-specific rendering. |
| Sinhala and Tamil coverage | PARTIAL | The home hero, workflow headings, surveillance headings, and history filters use translated keys. The source audit measured 876 keys per locale and 870 of 876 values differ from English in each locale. The audit still flags 1,965 candidate positions. Language quality, remaining literals, and browser layout require review. |
| Audit actor labels and online sessions | PARTIAL | Masked labels and a 15-minute session query are implemented. Anonymous historical events cannot be attributed retroactively from the stored records alone. |

## Disproved hypotheses

- The seed does not omit the standard account activation flags. Its preserved synthetic marker is sufficient for the production denial.
- Empty stock alone cannot produce the original OTC generic transaction error. The original service allowed an empty array.
- Email lookup is implemented across all account collections and converts IDs to strings. The exact historical zero-row cause is unverified.
- The admin API is present. The missing element was the UI.
- The planned lab statuses already use the application's case-sensitive enum.
- The public advisory counts were not evidence of admin approval. The frontend fabricated notices from district case totals when the alert array was empty.
- The curated drug catalogue already has the reported reference. The search endpoint used only database rows.

## Production boundary

No production writes, login, provider sends or database connections were performed. The operator reports server export enabled. The existing RC4-128 generated-PDF path and identifier-derived passwords remain release risks. The owner runbook covers private, manifest-scoped operations and expected output. Production stays on its existing revision until the remaining release gates are met.

[Owner runbook](LIVE_QA_OWNER_RUNBOOK.md)

## Final offline verification

The final frozen run of `node scripts/run_offline_tests.js` exited 0 on Node 26.4.0 with **3,670 passed, 0 failed, 0 skipped across 228 test suites**. All seven profiles completed and the protected ledger matched 15/15. The receipt is in `%TEMP%/medisync-test-tmp/clinical-offline-KrDtEC/summary.json`.

| Profile | Passed |
| --- | ---: |
| Backend | 2,840 |
| Client | 666 |
| Email and PDF | 31 |
| ML scoring | 40 |
| Flask | 31 |
| Root lifecycle | 55 |
| ML status contract | 7 |
| ML status contract | 7 |

The isolated CRA production build exited 0 and emitted `index.html`. It used the repo's `agent_b_combined_boundary.cjs` and `agent_b_combined_child.cjs` build entry with inert URLs. Existing ESLint warnings remain. The build and output log were retained in the local temporary directory. `git diff --check` and the repair-document link checks passed.

Earlier gate attempts exposed the old UI test expectations, the overly broad curated drug fallback, and the five-minute limit for serial backend batches. The final candidate narrows the fallback to the confirmed reference and retains the regression coverage. The backend timeout is now ten minutes. A separate CLI run without a URI exited 1 for each of the verify, stock and mint commands, with a fixed sanitized category and no connection.

The candidate is uncommitted. HEAD is `5397953`. CI, deployment, and live checks are pending because the clinical release scope still includes B8 and the unresolved live checks noted above.
