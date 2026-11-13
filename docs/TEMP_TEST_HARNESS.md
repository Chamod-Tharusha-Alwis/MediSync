# Temporary Test Harness Documentation

This document inventories all temporary test aids, flags, and bypasses introduced for automated or QA verification, along with removal instructions.

---

## 1. Inventory of Temporary Test Aids
| Test Aid | Location | Activation Condition | Allowlist Scope | Removal Phase |
| --- | --- | --- | --- | --- |
| Temporary Test OTP Security Harness | `server/src/security/testOtpHarness.js` | `TEST_OTP_ENABLED=true` + `TEST_OTP_CODE` | Exactly 5 designated test account emails | Final Task of Master Run |

---

## 2. Security Guardrails for Temporary Test OTP
- **Activation Invariants**:
  - Enabled strictly via environment variable `TEST_OTP_ENABLED=true`.
  - OTP value is injected via `TEST_OTP_CODE` (must be 6-digit numeric string). Never hardcoded in source or committed.
  - Restricted strictly to the allowlist of exactly five test account emails:
    1. `admin.owner@example.org` (Admin)
    2. `patient.owner@example.org` (Patient)
    3. `doctor.owner@example.org` (Doctor)
    4. `hospital.owner@example.org` (Hospital)
    5. `pharmacy.owner@example.org` (Pharmacy)
  - Intercepts OTP email dispatch for allowlisted emails when active, preserving email provider quota.
  - Logs every use without logging the OTP code (`[Security Audit] Temporary test OTP verified successfully for allowlisted test account: <masked>`).

---

## 3. Removal Procedure Status
- **Status**: EXECUTED on branch `chore/remove-test-otp` (Milestone 4 WP6).
- **Actions executed**:
  1. Deleted `server/src/security/testOtpHarness.js`.
  2. Removed harness integrations from:
     - `server/src/utils/emailService.js`
     - `server/src/controllers/authController.js`
     - `server/src/controllers/patientController.js`
     - `server/src/controllers/labController.js`
  3. Added regression verification test suite `server/tests/testOtpRemovalOffline.test.js` proving no bypass exists and `TEST_OTP_ENABLED=true` cannot bypass OTP.
  4. Removed `testOtpHarnessOffline.test.js` and updated `server/clinical.offline.jest.cjs`.
  5. Cleaned `server/tests/jwt-patient-nic-removal-s1.test.js`.
  6. Verified zero references to `testOtpHarness` or `TEST_OTP` in `server/src/`.
  7. Committed on `chore/remove-test-otp` and pushed to remote (left unmerged pending live verification).
