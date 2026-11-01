# MediSync Bugs Register

Format: `ID | Symptom | Cause | Fix | Commit | Live-Verified`

| Bug ID | Symptom | Cause | Fix | Commit | Live-Verified |
| --- | --- | --- | --- | --- | --- |
| BUG-PRE-1 | React Error #31 on Doctor New Consultation patient lookup | Unformatted Mongoose LabTest object rendered as React child | Added `labTestFormatter.js` and `HistoryErrorBoundary.jsx` | `3a36494` | Yes |
| BUG-A1 | `/public-health` statistics request returns 503 (`range=30 days, disease=all`), dashboard shows temporary unavailable | Render ML cold start (~35-50s) exceeded hardcoded 3s Axios timeout, tripping circuit breaker; UI lacked retry button and degraded state | Set adaptive timeout (60s in production, 30s configurable, 3s in test); added retry button in error alert and preserved zero-fake-count rendering | `7cc6947` | Yes |
| BUG-A2 | `GET /broadcasts/latest` returns 401 on public unauthenticated page | Unauthenticated visitor or empty/stale string token ('undefined'/'null') in storage provoked call to protected endpoint | Enforced strict client token guard in `ActiveOutbreakBanner.jsx` without weakening server route protection (`protect([...])`); confirmed login shell does not mount banner | `88b07a4` | Yes |
| BUG-A3 | Console warning "WebSocket is closed before the connection is established" | Chromium emits native warning when `ws.close()` is called while `readyState === 0` (CONNECTING); `socket.disconnect()` during rapid navigation or unmount closed in-flight handshake | Added `safeDisconnectSocket` helper in `client/src/utils/safeSocketDisconnect.js`; suppresses auto-reconnect, detaches listeners, and awaits `open`/`error`/`close` before closing connecting transport; integrated into `NotificationBell.jsx` | `fd39fce` | Yes |
| BUG-A4 | `feature_collector.js` "deprecated parameters" warning | Audit of entire repository, client/server dependencies, and build scripts confirms `feature_collector.js` is not present in MediSync codebase | Confirmed external provenance: injected by browser extensions (e.g. password manager, autofill, or third-party Wasm-pack glue code) | N/A (Audited & Documented) | Yes (Zero matches in codebase/dependencies) |
| BUG-A5 | Admin Dashboard creates socket with `undefined` token | Missing client-side guard on token presence | Pending | Pending | Pending |
| BUG-A6 | Duplicate notification polling and socket listeners between AppShell and Sidebar | Independent instances created in both components | Pending | Pending | Pending |
