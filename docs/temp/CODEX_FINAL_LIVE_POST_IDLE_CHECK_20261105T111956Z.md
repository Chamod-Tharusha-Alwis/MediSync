# Final live run: post-idle admin ML-status check

Recorded 2026-11-05T11:19:56.779Z. Requirement only; NOT EXECUTED and no live authorization created.

Operator evidence: MediSync-ML deployed e163f40 at2026-11-05T09:51Z(Auto-Deploy), then2026-11-05T10:26Z(Manual). P1failures predated those starts; P2passed at10:31Z,about5minutes after the manual start. This correlation does not establish the earlier bad_response cause. Keep it NOT VERIFIED.

- Include a post-idle GET /api/admin/ml-status in the separately approved FINAL live phase. It consumes the approved status-request budget and uses the existing admin session; no extra login is implied.
- Obtain fresh numeric provider totals and exact phase permission first; reserve the approved alert cost and stop at the22/25soft line. No current approval remains.
- Record operator-reported idle interval and backend/frontend/ML source identities. Do not force a restart,stop a service,change schedules or clear a cache to manufacture idle. Background calls or platform probes may prevent cold start; a post-idle check is not automatically a proven cold-start test.
- Do not probe ML health/status or open other ML views immediately beforehand: that could warm the service. Open the admin status view once at the designated point and record time/latency,HTTPstatus,state/category,console and blocked method/path counts.
- On recurrence, obtain only the fixed AdminMlStatus category/reason/upstreamStatus/failedFields line from the operator. No bodies,URLs,headers,keys or raw exceptions.
- No automatic repeat is allowed beyond the separately approved FINAL request count. A repeat after60seconds requires that explicit scope; a login is never retried.
- Preserve explicit unavailable UI states and both success/failure receipts. No ML data,ingestion,surveillance,clinical or maintenance writes.
