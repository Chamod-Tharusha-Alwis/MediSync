# MediSync future features

These items are deferred work, not claims of completed live verification. The clinical PDF export hold remains enabled. No socket transport behavior changes are included in the current UI patch.

| Priority | Item | Required acceptance |
| --- | --- | --- |
| P1 | Modern PDF encryption and key delivery, with trilingual clinical layout | Review a modern encryption implementation and document-specific key delivery independent of patient identifiers. Verify wrong-key, tamper and missing-key rejection with no plaintext fallback; preserve ownership and consent checks. Validate Sinhala/Tamil shaping, fonts, pagination and clinical content before separately approving release of the hold. Existing legacy encryption proofs do not establish these requirements. |
| P2 | Consolidate duplicate notification instances | `AppShell.jsx` renders a header notification bell while its `Sidebar.jsx` also renders one. When both mount, each starts its own fetch, timer and socket. Introduce shared notification lifecycle/state while preserving desktop/mobile controls, unread counts, event delivery and session-clear cleanup. Admin's dashboard also has a distinct socket. |
| P2 | Avoid admin socket initialization without a usable token | `admin/Dashboard.jsx` currently constructs the socket even when its token resolves to `undefined`. Add a client-side early return and regression tests. This is unnecessary connection/reconnection load and diagnostic noise, not a demonstrated authorization bypass: the server's `socketAuthorization.js` rejects missing/invalid tokens and checks the session, account, ban and device state before admitting a socket or joining authenticated rooms. Retain all server checks; a client guard is not a security boundary. |
| P2 | Diagnose the native WebSocket startup/closure warning | Capture a sanitized browser initiator stack and lifecycle trace, then reproduce under navigation and session clearing. Existing delayed initialization and unmount cleanup do not prove the reported warning resolved. Teardown during transport upgrade is a hypothesis, not a confirmed cause. Preserve current transports until a reviewed change and event-delivery/fallback tests justify otherwise. |

Relevant source: `server/src/utils/pdfGenerator.js`, `server/src/security/labReportEnvelope.js`, `client/src/components/ui/AppShell.jsx`, `client/src/components/common/Sidebar.jsx`, `client/src/components/common/NotificationBell.jsx`, `client/src/pages/admin/Dashboard.jsx`, and `server/src/security/socketAuthorization.js`.

Live keyboard/screen-reader behavior, native WebSocket warning resolution and vendor attribution of `feature_collector.js` remain unverified. Offline component tests do not establish genuine clinical consent or database persistence.
