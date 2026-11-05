# Empty-SQLite ML contract and sanitized diagnostics

2026-11-05T09:48:24.750Z. Base source c00f2589218750120c34fbde5533cacbda3038d4.

## Actual offline route and validator result

Fresh owned scratch profile initialises the real Flask schema and verifies outbreak_tracking=0 and outbreak_feedback=0. The actual HMAC-authenticated GET /model-status returns200 with41reference disease profiles, independently of outbreak tracking. SQLite connect is patched to reject during the route, with0calls observed; before/after counts remain0. Its complete actual JSON reply is fed unchanged to the actual Node readAdminMlStatus validator over an inert sender. No fixture implementation replaces the Flask handler or backend validator. This is in-process contract evidence, not real Express-to-Flask network or clinical E2E.

| Validator rule | Real reply | One-field corruption rejected |
| --- | --- | --- |
| response | PASS | PASS |
| status | PASS | PASS |
| dataPoints | PASS | PASS |
| dataPointUnit | PASS | PASS |
| clinicalValidation | PASS | PASS |
| models.diseasePrediction | PASS | PASS |
| models.outbreakForecasting | PASS | PASS |

Four real Flask tests cover this empty-storage case and missing/wrong/missing-shared-key403denials. The latter map to the existing backend auth category, not schema success. Full3118PASS/0FAIL/0SKIP/sourceFrozen=true/15pins; focused167PASS; isolated production buildexit0,existingwarnings. Seven new cross-runtime rule pairs are counted as7logical checks, not14new live tests. Actual fixture digest and exact profile breakdown are in docs/temp/CODEX_V2_ML_STATUS_DIAGNOSTICS_20261105T094824Z.json.

## Fixed safe diagnostics

Only bad_response logs gain reason=schema/http_status/redirect/other, upstreamStatus=bounded numeric code or none, and failedFields from7fixed paths. Response bodies, exception text, keys, URLs, headers and arbitrary keys are never serialized. Config/auth/not_found/dns/timeout/connection logs and the browser unavailable DTO retain their existing contracts. A synthetic offline captured example is:

`[AdminMlStatus] category=bad_response reason=schema upstreamStatus=200 failedFields=dataPointUnit`

TLS, HMAC, exact root URL joining, bounded timeout/size and maxRedirects0remain. Even a fulfilled3xx/4xx/5xx with schema-compatible body is refused. Tests cover each field, multi-field errors, spoofed status strings, redirection and log suppression. A two-case diagnostic test-expectation failure is retained; the final assertions check allowlisted comma-separated fields plus exact multi-field output. No validation was loosened.

## Live status and next gate

Operator confirms ML86d5876Live; local protected app.py bytes match that Git source. This does not independently inspect the remote image. Empty tracking alone does not reproduce bad_response in this profile. Both P1requests remain200/unavailable/bad_response at09:19:18 and09:20:20UTC,60004ms between first reply and second dispatch;0console/blocked requests. The live upstream reason remainsNOT VERIFIED until a separately approved P2check captures the new fixed fields. No further login/email is authorized. Last confirmed totalsResend7/Brevo0/combined7,cap25/remaining18. No Atlas/Redis, live data/DDL, ML ingestion or hosting-setting change was performed; clinical acceptance remains historical2/14.
