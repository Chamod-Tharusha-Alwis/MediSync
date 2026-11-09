# Phase 4 Plan — Clinical Safety Gaps (Deterministic Emergency Red-Flag Advisory)

**Date**: 2026-11-09  
**Branch**: `final/p4-clinical-safety`  
**Status**: PLANNING  
**Ledger Compliance Target**: 15 / 15 Files Locked  

---

## 1. Objectives & Safety Invariants

Phase 4 addresses clinical safety gaps in a minimal, honest, and strictly deterministic way without altering ML ranking, without auto-diagnosing, and without blocking clinical autonomy:

1. **Deterministic Rule-Based Emergency Red-Flag Advisory**:
   - Evaluates a small, conservative set of critical emergency presentation patterns based on selected symptoms and clinician input.
   - Distinct from statistical ML ranking: runs in parallel, outputs a prominent advisory ("Possible emergency presentation: urgent clinical assessment recommended").
   - **Guaranteed non-blocking**: The clinician can proceed, prescribe, and finalize consultation normally.
   - **Guaranteed ranking invariant**: ML disease ordering is completely unchanged.
   - **Guaranteed caveat**: Stamped with `clinicalValidation: "not_established"` and source note `"design heuristic, not clinically validated"`.
2. **Rules Configuration**:
   - Located in a single standalone JSON file: `server/src/data/emergencyRedFlags.json`.
   - Explicit metadata: `status: "needs_clinician_review"`, `source: "design heuristic, not clinically validated"`.
   - Targeted patterns:
     - **Acute Meningism / Intracranial Emergency** (SC-09): Sudden severe headache + neck stiffness / photophobia.
     - **Acute Cardiorespiratory Distress / Failure** (SC-03): Dependent edema / swollen ankles + exertional breathlessness / dyspnea.
     - **Acute Coronary Presentation**: Chest pain + sweating / radiation to arm / jaw.
     - **Altered Mental Status**: Sudden confusion / loss of consciousness / syncope.
     - **Severe Anaphylaxis**: Facial/airway swelling / wheezing + rash / hypotension.
     - **Severe Hemorrhage**: Heavy active bleeding / hematemesis / hemoptysis.
3. **Medicine Safety Engine Verification**:
   - Verify the 5 implemented rules in `server/src/utils/ingredientResolver.js` (Warfarin + Ciprofloxacin DDI, dose ceiling, course duration limit, patient allergy alert, duplicate ingredient alert).
   - Display explicit scope indicator on UI: *"Checks performed: DDI, duplicate ingredient, allergy, dose ceiling, duration limit"*.
   - Strictly prohibit any unverified claims of renal, hepatic, pediatric, or geriatric dose adjustment.

---

## 2. Technical Architecture & File Plan

### 2.1 File Map

```
server/
  src/
    data/
      emergencyRedFlags.json      <-- New data file with 6 conservative heuristic rules
    utils/
      emergencyAdvisory.js        <-- Pure evaluation helper (zero side-effects)
    services/
      mlPredictionService.js      <-- Attaches deterministic emergencyAdvisory to prediction response
client/
  src/
    pages/
      doctor/
        NewConsultation.jsx       <-- Displays prominent advisory banner & safety scope indicator
docs/
  report/
    ML_DESIGN_PARAMETERS.md       <-- Updates limitation from "zero red-flag rules" to "advisory red-flag screen present, limited rule set, unvalidated"
    chapters/
      06_machine_learning.md      <-- Accurately reflects deterministic advisory layer
      11_limitations_future_work.md <-- Retains caveat that it is not an exhaustive diagnostic triage engine
  final/
    OWNER_ACTIONS.md              <-- Logs action for licensed clinician to review the heuristic rule list
    PHASE_4_REPORT.md             <-- Final verification and test receipts
```

### 2.2 Rule Schema (`emergencyRedFlags.json`)

```json
{
  "metadata": {
    "version": "1.0.0",
    "status": "needs_clinician_review",
    "provenance": "design heuristic, not clinically validated",
    "disclaimer": "This heuristic rule set highlights potentially critical clinical presentations for urgent review. It does not provide medical diagnosis or replace clinical judgment."
  },
  "rules": [
    {
      "id": "ACUTE_MENINGISM",
      "label": "Meningism / Acute Severe Headache",
      "requiredAny": ["sudden severe headache", "severe headache", "thunderclap headache"],
      "accompaniedByAny": ["stiff neck", "neck stiffness", "photophobia", "altered consciousness"],
      "advisoryMessage": "Possible acute meningism or intracranial emergency: urgent assessment recommended."
    },
    {
      "id": "ACUTE_CARDIORESPIRATORY_DISTRESS",
      "label": "Dependent Edema with Exertional Dyspnea",
      "requiredAny": ["shortness of breath on exertion", "breathlessness at rest", "dyspnea", "orthopnea"],
      "accompaniedByAny": ["swollen ankles", "dependent edema", "ankle swelling", "pedal edema"],
      "advisoryMessage": "Possible acute cardiac or respiratory compromise: urgent assessment recommended."
    },
    {
      "id": "ACUTE_CORONARY_SYNDROME",
      "label": "Acute Coronary Symptoms",
      "requiredAny": ["chest pain", "angina", "retrosternal chest pain"],
      "accompaniedByAny": ["sweating", "cold sweats", "pain radiating to left arm", "pain radiating to jaw", "diaphoresis"],
      "advisoryMessage": "Possible acute coronary syndrome: emergency assessment recommended."
    },
    {
      "id": "ALTERED_CONSCIOUSNESS",
      "label": "Acute Altered Mental Status",
      "requiredAny": ["loss of consciousness", "syncope", "unresponsive", "acute confusion", "altered mental status"],
      "accompaniedByAny": [],
      "advisoryMessage": "Acute neurological or conscious state change: immediate clinical evaluation required."
    },
    {
      "id": "ANAPHYLAXIS",
      "label": "Suspected Anaphylaxis",
      "requiredAny": ["throat tightness", "stridor", "facial swelling", "tongue swelling", "swelling of lips"],
      "accompaniedByAny": ["wheezing", "difficulty breathing", "skin rash", "urticaria", "hypotension"],
      "advisoryMessage": "Possible acute anaphylactic reaction: immediate airway and hemodynamic evaluation required."
    },
    {
      "id": "SEVERE_HEMORRHAGE",
      "label": "Severe Active Hemorrhage",
      "requiredAny": ["heavy bleeding", "hematemesis", "vomiting blood", "hemoptysis", "coughing blood", "melena"],
      "accompaniedByAny": [],
      "advisoryMessage": "Signs of acute or significant hemorrhage: urgent assessment recommended."
    }
  ]
}
```

---

## 3. Sanity Cases Verification Matrix

The 4 recognized sanity cases from `scripts/verify_sanity_symptom_cases.py` are asserted against the emergency advisory:

| Case ID | Presentation | Key Symptoms | Expected Advisory Behavior | Expected ML Behavior |
|:---:|---|---|:---:|:---:|
| **SC-09** | Acute meningism | `["sudden severe headache", "stiff neck", "photophobia"]` | **TRIGGERS ADVISORY** (`ACUTE_MENINGISM`) | ML ranking remains Migraine (unchanged) |
| **SC-03** | Dependent edema + dyspnea | `["swollen ankles", "weight gain", "shortness of breath on exertion"]` | **TRIGGERS ADVISORY** (`ACUTE_CARDIORESPIRATORY_DISTRESS`) | ML ranking remains Acanthosis nigricans (unchanged) |
| **SC-05** | Resting tremor + rigidity | `["tremor", "bradykinesia", "muscle rigidity"]` | **NO ADVISORY** (chronic presentation; not acute red flag) | ML ranking remains Malaria (unchanged) |
| **SC-10** | Malar rash | `["skin rash on face", "malar butterfly rash", "joint stiffness"]` | **NO ADVISORY** (subacute autoimmune; not acute red flag) | ML ranking remains Fungal infection (unchanged) |

---

## 4. Execution Steps

1. Create `server/src/data/emergencyRedFlags.json`.
2. Implement `server/src/utils/emergencyAdvisory.js` with pure functional matching.
3. Integrate into `server/src/services/mlPredictionService.js` without altering `predictions` array.
4. Update `client/src/pages/doctor/NewConsultation.jsx` to render the advisory banner when flagged and show the explicit 5-point medicine safety check list.
5. Author test suite `server/tests/clinicalSafetyPhase4.test.js` validating all 6 rules, asserting SC-09 and SC-03 triggers, confirming SC-05 and SC-10 pass without advisory, and asserting ML ranking invariance.
6. Update documentation: `06_machine_learning.md`, `11_limitations_future_work.md`, `ML_DESIGN_PARAMETERS.md`, `OWNER_ACTIONS.md`.
7. Run all quality gates (`run_offline_tests.js`, client build, link checker, ledger 15/15).
8. Author `PHASE_4_REPORT.md`, commit, push `final/p4-clinical-safety`, merge into `main`.
