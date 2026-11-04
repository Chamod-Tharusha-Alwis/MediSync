# Decisions (append-only)

- 2026-11-04T05:52:16.227Z — New operator master prompt authorizes main pushes per completed item and scoped reviewer delegation; it supersedes the earlier single-agent/push hold. No ingest, seed, data repair, cache mutation, service restart or provider operation is authorized. All unrelated untracked files are preserved.
- Preserve and independently check newer C4 commit f825df4 rather than reimplement completed work. Previous reports containing another C4 SHA must be reconciled against actual git history.
- Q1 must not remove provenance disclosures while public responses can include simulated data. Audit this boundary before editing.

- 2026-11-04T05:56:27.468Z — Q1 source audit proves current ML aggregate cannot separate real/demo provenance. Mark Q1 BLOCKED on Q2, retaining banners; proceed to independent Q2 under the queue's blocked-item rule. No data repair is needed or authorized for this implementation.
- 2026-11-04T05:56:27.468Z — C4 historical passed=true is unsupported: both health requests TIMEOUT and the verifier predicate ignores them; independent inert reproduction returned success anyway. Preserve receipt and qualify claims, repair under Q4 instead of silently accepting them.
