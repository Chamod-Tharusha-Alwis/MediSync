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
    1. `medisync.system.lk@gmail.com` (Admin)
    2. `chamodtharusha13@gmail.com` (Patient)
    3. `chamodalwis1309@gmail.com` (Doctor)
    4. `ayuaranacare@gmail.com` (Hospital)
    5. `coctharusha0913@gmail.com` (Pharmacy)
  - Intercepts OTP email dispatch for allowlisted emails when active, preserving email provider quota.
  - Logs every use without logging the OTP code (`[Security Audit] Temporary test OTP verified successfully for allowlisted test account: <masked>`).

---

## 3. Removal Procedure (Final Task of Master Run)
1. Delete `server/src/security/testOtpHarness.js`.
2. Remove harness integrations from:
   - `server/src/utils/emailService.js`
   - `server/src/controllers/authController.js`
   - `server/src/controllers/patientController.js`
   - `server/src/controllers/labController.js`
3. Add automated regression test `server/tests/testOtpRemoval.test.js` proving no bypass exists.
4. Remove `TEST_OTP_ENABLED` and `TEST_OTP_CODE` from environment.
5. Push to `main` and remind user to rotate the five test account passwords.
