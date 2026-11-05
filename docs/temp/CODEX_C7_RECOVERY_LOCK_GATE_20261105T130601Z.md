# C7 recovery and login-form concurrency: offline gate

2026-11-05T13:06:02.984Z

New red tests: nine application recovery failures and ten concurrent login/OTP failures. Fix: localized status-announced Suspense loading; outer shell boundary in addition to existing keyed route boundary; focused safe recovery heading; minimum44px reload control. Five actual login pages share one synchronous per-page lock across login, OTP verify and resend, released in finally. Existing endpoint, password, OTP, token, redirect and server admission contracts are unchanged. Actual mocked success and explicit post-failure resubmission are tested for every role; no automatic retry.

Focused32PASS/0FAIL, client574PASS; combined3162PASS/0FAIL/0SKIP,exit0,sourceFrozen/protected15. Intermediate3161PASS/1testfailure preserved: dotted property path was incorrectly interpreted by Jest; own-key assertion fixes the test. Production client source did not change after successful buildexit0,117modules,demoImported=false,clinical-production.

Full command: node scripts/run_offline_tests.js. Receipt scratch/clinical-offline-GSoO4Z/summary.json. Build scratch/CODEX_C7_CLINICAL_PRODUCTION_BUILD_1793878490125/build-result.json. Focused source tests: app-recovery-states.test.jsx, login-submit-lock.test.jsx, existing not-found.test.jsx. Faults and APIs are inert fixtures; not live E2E.

C7 is partial: remaining major forms, inner history privacy/localization, empty/error handling and full accessibility remain open. Local compiled Chromium found language-button widths32–34px across9views (zero external/API traffic,zero normal console/page errors): docs/temp/CODEX_OFFLINE_LANGUAGE_GEOMETRY_RED_20261105T114000Z.json. Next item will repair measured targets; no Lighthouse score claimed.

No live login/email or clinical/provider/data/Redis operation. Operator totals remain8/0/8,cap25. No current live approval.
