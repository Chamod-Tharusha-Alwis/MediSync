# MediSync future features

These items are deferred work, not claims of completed live verification. The clinical PDF export hold remains enabled.

| Priority | Item | Status | Required acceptance |
| --- | --- | --- | --- |
| P1 | Modern PDF encryption and key delivery, with trilingual clinical layout | Deferred (SECURITY_HOLD) | Review a modern encryption implementation and document-specific key delivery independent of patient identifiers. Verify wrong-key, tamper and missing-key rejection with no plaintext fallback; preserve ownership and consent checks. Validate Sinhala/Tamil shaping, fonts, pagination and clinical content before separately approving release of the hold. Existing legacy encryption proofs do not establish these requirements. |
| P1 | Human clinical-review workflow for confirmed-case surveillance | Deferred; do not build in the consultation-activity phase | Define clinician review authority, confirmed diagnosis and episode evidence, case definitions, audit trail, consent and ownership before enabling confirmed-case, outbreak or forecast reporting. Do not stamp historical consultations as verified or migrate/backfill automatically. Any historical-data review and record changes require separate approval. Public consultation visits remain a separate metric and cannot supply confirmed-case or outbreak figures. |
| P2 | Consolidate duplicate notification instances | RESOLVED (Feature A6, commit `e246778`) | Shared `NotificationProvider` at AppShell root, unified polling and socket lifecycle. |
| P2 | Avoid admin socket initialization without a usable token | RESOLVED (Feature A5, commits `b99e54b`, `64e92e6`) | Client-side token presence guard preventing unauthenticated socket initialization. |
| P2 | Diagnose the native WebSocket startup/closure warning | RESOLVED (Feature A3, commit `fd39fce`) | Safe socket disconnect awaiting handshake resolution before socket.close(). |

Relevant source: `server/src/utils/pdfGenerator.js`, `server/src/security/labReportEnvelope.js`, `client/src/components/ui/AppShell.jsx`, `client/src/components/common/Sidebar.jsx`, `client/src/components/common/NotificationBell.jsx`, `client/src/pages/admin/Dashboard.jsx`, and `server/src/security/socketAuthorization.js`.
