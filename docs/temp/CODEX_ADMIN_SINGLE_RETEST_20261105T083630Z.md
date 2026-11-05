# Admin single-session retest — partial result

2026-11-05T08:36:30.754Z. Live application commit 40979ff0aadee8ae9b97d20ded5bdf21e228ae10; run q1_sessions_20261105_eb1768a8.

| Check | Actual result |
| --- | --- |
| Login / logout | One each; HTTP 200 / 200 |
| Dashboard render / banner | PASS: rendered, no temporary/prototype/demo banner |
| Console / page exceptions | 0 / 0 |
| Blocked method/path patterns | None; total 0, including /socket.io/ |
| First /api/admin/ml-status | HTTP 200, unavailable, category=bad_response, received 2026-11-05 14:01:24 Asia/Colombo |
| Repeat about sixty seconds later | NOT SENT; no status or category exists |
| Owned session/browser cleanup | Server logout200, browser closed |

The runner exited 1 with ROLE_BROWSER_STEP_FAILED_SANITIZED after recording both page observations. The original receipt did not retain the exact thrown stage. A likely timing race is the initial-response guard, which checked an asynchronous response array after a fixed five-second render wait. A late reply can reach the observer during cleanup, as permitted by this source path. This is not a proven upstream failure and does not establish a cold-start-versus-steady comparison. Do not manufacture a second result or treat the overall timed retest as PASS.

The local runner candidate now explicitly waits, bounded to sixty seconds, for the already-dispatched first reply, then sends one additional GET sixty seconds after that receipt; fixed stage labels are retained. Delayed arrival, timeout, duplicate responses, interval enforcement, scope admission and no-retry behavior are tested offline. Focused138PASS, complete3054PASS/0FAIL/0SKIP, exit0, sourceFrozen=true,15pins. Receipt scratch/clinical-offline-L6wGfX/summary.json. This correction has NOT run live and is not committed or pushed. Application and protected source are unchanged. No second authentication or request was attempted.

Final operator-dashboard totals: Resend6, Brevo0, combined6; cap25, remaining19. Operator matches the new alert to this single retest. No further login/email is authorized. The one-login approval is consumed; another timed comparison needs fresh separate approval. Historical clinical real E2E remains2/14.

Original receipt preserved byte-for-byte: docs/temp/CODEX_Q1_SESSION_admin_1793867465453.json. Its digest, executed runner binding and distinct corrected-candidate binding are recorded in docs/temp/CODEX_ADMIN_SINGLE_RETEST_20261105T083630Z.json. No new screenshot was captured before runner termination; DOM/console/HTTP receipts provide the stated observations.
