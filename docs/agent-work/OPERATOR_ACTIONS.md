# Operator-only actions

No production mutation is authorized by this checklist.

1. [ ] Provide nonsecret Render deploy evidence for MediSync and MediSync-ML: live commit SHA/status; confirm the reported Free plan, no disk and absence of MEDISYNC_ML_DB_PATH. Do not provide environment values.
2. [ ] Provide sanitized ingest request counts/statuses since the reported 4 November 11:12 +05:30 deployment, and whether any source was not the approved seeder. Do not send identifiers, credentials or raw request bodies.
3. [ ] Before any role login/OTP check, provide fresh combined sent-email totals; the existing testing cap is 30 per day. No invitations/broadcasts are permitted.
4. [ ] Clinical-write, credential rotation, Atlas settings, Redis credentials, service restarts and cleanup each remain separately gated; exact steps will be added only after source review.

5. [ ] Evidence update 2026-11-04T06:00:01.255Z: operator confirms ML86d5876 Live at11:12 +05:30, manual. Supplied backend SHA/status and ingest counts remain template placeholders, not observations. Keep NOT VERIFIED; do not infer absent ingest from missing access logs.

6. [ ] After Q2 deployment, confirm actual backend commit through its optional public /health commit field (RENDER_GIT_COMMIT is platform-provided); do not add/change secrets. If real statistics return503 because trusted clinical provenance is missing, do not seed, backfill or fabricate verification. Plan clinical review separately.
7. [ ] Q2 restart-independence acceptance: after recording the read-only public aggregate and deployed SHA, operator may separately choose an ML restart and provide its time. Codex has not requested/performed a restart. Re-read the same public filter afterward; expected source remains Mongo. No new index is created/required automatically; production query latency/index adequacy remain unverified.

8. [ ] After the scoped Q2 deployment and one read-only public health GET, provide only its fixed [PublicHealth] stage=... category=... line from MediSync Render logs. No raw logs/identifiers/env values. A new source receipt does not authorize patient-data reads, backfill or migration.
9. [ ] Before approving any future login runner, provide real Resend/Brevo/combined sent counts (current N values are placeholders). Review pure session policy and runner integration; no login is authorized by this checklist.

## 2026-11-05T08:58:01.552Z — Next phase authorization

- [ ] To authorize P1 only, reply APPROVE P1 and numeric Resend/Brevo/combined sent totals read just now. One admin login/logout; refresh at most once only if the existing session fence permits it; no retry. Browser GETs for dashboard/statistics/active alerts/notifications/language and static assets; GET /api/admin/ml-status initially through the status view and once more at least60seconds after its reply. Only authenticated exact /socket.io/ control transport is permitted. No app socket events or clinical/OTP/admin/maintenance writes. Expected one alert, conservatively reserve2; stop if projected total would exceed22 of25. Screenshot outside repo/OneDrive.
- [ ] After P1, confirm actual provider totals and only the fixed AdminMlStatus category word from Render for the check window. No raw logs, addresses, request bodies or credentials.
- [ ] Decide historical inventory scope for groups8–10; current no-inventory decision is retained until clarified.
- [ ] Lighthouse is not installed. If approved separately, use a local installed browser/tool against a scoped page; first record version, URL/role, mobile/desktop profile and evidence outside repo. No package installation authorized by V2.

## 2026-11-05T09:02:08.716Z — V2 security operator checklist (not executed)

- [ ] Change the shared password on the five existing role accounts through the real change-password flow after separately authorizing W2/rotation; enter secrets privately and record only completion. Retire local temporary-password variables afterward without changing the keyring.
- [ ] Review Atlas account/service dependencies, restrict network access to the required authorized outbound/workstation ranges and remove broad0.0.0.0/0 access only after validating those dependencies. No agent changes are authorized.
- [ ] Review dependencies of the legacy atlasAdmin account, then retire it through operator-owned Atlas controls; never paste credentials or roles with user-identifying details into reports.
- [ ] Rotate Redis credentials and verify application/recovery consumers through an operator-controlled rollout.
- [ ] Review backend/ML/Vercel environment-variable names for legacy QA/test aliases and unused values; do not print secrets or change ENCRYPTION_KEYS.
- [ ] Decide how to retire MEDISYNC_PROTOTYPE_MODE/operator-key Vault bypass. Any encryption migration needs a reviewed backward-compatible dry-run, private backup and tested restore before separate apply approval. No automatic startup migration.
- [ ] Rotate any credentials found exposed in historical source/evidence; report secret type/location only, never values, and do not rewrite Git history automatically.
- [ ] For future migrations, first take a private encrypted backup outside repo/OneDrive, verify its digest/access controls and an isolated restore, then review dry-run counts. Approve only one exact migration at a time.

## 2026-11-05T09:48:24.750Z — P1 consumed; next diagnostic gate supersedes old P1 request

- [ ] Review docs/temp/CODEX_V2_ML_STATUS_DIAGNOSTICS_20261105T094824Z.md. After exact-head deployment confirmation, separately authorize APPROVE P2 with fresh numeric Resend/Brevo/combined totals for one admin login/logout and the existing two-status-GET comparison only. Expected1alert,reserve2; projected total must not exceed22/25. No other role, clinical/OTP/maintenance writes or retry.
- [ ] Return only each fixed AdminMlStatus category/reason/upstreamStatus/failedFields line from that approved window; no raw logs, bodies, URLs, headers or secrets.
- [ ] No ML protected source or production data repair is proposed: the actual empty-storage reply already passes the unchanged schema. Root cause remains unverified pending fixed diagnostic evidence.
