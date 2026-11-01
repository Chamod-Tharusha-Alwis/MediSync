# MediSync Master State

**Current Status**: Feature A2 Live-Verified & Complete
**Active Feature**: A3 (Console warning "WebSocket is closed before the connection is established")
**Last Updated**: 2026-11-01

---

## 1. Finished Features
| Feature ID | Description | Commit Hash | CI Status | Live Verified | Date |
| --- | --- | --- | --- | --- | --- |
| PRE-1 | Resolve React Error #31 in lab test rendering across 8 components | `3a36494` | Green | Yes (Doctor flow past OTP to Step 2) | 2026-10-31 |
| PRE-2 | Admit medisync_prod in clinical command storage preflight | `ed313bb` | Green | Yes | 2026-10-31 |
| PRE-3 | Pharmacy credentials verification against stored hash | Local (Read-only) | N/A | Yes (Match verified) | 2026-11-01 |
| A1 | Public Health 503 fix (adaptive cold-start timeout) & graceful degradation with retry | `7cc6947` | Green (runs 41295783903 & 41295783852) | Yes (Desktop, Mobile 375px, 503 retry flow) | 2026-11-01 |
| A2 | Resolve GET /broadcasts/latest 401 on unauthenticated calls without weakening private auth | `88b07a4` | Green (runs 41298550380 & 41298550390) | Yes (0 broadcast calls on public routes, 401 retained on unauthenticated API) | 2026-11-01 |

---

## 2. Next 5 Features
1. **A3**: Console warning "WebSocket is closed before the connection is established" initiator capture & evidence-based fix.
2. **A4**: `feature_collector.js` deprecated parameters provenance determination and resolution.
3. **A5**: Admin Dashboard socket undefined token early-return and regression tests.
4. **A6**: Consolidate duplicate notification instances (`AppShell.jsx` & `Sidebar.jsx`).
5. **B1**: ML service 503 during consultation.

---

## 3. Open Bugs
See [`BUGS.md`](file:///c:/Users/chamo/OneDrive/Desktop/Final%20project/medisync/docs/BUGS.md) for full bug details.
- `BUG-A1`: RESOLVED in commit `7cc6947`, verified live.
- `BUG-A2`: RESOLVED in commit `88b07a4`, verified live.
- `BUG-A3`: Console warning WebSocket closed before connection established.
- `BUG-A4`: `feature_collector.js` deprecated parameter warning.
- `BUG-A5`: Admin Dashboard initializes socket when auth token is undefined.
- `BUG-A6`: Duplicate notification bell lifecycles in `AppShell.jsx` and `Sidebar.jsx`.

---

## 4. Last Live-Test Result
- Feature A2 (`88b07a4`):
  - Server private route check: `GET /api/alerts/broadcasts/latest` without bearer token returns HTTP 401 (not weakened).
  - Browser public navigation check (`/`, `/select-role`, `/public-health`, `/patient/login`, `/doctor/login`):
    - Clean storage: 0 broadcast calls, 0 401 responses.
    - `token = 'undefined'`: 0 broadcast calls, 0 401 responses.
    - `token = 'null'`: 0 broadcast calls, 0 401 responses.

---

## 5. In-Progress / Half-Done Work
- Feature A2 complete. Starting Feature A3.
