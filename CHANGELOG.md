# Changelog

## Patch v1.0.1 — 28 October 2026 (release candidate)

### Security

- Replace raw hospital-controller exception details and logs with fixed messages while preserving response status and shape.
- Update root `follow-redirects` from 1.16.0 to 1.16.2 through a non-forced, script-disabled audit fix; root audit reports zero findings afterward.
- Apply in-range client dependency fixes without forced upgrades: critical findings fall from 3 to 0 and high findings from 27 to 13.
- Block audit-model updates, replacements, deletes, existing-record saves and mixed mutation bulk batches; retain inserts and reads.

### Fixes

- Add twelve hospital error/privacy regressions, including successful profile and existing not-found behavior.
- Exclude generated context-session statistics from the source-freeze inventory; application source and workflow files remain checked.
- Preserve the approved CRLF laboratory test blob and canonical LF storage-policy files across checkouts.

### Removed

- Raw exception text from ten hospital error responses and three logs.
- No application features, packages, records or historical evidence removed.

### Known issues

- AES-GCM/HMAC cutover, protected authorization changes and production migrations remain held for review. Current patient storage is not fully GCM/HMAC; historic keys and data must remain readable.
- Audit guards protect Mongoose model operations; raw-driver/DBA writes and capped rollover remain outside that boundary. Capped audit storage is not immutable.
- API-wide schema coverage, shared Redis IP/account limiting and password lockout need compatibility review; current cross-site session/cookie behavior is preserved.
- Client audit retains 13 high, 7 moderate and 16 low findings; server audit retains 5 low findings. No forced dependency upgrades or toolchain downgrades applied.
- Git-history pattern findings need private review; no assertion that history is free of secrets and no history rewrite.
- Real production boot, authenticated five-role browser/persistence smoke tests and backup/restore remain unverified. No migration, seed or production data access was performed.
- This entry describes a candidate, not proof of production deployment or full clinical security qualification.
