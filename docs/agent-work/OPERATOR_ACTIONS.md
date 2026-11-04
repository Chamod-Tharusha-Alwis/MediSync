# Operator-only actions

No production mutation is authorized by this checklist.

1. [ ] Provide nonsecret Render deploy evidence for MediSync and MediSync-ML: live commit SHA/status; confirm the reported Free plan, no disk and absence of MEDISYNC_ML_DB_PATH. Do not provide environment values.
2. [ ] Provide sanitized ingest request counts/statuses since the reported 4 November 11:12 +05:30 deployment, and whether any source was not the approved seeder. Do not send identifiers, credentials or raw request bodies.
3. [ ] Before any role login/OTP check, provide fresh combined sent-email totals; the existing testing cap is 30 per day. No invitations/broadcasts are permitted.
4. [ ] Clinical-write, credential rotation, Atlas settings, Redis credentials, service restarts and cleanup each remain separately gated; exact steps will be added only after source review.
