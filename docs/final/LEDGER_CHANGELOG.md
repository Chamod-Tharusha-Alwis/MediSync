# MediSync Protected Ledger Changelog (`docs/final/LEDGER_CHANGELOG.md`)

This changelog records all controlled and authorized modifications to the 15 cryptographically verified protected source files defined in `docs/release/PROTECTED_HASHES.json`.

---

## Controlled Changes

### 1. `ml-engine/app.py` (Task R2 - ML Service Logging and Telemetry)
- **Date**: 2026-11-10
- **File**: `ml-engine/app.py`
- **Previous Approved SHA-256**: `0500ddf7db3bb3bb5af945a44adacf5b1a920facdf37d32d665cca40caab1a37`
- **New Approved SHA-256**: `3b51e3fde149146d85ca2f15668ddb35963ebc8d700f89720c068536b5bb25de`
- **Line Endings**: Historical CRLF preserved verbatim (`.gitattributes -text` enforced)
- **Reason**: Added structured stdout startup logging (`[ML-STARTUP]`), per-request non-PII latency/tier telemetry (`[ML]`), and `/metrics` counter endpoint exposing Prometheus text and JSON metrics.
- **Verification**: Verified via `node scripts/run_offline_tests.js` (15/15 protected files accounted for, all 3,559 offline tests pass).
