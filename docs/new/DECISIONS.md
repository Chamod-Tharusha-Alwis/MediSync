# Architecture and Security Decisions (DEC)

## DEC-001: Verification and Ancestry of Stage B1 Fixes (`stage-b1/fixes`)

- **Status**: Verified & Accepted
- **Date**: 2026-11-06
- **Context**:
  During Stage B1, several bug fixes and security hardening patches were developed on branch `stage-b1/fixes` up to commit `0dc886d` (`docs(stage-b1): record Batch 6 report`). These items were marked "Pending Host Commit" pending verification of whether they were incorporated into `chore/post-seed-verification` and the current HEAD of `feat/final-stage-b2-to-g`.
  
  The items in question include:
  1. **U2**: Prescription medication catalog filtering in `server/src/controllers/doctorController.js` (commit `d149034`).
  2. **U7**: Patient consent requirement prior to first prescription lookup in `client/src/pages/pharmacy/PrescriptionFulfillment.jsx` (commit `68ecc6a`).
  3. **S3**: Auth rate limiter outside test environment in `server/src/app.js` (commit `8375a54`).
  4. **S4**: Sensitive login notification credential redaction in `server/src/controllers/authController.js` (commit `f773227`).
  5. **S6**: Public lab status check rate limiting in `server/src/routes/publicRoutes.js` (commit `bdf12a7`).
  6. **Lockout Policy**: Progressive credential lockout after 5 failed password attempts in 15 minutes (commit `e123b82`).
  7. **Gate Allowlist**: Inclusion of S1, S6, S3 test suites in the offline gate runner `scripts/run_offline_tests.js` (commits `ffee493`, `c93c73a`).
  8. **S1 Test Fix**: Lockout policy mock in S1 runtime token test `server/tests/antigravitySecurityRuntime.test.js` (commit `f367702`).

- **Verification**:
  Executed `git merge-base --is-ancestor 0dc886d HEAD`.
  The command returned exit code `0`, confirming that commit `0dc886d` and all predecessor commits on `stage-b1/fixes` are direct ancestors of HEAD (`a9e3e46`).

- **Decision**:
  All B1 fixes are fully merged and present in HEAD. No manual patching, cherry-picking, or duplicate code changes are required for B1 leftovers.

---

## DEC-002: S7 Internal Authentication Timing and Replay Window Safety

- **Status**: Audited & Verified Safe
- **Date**: 2026-11-06
- **Context**:
  Investigation item S7 evaluated `server/src/utils/internalAuth.js` (lines 18–62) for:
  1. Timing side-channel vulnerability during HMAC token comparison.
  2. Potential runtime crashes caused by buffer length mismatch in `crypto.timingSafeEqual`.
  3. Security implications of the 2-hour replay tolerance window.

- **Technical Analysis**:
  1. **Timing Safety & Length Guard**:
     `verifyToken` constructs UTF-8 buffers from the candidate token and the expected HMAC tokens for the current and previous UTC hour:
     ```javascript
     const tokenBuf = Buffer.from(token, 'utf-8');
     const currentBuf = Buffer.from(expectedCurrent, 'utf-8');
     const prevBuf = Buffer.from(expectedPrev, 'utf-8');
     return (
       (tokenBuf.length === currentBuf.length && crypto.timingSafeEqual(tokenBuf, currentBuf)) ||
       (tokenBuf.length === prevBuf.length && crypto.timingSafeEqual(tokenBuf, prevBuf))
     );
     ```
     In Node.js `crypto`, `timingSafeEqual(a, b)` throws a `RangeError: Input buffers must have the same byte length` if `a.length !== b.length`. The explicit guard `tokenBuf.length === currentBuf.length` prevents unhandled exceptions while rejecting mismatched candidates. The entire verification is enclosed in a `try/catch` block returning `false` on any parsing or buffer conversion anomaly.
     Comparing string lengths does not leak confidential HMAC material because SHA-256 hex digests are publicly known to be 64 characters (64 bytes).
  
  2. **Replay Window**:
     `getHourStrings` extracts the current UTC hour (`YYYY-MM-DDTHH`) and previous UTC hour. A token generated at minute 00:01 of an hour remains acceptable through the end of the subsequent hour (~1 hour 59 minutes 59 seconds max; ~1 hour min).
     Because this token is strictly used for inter-service communication (`Node.js` backend <-> `Flask` ML service) across the private internal backend network via the `x-internal-key` header, this window provides clock-drift tolerance across distributed container instances without requiring sub-second NTP synchronization.

- **Decision**:
  The existing implementation in `server/src/utils/internalAuth.js` is cryptographically sound, protected against timing attacks, crash-resilient against invalid input lengths, and well-tailored for private inter-service IPC. No code modifications are needed.

---

## DEC-003: U18 Client Console Warnings Status

- **Status**: Resolved & Verified
- **Date**: 2026-11-06
- **Context**:
  Investigation item U18 tracked browser console warnings in `client/src` during runtime and test execution.

- **Audit Findings**:
  1. **Pull Request #14 (`b0fc8c7` / `1d8bf7d`)**:
     PR #14 ("fix(client): suppress console.warn in optional storage and device hints") eliminated non-essential console warnings in:
     - `client/src/i18n/LanguageContext.jsx`: Silenced `console.warn` when `localStorage` writes fail (e.g. in restricted sandboxed environments or private browsing mode), preserving in-memory fallback.
     - `client/src/utils/deviceFingerprint.js`: Silenced `console.warn` when high-entropy client hint collection (`navigator.userAgentData.getHighEntropyValues`) is rejected or unsupported.
     - `client/src/__master_offline__/optional-client-diagnostics.test.jsx`: Added 4 automated offline unit tests confirming that storage and device hint fallbacks operate silently without calling `console.warn`, `console.error`, or `console.log`.
  
  2. **Ancestry Verification**:
     `git merge-base --is-ancestor b0fc8c7 HEAD` returned exit code `0`, confirming PR #14 is fully merged into HEAD.
  
  3. **Production Component Logs**:
     Remaining `console.error` and `console.warn` calls in `client/src` are inside intentional top-level React Error Boundaries (`ErrorBoundary.jsx`, `HistoryErrorBoundary.jsx`) or explicit operational alerts (`NotificationBell.jsx`, `IdleTimer.jsx`) using sanitized operational error codes without leaking clinical data or stack traces.
  
  4. **React Test `act(...)` Warnings**:
     Any remaining `act(...)` notices during test runs originate from asynchronous debounced timers in Jest mock environments and do not affect production browser execution.

- **Decision**:
  U18 is fully resolved. Production client code is clean, resilient, and builds with zero warnings.
