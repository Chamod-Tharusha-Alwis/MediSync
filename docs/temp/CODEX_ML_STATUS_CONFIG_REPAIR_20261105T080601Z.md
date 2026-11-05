# ML-status configuration and request-phase repair

2026-11-05T08:06:01.010Z. Base HEAD f55bc64c220a451992faff24755219dc7a9dbb7c. Offline qualification only at this checkpoint.

## Source findings and repair

- server/src/controllers/adminController.js:20 reads exactly ML_ENGINE_URL. Previously an undefined or empty value silently selected localhost:5001; whitespace was passed through. The fallback is removed. Missing/invalid configuration now returns HTTP 200 with the explicit unavailable envelope and fixed category=config, before token preparation or HTTP dispatch. No environment values are read by the service itself.
- Controller lines 515-520 inject the URL, HMAC generator and Axios lifecycle-aware getter. NODE_ENV permits explicitly configured loopback HTTP only outside production; production requires HTTPS and rejects loopback. No QA or database policy changes.
- server/src/services/adminMlStatusService.js:15-25 accepts only a root origin, rejects credentials/query/fragment/path/whitespace and unsafe protocols, and joins exactly /model-status. Trailing root slashes normalize. maxRedirects remains 0; timeout 10000 and response limit 65536 remain unchanged. TLS verification is not overridden.
- INTERNAL_API_KEY remains the HMAC source (server/src/utils/internalAuth.js:21-37); signing and verification are unchanged. Missing/throwing/invalid token preparation is config, not upstream auth. An actual 401/403 remains auth.
- Adapter-boundary lifecycle observations separate request preparation, transport and received reply. A newly added negative failed before the correction: a plain response-interceptor exception after an inert response was incorrectly config. The final test passes and remains bad_response. No absence-of-metadata or absence-of-boot-log claim is used to prove no network contact historically.
- Strict upstream schema, reference-profile unit, unestablished clinical validation, unavailable forecasting and allowed model names are unchanged. Unrelated HTML/JSON, malformed responses, redirects and unmapped upstream failures remain bad_response. There is no relaxation to make an unavailable model appear available.
- The read-only browser evidence parser now recognizes only the added fixed config category; no transport or clinical-write allowlist expansion. The live runner was not executed.

## Executed evidence

- Focused Jest: 132 PASS, 0 FAIL, 0 SKIP, exit 0, 2 suites. Command: node server/node_modules/jest/bin/jest.js --config server/clinical.offline.jest.cjs --runInBand --runTestsByPath server/tests/adminMlStatusOffline.test.js server/tests/authenticatedSessionBrowser.test.js --silent.
- Complete offline runner: 3048 PASS, 0 FAIL, 0 SKIP, exit 0; backend 2370, client 540, email/PDF 31, ML scoring 40, owned Flask 27, root loopback 40. Command: node scripts/run_offline_tests.js. Receipt scratch/clinical-offline-huQduE/summary.json; sourceFrozen=true, 15 protected expectations intact. This is +61 checks versus committed 2987, not additional live acceptance. Local Node v26.4.0; CI separately uses Node 24.
- Production client build exit 0, 116 modules, demoImported=false, existing warnings. Captured scratch/CODEX_ML_STATUS_CONFIG_BUILD_20261105.log before the final backend lifecycle correction; client bytes did not change. Exact-head CI will repeat the build.
- Syntax checks and git diff --check exit 0. LF-to-CRLF working-copy warnings are conversion notices; no whole-file line-ending rewrite.
- Preserved failing negative: scratch/CODEX_ML_CONFIG_RESPONSE_PHASE_NEGATIVE_20261105.log (1 failed / 99 filtered). It is deliberately not presented as a full regression result. Final focused and full gates pass after the source repair.

## Operator evidence and remaining boundaries

Operator-confirmed totals: Resend 5, Brevo 0, combined 5; cap 25, remaining 20. Five received alert masks and Sri Lanka labels confirmed; identifiers are not retained. The operator confirms the public root ML URL was configured before the sweep. This validates the URL shape, not the historical response. The AdminMlStatus log-category placeholder is still NOT CONFIRMED. Supplied ML lines are Gunicorn startup messages, not access logs; they cannot establish whether the request was sent. Raw backend/keyring/connection excerpts were not retained.

No new login, email, direct Atlas/Redis connection, clinical operation, ML data mutation or manual deployment was performed. The earlier admin sweep remains FAIL with 3 blocked socket GETs. The socket cleanup has offline proof; live admin retest needs separate approval. Real clinical E2E remains 2/14. Historical bad_response root cause remains NOT VERIFIED. Source push and automatic deployment verification follow this checkpoint; their result belongs in a separate exact-head receipt.

Full source hashes and evidence bindings: docs/temp/CODEX_ML_STATUS_CONFIG_REPAIR_20261105T080601Z.json.
