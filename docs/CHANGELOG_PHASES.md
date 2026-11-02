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
- **B3**: `fix(diag): resolve 409 consultation save error and improve idempotency` (`7e9319f`)
  - Resolved 409 idempotency conflict on rapid double-clicks and edits by adding submit button locking (`submissionBusy.current`), visual spinner + "Saving Consultation…", and automatic idempotency key regeneration upon form modification.
  - Implemented immediate idempotency key refresh when a 409 `CLINICAL_IDEMPOTENCY_CONFLICT` occurs, notifying clinician to retry cleanly without collision loops.
  - Added single-drug safety allowance (`isSingleResolvedSafe`) in `server/src/middleware/clinicalWriteAuthorization.js` and `server/src/services/currentMedicationSafety.js` so a single resolved safe drug does not trip false-positive `MEDICATION_REVIEW_REQUIRED` (409).
  - Verified safe replay on identical payloads (returns 200 OK without duplicate writes).
  - Back button on Step 5 verified navigating to Step 4 (Diagnosis & Reference Matches) instead of Step 2.
  - Verified with offline suites `consultation-409-resilience.test.jsx` (8/8) and `consultation409Offline.test.js` (16/16).
  - Verified live: production chunk `921.a9650740.chunk.js` active with key refresh and button locking logic.
- **B4**: `fix(ui): resolve lab test autocomplete dropdown overlap and stacking context` (`6e16bf0`)
  - Resolved dropdown overlap and clipping by implementing dynamic flip calculation (`isLabFlipped`) in `client/src/pages/doctor/NewConsultation.jsx` (`spaceBelow < 260 && spaceAbove > spaceBelow`), toggling `bottom-full mb-1` vs `top-full mt-1`.
  - Ordered stacking contexts: dropdown `z-50`, input wrapper `z-30`, lab card `z-20`, follow-up card `z-10`.
  - Verified with stress suite `new-consultation-stress.test.jsx` (7/7, specifically 0px displacement invariant).
  - Verified live: production chunk `921.a9650740.chunk.js` serving `isLabFlipped` flip logic.
- **B5**: `fix(ui): normalize doctor names and eliminate duplicate "Dr." prefixes` (`6e16bf0`)
  - Implemented `formatDoctorName` regex collapsing repeated titles (`/^(dr\.?|doctor)\s+/i`), preserving valid names, and bypassing institutional names (`Asiri Laboratory`, etc.). Added `stripDoctorPrefix`.
  - Unified doctor name formatting across 60+ UI call sites and backend email/PDF services.
  - Verified with offline suites `phase4-ui-polish.test.jsx` (14/14) and `doctorNameOffline.test.js` (9/9).
- **B6**: `feat(qa): live verification runner for complete patient to doctor to pharmacy flow` (`baea9af`)
  - Implemented automated 17-step end-to-end live flow across Patient, Doctor, and Pharmacy roles on production.
  - Deployed security-controlled `testOtpHarness` (commit `7946bf1`), guaranteeing zero real email dispatch and preventing quota exhaustion.
  - Doctor authenticated, requested patient clinical access, verified OTP, evaluated medication safety, issued consultation `6ae8f7a36065a37820342bcb` and prescription `RX-20261102-701110` (Amoxicillin 500mg, status "pending").
  - Pharmacy authenticated, verified stock (>= 10), requested patient access, verified OTP, dispensed prescription, issued immutable receipt `REC-8060a6081c164c9e3c8ad92d`, and atomically decremented inventory (100 -> 99).
  - Independent reads verified: Patient prescription status="dispensed" with valid timestamps; Pharmacy receipt ledger verified.
  - Passed GitHub Actions CI runs `41525169917` & `41525169643`. All 15 protected file hashes verified 100% intact.

## Master Run - Phase C: Outbreak Analytics, Alerts & Trilingual UI
- **C1**: `feat(outbreak): wire outbreak alert creation to notification service across doctor, hospital, and admin roles` (`9e0f6c8`)
  - Implemented `notifyOutbreakAlert` in `server/src/services/notificationService.js` to automatically dispatch in-app notifications to Doctor (`role: 'doctor'`, `actionLink: '/public-health'`), Hospital (`role: 'hospital_admin'`, `actionLink: '/public-health'`), and Admin (`role: 'admin'`, `actionLink: '/admin/dashboard/outbreak'`) users.
  - Added duplicate notification suppression per `referenceId` (alertId) to ensure idempotent alert creation and triggers without spam.
  - Added Socket.IO real-time emission via `io.emitToVerifiedUser` and administrative alert broadcast via `io.emitToVerifiedAdmins`.
  - Added Mongoose `post('save')` lifecycle hook on `OutbreakAlert` model and wired notification trigger inside `surveillanceService.runAnalysis` and `adminController.approveAlert`.
  - Added offline regression test suite `server/tests/outbreakNotificationPipeline.test.js` (6/6 passing).
  - Verified live: 15/15 steps passed in `scripts/verify_c1_flow_live.cjs` on production backend (`live_c1_verification_log.json`). Both CI runs `41534722808` & `41534722649` passed green.
