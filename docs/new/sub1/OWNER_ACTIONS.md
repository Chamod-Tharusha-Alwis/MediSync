# Sub-Project 1 — Owner Actions

Only the owner performs these. The agent never runs them.

## Pending now
1. Review `00_MASTER_PLAN.md`, answer Q1–Q6, reply **APPROVED** to start Phase 1.

## Planned (details filled in by later phases)
- Phase 1: copy-paste PowerShell delete commands for approved large folders; move repo out of OneDrive; approve or decline any git history rewrite (agent will not rewrite or force push without written approval here).
- Phase 2: set `PDF_EXPORT_ENABLED=true` on Render when ready (default stays off → 503).
- Phase 3: run `scripts/seed-dispensing-sample.js` (namespace `SEED_2026_11_B`) dry-run, then confirm, against production if desired.
- Phase 5: if official census fetch is blocked, download the DCS 2024 district table and provide it.
- Phase 7: ordered live-test checklist (max 50 OTPs per day, no retries after a failure).
