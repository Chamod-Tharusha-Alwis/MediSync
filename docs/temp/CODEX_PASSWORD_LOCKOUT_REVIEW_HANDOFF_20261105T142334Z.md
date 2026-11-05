# Password lockout: integrated candidate for review

Prepared 2026-11-05T14:23:34.516Z. **Not applied and not active.** The threshold decision approved preparation; source activation still needs review.

The proposed policy holds an account after five failed passwords in a fixed fifteen-minute window starting with the first failure. Attempts one through four return 401; the fifth and subsequent held attempts return 429. Successful logins do not reset the count or extend the window. The controller checks eligibility before password comparison and again after a match, before creating a session.

The key uses the account and model returned by the server lookup. Personal and organization aliases share the same Doctor allowance. Generic and dedicated pharmacy logins share the same PharmacyStaff allowance. Client-supplied account IDs and IP changes cannot select a different counter for that account. Existing IP and OTP controls remain unchanged.

Store failure, an invalid counter or a two-second store-call deadline produces a fixed, sanitized 503. The guard does not retry. Importing the module performs no Redis operation. No new environment variables, secrets, migrations, account flags or patient-record changes are introduced. Once activated, ordinary login attempts would use the existing Redis security-counter helpers.

| Candidate check | Actual result |
| --- | --- |
| Guard/controller negatives and real-crypto session positives | 25 PASS; included in the backend total below |
| Focused authentication and admission regression | 214 PASS; overlaps the backend total |
| Exact-byte detached backend regression | 2,498 PASS, 0 FAIL, 0 SKIP; one private preservation test deliberately excluded |
| Detached lifecycle regression | 40 PASS, 0 FAIL |
| Protected expectations | 15/15 intact |
| Patch admission and detached reconstruction | Exit 0; raw source differences match exactly the nine-file allowlist |

The deployed application's separate full baseline is 3,211 PASS. Do not add these overlapping totals or describe the candidate as a new full combined run. Client and ML bytes are unchanged, so their completed checks and clinical-production build were reused. No real Redis, Atlas, provider or live authentication operation ran. Actual Redis TTL, transport behavior, distribution and latency remain unverified.

A valid authentication already past its final check can complete if a lock starts afterwards. This policy does not revoke existing sessions. Knowing an account identifier lets an attacker temporarily block its owner by submitting failures; that is the selected lockout tradeoff.

## Exact file allowlist

- server/src/controllers/authController.js
- server/src/controllers/pharmacyController.js
- server/src/security/passwordAttemptPolicy.js
- server/clinical.offline.jest.cjs
- server/tests/phase0LoginDiagnostics.test.js
- server/tests/agentBClinicalHandlers.test.js
- server/tests/masterLoginAdmission.test.js
- server/tests/helpers/loginRequestHarness.js
- server/tests/passwordAttemptPolicy.test.js

The first three entries are runtime files; the other six are test/configuration companions. No protected source file is changed.

## Evidence and next decision

- Exact local diff: docs/temp/CODEX_PASSWORD_ATTEMPTS_INTEGRATED_REVIEW_20261105T141533Z.patch
- Portable JSON diff envelope: docs/temp/CODEX_PASSWORD_ATTEMPTS_INTEGRATED_REVIEW_20261105T141533Z_PATCH_DOCUMENT.json
- Source/result hashes, raw-byte binding and detailed receipts: docs/temp/CODEX_PASSWORD_ATTEMPTS_INTEGRATED_REVIEW_20261105T141533Z.json

The JSON envelope preserves the local patch exactly and can be carried in Git without treating unified-diff context spaces as newly added trailing whitespace. Earlier three-file-only packages are historical and superseded by this nine-file package.

The next approval would permit applying this exact nine-file candidate, running the original workspace's full offline gate, then committing and pushing through the normal automatic deployment cycle only if green. That deployment would activate account lockouts. It would not authorize a test login, email, direct Redis/Atlas operation or clinical workflow. Any live qualification remains separately gated.
