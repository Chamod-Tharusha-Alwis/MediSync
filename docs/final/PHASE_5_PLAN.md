# Phase 5 Implementation Plan: ML Coverage Improvement (Time-Boxed, Honest)

**Phase**: Phase 5 — ML Coverage Improvement  
**Date**: 2026-11-09  
**Branch**: `final/p5-ml-coverage`  
**Time Box**: Strict single-pass evaluation; if unsafe or uncertain, document and move on.  

---

## 1. Objectives & Scope

1. **Review Unmapped Conditions**: Audit `ml-engine/data/unmapped_diseases.v1.json` (491 conditions currently marked `needs_owner_review`).
2. **Safe Auto-Mapping Criterion**: Using the official 71,704-concept ICD-10-CM catalog (`server/reference-data/icd10_clean.json`), attempt to safely auto-map only **unambiguous, clearly equivalent** conditions.
   - Strict rule: **Never accept fuzzy guesses or clinical assumptions**.
   - If an unmapped condition maps to multiple clinical sub-codes (e.g., ruptured vs. unruptured aneurysm, unilateral vs. bilateral hearing loss), it MUST remain unmapped pending human physician review.
3. **Resource & Memory Benchmarking**: Re-verify memory footprint using `scripts/benchmark_ml_resources.py` with real OS resident set size (RSS). Peak memory must remain well under the 512 MB Render Free tier limit.
4. **Noise Caveat Preservation**: Reiterate the Tier 2 noise caveat regarding outpatient survey data and Sri Lankan priority tropical diseases (which must remain strictly reserved for Tier 1 curated profiles).
5. **Exit Criteria**: Output either safely recomputed counts updated across all documents or a documented "no safe additional clinical mappings" outcome.

---

## 2. Evaluation Methodology

1. Programmatic scan of all 491 conditions in `unmapped_diseases.v1.json` against normalized ICD-10 descriptions.
2. Clinical ambiguity analysis for candidates with high token overlap (score $\ge 0.70$).
3. Process memory benchmarking via `psutil` within the Python virtual environment.
4. Verification against full offline test suite and quality gates.
