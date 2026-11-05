# Phase 2 offline progress

Recorded 2026-11-05T14:23:34.516Z. Five finished fixes are pushed on main through fdbd40f. Both required CI workflows passed; backend health reported that exact SHA as ready and the existing Vercel deployment was READY at the same SHA.

| Commit | Finished change |
| --- | --- |
| 192e1d4 | Registered twelve missing translation keys and replaced unsupported translation percentages with an exact source audit |
| 4d02303 | Added localized loading/status feedback, shared-shell recovery and synchronous locks on five login/OTP forms |
| 3692403 | Removed raw history-exception logging, localized that fallback and enlarged language targets |
| f566eea | Prevented stale medication replies from replacing current warnings and rejected malformed or incomplete replies honestly |
| fdbd40f | Rejected malformed login input before account lookup while preserving supported legacy comparison paths |

The shared-source offline gate passed **3,211 tests**, with zero failures/skips and all fifteen protected expectations intact. The production client build passed. One earlier full run exposed a missing validator dependency in inert test harnesses; the existing 403 assertions were retained and the real validator was supplied. Failure evidence is preserved.

The matrix still has 846 rows: R 560, W-low 78, W-clin 41, W-sec 99, W-adm 37 and X 31. All fourteen clinical group definitions were located. Historical real clinical acceptance remains **2/14**. The earlier inventory-related definition conflict remains recorded; no stock check was introduced.

Dictionary parity is now 754 nonempty keys per language with no missing static registrations. Hard-coded source positions remain review findings, not a measured translation percentage. Native-language quality and the complete authenticated visual matrix are not verified.

Actual compiled local UI checks covered nine catchall views and forty-five public unavailable-state views in EN/SI/TA at 320, 375 and 1440 pixels. Language controls meet the 44-pixel target and tested views had keyboard reachability and no horizontal overflow. The forty-five-view run fulfilled thirty-six deliberate 503 responses locally: it recorded thirty-six expected fixture-related console entries, zero unexpected console errors and zero page exceptions. No request reached an external API. This is not live-data acceptance, a Lighthouse score or a complete accessibility certification.

The separate integrated 5/15 password-lockout candidate is ready for source review and remains inactive. Review: docs/temp/CODEX_PASSWORD_LOCKOUT_REVIEW_HANDOFF_20261105T142334Z.md. It has 2,498 detached backend PASS plus 40 lifecycle PASS, with one private preservation test excluded. The policy cases are included in those totals; they are not a new full combined regression.

Remaining work includes other major-form locks and state handling, distributed IP quotas, API-wide schema coverage, native-language/Lighthouse qualification and separately approved clinical/live checks. The earlier ML bad_response cause remains unverified. The FINAL live plan includes a post-idle admin ML-status check without intentional warm-up.

No new live login or provider send ran. The last operator-confirmed total is Resend 8, Brevo 0, combined 8 of 25; no fresh dashboard total is claimed. Clinical production remains NO-GO.
