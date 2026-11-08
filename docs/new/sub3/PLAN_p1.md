# MediSync Sub-Project 3 — Phase P1 Plan: Medicine Safety Rules

## 1. Objectives & Safety Invariants
1. **Locate & Audit**:
   - Catalog all existing medication safety rules across `server/src/utils/ingredientResolver.js`, `server/src/controllers/drugController.js`, `server/src/services/dispensingService.js`, and `ml-engine/data/`.
   - Author `docs/new/sub3/MEDICINE_SAFETY_RULES.md` documenting file locations, line numbers, checks, data sources, and gaps.
2. **Cited Limits Reference Catalog**:
   - Author `server/src/data/medicine_safety_limits.json` and `ml-engine/data/medicine_safety_limits.json`.
   - Include verified limits with explicit citations (`source`, `retrievedAt`, `citationUrl`, `status: "verified"`) for standard benchmark medicines (Paracetamol, Amoxicillin, Ibuprofen from WHO Model Formulary 2008 & British National Formulary BNF 86).
   - Any medicine without cited data defaults to `status: "pending_owner_data"` and surfaces `"Safety limits not configured"` rather than hardcoded/invented numbers.
3. **Safety Engine**:
   - Implement `server/src/utils/medicineSafetyEngine.js` checking:
     (a) Pairwise drug interactions from `interactions_clean.json`.
     (b) Duplicate active ingredients across lines and patient's active prescriptions.
     (c) Maximum course duration and daily dose limits from cited catalog.
   - Enforce warning & acknowledgment workflow: never silently block clinical judgement; require explicit clinician/pharmacist reason; audit log without PII.
4. **UI Integration**:
   - Add trilingual "Medicine Safety" panel in `client/src/pages/doctor/NewConsultation.jsx` and pharmacy dispensing flow.
   - Add EN, SI, TA translation keys for all safety panel states.
5. **Quality Gates**:
   - Dedicated suite `server/tests/phase1MedicineSafetyRules.test.js`.
   - `node scripts/run_offline_tests.js` (100% pass, 0 failed, 15/15 protected files).
   - `npm --prefix client run build` (exit 0).
