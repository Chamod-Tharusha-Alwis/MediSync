# Phase D3 Implementation Plan: Matcher V2 (Tiered Sparse Retrieval)

## 1. Goal
Implement a tiered symptom-to-disease matcher in `ml-engine/app.py`:
- **Tier 1 (Curated Baseline)**: 41 clinical profiles from `dataset.csv`. Zero regressions on existing benchmark scenarios, fastest, highest confidence. Sri Lankan priority diseases (Dengue, Malaria, Typhoid, TB, etc.) served exclusively by Tier 1.
- **Tier 2 (Sourced & Filtered KB)**: 174 active mapped conditions with empirical symptom probabilities from `disease_symptom_kb.v1.json`. Evaluated via weighted sparse similarity (cosine on TF-IDF or symptom overlap weighted by $P(\text{symptom} \mid \text{condition})$).
- **Blend Strategy**:
  1. Evaluate Tier 1. If top match confidence $\ge 40\%$ ($\ge 0.40$), Tier 1 wins.
  2. If Tier 1 confidence $< 40\%$, evaluate Tier 2.
  3. Tier 2 results labeled `source: "knowledge_base"`, `clinicalValidation: "not_established"`.
  4. If neither matches, return empty predictions (`matched: false`) allowing manual ICD selection.
- **Memory Footprint**: Peak RSS $< 200\text{ MB}$, well within Render Free 512 MB RAM ceiling.
- **Guards & Negative Tests**:
  - `["back pain", "belly pain", "chest pain", "abdominal pain"]` must NOT return Typhoid as urgent or top match.
  - `["wrist pain", "ankle pain"]` must NOT return Dengue or Leptospirosis in top 5.
  - Classic dengue presentation must return Dengue from Tier 1.

## 2. Step-by-Step Execution Plan
1. **Model Loader in `ml-engine/app.py`**:
   - Load `disease_symptom_kb.v1.json` at startup safely inside `try/except`. If missing/corrupt, fall back cleanly to Tier 1 only.
   - Vectorize Tier 2 conditions using TF-IDF where symptom terms are repeated proportional to integer weights derived from empirical probabilities (e.g. $w = \max(1, \text{round}(P / 10))$) or direct weighted cosine similarity.
2. **Tiered Match Function**:
   - `match_symptoms_tier1(input_symptoms_list, input_symptoms_str)`
   - `match_symptoms_tier2(input_symptoms_list, input_symptoms_str)`
   - Blending logic with $0.40$ (40%) threshold.
3. **Protected Ledger Hash Update**:
   - `ml-engine/app.py` is protected file #3. Compute SHA-256 and update `docs/release/PROTECTED_HASHES.json` with clear reason.
4. **Backend Gateway Pass-Through**:
   - Verify `server/src/utils/inferenceResponse.js` passes `source` and `clinicalValidation` attributes.
5. **Testing & Verification**:
   - Python unit tests in `ml-engine/test_tiered_matcher.py` (Tier 1 priority, Tier 2 lookup, 3 required negative test cases, memory RSS $< 200\text{ MB}$).
   - Run `node scripts/run_offline_tests.js`.
   - Run `npm --prefix client run build`.
   - Verify 15/15 protected files ledger.
