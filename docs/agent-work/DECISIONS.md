# Decisions (append-only)

- 2026-11-04T05:52:16.227Z — New operator master prompt authorizes main pushes per completed item and scoped reviewer delegation; it supersedes the earlier single-agent/push hold. No ingest, seed, data repair, cache mutation, service restart or provider operation is authorized. All unrelated untracked files are preserved.
- Preserve and independently check newer C4 commit f825df4 rather than reimplement completed work. Previous reports containing another C4 SHA must be reconciled against actual git history.
- Q1 must not remove provenance disclosures while public responses can include simulated data. Audit this boundary before editing.

- 2026-11-04T05:56:27.468Z — Q1 source audit proves current ML aggregate cannot separate real/demo provenance. Mark Q1 BLOCKED on Q2, retaining banners; proceed to independent Q2 under the queue's blocked-item rule. No data repair is needed or authorized for this implementation.
- 2026-11-04T05:56:27.468Z — C4 historical passed=true is unsupported: both health requests TIMEOUT and the verifier predicate ignores them; independent inert reproduction returned success anyway. Preserve receipt and qualify claims, repair under Q4 instead of silently accepting them.

- 2026-11-04T06:16:39.554Z — Q2 only counts reviewed confirmed episodes. Legacy real records with missing/malformed provenance produce unavailable, never silently zero or fabricate trust. Valid complete empty queries may return zero. No migration/DDL/clinical write is included. Public route has no simulation query switch.
- 2026-11-04T06:16:39.554Z — Q2 zero-fill is aligned successful observed UTC history only; forecasts require three case-bearing dates, and UI honors explicit empty forecast. Keep existing nonclinical disclaimer. Suppressed district selection displays undisclosed (<5), not zero; this retains existing display suppression, not a claim of k-anonymity.

- 2026-11-04T06:23:53.238Z — Do not roll back Q2 to mixed ephemeral numbers merely because trusted statistics are unavailable: returning503 is the required truthfulness behavior. Full Q2 acceptance remains blocked, not PASS. Q1 resumes against the deployed real-only-or-unavailable boundary.

- 2026-11-04T11:04:19.811Z — Q1 removes temporary source notices, not record provenance or clinical/statistical warnings. Explicitly reject any flagged simulated public payload.20obsolete notice cases replaced by20behavioral absence/rejection cases; all unrelated assertions retained.
- 2026-11-04T11:04:19.811Z — Derived public-placeholder eligibility is deliberately narrower than substring matching. It hides only the bootstrap placeholder shapes without setting synthetic flags that would break legitimate production login. No record mutation.
