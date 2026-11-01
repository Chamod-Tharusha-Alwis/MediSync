# MediSync Master State

**Current Status**: Feature A5 Live-Verified & Complete
**Active Feature**: A6 (Consolidate duplicate notification instances in `AppShell.jsx` & `Sidebar.jsx`)
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
| A3 | Safe socket disconnection to eliminate "WebSocket is closed before the connection is established" console warning | `fd39fce` | Green (runs 41301035888 & 41301035679) | Yes (0 WS warnings across public routes and rapid unmount/navigation in live browser) | 2026-11-01 |
| A4 | Audit provenance of `feature_collector.js` deprecated parameters warning | Documented | N/A | Yes (Confirmed 100% external origin; zero matches in repo/node_modules) | 2026-11-01 |
| A5 | Guard socket initialization on missing or invalid token in Admin Dashboard and NotificationBell | `b99e54b`, `64e92e6` | Green (runs 41304021647 & 41304735203) | Yes (0 socket calls dispatched on empty, 'undefined', or 'null' tokens in live browser) | 2026-11-01 |

---

## 2. Next 5 Features
1. **A6**: Consolidate duplicate notification instances (`AppShell.jsx` & `Sidebar.jsx`).
2. **B1**: ML service 503 during consultation.
3. **B2**: Empty medication suggestions.
4. **B3**: 409 on saving consultation.
5. **B4**: Lab dropdown overlap in consultation form.

---

## 3. Open Bugs
See [`BUGS.md`](file:///c:/Users/chamo/OneDrive/Desktop/Final%20project/medisync/docs/BUGS.md) for full bug details.
- `BUG-A1`: RESOLVED in commit `7cc6947`, verified live.
- `BUG-A2`: RESOLVED in commit `88b07a4`, verified live.
- `BUG-A3`: RESOLVED in commit `fd39fce`, verified live.
- `BUG-A4`: RESOLVED (provenance audit confirmed external origin).
- `BUG-A5`: RESOLVED in commits `b99e54b` & `64e92e6`, verified live.
- `BUG-A6`: Duplicate notification bell lifecycles in `AppShell.jsx` and `Sidebar.jsx`.

---

## 4. Last Live-Test Result
- Feature A3 (`fd39fce`):
  - Headless Chromium (Playwright) tested against `https://medisync.chamodtharusha.com.lk`:
  - Rapid navigation across public routes (`/`, `/select-role`, `/public-health`, `/patient/login`, `/doctor/login`): 0 WebSocket warnings.
  - Stress navigation with rapid route transitions during 500ms socket timer (simulating rapid component unmount): 0 "WebSocket closed before connection established" warnings.
  - Live chunk `305.75888904.chunk.js` verified serving `skipReconnect: true` and `safeDisconnectSocket`.

---

## 5. In-Progress / Half-Done Work
- Feature A2 complete. Starting Feature A3.
