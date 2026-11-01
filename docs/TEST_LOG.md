# MediSync Test Log

| Date | Feature | Commit | Offline Tests | Production Build | Live Verification Results | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-31 | React Error #31 Regression & History Boundary | `3a36494` | PASS (2,254/2,254) | PASS | PASS (Doctor lookup past OTP renders Step 2 without crash) | `scratch/browser_step2_verified.png` |
| 2026-11-01 | Pharmacy Account Password Candidate Match | Local check | PASS | N/A | Local bcrypt comparison against Atlas `pharmacystaffs` | Candidate 1: match, Candidate 2: match |
| 2026-11-01 | A1: Public Health 503 Resolution & Graceful Degradation | `7cc6947` | PASS (Backend: 25 tests; Frontend: 11 tests) | PASS | PASS: Desktop live 200 OK, Mobile 375px clean, 503 retry flow verified | `live_public_health_desktop.png`, `live_public_health_503_degradation.png`, `live_public_health_after_retry.png` |
| 2026-11-01 | A2: Resolve GET /broadcasts/latest 401 on unauthenticated calls | `88b07a4` | PASS (Frontend: 7 tests) | PASS | PASS: 0 broadcast calls on public routes, 401 retained on unauthenticated API | Live browser matrix (null, undefined, clean storage) |
