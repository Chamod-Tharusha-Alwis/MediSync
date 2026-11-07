# Sub-Project 1 — Decisions

Format: ID — decision — alternatives — reason.

## D-001 — Separate tracking folder `docs/new/sub1/`
- Decision: keep this sub-project's plan and tracking in `docs/new/sub1/`, leaving `docs/new/PROGRESS_TRACKER.md` and `docs/new/DECISIONS.md` as the record of M0–M5.
- Alternatives: append to the existing files.
- Reason: brief requires the new folder; keeps history readable.

## D-002 — "Outbreak 3 levels" proposed as geographic aggregation (pending owner Q1)
- Decision (proposed): District / Province / Island-wide, each using unchanged rules (N >= 5, 2 consecutive days, z > 2) and existing tiers Watch/Alert/Critical.
- Alternatives: interpret as the three severity tiers only (already implemented).
- Reason: tiers already exist, so the brief's "each with its own tier" implies spatial levels; client already has `PROVINCE_CLUSTERS`.

## D-003 — PDF attachment respects `PDF_EXPORT_ENABLED` (pending owner Q3)
- Decision (proposed): attach `consultation_<id>.pdf` only when the flag is on; otherwise email the prescription list only.
- Alternatives: always attach (bypasses the existing security hold).
- Reason: do not weaken an existing gate without owner sign-off.

## D-004 — Agent deletes no large folders
- Decision: Phase 1 produces audit + owner commands; agent only uses `git rm --cached` and removes small, proven-unused code.
- Alternatives: agent deletes scratch/Python/.venv directly.
- Reason: brief rule; irreversible data loss risk.
