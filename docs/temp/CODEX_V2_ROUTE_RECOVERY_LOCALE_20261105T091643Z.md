# Localized route recovery

2026-11-05T09:16:43.410Z

Actual component regression reproduced two failures in selected Sinhala/Tamil while English passed. The route error boundary now reads existing language context through a small wrapper and supplies translated title, interrupted-save caution and reload label to the same catching class. Keyed route remount behavior, exception suppression, English fallback outside the provider and reload semantics are preserved. No authentication, API, database, encryption, consent or PDF policy changes.

Client profile547PASS/0FAIL/0SKIP; complete3078PASS/0FAIL/0SKIP,sourceFrozen=true,15pins; isolated production buildexit0,existing warnings. New7tests cover all3recovery locales,739-key/nonempty parity, local persistence/remount, missing-key fallback, interrupted-save warning and language switching during the error state. The preserved red run is544PASS/2FAIL before the source correction. These tests execute production React components/provider, not string assertions.

This is not full trilingual clinical qualification, mobile geometry/accessibility acceptance, or live error injection. Public navigation regression may run after exact-head deployment; private pages and P1 remain gated. No new login/email/directDB/Redis/provider operation. Source hashes, exact receipts and build path are in docs/temp/CODEX_V2_ROUTE_RECOVERY_LOCALE_20261105T091643Z.json.
