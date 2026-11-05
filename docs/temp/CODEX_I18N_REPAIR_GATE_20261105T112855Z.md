# Translation registration repair: offline evidence

2026-11-05T11:28:56.451Z

12 missing keys used at 23 call sites are now registered in EN/SI/TA; original 739 labels per language are preserved. Actual held PDF controls remain disabled and show existing native-language labels. Red: two locale failures, then 550 client PASS. Audit tests: 11 PASS. Combined: 3,138 PASS, zero failed/skipped, source frozen, 15 protected expectations intact.

The replacement AST audit compares exact key sets, rejects duplicate/empty/nonliteral dictionary entries without executing them, follows the actual client import graph, and reports source positions without literal values. Legacy percentage estimates are withdrawn. 751 keys per locale, zero missing static usage registrations; 1,760 candidate positions and five dynamic keys require review. No all-site translation claim.

Build profile was explicitly asserted clinical-production (116 modules, demoImported=false). The output log completed compilation; process exit was lost with the expired tool session and is NOT VERIFIED locally. Exact-head CI build must pass before deployment closure. The prior direct local build inherited the QA environment flag: its compilation alone did not establish production configuration. This build clears that flag. Existing clinical build policy and CI were not weakened.

Receipts: scratch/CODEX_I18N_LABELS_GREEN_1793877400821/client-results.json; scratch/clinical-offline-XBD81s/summary.json. Source audit: docs/temp/CODEX_I18N_SOURCE_AUDIT_20261105T111802Z.json. Matrix: docs/temp/CODEX_TEST_MATRIX_20261105T112855Z.json. Full command: node scripts/run_offline_tests.js (exit0). Focused command: node server/node_modules/jest/bin/jest.js --config server/clinical.offline.jest.cjs --runInBand --runTestsByPath server/tests/i18nSourceAudit.test.js --silent (exit0). No real infrastructure qualification implied.

Post-idle check is a FINAL live-run requirement only, with named approval and fresh counts; it has not run. Operator-confirmed emails remain 8/0/8, cap25. P2 remains accepted point-in-time; prior bad_response cause unverified.
