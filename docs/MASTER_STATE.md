# MediSync Master State

**Current Status**: Feature A1 Live-Verified & Complete
**Active Feature**: A2 (`GET /broadcasts/latest` 401 resolution)
**Last Updated**: 2026-11-01

---

## 1. Finished Features
| Feature ID | Description | Commit Hash | CI Status | Live Verified | Date |
| --- | --- | --- | --- | --- | --- |
| PRE-1 | Resolve React Error #31 in lab test rendering across 8 components | `3a36494` | Green | Yes (Doctor flow past OTP to Step 2) | 2026-10-31 |
| PRE-2 | Admit medisync_prod in clinical command storage preflight | `ed313bb` | Green | Yes | 2026-10-31 |
| PRE-3 | Pharmacy credentials verification against stored hash | Local (Read-only) | N/A | Yes (Match verified) | 2026-11-01 |
| A1 | Public Health 503 fix (adaptive cold-start timeout) & graceful degradation with retry | `7cc6947` | Green (runs 41295783903 & 41295783852) | Yes (Desktop, Mobile 375px, 503 retry flow) | 2026-11-01 |

---

## 2. Next 5 Features
1. **A2**: Public route `GET /broadcasts/latest` 401 resolution without weakening auth.
2. **A3**: Console warning "WebSocket is closed before the connection is established" initiator capture & evidence-based fix.
3. **A4**: `feature_collector.js` deprecated parameters provenance determination and resolution.
4. **A5**: Admin Dashboard socket undefined token early-return and regression tests.
5. **A6**: Consolidate duplicate notification instances (`AppShell.jsx` & `Sidebar.jsx`).

---

## 3. Open Bugs
See [`BUGS.md`](file:///c:/Users/chamo/OneDrive/Desktop/Final%20project/medisync/docs/BUGS.md) for full bug details.
- `BUG-A1`: RESOLVED in commit `7cc6947`, verified live.
- `BUG-A2`: `GET /broadcasts/latest` returns 401 on unauthenticated public page.
- `BUG-A3`: Console warning WebSocket closed before connection established.
- `BUG-A4`: `feature_collector.js` deprecated parameter warning.
- `BUG-A5`: Admin Dashboard initializes socket when auth token is undefined.
- `BUG-A6`: Duplicate notification bell lifecycles in `AppShell.jsx` and `Sidebar.jsx`.

---

## 4. Last Live-Test Result
- Feature A1 (`7cc6947`):
  - Desktop live load: HTTP 200 OK on `/api/public/health-stats`, "Total Cases" and "Top Disease" rendered.
  - Mobile viewport (375x667): rendered cleanly with zero layout breakage.
  - Degradation test: HTTP 503 simulated; accessible error alert with "Retry" rendered; "Total Cases" hidden (0 fake counts); clicking "Retry" re-dispatched request and rendered live stats.
  - Screenshots stored in `<appDataDir>/scratch/` outside repo.

---

## 5. In-Progress / Half-Done Work
- Feature A1 complete. Starting Feature A2.
