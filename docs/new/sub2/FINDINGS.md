# Sub-Project 2 — Root Cause Findings & Architecture Review

Date: 2026-11-08  
Branch: `fix/post-merge-sub2` (base `main` @ `da438aa`)

---

## Task A: Seeder Mongoose Instance Mismatch

### 1. Root Cause
`scripts/seed-dispensing-sample.js` imports `mongoose` via bare `require('mongoose')` at line 19, resolving to the workspace root `node_modules/mongoose`. Concurrently, lines 20–23 import models (`Dispensing`, `Pharmacy`, `PharmacyStaff`, `Prescription`) from `../server/src/models/*`. Within each model file, `require('mongoose')` resolves to `server/node_modules/mongoose`.

At runtime (`runCli`), line 287 executes `await mongoose.connect(uri, { dbName: parsed.database })`, connecting only the **root** Mongoose instance. The models remain bound to the **server** Mongoose instance, whose default connection is disconnected. When `Pharmacy.findOne(...)` executes at line 186, Mongoose buffers the query waiting for connection (`bufferCommands: true`). After 10,000 ms, Mongoose fails closed with:
`Operation pharmacies.findOne() buffering timed out after 10000ms`.

### 2. Evidence in Code
- `scripts/seed-dispensing-sample.js:19`:
  ```javascript
  const mongoose = require('mongoose'); // Loads root node_modules/mongoose
  const Dispensing = require('../server/src/models/Dispensing'); // Loads server/node_modules/mongoose
  ```
- Contrast with `scripts/remove_demo_batch.js:189–195` and `scripts/seed-platform-data.js:109`:
  ```javascript
  const mongoose = require(require.resolve('mongoose', { paths: [path.resolve(__dirname, '../server')] }));
  ```
- Contrast with `server/node_modules/mongoose` package identity.

### 3. Proposed Fix
1. Standardize `scripts/seed-dispensing-sample.js` to resolve Mongoose from `server/` before requiring any server models:
   ```javascript
   const mongoose = require(require.resolve('mongoose', { paths: [path.resolve(__dirname, '../server')] }));
   ```
2. Disable command buffering on connection (`mongoose.set('bufferCommands', false)`), matching `seed-platform-data.js`.
3. Audit all other scripts in `scripts/`:
   - `scripts/remove_demo_batch.js`: already uses server path resolution.
   - `scripts/seed-demo-outbreak.js`: already uses server path resolution.
   - `scripts/seed-platform-data.js`: already uses `../server/node_modules/mongoose`.
   - `scripts/agent_b_combined_test_boundary.cjs`: already uses `../server/node_modules/mongoose`.
4. Add an offline test in `server/tests/phase3GroupingAndDispensingSeeder.test.js` or a dedicated test verifying:
   - `seed-dispensing-sample.js` Mongoose instance equals `server/src/models/Pharmacy` Mongoose instance.
   - `--dry-run` performs zero writes and returns a valid plan with zero database connection timeouts.

---

## Task B: Outbreak Alert Lifecycle (Confirm / False Alarm / Resolve)

### 1. Root Cause & State Machine Breakdown
There are three interconnected issues preventing resolution and action display:

#### Issue B.1: Confirmed Alert Hides the Resolve Button in the UI
In `client/src/pages/admin/OutbreakMonitor.jsx:668–676`:
```jsx
) : alert.feedbackStatus === 'confirmed' ? (
  <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-xl select-none">
    Confirmed
  </span>
)
```
When an alert is confirmed (`feedbackStatus === 'confirmed'`), it enters this branch, rendering only the static "Confirmed" badge and **no action buttons at all**. Because the alert remains in `status: 'Active'`, it is in a non-terminal state, but the operator has no button to transition it to `Resolved` once the outbreak is managed.

#### Issue B.2: Backend `canReviewSimulation` Blocks Real Admin Accounts
In `server/src/controllers/adminController.js:923`:
```javascript
if (service.synthetic(alert) && !await service.canReviewSimulation(req.user)) {
  return res.status(403).json({ error: 'Synthetic reviewer required.' });
}
```
And in `server/src/services/surveillanceService.js:282–286`:
```javascript
async function canReviewSimulation(user) {
  if (!['admin','super_admin','superadmin'].includes(user?.role)) return false;
  const admin = await require('../models/Admin').collection.findOne({
    _id: new mongoose.Types.ObjectId(user.id),
    isActive: true
  });
  return Boolean(admin && synthetic(admin));
}
```
`canReviewSimulation` requires `synthetic(admin) === true`. If the owner logs in with a genuine administrative account (which is not synthetic), `canReviewSimulation` evaluates to `false`. Any attempt by a real administrator to approve, verify, or resolve synthetic alerts fails with HTTP 403 `Synthetic reviewer required.`.

#### Issue B.3: Missing Audit Logging on Transition
Transitions in `verifyAlertStatus` and `resolveAlert` did not append an entry to `AuditLog`, leaving actions untracked in compliance logs.

### 2. Intended State Machine
```
[Pending]
   │
   ├── Approve ────────► [Active (unverified)]
   └── Dismiss ────────► [Dismissed] (terminal: read-only badge)

[Active (unverified)]
   │
   ├── Confirm ────────► [Active (confirmed)] ─── Resolve ───► [Resolved] (terminal)
   ├── False Alarm ────► [Resolved (false alarm)] (terminal: read-only badge)
   └── Resolve ────────► [Resolved] (terminal: read-only badge)
```
- **Non-terminal states** (`Pending`, `Active (unverified)`, `Active (confirmed)`) must display all permitted actions.
- `Active (confirmed)` alerts MUST show a visible **Resolve** button alongside the "Confirmed" badge.
- **Terminal states** (`Resolved`, `Dismissed`) render read-only status badges with zero action buttons.

### 3. Discrepancy Explanation: 14 Alerts in Batch vs. 6 Active on Monitor
- `remove_demo_batch.js --dry-run` queries:
  ```javascript
  { $and: [ { demoBatchId: 'DEMO_OUTBREAK_2026_V1' }, { syntheticSeedBatch: { $ne: 'SEED_2026_11_A' } } ] }
  ```
  This matches **all 14 historical alerts** generated under batch `DEMO_OUTBREAK_2026_V1` across all lifecycle states (`Active`, `Pending`, `Resolved`, `Dismissed`).
- In contrast, `getActiveAlerts` in `server/src/controllers/alertController.js:24` filters:
  ```javascript
  status: { $in: ['Active', 'Pending'] }
  ```
  It queries only alerts currently active or pending. The other 8 alerts in the batch are in terminal states (`Resolved` or `Dismissed` from earlier tests or false-alarm resolutions).

### 4. Proposed Fix
1. In `server/src/services/surveillanceService.js:282–286`: Allow any active admin user (`admin`, `super_admin`, `superadmin`, `health_officer`) to review and resolve simulation alerts without demanding that the administrator account itself have synthetic provenance tags.
2. In `client/src/pages/admin/OutbreakMonitor.jsx:668–676`: For `alert.feedbackStatus === 'confirmed'`, render the "Confirmed" badge **plus** a "Resolve" button.
3. In `server/src/controllers/adminController.js` (`resolveAlert`) and `server/src/controllers/alertController.js` (`verifyAlertStatus`): Add append-only audit logging via `AuditLog.create({ actorId, actorRole, action: 'ALERT_CONFIRMED'|'ALERT_RESOLVED'|'ALERT_FALSE_ALARM', timestamp: new Date() })` without PII.
4. Return trilingual-ready error responses and surface explicit toast feedback in the UI.
5. Add unit tests for every transition and client rendering tests.

---

## Task C: ML Engine "Not Available" / "Not Verified"

### 1. Root Cause & Architectural Investigation
Tracing the call path:
1. `Admin Dashboard (Overview)` calls `api.get('/admin/system-health')`.
   - `adminController.getSystemHealth` invokes `checkMlHealth({ timeoutMs: 3000 })` in `server/src/services/mlPredictionService.js`.
   - The ML service on Render Free Tier goes into cold sleep after 15 minutes of inactivity. Cold start takes 50–80 seconds.
   - The 3,000 ms timeout expires immediately during cold start, returning `{ availability: 'waking_up', status: 'waking_up' }`.
   - In `client/src/pages/admin/Dashboard.jsx:723–724`, the status checks only for `'available'` or `'operational'`:
     ```jsx
     status: (systemHealth?.mlEngine?.status === 'available' || systemHealth?.mlEngine?.status === 'operational' || systemHealth?.mlEngine?.availability === 'available') ? 'Available' : 'Not verified'
     ```
     Because `'waking_up'` is not recognized, it displays **"Not verified"** in amber.
   - The Overview page never polls again; the status remains permanently "Not verified" until manual page refresh.
2. `Admin Outbreak Monitor` calls `api.get('/admin/ml-status')`.
   - `adminController.getMLStatus` calls `probeAdminMlStatusWithRetry`.
   - `adminMlStatusService.js:54` uses `timeout: 10000` (10 seconds), which times out on Render cold starts.
   - It correctly classifies the failure as `availabilityState: 'waking'`, returning `{ available: false, availabilityState: 'waking', dataPoints: null }`.
   - In `client/src/pages/admin/OutbreakMonitor.jsx:397`:
     ```jsx
     value={modelStatus ? modelStatus.dataPoints.toLocaleString() : "Not available"}
     ```
     Because `dataPoints` is `null` when waking, evaluating `modelStatus ? ...` without null-checking `dataPoints` causes `TypeError: Cannot read properties of null` or falls back to "Not available".
   - Furthermore, `OutbreakMonitor.jsx` never schedules a retry when in `'waking'` state.
3. `ML_ENGINE_URL` environment configuration:
   - In `server/src/controllers/adminController.js:23`:
     `const ML_ENGINE_URL = process.env.ML_ENGINE_URL;`
     If unset in Render backend env, it is `undefined`, causing `modelStatusUrl` to throw `INVALID_ML_CONFIGURATION` and mark the service permanently down.

### 2. Proposed Fix
1. In `adminController.js:23`: Default `ML_ENGINE_URL` to `process.env.ML_ENGINE_URL || 'https://medisync-ml.onrender.com'`.
2. In `client/src/pages/admin/Dashboard.jsx`:
   - Support `'waking'` and `'waking_up'` states with an amber badge "Starting up...".
   - If in waking state, schedule a non-blocking poll after 10 seconds to auto-refresh the card once awake.
3. In `client/src/pages/admin/OutbreakMonitor.jsx`:
   - Fix line 397: Safely guard `dataPoints` access (`modelStatus?.available && Number.isFinite(modelStatus.dataPoints) ? modelStatus.dataPoints.toLocaleString() : t("adminStatus.notAvailable", "Not available")`).
   - If `modelStatus?.availabilityState === 'waking'`, set a 10-second timer to re-probe `/admin/ml-status` up to 6 times (60s total) so cards auto-update without manual reload.
4. Add non-blocking warm-up ping on admin page loads.
5. Verify `ml-engine/app.py`: In production (`MEDISYNC_ML_QA` not set), `db_path` correctly resolves to `ml-engine/medisync.db`. The 41 disease profiles consume <80 MB of RAM, well within Render's 512 MB memory boundary.

---

## Task D: "SYNTHETIC SIMULATION" Alert Label Scoping

### 1. Root Cause
In `client/src/pages/admin/OutbreakMonitor.jsx:630`, `client/src/pages/admin/Dashboard.jsx:565`, and `client/src/components/common/ActiveOutbreakBanner.jsx:95`, the badge renders if `alert.syntheticLabel` is truthy:
```jsx
{alert.syntheticLabel && (
  <span className="block text-[11px] text-amber-400 font-semibold tracking-wide uppercase mt-0.5">
    {alert.syntheticLabel}
  </span>
)}
```
The text `"SYNTHETIC EPIDEMIOLOGICAL SIMULATION — FOR SYSTEM TESTING ONLY"` is not hardcoded in the frontend; it was saved onto the alert documents in MongoDB during seed execution (`scripts/seedSyntheticOutbreaks.js`).

### 2. Proposed Behavior Once Demo Batch Is Removed
- For genuine clinical alerts: `isSimulatedDemo` and `syntheticLabel` are undefined/null, so no synthetic label is ever rendered.
- For simulation records: Keep rendering `alert.syntheticLabel` only when `alert.isSimulatedDemo === true` (or `alert.isSimulation === true`).
- The regulatory badge `clinicalValidation: not_established` remains permanent and untouched on all surveillance and diagnosis views.
