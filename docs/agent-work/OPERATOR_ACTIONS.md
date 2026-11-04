# Operator-only actions

No production mutation is authorized by this checklist.

1. [ ] Provide nonsecret Render deploy evidence for MediSync and MediSync-ML: live commit SHA/status; confirm the reported Free plan, no disk and absence of MEDISYNC_ML_DB_PATH. Do not provide environment values.
2. [ ] Provide sanitized ingest request counts/statuses since the reported 4 November 11:12 +05:30 deployment, and whether any source was not the approved seeder. Do not send identifiers, credentials or raw request bodies.
3. [ ] Before any role login/OTP check, provide fresh combined sent-email totals; the existing testing cap is 30 per day. No invitations/broadcasts are permitted.
4. [ ] Clinical-write, credential rotation, Atlas settings, Redis credentials, service restarts and cleanup each remain separately gated; exact steps will be added only after source review.

5. [ ] Evidence update 2026-11-04T06:00:01.255Z: operator confirms ML86d5876 Live at11:12 +05:30, manual. Supplied backend SHA/status and ingest counts remain template placeholders, not observations. Keep NOT VERIFIED; do not infer absent ingest from missing access logs.

6. [ ] After Q2 deployment, confirm actual backend commit through its optional public /health commit field (RENDER_GIT_COMMIT is platform-provided); do not add/change secrets. If real statistics return503 because trusted clinical provenance is missing, do not seed, backfill or fabricate verification. Plan clinical review separately.
7. [ ] Q2 restart-independence acceptance: after recording the read-only public aggregate and deployed SHA, operator may separately choose an ML restart and provide its time. Codex has not requested/performed a restart. Re-read the same public filter afterward; expected source remains Mongo. No new index is created/required automatically; production query latency/index adequacy remain unverified.
