# MediSync Test Log

| Date | Feature | Commit | Offline Tests | Production Build | Live Verification Results | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-31 | React Error #31 Regression & History Boundary | `3a36494` | PASS (2,254/2,254) | PASS | PASS (Doctor lookup past OTP renders Step 2 without crash) | `scratch/browser_step2_verified.png` |
| 2026-11-01 | Pharmacy Account Password Candidate Match | Local check | PASS | N/A | Local bcrypt comparison against Atlas `pharmacystaffs` | Candidate 1: match, Candidate 2: match |
| 2026-11-01 | A1: Public Health 503 Resolution & Graceful Degradation | `7cc6947` | PASS (Backend: 25 tests; Frontend: 11 tests) | PASS | PASS: Desktop live 200 OK, Mobile 375px clean, 503 retry flow verified | `live_public_health_desktop.png`, `live_public_health_503_degradation.png`, `live_public_health_after_retry.png` |
| 2026-11-01 | A2: Resolve GET /broadcasts/latest 401 on unauthenticated calls | `88b07a4` | PASS (Frontend: 7 tests) | PASS | PASS: 0 broadcast calls on public routes, 401 retained on unauthenticated API | Live browser matrix (null, undefined, clean storage) |
| 2026-11-01 | A3: Safe socket disconnect eliminating WebSocket closed warning | `fd39fce` | PASS (Frontend: 12 tests) | PASS | PASS: 0 WebSocket warnings across public routes and rapid unmounts | Live Playwright headless trace: 0 warnings, live chunk `305.75888904.chunk.js` serving `skipReconnect: true` |
| 2026-11-01 | A4: Provenance audit for `feature_collector.js` | N/A (Doc) | N/A | N/A | PASS: Complete codebase & dependency search (0 matches) | Confirmed external 3rd-party browser/extension origin |
| 2026-11-01 | A5: Guard socket initialization on missing or invalid token | `b99e54b`, `64e92e6` | PASS (Frontend: 16 tests) | PASS | PASS: 0 socket calls dispatched on empty, 'undefined', or 'null' tokens | Live Playwright headless test across null, 'undefined', and 'null' storage states |
| 2026-11-01 | A6: Consolidate duplicate notification lifecycles | `e246778` | PASS (Frontend: 20 tests) | PASS | PASS: 1 fetch to /notifications, 1 socket connection, 0 duplicate connections on mobile drawer toggle | Live Playwright headless test across desktop and mobile viewports |
