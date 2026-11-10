# MediSync Task R2 Verification Report: ML Service Logging & Proof of Use (`docs/final/R2_REPORT.md`)

- **Date**: 2026-11-10
- **Branch**: `final/rem-r2-ml-logging`
- **Scope**: ML engine structured logging, Gunicorn access log, `/metrics` Prometheus/JSON endpoints, backend request telemetry (`[ML] predict_disease`), fallback differentiation, and proof-of-use UI metadata.
- **Offline Quality Gate**: 3,559 passed / 0 failed across 219 test suites (139 backend, 78 client, 2 email-pdf, 40 ml-scoring, 31 ml-flask, 55 root tap, 7 ml-status-contract).
- **Client Build**: Exit code 0, 0 errors.
- **Protected Ledger Status**: 15 / 15 accounted for; controlled change to `ml-engine/app.py` recorded in `docs/final/LEDGER_CHANGELOG.md` with SHA-256 update in `docs/release/PROTECTED_HASHES.json`.

---

## 1. Executive Summary

Task R2 addresses the observation that the live ML engine functions correctly but produced empty logs in Render dashboard due to lack of request-level logging. Structured stdout logging with zero PII has been implemented across both the ML engine and the backend gateway:

1. **ML Engine Startup Logging**:
   - Emits `[ML-STARTUP]` on initialization with concept counts, curated disease profiles, Tier 2 empirical profiles, and process RSS memory in megabytes:
     `[ML-STARTUP] model=tiered_matcher_v2 kb_version=v1 concepts=71704 curated=41 kb_empirical=174 rss_mb=<float> status=ready`
2. **Gunicorn Access Logging**:
   - Updated `ml-engine/Dockerfile` `CMD` to include `--access-logfile -`, streaming all incoming HTTP access entries directly to standard output.
3. **ML Engine Per-Request Structured Logging**:
   - Implemented `@app.before_request` and `@app.after_request` hooks emitting non-PII telemetry:
     `[ML] request_id=<uuid> method=<method> path=<path> status=<status> latency_ms=<float> symptoms_count=<N> tier=<1|2> top_confidence=<float>`
   - Zero symptom strings and zero personal identifiers are emitted.
4. **Prometheus / JSON `/metrics` Endpoint**:
   - Added `GET /metrics` in `ml-engine/app.py` tracking:
     - `medisync_ml_requests_total`
     - `medisync_ml_predictions_total`
     - `medisync_ml_tier1_total`
     - `medisync_ml_tier2_total`
     - `medisync_ml_errors_total`
   - Added platform health/metrics routing in `server/src/app.js` (`/metrics`, `/api/metrics`).
5. **Backend Gateway Logging (`server/src/services/mlPredictionService.js`)**:
   - Emits structured telemetry on each prediction:
     `[ML] predict_disease status=200 latency_ms=<int> tier=<1|2> source=ml-engine`
   - On fallback/service unavailability:
     `[ML] predict_disease status=503 latency_ms=<int> tier=none source=fallback`
   - Response payload explicitly returns `source: "ml-engine" | "fallback"`, `tier`, and `latencyMs`.
6. **UI Proof-of-Use & Fallback Indicator (`client/src/pages/doctor/NewConsultation.jsx`)**:
   - Suggestion card displays exact tier, latency, and model version:
     `Tier <N> match · <latency>ms · Model v2.0`
   - If ML service is unavailable or in fallback mode, UI displays:
     `ML service unavailable; reference catalog fallback`
   - Existing manual clinician entry and search remain fully functional.

---

## 2. Test Verification Matrix

| Test Suite / Runner | Tests Passed | Failed | Verification Scope |
|---|:---:|:---:|---|
| `server/tests/mlTelemetryLogging.test.js` | 3 | 0 | Structured stdout logging, non-PII assertions, latency/tier tracking, fallback distinction |
| `server/tests/postR2LocalReadiness.test.js` | 30 | 0 | Application lifecycle, runtime health, /metrics route compatibility |
| `client/src/__master_offline__/phase1-cold-start-resilience.test.jsx` | 6 | 0 | UI cold-start waking retry, 2-call boundary, unavailable state |
| `client/src/__master_offline__/b13-inference.test.jsx` | 21 | 0 | Inference display, similarity score, manual override retention |
| `ml-engine/test_medication_safety.py` | 6 | 0 | DDI safety engine and startup logging |
| `ml-engine/b13_r2_scoring_checks.py` | 40 | 0 | Exact AST extraction, mathematical scoring bounds |
| `scripts/run_offline_tests.js` | **3,559** | **0** | Full 219-suite offline gate across all modes |
| `npm --prefix client run build` | Code 0 | 0 | Optimized React production bundle |

---

## 3. Controlled Protected File Ledger Entry

- **File**: `ml-engine/app.py`
- **Old Approved SHA-256**: `0500ddf7db3bb3bb5af945a44adacf5b1a920facdf37d32d665cca40caab1a37`
- **New Approved SHA-256**: `3b51e3fde149146d85ca2f15668ddb35963ebc8d700f89720c068536b5bb25de`
- **Line Endings**: Verbatim CRLF preserved (`.gitattributes -text` enforced).
- **Log Entry**: Recorded in `docs/final/LEDGER_CHANGELOG.md` and updated in `docs/release/PROTECTED_HASHES.json`.
