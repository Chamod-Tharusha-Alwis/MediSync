# MediSync Phase Changelog

## Phase 7b (Completed)
- **Commit `3a36494`**: `fix(client): resolve react error #31 with shared lab test formatter and history error boundary`
- **Authorized Audit**: Local read-only comparison of pharmacy account candidate passwords against stored bcrypt hash in production database. Verified both Candidate 1 and Candidate 2 match.

## Master Run - Phase A: Live Bugs (Completed)
- **A1**: `fix(public): resolve public-health 503 with adaptive cold-start timeout and retry degradation` (`7cc6947`)
  - Added adaptive timeout in `server/src/controllers/publicController.js` (60s in production for Render ML cold start, 3s in test).
  - Added retry state and action in `client/src/pages/public/PublicHealth.jsx` with accessible alert banner.
  - Enforced zero fake counts rendering during unavailable states.
  - Added regression test `client/src/__master_offline__/public-health-retry.test.jsx`.
- **A2**: `fix(alerts): prevent unauthenticated broadcast requests without weakening private endpoint auth` (`88b07a4`)
  - Guarded `ActiveOutbreakBanner.jsx` against missing, `'undefined'`, or `'null'` tokens.
  - Preserved private `protect([...])` middleware on `GET /alerts/broadcasts/latest`.
  - Expanded regression suite in `client/src/__master_offline__/phase0-login-banner.test.jsx`.
  - Verified live: 0 broadcast calls on public routes; 401 retained on unauthenticated API calls.
- **A3**: `fix(client): safe socket disconnection to eliminate websocket closed warning` (`fd39fce`)
  - Captured exact browser initiator trace where `socket.disconnect()` invoked during in-flight WebSocket handshakes triggered Blink console warnings.
  - Implemented `safeDisconnectSocket` in `client/src/utils/safeSocketDisconnect.js` to suppress auto-reconnect, detach listeners, and await handshake completion before closing connecting transports.
  - Integrated safe disconnection into `NotificationBell.jsx`.
  - Added unit and regression suite `client/src/__master_offline__/safe-socket-disconnect.test.js`.
  - Verified live: 0 WebSocket warnings across public and rapid-navigation routes.
- **A4**: `docs: audit provenance of feature_collector.js warning`
  - Performed comprehensive audit across repository, frontend, backend, ML engine, and dependencies.
  - Confirmed `feature_collector.js` is 100% external, originating from browser extensions or external Wasm-pack glue code. Zero occurrences in MediSync codebase.
- **A5**: `fix(admin): guard socket initialization on missing or undefined token` (`b99e54b`, `64e92e6`)
  - Enforced strict client token guard before calling `io(SOCKET_SERVER_URL, ...)` in `client/src/pages/admin/Dashboard.jsx` and `client/src/components/common/NotificationBell.jsx`.
  - Prevented invalid `'null'` or `'undefined'` string tokens from triggering unauthenticated socket connections and `SOCKET_AUTH_DENIED` errors.
  - Added safe socket disconnection via `safeDisconnectSocket` on unmount.
  - Added unit and regression suite `client/src/__master_offline__/admin-dashboard-socket.test.jsx`.
  - Verified live: 0 socket requests dispatched on empty, `'undefined'`, or `'null'` tokens.
- **A6**: `fix(client): consolidate duplicate notification lifecycles via shared NotificationProvider` (`e246778`)
  - Resolved duplicate polling (60s timer) and duplicate Socket.IO connections caused by independent `NotificationBell` mounts in `AppShell.jsx` (header) and `Sidebar.jsx` (mobile/sidebar drawer).
  - Created root-level `NotificationProvider` and `useNotifications` hook in `client/src/components/common/NotificationBell.jsx`.
  - Wrapped `AppShell.jsx` main layout in `<NotificationProvider>`, allowing all bell instances to consume unified state.
  - Maintained backward-compatibility standalone fallback for unit tests and isolated components.
  - Added regression suite `client/src/__master_offline__/consolidated-notifications.test.jsx`.
  - Verified live: 1 single fetch to `/notifications`, 1 socket connection, 0 additional connections during mobile drawer toggles.

## Master Run - Phase B: Doctor & Pharmacy Flow
- **B1**: `fix(doctor): handle ML service 503 cold-start with retry action and unblocked manual diagnosis` (`63a2675`)
  - Extended cold-start error classifier (`isColdStartError`) in `client/src/pages/doctor/NewConsultation.jsx` to recognize `waking_up` availability payload and status phrases.
  - Added accessible inline "Retry Analysis" button inside the unavailable state container for direct clinician retry.
  - Verified manual clinician diagnosis and ICD entry are never blocked by ML downtime, permitting immediate advancement to prescription construction.
  - Added offline regression suite `client/src/__master_offline__/b1-ml-503-resilience.test.jsx` (2/2 passing).
  - Verified live: production chunk `921.034a6ca3.chunk.js` serving `Retry Analysis` button and `waking_up` classification; `/health` endpoints returning 200 OK.
- **B2**: `fix(client): enrich medication search with catalog fallback and trilingual transliteration` (`a3726ec`)
  - Enhanced `client/src/components/DrugSearchInput.jsx` to seamlessly check and merge the curated catalog of essential medications (`FALLBACK_DRUGS`) even when the remote database search responds with empty arrays (`data: []`).
  - Added Sinhala and Tamil phonetic transliteration mapping (`TRANSLITERATION_MAP`) and labels (`si`, `ta`) so that searches in national scripts (e.g. "පැරසිටමෝල්", "அமோக்சிசிலின்") resolve immediately to appropriate drugs.
  - Preserved prefix-first matching and free-text custom/unlisted medication entry.
  - Added regression suite `client/src/__master_offline__/b2-drug-suggestions-trilingual.test.jsx` (5/5 passing, all 18 drug search tests passing).
  - Verified live: production chunk `921.a9650740.chunk.js` active with Panadol/Acetaminophen catalog fallback and custom addition; `/health` 200 OK.
