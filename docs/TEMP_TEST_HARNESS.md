# Temporary Test Harness Documentation

This document inventories all temporary test aids, flags, and bypasses introduced for automated or QA verification, along with removal instructions.

---

## 1. Inventory of Temporary Test Aids
| Test Aid | Location | Activation Condition | Allowlist Scope | Removal Phase |
| --- | --- | --- | --- | --- |
| Temporary Test OTP (Pending) | Auth / OTP controllers | `TEST_OTP_ENABLED=true` + `TEST_OTP_CODE` | 5 designated test account emails only | Final Task of Master Run |

---

## 2. Security Guardrails for Temporary Test OTP
When implemented:
- Enabled strictly via environment variable `TEST_OTP_ENABLED=true`.
- OTP value is injected via `TEST_OTP_CODE` (never hardcoded in source or committed).
- Restricted strictly to the allowlist of five test account emails.
- Logs every use without logging the OTP code.
- In the final cleanup task: code path, environment variables, and tests will be completely removed, verified with an automated regression test confirming bypass rejection.
