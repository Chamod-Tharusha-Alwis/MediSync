# Masking deployment and one combined live sweep

Application commit `4383d6367ea19b6f21e084c76700e80fa291174e`. Mask-only commit independent of the later test-harness changes. Both exact-head CI workflows passed:41964403284(clinical),41964403249(security). Vercel`dpl_DjARK9AL7sHn1aRr3S7HXztNnj7X` READY exactSHA; backendhealth200/ready/exactSHA. Mask gate2953PASS/build0/15pins. No recipient/stored/logmask change. Live email-body masking awaits operator confirmation; do not call received-mail masking PASS yet.

## Actual browser results

| Role | Login/logout HTTP | Dashboard/no-console verdict | Console errors | Blocked requests |
| --- | --- | --- | --- | --- |
| admin | 200/200 | FAIL | 3 | 3 |
| patient | 200/200 | PASS | 0 | 0 |
| doctor | 200/200 | PASS | 0 | 0 |
| hospital | 200/200 | PASS | 0 | 0 |
| pharmacy | 200/200 | PASS | 0 | 0 |

Exactly5login attempts and5logout200responses. No retry; admin authority consumed. All dashboards rendered without a prototype/demo/temporary banner;0page exceptions across roles. Patient/doctor/hospital/pharmacy had0console errors and0blocked requests. Admin failed the no-console gate with3boundary-induced resource errors. These are not proof of a production Socket.IO defect. Preserve the original failure receipt unchanged.

Final blocked-request breakdown: **GET `/socket.io/`:3 (admin)**. Other methods/path patterns:0recorded. No clinical save, dispense, OTP, ingest, seed, surveillance trigger or cache-clear request was dispatched by the harness. Normal login/session/audit/lastLogin effects are within the approved authenticated scope; this is not a claim of zero database writes by the application. No direct Atlas/Redis connection.

Admin `/api/admin/ml-status`:HTTP200,explicitunavailable,category`bad_response`. Fixed backend log-line confirmation awaits operator; actual upstream status/schema cause remains unverified. The strict unavailable card DOM matcher returnedfalse, so exact UI-card acceptance is NOT VERIFIED even though the API contract passed. Do not reinterpret general page rendering as proof of that card. No forecast widget was observed. Existing map data truth remains unverified, independently of page/no-console acceptance.

Doctor dashboard plus actual `/doctor/consultation/new` initial page rendered in Chromium, with a blank patient field and no consent modal. No patient identifier entered or looked up. Lab dropdown and medication controls are behind the real consent gate: opening PatientAccessModal automatically requests an OTP, which is outside this approval. Therefore lab placement/drug search UI are BLOCKED, not mocked or bypassed. Interaction UI calls POST `/api/drugs/interactions`; although its controller reads Drug and computes warnings, the existing narrow allowlist does not authorize it. No clinical save or dispense occurred.

Lighthouse:BLOCKED(tool not installed in repository/global/knownQA locations). No installation, substitute score, or authenticated Lighthouse claim. All screenshots are in the owned `%LOCALAPPDATA%/medisync/evidence/q1_sessions_20261105_b24d9a71` directory, outside repo/OneDrive; none staged or committed. Original per-role receipts reference their exact screenshot paths.

## Harness qualification and preserved failures

The exact4admin-executed runner/policy sources were hash-verified against that receipt and copied to unique CODEX_COMBINED_ADMIN_EXECUTED TXT evidence before changes. Sanitized request/console receipts do not retain raw URL/query values, headers, bodies, real identifiers, tokens or private input. UI screenshots are private external artifacts, not published evidence. An inert browser rehearsal using the installed Socket.IO client, with every HTTP request aborted and WebSocket route closed before any connection, generated an accepted polling URL. That does not identify the historical three blocked GETs.

A possible logout cleanup issue was found: the test's direct server logout did not notify page listeners before the boundary closed the socket scope. The harness now dispatches the application's existing session-cleared event before its one real server logout request. Inert tests prove event-before-request, exactonePOST and failure not treated as logout proof. This is harness cleanup, not a production transport/authentication patch. The remaining four roles passed; admin was NOT rerun and NOT relabelled PASS. Historic exact denial reason/timing remains unverified. New receipts record fixed transport denial categories without arbitrary values. The notification allowlist did not expand.

The browser may request a notification handshake immediately after login headers, before the runner has parsed the actual JSON proof. The guard now waits at most3seconds for that real validated proof; OTP/failed/unobserved authentication remains denied. No synthesized response or grant. New combined scope is explicit opt-in, preserves the original stricter historical map/telemetry acceptance output separately, and accepts only its stated dashboard/no-console/status contract. Missing clinical/Lighthouse checks are explicit and do not become PASS.

Latest full offline gate after all harness changes:2959PASS/0FAIL/0SKIP,exit0,sourceFrozen=true,15pins (`scratch/clinical-offline-0Gkrkn/summary.json`). Focused session/transport101PASS. No client application source changed after the successful masking build. Previous2958gate and mask2953gate preserved separately. Combined execution receipt and per-role hash bindings: `docs/temp/CODEX_COMBINED_SWEEP_RESULTS_20261105T041505Z.json`.

## Email accounting and stop

Operator-confirmed start:Resend0/Brevo0/combined0; limit25. Conservative reservation at most2perlogin =>upperbound10forfive attempts. Login responses do not expose actual send/delivery counts. Per-role actual alerts, masking and final provider totals await operator confirmation. No further login or email is authorized or will run under this consumed sweep. No OTP/invitation/broadcast/test mail sent by the harness. Historical clinical realE2E remains2/14; this partial browser sweep is not clinical production certification.

Portable original source/receipt bytes are encoded in `docs/temp/CODEX_COMBINED_SWEEP_PORTABLE_EXECUTED_BYTES_20261105T041708Z.json`. Decode base64 and compare the recorded rawSHA256; Git may normalize TXT/JSON line endings on checkout. This avoids changing attributes or historical evidence. All13entries were decoded and verified offline. No environment-file content is included.
