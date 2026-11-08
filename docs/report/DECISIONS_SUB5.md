# Sub-Project 5: Autonomous Decisions Ledger

This document tracks autonomous engineering, architectural, and data integrity decisions made during Sub-Project 5 overnight execution.

## Policy
1. No ungrounded guessing or invention of medical data.
2. Maintain `clinicalValidation: not_established` disclaimer contract.
3. Protect the 15-file SHA-256 ledger in `docs/release/PROTECTED_HASHES.json`.
4. Run in offline/in-memory mode only; zero connection to production.

## Decisions

### DEC-S0-01: Baseline Branch and Environment
- **Context**: PR #35 merged into `main` at `7ba2840`.
- **Decision**: Created single feature branch `feat/sub5-submission-pack` tracking `origin/main`.
- **Environment**: Node.js `v26.4.0`, Python `3.14.6` in `.venv`, npm `11.17.0`. Installed `psutil 7.2.2` in `.venv` for real OS RSS process memory benchmarking.
