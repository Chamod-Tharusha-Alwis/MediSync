# MediSync Medicine Safety Limits Verification Audit

> **Policy Invariant**: Under Rule 3 ("NEVER invent data / citations / statistics"), no clinical parameter may be claimed as verified unless explicitly fetched, cross-checked, and authenticated during the current engineering session. Because this session operated strictly in offline mode (Rule 1), all page numbers and external citations are removed as **NOT VERIFIED**. The parameters below are classified as **`unverified_owner_must_check`**.

---

## 1. Safety Limits Verification Ledger

| Drug Name | Canonical Ingredient | Max Single Dose | Max Daily Dose | Max Course Duration | Cited Clinical Source | Verification Status | Action Required by Owner (Section Name Only - Owner to Locate) | Special Clinical Review Flag |
|---|---|:---:|:---:|:---:|---|:---:|---|:---:|
| **Paracetamol** | `acetaminophen` | 1,000 mg | 4,000 mg | 7 days | WHO Model Formulary 2008 / BNF 86 | `unverified_owner_must_check` | Verify against BNF (Section "Analgesics - Non-opioids - Paracetamol") & WHO Model Formulary (Section "Non-opioids"). Owner to locate exact section. Check adult single dose (1 g every 4-6h) and 24h ceiling (4 g). | **FLAGGED FOR REVIEW**: 7-day course duration for acute self-limiting pain vs. chronic therapy requires clinician review. |
| **Amoxicillin** | `amoxicillin` | 1,000 mg | 3,000 mg | 14 days | WHO Model Formulary 2008 / BNF 86 | `unverified_owner_must_check` | Verify against BNF (Section "Antibacterials - Penicillins - Amoxicillin") & WHO Model Formulary (Section "Beta-lactam medicines"). Owner to locate exact section. Check oral dosing ceilings and course durations. | Standard antibacterial stewardship review. |
| **Ibuprofen** | `ibuprofen` | 800 mg | 2,400 mg | 10 days | WHO Model Formulary 2008 / BNF 86 | `unverified_owner_must_check` | Verify against BNF (Section "NSAIDs - Ibuprofen") & WHO Model Formulary (Section "Non-opioids"). Owner to locate exact section. Check single-dose ceiling and over-the-counter vs. prescription daily limits. | **FLAGGED FOR REVIEW**: Single-dose 800 mg is high for outpatient primary care; verify gastric protection and kidney function prerequisites with hospital clinician. |

---

## 2. Specific Items Flagged for Clinical Panel Review

1. **Ibuprofen Single-Dose 800 mg**:
   - In outpatient primary care and general OPD clinics, single oral doses of 800 mg Ibuprofen carry elevated risks of acute gastric mucosal erosion and nephrotoxicity, particularly in dehydrated patients or those with undiagnosed renal impairment.
   - Recommended clinician action: Evaluate whether the prototype single-dose ceiling should be lowered to 400 mg or 600 mg for unmonitored outpatient prescription.
2. **Paracetamol 7-Day Course Duration**:
   - Continuous 7-day therapy at maximum daily dose (4,000 mg/day) carries cumulative hepatotoxicity risk, especially in patients with low body weight or subclinical chronic liver disease.
   - Recommended clinician action: Review whether uncomplicated adult antipyretic courses should be capped at 3 to 5 days before mandating clinical reassessment.

---

## 3. Platform Behavioral & Regulatory Status

1. **Storage Files**:
   - `server/src/data/medicine_safety_limits.json`
   - `ml-engine/data/medicine_safety_limits.json`
   - In both files, `citationStatus` and `status` are set to `"unverified_owner_must_check"`.
2. **Clinical Guard Rails**:
   - The safety engine (`server/src/services/medicineSafetyService.js`) enforces these boundaries as conservative prototype bounds during prescription authoring, returning warnings to clinicians when prescribed quantities exceed these thresholds.
   - All prescription warning dialogs and documentation explicitly note that dosage limits constitute reference thresholds requiring clinician judgment (`clinicalValidation: not_established`).
