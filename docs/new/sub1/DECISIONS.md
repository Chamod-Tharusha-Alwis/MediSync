# Sub-Project 1 — Decisions

Format: ID — decision — alternatives — reason.

## D-001 — Separate tracking folder `docs/new/sub1/`
- Decision: keep this sub-project's plan and tracking in `docs/new/sub1/`, leaving `docs/new/PROGRESS_TRACKER.md` and `docs/new/DECISIONS.md` as the record of M0–M5.
- Alternatives: append to the existing files.
- Reason: brief requires the new folder; keeps history readable.

## D-002 — "Outbreak 3 levels" confirmed as geographic aggregation (Owner Q1: YES)
- Decision: District (25), Province (9), and Island-wide (1), each evaluated using unchanged rules (N >= 5, 2 consecutive days, z > 2) and existing tiers (Watch / Alert / Critical).
- Alternatives: interpret as the three severity tiers only (already implemented).
- Reason: confirmed by owner; tiers already exist, spatial hierarchy provides regional and national epidemiological visibility.

## D-003 — Ignore `medisync-qa-evidence/` in git (Owner Q2: YES)
- Decision: add `medisync-qa-evidence/` to `.gitignore` and do not track bulk evidence artifacts (optionally small curated PNGs in `docs/evidence/` later).
- Alternatives: commit full QA evidence directory.
- Reason: confirmed by owner; prevents bloating git history.

## D-004 — PDF attachment respects `PDF_EXPORT_ENABLED` (Owner Q3: YES)
- Decision: attach `consultation_<id>.pdf` to consultation summary email only when `PDF_EXPORT_ENABLED === 'true'`; otherwise send the prescription list email without PDF attachment.
- Alternatives: always attach PDF regardless of flag.
- Reason: confirmed by owner; preserves existing security hold without bypassing `PDF_EXPORT_ENABLED`.

## D-005 — Remove "Predictive Restock Warnings" sidebar item (Owner Q4: YES)
- Decision: remove the "Predictive Restock Warnings" navigation item from the Pharmacy sidebar.
- Alternatives: repurpose as link to district health burden.
- Reason: confirmed by owner; inventory subsystem was removed in M2, and district health burden is already surfaced on the Pharmacy dashboard.

## D-006 — Read-only aggregate/count queries allowed on `medisync_prod` for 6-vs-5 alert check (Owner Q5: YES)
- Decision: read-only `countDocuments` / `aggregate` queries on `medisync_prod` are permitted to diagnose the 6-vs-5 active alert count; never print document contents or PII, zero writes. Owner runs `remove_demo_batch` dry-run first.
- Alternatives: offline simulation only.
- Reason: confirmed by owner; allows exact diagnosis of production alert state while upholding strict read-only and zero-PII invariants.

## D-007 — Official 9 Provinces / 25 Districts mapping with bijection test (Owner Q6: YES)
- Decision: use the official Sri Lankan administrative division of 9 provinces and 25 districts, enforced by a unit test verifying every district maps to irritably/exactly one province (25 districts total, 9 provinces).
- Alternatives: custom regional clustering.
- Reason: confirmed by owner; matches official Sri Lankan public health administration.

## D-008 — Agent deletes no large folders
- Decision: Phase 1 produces `SIZE_AUDIT.md`, `scripts/size_report.ps1`, `.gitignore` updates, and copy-paste owner deletion commands in `OWNER_ACTIONS.md`; agent only uses `git rm --cached` and removes small, proven-unused code.
- Alternatives: agent deletes `scratch/`, `Python/`, `.venv/` directly.
- Reason: brief rule; prevents irreversible data loss.
