# MediSync Future Features & Deferred Items

These items are deferred work, not claims of completed live verification.

| Priority | Item | Status | Required Acceptance |
|---|---|---|---|
| **P1** | Modern PDF encryption and key delivery, with trilingual clinical layout | Deferred (SECURITY_HOLD) | Review a modern encryption implementation and document-specific key delivery independent of patient identifiers. Verify wrong-key, tamper, and missing-key rejection with no plaintext fallback; preserve ownership and consent checks. Validate Sinhala/Tamil shaping, fonts, pagination, and clinical content before separately approving release of the hold. Existing legacy encryption proofs do not establish these requirements. |
| **P1** | Human clinical-review workflow for confirmed-case surveillance | Deferred | Define clinician review authority, confirmed diagnosis and episode evidence, case definitions, audit trail, consent, and ownership before enabling confirmed-case, outbreak, or forecast reporting. Do not stamp historical consultations as verified or migrate/backfill automatically. Any historical-data review and record changes require separate approval. Public consultation visits remain a separate metric and cannot supply confirmed-case or outbreak figures. |

---

## Implemented Platform Features (Archived from Roadmap)

1. **Consolidate duplicate notification instances**: Resolved (commit `e246778`) via shared `NotificationProvider` at AppShell root, unified polling, and managed socket lifecycle.
2. **Avoid admin socket initialization without a usable token**: Resolved (commits `b99e54b`, `64e92e6`) via client-side token presence guard preventing unauthenticated socket connection attempts.
3. **Diagnose native WebSocket startup/closure warning**: Resolved (commit `fd39fce`) via safe socket disconnect pattern awaiting handshake resolution before socket.close().
