# Five-role session-only live review

Captured 2026-11-04T17:43:08.8590272Z. Backend application 7e0d9c0; frontend efb7eee (documentation-only successor; application bytes unchanged). Verdict: authentication/logout PASS; no-console and admin data-availability acceptance NOT MET. No further authentication is authorized by this consumed five-role run.

| Role | Login/logout HTTP | Dashboard DOM rendered | Temporary banner | Boundary console errors | Other console errors | Actual new login alerts |
| --- | --- | --- | --- | --- | --- | --- |
| admin | 200/200 | Yes | No | 14 | 1 | Not verified |
| patient | 200/200 | Yes | No | 4 | 0 | Not verified |
| doctor | 200/200 | Yes | No | 4 | 0 | Not verified |
| hospital | 200/200 | Yes | No | 3 | 0 | Not verified |
| pharmacy | 200/200 | Yes | No | 4 | 0 | Not verified |

One browser login per role, no retries; one logout per authenticated session, all HTTP 200. Six view DOM observations (admin overview and Outbreak Monitor, four other dashboards); no page exceptions. This is session-only observation, not clinical workflow acceptance or a complete accessibility/visual audit. No screenshots were created or committed.

Blocked request aggregate: GET /socket.io/ x29. No WS frame was transmitted; the boundary denies WebSocket transport and polling because arbitrary socket events are outside login/refresh/logout approval. These 29 ERR_BLOCKED_BY_CLIENT console entries are induced by the authorized boundary, not proven production defects. They are still counted: the requested zero-console criterion did not pass. No blocked clinical/OTP/ingest/seed/trigger/cache-clear request was observed. Successful dispatched mutation budget: 5 login, 0 refresh, 5 logout. Historical 90 blocks remain method/path NOT_RECORDED; they are not conflated with this new aggregate.

Admin additionally returned GET /api/admin/ml-status HTTP 503, with one HTTP-resource console error. The map DOM rendered; source data truth was not verified. No private forecast widget is implemented, so forecast availability is not established by absence. Source evidence: server/src/controllers/adminController.js:516-548 calls ML /model-status, retries certain read failures, then returns 503; this receipt does not reveal which upstream cause occurred. Client OutbreakMonitor.jsx:78 reads response.data.data, but the controller returns top-level fields at :536-542; :215 retains an unsupported 15,420 fallback. That source defect was not observed as a visible number in this run and is not claimed reproduced. No analysis trigger was called.

Final independent review rejects the original admin receipt's permissive subview passing flags: rendered map alone cannot establish honest available data. Its overall role result was already failed and remains unchanged. The adapter was tightened and a negative assertion now prevents that false subclaim. The original receipts and exact pre-correction source copies CODEX_Q1_ADMIN_RUNNER_SOURCE_20261104230804701.txt and CODEX_Q1_ADMIN_BOUNDARY_SOURCE_20261104230804701.txt are preserved. Admin was not rerun. The four later receipts bind their exact source hashes.

Email accounting: last operator-confirmed total 1. Login responses expose no provider acceptance/delivery count. Reserve two potential emails per attempt; final conservative upper bound 11, under cap 25. This is not an actual send count. Fresh provider totals and per-role log counts were requested after the final logout; final actual count remains NOT VERIFIED until supplied. No direct provider requests by the harness; normal login email side effects were within approval.

Offline: 68 focused PASS (two suites), exit 0. Initial additional credential fixture hit the existing offline dotenv read fence (67 PASS/1 FAIL); fixed the test using an inert injected file reader, without weakening the fence. Complete regression 2,780 PASS/0 FAIL/0 SKIP, exit 0, sourceFrozen=true, 15 protected pins. Receipt scratch/clinical-offline-vblOYD/summary.json. Client build exit 0, 115 clinical modules, demoImported=false, existing warnings only. Test runtime Node v26.4.0, not a replacement for deployment Node 24 contract.

No clinical write, consent request, OTP submission, dispensing, ingest, seed, surveillance trigger, cache clear or direct Atlas/Redis connection. Login/last-login/session/audit/trusted-device effects are normal approved authentication effects; this report does not claim a globally write-free database. All owned browser contexts closed and their sessions logged out. Historical real backend group acceptance remains 2/14.

Next: operator dashboard email reconciliation; review a separately scoped Socket.IO read-subscription test boundary, and repair/qualify the admin unavailable-state contract before claiming complete role UI acceptance. No expanded transport, additional login, production data change or hosting action was performed.

Final aggregation correction: absent other-console categories are recorded as integer zero. The original draft is preserved at docs/temp/CODEX_Q1_FIVE_ROLE_SESSION_REVIEW_20261104231308677.json. Five durable role markers exist, each recorded before its one submit; the owned lock is removed and all logout/browser cleanup receipts passed. New executable files are test tooling only; no application implementation source was changed.
