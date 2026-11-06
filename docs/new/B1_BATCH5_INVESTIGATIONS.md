# B1 Batch 5 Read-Only Investigations

**Date:** 2026-11-06  
**Repository:** `medisync`  
**Branch:** `stage-b1/fixes`  
**Status:** READ-ONLY INVESTIGATION (No production code modified for these items)

---

## 1. S6 — Public Lab Status Check Analysis

### 1.1 Route & Controller Citations
- **Route definition:** `server/src/routes/labRoutes.js:50`
  ```javascript
  // PUBLIC — no auth needed
  router.get('/public/:labTestId/status', publicStatusCheck);
  ```
- **Controller implementation:** `server/src/controllers/labController.js:1322`
  ```javascript
  exports.publicStatusCheck = async (_req, res) => res.status(403).json({ message: 'Authenticate to view laboratory status' });
  ```
- **Existing test assertion:** `server/tests/agentBClinicalHandlers.test.js:19`
  ```javascript
  await c.publicStatusCheck({ params: { labTestId: 'synthetic-guessed-id' } }, res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(findOne).not.toHaveBeenCalled();
  ```

### 1.2 Identifier Format & Entropy
- **Schema generation:** `server/src/models/LabTest.js:9-13`
  ```javascript
  function generateLabTestId() {
    const date   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = Math.floor(1000 + Math.random() * 9000); // 4-digit random
    return `LT-${date}-${suffix}`;
  }
  ```
- **Entropy assessment:** Sequential/date-based prefix (`LT-YYYYMMDD-`) with only **4 decimal digits** of randomness (`1000` to `9999`).
- **Brute-force feasibility:** There are only **9,000 possible identifiers per calendar day**. Without strict rate-limiting, an automated scanner can enumerate an entire day's test space in under 30 seconds.

### 1.3 Response DTO & Data Exposure History
- **Historical baseline (commit `48a0ade0cd`):**
  ```javascript
  const labTest = await LabTest.findOne({ labTestId })
    .select('labTestId testName testCategory status urgency reportUploadedAt createdAt statusHistory')
    .populate('hospitalId', 'name');
  ```
  While direct patient PII (name, NIC) was excluded, exposing `testName`, `urgency`, `hospitalId.name`, and timestamp history allows inferring clinical workloads and associating test orders with specific hospital visits.
- **Current baseline:** Already hardened in Agent B to unconditionally return **HTTP 403 Forbidden** (`{ message: 'Authenticate to view laboratory status' }`) without executing any database query.

### 1.4 Rate Limiting & Protection
- `server/src/routes/labRoutes.js:50` has **no rate limiter middleware** attached.
- Even though the controller returns 403, unthrottled requests can still place unnecessary load on Express routing and reverse proxies.

### 1.5 Recommendation (Smallest Safe Fix)
1. Keep the HTTP 403 rejection in `labController.js:1322` so zero data is leaked.
2. Attach `publicListingLimiter` (`server/src/security/rateLimiters.js` or `server/src/middleware/rateLimiter.js`) to `server/src/routes/labRoutes.js:50` to throttle abusive requests.
3. In Stage B2, formally deprecate or remove the route once client portal confirms all lab status queries use authenticated endpoints (`/api/lab/hospital/...` or `/api/lab/patient/...`).

---

## 2. S7 — Internal Service Authentication (`internalAuth.js`)

### 2.1 Implementation & Logic
- **File:** `server/src/utils/internalAuth.js:7-62`
- **Purpose:** Pre-shared secret HMAC token generation and verification for internal service-to-service communication (Node.js backend <-> Python Flask ML Engine).
- **Token generation:**
  ```javascript
  const getHourStrings = () => {
    const now = new Date();
    const currentStr = now.toISOString().slice(0, 13); // e.g. "2026-05-21T03"
    const prev = new Date(now.getTime() - 60 * 60 * 1000);
    const prevStr = prev.toISOString().slice(0, 13);
    return { currentStr, prevStr };
  };
  ```
- **Signing algorithm:** `crypto.createHmac('sha256', secret).update(hourStr).digest('hex')`.

### 2.2 Timing Safety Check
- **Verification snippet (lines 51-59):**
  ```javascript
  const tokenBuf = Buffer.from(token, 'utf-8');
  const currentBuf = Buffer.from(expectedCurrent, 'utf-8');
  const prevBuf = Buffer.from(expectedPrev, 'utf-8');
  return (
    (tokenBuf.length === currentBuf.length && crypto.timingSafeEqual(tokenBuf, currentBuf)) ||
    (tokenBuf.length === prevBuf.length && crypto.timingSafeEqual(tokenBuf, prevBuf))
  );
  ```
- **Analysis:**
  - `crypto.timingSafeEqual` throws if buffer lengths mismatch. The explicit length check `tokenBuf.length === currentBuf.length` prevents runtime crashes.
  - Length leak: Comparing `.length === 64` leaks whether the caller supplied a 64-character hex string. Because SHA-256 hex digests are publicly known to be 64 bytes, this leaks zero secret information.
  - Short-circuit: The `||` operator short-circuits if the current hour matches, leaking whether the token corresponds to the current hour or previous hour. In service-to-service IPC, this has negligible security impact.

### 2.3 Replay Window Analysis
- Tokens are bucketed by UTC hour string `YYYY-MM-DDTHH`.
- Verification admits tokens matching either `currentStr` or `prevStr`.
- **Maximum replay lifetime:**
  - Token generated at `HH:00:01` is valid until `(HH+1):59:59` -> **1 hour 59 minutes 58 seconds** (~2 hours).
  - Token generated at `HH:59:59` is valid until `(HH+1):59:59` -> **1 hour 0 minutes 0 seconds** (~1 hour).
- **Assessment:**
  - The 2-hour window safely accommodates clock skew between Docker containers / cloud instances without needing NTP synchronization down to the second.
  - Because communication is strictly within the private backend VPC network (Node.js <-> Flask), this replay window is acceptable.
  - If exposed externally or across untrusted networks in the future, standard HMAC over `timestamp + nonce + body` with a 5-minute replay window and Redis nonce deduplication should be adopted.

---

## 3. U18 — Client Console Warnings & React Lifecycle Audit

### 3.1 App-Owned Console Calls in `client/src`
An audit of `client/src/**/*.js*` identified **19 total occurrences** of `console.warn` or `console.error`.
- **9 occurrences** are inside test harness file `client/src/__master_offline__/sensitive-logging.test.jsx` (intentional testing of error logging suppression).
- **10 occurrences** exist in production components:
  1. `client/src/App.js:79` — `[ErrorBoundary] Runtime render error captured (sanitized operational code)`
  2. `client/src/components/common/HistoryErrorBoundary.jsx:24` — `[HistoryErrorBoundary] Captured render error in medical history panel`
  3. `client/src/components/common/IdleTimer.jsx:22` — `Idle logout could not reach the server.`
  4. `client/src/components/common/NotificationBell.jsx:77` — `[Socket.IO] Authentication rejected or expired. Halting reconnection.`
  5. `client/src/i18n/LanguageContext.jsx:32` — `Failed to persist language in localStorage`
  6. `client/src/pages/admin/AnalyticsDashboard.jsx:46` — `[AnalyticsDashboard] Failed to fetch analytics data:`
  7. `client/src/pages/admin/BanManagement.jsx:54` — `Failed to load users:`
  8. `client/src/pages/admin/Dashboard.jsx:678` — `[Socket.IO Admin] Authentication rejected or expired. Halting reconnection.`
  9. `client/src/pages/doctor/PatientDetail.jsx:73` — `fetchRecords failed: [operational error code: CLINICAL_RECORD_FETCH_FAILED]`
  10. `client/src/utils/deviceFingerprint.js:85` — `[DeviceTracker] Failed to get high entropy hardware model`

### 3.2 Known React Test Warnings (`act(...)`)
Inspection of test gate execution (`scratch/clinical-offline-kkbybA/client-console.txt`) reveals exactly **3 unique `act(...)` warning categories**:
1. `An update to DrugSearchInput inside a test was not wrapped in act(...).`
   - **Root cause:** Debounced input search timer triggers state update `setQuery(...)` after the synchronous Jest test assertion completes.
2. `An update to NotificationProvider inside a test was not wrapped in act(...).`
   - **Root cause:** Mock Socket.IO message handler updates unread notification badge state asynchronously.
3. `An update to PharmacyProfileModal inside a test was not wrapped in act(...).`
   - **Root cause:** Async modal open/close animation or fetch resolver updates component state after unmount or after assertion.

### 3.3 Remediation Strategy
- Wrap state transitions in `await waitFor(() => ...)` or `await act(async () => ...)`.
- Clear active debounced timers in `afterEach` (`jest.clearAllTimers()`) to eliminate trailing microtask updates.

---

## 4. S3 — Auth Limiter Skip Inversion in `server/src/app.js`

### 4.1 Current Code & Vulnerability
- **File & lines:** `server/src/app.js:303-309`
  ```javascript
  // Rate limiting: strict in production, relaxed in development
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 10 : 100,
    message: { error: 'Too many requests from this IP, please try again later.' },
    skip: () => process.env.NODE_ENV !== 'production',
    validate: { trustProxy: false }
  });
  ```
- **Flaw:**
  - Notice line 305 specifies: `max: process.env.NODE_ENV === 'production' ? 10 : 100`. The intent was clearly to enforce a 100-request limit during development/staging.
  - However, line 307 specifies `skip: () => process.env.NODE_ENV !== 'production'`.
  - When `NODE_ENV !== 'production'` (e.g. `development`, `staging`, `preview`), `skip()` evaluates to `true`, causing `express-rate-limit` to bypass all rate limit checks entirely. The `max: 100` branch is **unreachable dead code**.
  - In staging, review environments, and local demos, authentication endpoints (`/api/auth/*`) are completely unthrottled against credential stuffing.

### 4.2 Safest Inversion
Change line 307 to:
```javascript
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 10 : 100,
    message: { error: 'Too many requests from this IP, please try again later.' },
    skip: () => process.env.NODE_ENV === 'test',
    validate: { trustProxy: false }
  });
```

### 4.3 Behavioral Verification
- **Production (`NODE_ENV === 'production'`):** Enforces 10 requests per 15 minutes. Not skipped.
- **Development / Staging / Demo (`NODE_ENV !== 'production' && NODE_ENV !== 'test'`):** Enforces 100 requests per 15 minutes. Not skipped.
- **Automated Tests (`NODE_ENV === 'test'`):** Skipped to prevent rapid test runner requests from triggering 429 errors.
