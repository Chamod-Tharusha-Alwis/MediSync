# MediSync Bugs Register

Format: `ID | Symptom | Cause | Fix | Commit | Live-Verified`

| Bug ID | Symptom | Cause | Fix | Commit | Live-Verified |
| --- | --- | --- | --- | --- | --- |
| BUG-PRE-1 | React Error #31 on Doctor New Consultation patient lookup | Unformatted Mongoose LabTest object rendered as React child | Added `labTestFormatter.js` and `HistoryErrorBoundary.jsx` | `3a36494` | Yes |
| BUG-A1 | `/public-health` statistics request returns 503 (`range=30 days, disease=all`), dashboard shows temporary unavailable | Render ML cold start (~35-50s) exceeded hardcoded 3s Axios timeout, tripping circuit breaker; UI lacked retry button and degraded state | Set adaptive timeout (60s in production, 30s configurable, 3s in test); added retry button in error alert and preserved zero-fake-count rendering | `7cc6947` | Yes |
| BUG-A2 | `GET /broadcasts/latest` returns 401 on public unauthenticated page | Unauthenticated call to protected endpoint or missing public route | Pending | Pending | Pending |
| BUG-A3 | Console warning "WebSocket is closed before the connection is established" | Pending investigation with initiator trace | Pending | Pending | Pending |
| BUG-A4 | `feature_collector.js` "deprecated parameters" warning | Pending provenance audit (vendor vs app) | Pending | Pending | Pending |
| BUG-A5 | Admin Dashboard creates socket with `undefined` token | Missing client-side guard on token presence | Pending | Pending | Pending |
| BUG-A6 | Duplicate notification polling and socket listeners between AppShell and Sidebar | Independent instances created in both components | Pending | Pending | Pending |
