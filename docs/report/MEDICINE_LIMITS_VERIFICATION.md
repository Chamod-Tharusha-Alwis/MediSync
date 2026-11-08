# MediSync Medicine Safety Limits Verification Audit

> **Policy Invariant**: Under Rule 3 ("NEVER invent data / citations / statistics"), no clinical parameter may be claimed as verified unless explicitly fetched, cross-checked, and authenticated during the current engineering session. Because this session operated strictly in offline mode (Rule 1), the parameters below are classified as **`unverified_owner_must_check`**.

---

## 1. Safety Limits Verification Ledger

| Drug Name | Canonical Ingredient | Max Single Dose | Max Daily Dose | Max Course Duration | Cited Clinical Source | Verification Status | Action Required by Owner (Exact Section / Page) |
|---|---|:---:|:---:|:---:|---|:---:|---|
| **Paracetamol** | `acetaminophen` | 1,000 mg | 4,000 mg | 7 days | WHO Model Formulary 2008 / BNF 86 | `unverified_owner_must_check` | Verify against BNF 86 (Section "Analgesics - Paracetamol") & WHO Model Formulary 2008, Section 2.1 (Non-opioids, page 63). Check adult maximum single dose (1 g every 4-6h) and 24-hour ceiling (4 g). |
| **Amoxicillin** | `amoxicillin` | 1,000 mg | 3,000 mg | 14 days | WHO Model Formulary 2008 / BNF 86 | `unverified_owner_must_check` | Verify against BNF 86 (Section "Antibacterials - Penicillins - Amoxicillin") & WHO Model Formulary 2008, Section 6.2.1 (Beta-lactam medicines, page 108). Check standard adult oral dosing ceilings (up to 1 g every 8h in severe infections) and standard uncomplicated course durations (7-14 days). |
| **Ibuprofen** | `ibuprofen` | 800 mg | 2,400 mg | 10 days | WHO Model Formulary 2008 / BNF 86 | `unverified_owner_must_check` | Verify against BNF 86 (Section "NSAIDs - Ibuprofen") & WHO Model Formulary 2008, Section 2.1 (Non-opioids, page 61). Check maximum single oral prescription dose (800 mg) and maximum over-the-counter vs. prescription daily ceilings (1.2 g OTC vs. 2.4 g prescription with gastric protection). |

---

## 2. Platform Behavioral & Regulatory Status

1. **Storage Files Updated**:
   - `server/src/data/medicine_safety_limits.json`
   - `ml-engine/data/medicine_safety_limits.json`
   - In both files, `citationStatus` and `status` have been explicitly set to `"unverified_owner_must_check"`.
2. **Clinical Guard Rails**:
   - The safety engine (`server/src/utils/medicineSafetyEngine.js`) continues to enforce these boundaries as conservative prototype bounds during prescription authoring, returning warnings to clinicians when prescribed quantities exceed these thresholds.
   - All prescription warning dialogs and documentation explicitly note that dosage limits constitute reference thresholds requiring clinician judgment (`clinicalValidation: not_established`).
