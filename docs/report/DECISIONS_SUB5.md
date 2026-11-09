# Sub-Project 5: Autonomous Decisions Ledger

This document tracks autonomous engineering, architectural, and data integrity decisions made during Sub-Project 5 execution.

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

### DEC-S1-04: Clinical Synonyms Licensing & Offline Status
- **Context**: 32 clinical synonyms in `build_icd10_synonyms.py` mapped to ICD-10-CM codes.
- **Decision**: In offline mode, the agent verified that all 32 ICD-10 codes and descriptions exist in `server/reference-data/icd10_clean.json`. Because external websites could not be accessed, external CMS/CDC Alphabetic Index headings are explicitly marked **NOT VERIFIED / `owner_must_check`**, and the status in `icd10_synonyms.v1.json` is set to `"owner_must_check"`.

### DEC-S9-01: Correction Pass S9 Alignment with Ground-Truth Code
- **Context**: User audit identified discrepancies between text reports and underlying code implementations.
- **Decision**:
  - Tier 1 model classified as **TF-IDF + Cosine Similarity** over 41 disease profiles (verified in `ml-engine/app.py:308-319, 481-516`), removing "Random Forest" claims.
  - Tier switch threshold pinned to **40.0%** (confidence $\ge 40.0\%$, score $\ge 0.40$), verified in `ml-engine/app.py:553`.
  - Outbreak detection gates aligned with `server/src/services/surveillanceService.js:136-140`: **Gate 1 ($N \ge 5$)**, **56-day baseline**, **Gate 2 (2 consecutive calendar days with $z > 2.0$)**. Removed references to "C-SUM", "EWMA", and "DENGUE_PLATELET_ALERT".
  - Knowledge base counts grounded in `disease_symptom_kb.v1.json`: 801 raw conditions $\rightarrow$ 136 quarantined $\rightarrow$ 665 active filtered $\rightarrow$ 174 mapped, 491 unmapped. Edge filter $P \ge 15.0\%$, minimum 3 surviving symptoms.
  - Production backend URL set to `https://medisync-wabc.onrender.com`.
  - Demo batch identified as `DEMO_OUTBREAK_2026_V1`; protected production seed identified as `SEED_2026_11_A`.
