# MEDISYNC R6 AUTO-EXPIRY & SUPERSESSION REPORT (docs/final/R6_REPORT.md)

**Generated**: 2026-11-10T12:35:00+05:30  
**Branch**: `final/rem-r6-auto-supersede`  
**Status**: VERIFIED & PASS  

---

## 1. Summary of Changes

### 1.1 Core Lifecycle Engine (`server/src/utils/prescriptionLifecycle.js`)
- Created unified lifecycle derivation helper `getPrescriptionActiveState(rx, now = new Date())`:
  - Returns strictly one of: `'active' | 'expired' | 'superseded' | 'cancelled'`.
  - Cancelled: `rx.status === 'cancelled'`.
  - Superseded: `rx.supersededBy || rx.supersededAt`.
  - Expired: `rx.status === 'expired'` or `now >= endDate` (where `endDate = rx.expiresAt || (startDate + durationDays * DAY_MS)`).
  - Active: uncancelled, unsuperseded, unexpired.
- Implemented `getCanonicalIngredientSet(drugNameOrMed)`:
  - Resolves canonical active ingredients through `parseMedicationEntry`.
  - Normalizes and sorts canonical strings (e.g. `Citalopram 20mg` -> `['citalopram']`).
- Implemented `isSameMedicine(medA, medB)`:
  - Asserts exact match of canonical active ingredient sets.
  - Different doses of the same ingredient match (`Citalopram 20mg` vs `Citalopram 40mg` -> `true`).
  - Combination overlap (e.g. `Amoxicillin` vs `Amoxicillin + Clavulanic Acid`) returns `false` (warns only, does not supersede).
- Implemented `getDaysRemaining(rx, now = new Date())` calculating remaining active course days.

### 1.2 Data Model Updates (`server/src/models/Prescription.js`)
- Added supersession tracking fields to `prescriptionSchema`:
  - `supersededBy`: ObjectId referencing newer `Prescription`.
  - `supersededByConsultationId`: ObjectId referencing superseding `Consultation`.
  - `supersededAt`: Date of supersession event.
  - `supersededReason`: String (`"newer_prescription_same_medicine"`).
  - `resolvedIngredients`: Array of canonical ingredient strings.

### 1.3 Atomic Consultation Supersession (`server/src/services/consultationCommandService.js`)
- On saving a consultation with new prescriptions:
  - Queries active candidates for the patient (`status: pending | issued | dispensed | partially_dispensed`, `supersededBy: null`).
  - For each new prescription item, atomically checks existing candidate prescriptions.
  - If `isSameMedicine(candidate, newMed)` and `getPrescriptionActiveState(candidate, now) === 'active'`, atomically marks:
    - `candidate.supersededBy = rx._id`
    - `candidate.supersededByConsultationId = consultation._id`
    - `candidate.supersededAt = now`
    - `candidate.supersededReason = "newer_prescription_same_medicine"`
    - Saves candidate within transaction session.
    - Records audit log: `PRESCRIPTION_SUPERSEDED` with resource IDs only (no PII).

### 1.4 Dispensing Safety Hard Stop (`server/src/services/dispensingService.js`)
- In atomic dispensing checkout:
  - If `rx.supersededBy || rx.supersededAt`, dispensing immediately fails with `fail('SUPERSEDED', 'Prescription has been superseded by a newer consultation and cannot be dispensed.', 400)`.

### 1.5 Pharmacy Pending Queue Hygiene (`server/src/controllers/pharmacyController.js`)
- In `getPendingPrescriptions`:
  - Added `supersededBy: null` query predicate.
  - Filtered results via `getPrescriptionActiveState(rx) === 'active'` to guarantee superseded or expired prescriptions never appear in the pharmacist's pending dispensing queue.

### 1.6 Release Summary & Public Verification (`server/src/services/releaseSummaryService.js` & `client/src/pages/public/VerifyConsultation.jsx`)
- `releaseSummaryService.js` now uses `getPrescriptionActiveState(rx)`:
  - Superseded items receive `status: 'superseded'`, `statusLabel: 'Replaced by newer prescription'`.
  - Expired unreleased items receive `status: 'expired'`, `statusLabel: 'Course ended'`.
- `VerifyConsultation.jsx` displays dedicated badges:
  - Blue/sky pill for superseded: `Replaced by newer prescription` (`verification.statusSuperseded`).
  - Amber pill for expired: `Course ended` (`verification.statusExpired`).

### 1.7 Doctor Safety Check Notice (`server/src/controllers/prescriptionController.js` & `client/src/components/common/MedicineSafetyPanel.jsx`)
- In `/api/prescriptions/check-safety`:
  - When a prescribed medication matches an existing active medication for the patient, attaches `supersededNotices`:
    `"<Drug> is currently active from CON-xxxx (started <date>, <n> days left). Saving will replace it."`
- `MedicineSafetyPanel.jsx` renders a non-blocking informative blue callout card for each superseded notice.

---

## 2. Verification Suite Results

- **Test Suite**: `server/tests/prescriptionSupersession.test.js` (13 tests passed / 0 failed).
- **Trilingual Parity**: `en.js`, `si.js`, and `ta.js` updated with exact parity (839 keys each).
- **Test suite registration**: added to `server/clinical.offline.jest.cjs`.
