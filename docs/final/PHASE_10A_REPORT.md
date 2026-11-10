# Phase 10 Task A Report: Doctor-Responsibility Override (Warn, Never Block)

**Date**: 2026-11-10  
**Phase**: Phase 10 / Task P10-A  
**Branch**: `final/p10-doctor-override`  
**Standard**: Doctor flow warns and requires prescriber acknowledgment; never hard-blocks the clinician.

---

## 1. Audit of Former Hard-Blocks in Doctor Flow

Prior to Task P10-A, several safety rules and gates acted as absolute barriers, rejecting requests without any clinician override path:

| ID | Domain / Issue | Previous File & Line | Previous Behavior | Replacement Severity & Behavior |
|:---|:---|:---|:---|:---|
| **HB-01** | Patient Allergy Conflict | `server/src/services/consultationCommandService.js:32` | Threw uncaught `ALLERGY_CONFLICT` -> 400 error, transaction aborted | Evaluated as `critical` severity finding. Doctor may review warning card, check clinical responsibility acknowledgment, supply justification reason (min 5 chars), and save. |
| **HB-02** | Medication Review Required (DDI / Duplicate / Incomplete) | `server/src/middleware/clinicalWriteAuthorization.js:52` | Returned HTTP 409 `MEDICATION_REVIEW_REQUIRED`, blocking consultation creation | Middleware checks `safetyAcknowledgment.acknowledged`. If acknowledged, passes authorization to command service. |
| **HB-03** | Medication Assertion Failure | `server/src/services/currentMedicationSafety.js:29` via `consultationCommandService.js:35` | Threw `MEDICATION_REVIEW_REQUIRED` inside transaction | When valid `safetyAcknowledgment` is attached, bypasses hard block and commits `safetyOverride` on prescriptions. |
| **HB-04** | Course Duration Limit Exceeded | `server/src/utils/medicineSafetyEngine.js:223` | Flagged `duration_limit_exceeded` with `requiresAcknowledgment` | Mapped to `moderate` severity finding. Prescriber checks acknowledgment; saves without hard rejection. |
| **HB-05** | Daily Dose Limit Exceeded | `server/src/utils/medicineSafetyEngine.js:241` | Flagged `dosage_limit_exceeded` | Mapped to `severe` severity finding. Requires justification reason (min 5, max 250 characters). |
| **HB-06** | Pharmacist-Side Dispensing Allergy Check | `server/src/services/dispensingService.js:148` | Failed immediately with `ALLERGY_CONFLICT` | Supports pharmacist acknowledgment with reason (`pharmacistOverride`), recorded in dispensing record. Integrity rule `ALREADY_DISPENSED` remains a hard stop. |

---

## 2. Severity Mapping Matrix

All findings are classified into 4 standardized severity tiers:

1. **`critical`**: Direct patient allergy conflict (`allergy_conflict`).
2. **`severe`**: Known severe/major drug-drug interaction (`drug_interaction`), active prescription duplicate therapy (`duplicate_therapy_active_rx`), daily dosage ceiling exceeded (`dosage_limit_exceeded`).
3. **`moderate`**: Moderate drug interaction, duplicate active ingredients across prescription lines (`duplicate_ingredient`), course duration exceeded (`duration_limit_exceeded`).
4. **`info`**: Unresolved ingredient / incomplete formulary lookup (`incomplete_verification`), formulary limit unconfigured (`unconfigured_limit`).

---

## 3. Override Protocol & Cryptographic Integrity

1. **Client UI (`MedicineSafetyPanel.jsx` & `NewConsultation.jsx`)**:
   - Calls `POST /api/prescriptions/check-safety`.
   - Displays clear warning card per finding detailing finding type, severity, items, explanation, and reference source.
   - For `info` and `moderate` findings: requires single acknowledgment checkbox: *"I have reviewed these warnings and accept clinical responsibility"*.
   - For `severe` and `critical` findings: additionally requires short clinical justification reason (5 to 250 characters).
   - Generates client-side acknowledgment carrying `findingsHash`.
   - Submit button is **never permanently disabled**.
2. **Server-Side Recomputation (`consultationCommandService.js` & `clinicalSafetyValidator.js`)**:
   - Server **never trusts client findings**.
   - Server recomputes all findings against database, reference catalogs (`interactions_clean.json`, `medicine_safety_limits.json`), and decrypted patient allergies.
   - Computes deterministic SHA-256 `findingsHash` over normalized, sorted findings.
   - Compares client `findingsHash` against server `findingsHash`. Rejects with 400 `SAFETY_ACKNOWLEDGMENT_REQUIRED` if prescription was tampered with or changed since acknowledgment.
3. **Audit Evidence & Downstream Visibility**:
   - Persists `safetyOverride` on each `Prescription` document (`acknowledged`, `acknowledgedAt`, `doctorId`, `reason`, `findings`, `findingTypes`).
   - Emits transactional audit event `PRESCRIPTION_SAFETY_OVERRIDE` to append-only `AuditLog` (zero PII, types and severities only, no reason text).
   - Consultation Summary PDF & Locked Prescription PDF: prints line *"Doctor acknowledged safety warnings: <types>"*.
   - Pharmacy Dashboard: displays visible amber badge *"Prescriber acknowledged safety warnings (<types>)"*.
   - Verification Portal (`/verify/:token`): shows *"Safety warnings acknowledged by prescriber (<types>)"*.
   - Duplicate dispensing remains an uncompromised integrity hard stop (`ALREADY_DISPENSED`).
