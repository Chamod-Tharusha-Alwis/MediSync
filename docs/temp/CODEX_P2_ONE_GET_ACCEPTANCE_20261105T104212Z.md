# P2 single admin ML-status GET — PASS

2026-11-05T10:42:12.864Z. Live application e163f409515247a3ec4cc4e5ae50bacad00861f3.

| Requirement | Observed result |
| --- | --- |
| Admin authentication | Exactly1login,HTTP200; no retry |
| Logout | Exactly1,HTTP200; owned browser closed |
| ML-status | Exactly1GET dispatched,HTTP200,available,contractValid=true |
| Failure category | Not applicable for available response |
| Repeat | None; no timed-repeat field or request |
| Dashboard/status pages | Rendered, no temporary/prototype/demo banner |
| Console errors/page exceptions | 0/0 |
| Blocked method/path patterns | None; total0,including socket.io |
| Provider totals after | Operator confirms Resend8/Brevo0/combined8 of25;17remaining |

The status reply was received at10:31:01.479UTC(16:01:01.479Asia/Colombo). Screenshot stays outside repo/OneDrive; its private filename is retained in the original receipt. The service metadata contract is available at this observation; it is not clinical-validation/forecast/persistence evidence and does not prove the cause of earlier bad_response responses. No backend failure-log absence is claimed. No protected file or application runtime was changed for this retest.

## Narrow reusable test guard

The new opt-in admin-ml-once mode excludes timed/combined/other-role modes, reserves2emails and rejects projected usage above22/25. The routing fence requires authentication, permits only canonical GET plus OPTIONS for status, consumes the one-GET budget before dispatch and blocks any duplicate/query/case/trailing-slash alias. Existing session and notification controls remain; all clinical/OTP/ingest/seed/trigger/cache/dispense writes remain denied. Pre-live focused199PASS. Post-live full qualification of executed harness3121PASS. A further offline alias-negative exposed3unguarded variants; candidate now rejects them,202focusedPASS and final3124PASS/0FAIL/0SKIP,15pins. There was no further live run after that correction. Executed-versus-candidate source hashes are separately retained; do not project the live observation onto a later candidate.

No clinical records were created. Normal authentication can create/update session,security/audit and trusted-device records; those mandatory side effects were not enumerated by a direct DB query. No blanket statement of zero production writes is made for login/logout. No further login or email is authorized. Historical clinical acceptance remains2/14.

Original preserved receipt: docs/temp/CODEX_Q1_SESSION_admin_1793874642106.json. Review receipt: docs/temp/CODEX_P2_ONE_GET_ACCEPTANCE_20261105T104212Z.json.
