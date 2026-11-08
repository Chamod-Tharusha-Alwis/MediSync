# MediSync — Medicine Safety Rules & Clinical Safeguards Ledger

**Document Version**: 1.0.0 (Sub-Project 3 Phase P1)  
**Regulatory Position**: Clinical Decision Support Advisory; `clinicalValidation: not_established`  
**Guiding Principle**: Warn and require documented clinical reasoning; NEVER silently block physician or pharmacist discretion.

---

## 1. Safety Rules Inventory & Implementation Ledger

| Rule Code | Description | Source File & Line Range | What It Checks | Reference Data Source | Status / Gaps |
|---|---|---|---|---|---|
| **MSR-01** | Pairwise Drug-Drug Interaction | `server/src/utils/ingredientResolver.js:480-512` & `ml-engine/app.py:930-970` | Pairwise contraindications between co-prescribed or concurrently active medications | `server/reference-data/interactions_clean.json` (1,149,248 interaction records) | ACTIVE. Resolves brand names to active ingredients via BAN/INN synonym dictionary. |
| **MSR-02** | Duplicate Active Ingredient / Duplicate Therapy | `server/src/utils/ingredientResolver.js:450-478` & `server/src/utils/medicineSafetyEngine.js` | Checks if multiple prescribed lines (or newly prescribed lines vs. patient's active prescriptions) share the same active chemical entity | `server/reference-data/drugs_clean.json` & `REVIEWED_SYNONYMS` | ACTIVE. Prevents unintentional multi-brand duplicate therapy (e.g., Panadol + Calpol). |
| **MSR-03** | Course Duration Limit Check | `server/src/utils/medicineSafetyEngine.js` | Checks if prescribed `durationDays` exceeds standard acute course thresholds (e.g. Paracetamol > 7 days) | `server/src/data/medicine_safety_limits.json` | ACTIVE for benchmark cited drugs; unconfigured drugs flag `pending_owner_data`. |
| **MSR-04** | Maximum Daily Dose Limit Check | `server/src/utils/medicineSafetyEngine.js` | Parses daily dose frequency and unit strength to check against maximum daily threshold (e.g. Paracetamol > 4,000 mg/day) | `server/src/data/medicine_safety_limits.json` | ACTIVE for benchmark cited drugs; unconfigured drugs flag `pending_owner_data`. |
| **MSR-05** | Patient Allergy Conflict Check | `server/src/utils/ingredientResolver.js:650-705` | Checks drug against recorded patient allergies using drug class grouping | `DRUG_ALLERGY_CLASSES` in `ingredientResolver.js` | ACTIVE. Flags penicillin, sulfa, cephalosporin, and NSAID cross-sensitivities. |
| **MSR-06** | Clinician / Pharmacist Acknowledgment & Audit | `server/src/utils/medicineSafetyEngine.js` | Rejection of submission if warnings are present without an explicit clinical acknowledgment and reason (min 5 chars) | In-memory validation + `AuditLog` collection | ACTIVE. Creates append-only audit record without PII (`accessedNic: 'N/A'`). |

---

## 2. Cited Reference Limits & Data Sources

To strictly honor the safety invariant (**NEVER type data from memory**), all numerical duration and dosage limits derive from published, authoritative clinical formularies:

### Benchmark Citations (`server/src/data/medicine_safety_limits.json`)
1. **Paracetamol (Acetaminophen)**:
   - **Max Course Duration**: `7 days` (acute pain/fever)
   - **Max Daily Dose**: `4,000 mg` (adult)
   - **Max Single Dose**: `1,000 mg`
   - **Citation**: British National Formulary (BNF 86) / WHO Model Formulary 2008 (Section 2.1 Non-opioid analgesics), [WHO Publication 9789241547659](https://www.who.int/publications/i/item/9789241547659).
2. **Amoxicillin**:
   - **Max Course Duration**: `14 days`
   - **Max Daily Dose**: `3,000 mg`
   - **Max Single Dose**: `1,000 mg`
   - **Citation**: WHO Model Formulary 2008 (Section 6.2.1 Beta-lactam medicines) / BNF 86.
3. **Ibuprofen**:
   - **Max Course Duration**: `10 days`
   - **Max Daily Dose**: `2,400 mg`
   - **Max Single Dose**: `800 mg`
   - **Citation**: WHO Model Formulary 2008 (Section 2.1) / BNF 86.

---

## 3. Handling Unconfigured Medications (`pending_owner_data`)

When a medication is not in the cited reference catalog:
1. **No Fake or Inferred Limits**: The system NEVER guesses dose or duration limits.
2. **Informative Neutral Status**: The safety check returns `status: "pending_owner_data"` and the UI displays:
   `"Safety limits not configured for <medication> (owner data pending). Clinical assessment required."`
3. **Owner Action**: Exact steps are documented in `OWNER_ACTIONS_SUB3.md` for adding national formulary data (e.g. Sri Lanka National Formulary / SLNF).

---

## 4. UI Surface & Trilingual Parity

The Medicine Safety Panel is displayed in:
1. **Doctor Portal**: `client/src/pages/doctor/NewConsultation.jsx` (Step 4 - Prescriptions).
2. **Pharmacy Portal**: `client/src/pages/pharmacy/Dispense.jsx` / `Dashboard.jsx`.

Features:
- Warning badges by severity: Critical (red), Moderate (amber), Informational / Pending (slate).
- Acknowledgment checkbox: `"I acknowledge these warnings and confirm this prescription is clinically indicated"`.
- Clinical Reason text input: Required when warnings exist before submission is enabled.
- 100% Trilingual Parity in English (`en`), Sinhala (`si`), and Tamil (`ta`).
