# Phase 3 Report — Medicine Release Data Integrity & Verification Portals

**Date**: 2026-11-09  
**Branch**: `final/p3-release-data`  
**Status**: COMPLETE  
**Ledger Compliance**: 15 / 15 Files Locked (`docs/release/PROTECTED_HASHES.json`)  
**Offline Test Suite**: PASS (3,474 passed, 0 failed, 208 test suites)  
**Frontend Client Build**: PASS (Exit Code 0)  

---

## 1. Executive Summary

Phase 3 established data integrity and cross-boundary synchronization between pharmacy medication dispensing workflows and the OTP-gated patient verification portal (`/verify/:token`). 

Prior to this phase:
1. `Dispensing` records relied strictly on live relational Mongoose lookups (`populate('staffId')`, `populate('pharmacyId')`) for pharmacist and facility names. If accounts were renamed or omitted in historical aggregation, records lacked durable denormalized attribution.
2. `Prescription` status only supported `pending`, `issued`, `dispensed`, `expired`, `cancelled`. A partial dispensing checkout was unrepresented at the schema level and rejected by checkout validation.
3. Pharmacy dispensing history (`/api/pharmacy/history`) and public consultation verification (`/api/verify/:token/otp/verify`) utilized decoupled logic to extract and summarize medicine release status.

In Phase 3:
1. Audited and enriched `Prescription.js` and `Dispensing.js` with non-destructive, backward-compatible fields: `pharmacistName`, `pharmacyName`, `isAlternativeDispensed`, `alternativeDetails`, and `partially_dispensed` status enum.
2. Supported atomic partial-dispense transitions: prescriptions transition to `partially_dispensed`, while full checkout or final completion transitions to `dispensed`.
3. Verified strict anti-duplicate dispensing lockouts: any subsequent attempt to dispense an already-dispensed prescription fails with HTTP 400 (`ALREADY_DISPENSED: Prescription is not eligible for dispensing.`).
4. Unified release summary facts into a single shared helper service (`server/src/services/releaseSummaryService.js`), reused directly by `pharmacyController.js` and `verificationController.js`.
5. All legacy records missing explicit denormalized names gracefully display `"Not recorded"` without breaking or producing runtime errors.

---

## 2. Audit of Dispensing Data Capture

### 2.1 Schema Audit & Additions

| Model / Service | Prior Fields | Phase 3 Additions | Backward Compatibility Note |
|---|---|---|---|
| `server/src/models/Prescription.js` | `status: ['pending', 'dispensed', 'issued', 'expired', 'cancelled']`, `dispensedBy`, `pharmacyName`, `dispenserStaffId`, `dispensedByPharmacist` | Added `'partially_dispensed'` to `status.enum` | Existing queries and indexes unchanged; old records keep existing statuses. |
| `server/src/models/Dispensing.js` | `prescriptionId`, `pharmacyId`, `staffId`, `patientNic`, `items`, `receiptNumber`, `dispensedAt` | Added `pharmacyName: String`, `pharmacistName: String`, `isAlternativeDispensed: Boolean`, `alternativeDetails: String` | Optional fields; older records without them resolve through populated refs or fallback to `"Not recorded"`. |
| `server/src/services/dispensingService.js` | Strict rejection of `status !== 'dispensed'` in checkout | Added `isPartial` flag to `validateItems` allowing item statuses `['dispensed', 'partial', 'out_of_stock']`. Populates `pharmacistName` and `pharmacyName` directly onto `Dispensing`. | Preserves all safety invariants, transactions, and allergy checks. |

### 2.2 Release Facts Parity

Both the public verification portal (`/verify/:token`) and internal pharmacy endpoints (`/api/pharmacy/history` and `/api/pharmacy/receipt/:receiptNo`) now resolve release facts through `server/src/services/releaseSummaryService.js`:
- **Pharmacy Facility**: `d.pharmacyName || d.pharmacyId?.name || rx.dispensedBy?.name || rx.pharmacyName || 'Not recorded'`
- **Dispensing Pharmacist**: `d.pharmacistName || d.staffId?.fullName || rx.dispensedByPharmacist || 'Not recorded'`
- **Pharmacy District**: `d.pharmacyId?.district || rx.dispensedBy?.district || 'Not recorded'`
- **Brand Substitution**: `Boolean(d.isAlternativeDispensed || rx.isAlternativeDispensed)` with exact reason string in `alternativeDetails`.
- **Per-Item Status**: `'released' | 'partially_released' | 'not_released' | 'cancelled'`.

---

## 3. Double-Dispensing Lockout & State Transitions

### 3.1 Finite State Machine

```
               [pending] / [issued]
                      |
         +------------+------------+
         | (isPartial: true)       | (full checkout)
         v                         v
 [partially_dispensed]         [dispensed]
         |                         |
         | (completion checkout)   | (subsequent attempt)
         +------------> [dispensed] |
                              |    v
                              +--> [ALREADY_DISPENSED Error (400)]
```

### 3.2 Lockout Invariants Verified

1. **First Dispense (Full)**:
   - Atomic update: `Prescription.updateOne({ _id: rx._id, status: { $in: ['pending', 'issued', 'partially_dispensed'] }, expiresAt: { $gt: now } }, { $set: { status: 'dispensed', ... } })`.
   - Transitions to `status: 'dispensed'`.
2. **Duplicate Dispense Attempt**:
   - `!['pending', 'issued', 'partially_dispensed'].includes(rx.status)` trips immediately.
   - Throws `DispenseError('ALREADY_DISPENSED', 'Prescription is not eligible for dispensing.', 400)`.
3. **Partial Dispense Transition**:
   - `isPartialDispense: true` updates `Prescription` to `status: 'partially_dispensed'`.
   - Subsequent completion checkout is permitted and updates `status: 'dispensed'`.
   - After completion, all further attempts throw `ALREADY_DISPENSED`.
4. **Idempotency Replay**:
   - Requests with matching idempotency key and request hash replay prior receipt with `{ replay: true }` without double-mutating inventory or database state.

---

## 4. Verification & Test Evidence

### 4.1 Dedicated Integration Suite (`server/tests/dispensingIntegrityPhase3.test.js`)

```
PASS server/tests/dispensingIntegrityPhase3.test.js
  Phase 3 — Medicine Release Data Integrity & Double-Dispense Lockout Suite
    1. Validation and Item Status Helper
      √ validateItems accepts standard items and sets dispensed status by default (1 ms)
      √ validateItems rejects partial status when isPartial is false (3 ms)
      √ validateItems permits partial status when isPartial is true
    2. Shared Release Summary Helper (computeReleaseSummary & groupDispensingHistoryByReceipt)
      √ computeReleaseSummary returns partially_released when a prescription is partially_dispensed (1 ms)
      √ computeReleaseSummary defaults to "Not recorded" for old legacy records without pharmacist/pharmacy
      √ groupDispensingHistoryByReceipt normalizes receipt facts matching verify summary
    3. Double-Dispensing Lockout & State Transitions
      √ dispensing rejects already-dispensed prescription with ALREADY_DISPENSED error (2 ms)
      √ dispensing allows transitioning partially_dispensed to dispensed (6 ms)
      √ partial dispense sets status to partially_dispensed and stores partial item status (1 ms)

Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
```

### 4.2 Quality Gate Verification

| Quality Gate | Command | Result | Details |
|---|---|---|---|
| **Protected Ledger** | `node scripts/run_offline_tests.js` | **15 / 15 LOCKED** | `PROTECTED_HASHES.json` 100% compliant. |
| **Offline Test Matrix** | `node scripts/run_offline_tests.js` | **3,474 passed / 0 failed** | 208 test suites; 0 failures. |
| **Client Production Build** | `npm --prefix client run build` | **Exit Code 0** | Production bundle compiled without errors. |
| **Existing Phase 3 Seeder** | `npx jest server/tests/phase3GroupingAndDispensingSeeder.test.js` | **4 passed / 0 failed** | Regressions checked and clean. |
| **Verification Portal** | `npx jest server/tests/otpVerificationPortal.test.js` | **11 passed / 0 failed** | Verify portal endpoints & PDF gates clean. |

---

## 5. Next Steps

With Phase 3 complete and verified:
1. Merge `final/p3-release-data` into `main`.
2. Update `docs/final/MASTER_STATE.md` and `docs/final/PROGRESS.md`.
3. Advance to **PHASE 4: Clinical Safety Gaps** (author `PHASE_4_PLAN.md`, deterministic emergency red-flag advisory on doctor consultation screen, verify sanity cases SC-03, SC-05, SC-09, SC-10).
