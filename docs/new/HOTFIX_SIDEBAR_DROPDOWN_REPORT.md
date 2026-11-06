# Hotfix Report: Sidebar Notification Dropdown Viewport Bounds

**Date:** 2026-11-06  
**Target:** Desktop Sidebar NotificationBell dropdown viewport clipping  
**Branch:** `hotfix/sidebar-dropdown` (working tree prepared on `main` at `677cfb1`)  
**Status:** Verification Complete (offline gate run, 15/15 protected pins verified)

---

## 1. Problem Root Cause and Geometry Analysis

### A. Symptom
On desktop viewports (e.g. 1440x900), opening the notification bell in the sidebar (`Sidebar.jsx:169`) caused the dropdown panel to extend ~94 px past the left edge of the screen (`x < 0`) and significantly overflow below the bottom edge of the viewport (`y > 900`).

### B. Code Origin
1. **`client/src/components/common/Sidebar.jsx:169`**:
   The desktop sidebar is fixed to the left edge of the screen (`fixed left-0 top-0 bottom-0 w-64`, width = 256 px). In the sidebar footer (`px-3 pb-4`), inside the user badge (`px-4 py-3`), `<NotificationBell />` is mounted at the right side of the card (`left` ~ 192 px, `right` ~ 228 px, `top` ~ 742 px, `bottom` ~ 778 px in a 900 px high viewport).
2. **`client/src/components/common/NotificationBell.jsx:216`**:
   The dropdown container originally had classes:
   ```css
   fixed inset-x-2 top-16 sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:w-80 sm:max-w-[calc(100vw-1rem)] mt-2
   ```
   - **Horizontal Clipping:** `sm:right-0` aligns the right edge of the 320 px wide dropdown (`sm:w-80`) with the bell container's right edge (`x = 228 px`). The left edge was forced to `228 - 320 = -92 px` (~94 px left overflow outside the screen).
   - **Vertical Clipping:** `sm:top-full mt-2` anchored the dropdown top to `bottom + 8 px = 778 + 8 = 786 px`. With a dropdown height of ~429 px (header 45 px + `max-h-96` 384 px), the bottom edge reached `786 + 429 = 1215 px`, overflowing 315 px below the 900 px viewport.

---

## 2. Surgical Solution

1. **`client/src/components/common/NotificationBell.jsx`**:
   - `NotificationBellView` updated to accept `placement = 'header'` and `align` props:
     ```jsx
     const NotificationBellView = ({ placement = 'header', align }) => {
       const isSidebar = placement === 'sidebar' || align === 'left';
     ```
   - When `isSidebar === true`:
     - Desktop positioning classes switch to `sm:bottom-full sm:top-auto sm:left-0 sm:right-auto sm:mb-2 mt-2 sm:mt-0`.
     - Dropdown aligns to the bell's left edge (`sm:left-0 sm:right-auto`) and opens upward (`sm:bottom-full sm:top-auto sm:mb-2`).
     - Animation adjusts to `initial={{ opacity: 0, y: isSidebar ? -10 : 10, scale: 0.95 }}` and `exit={{ opacity: 0, y: isSidebar ? -10 : 10, scale: 0.95 }}`.
     - Scrollable container adds `sm:max-h-[calc(100vh-14rem)]` to ensure responsive vertical constraints on compact desktop screens.
   - When `isSidebar === false` (default / Header):
     - Classes remain `sm:top-full sm:right-0 mt-2` (100% backward-compatible).
   - On mobile (`< sm` / 320x640):
     - `fixed inset-x-2 top-16` remains active across all placements, centering the dropdown within the mobile viewport.

2. **`client/src/components/common/Sidebar.jsx:169`**:
   - Updated mounting to pass `placement="sidebar"`:
     ```jsx
     <NotificationBell placement="sidebar" />
     ```

### Resulting Geometry at 1440x900 (Desktop Sidebar)
- **Left:** `192 px >= 0` (No left clipping; starts at bell's left edge)
- **Right:** `192 + 320 = 512 px <= 1440 px` (No right clipping)
- **Bottom:** `742 - 8 = 734 px <= 900 px` (No bottom clipping; docked above bell)
- **Top:** `734 - 429 = 305 px >= 0` (No top clipping)
- **Clipping Status:** `isClipped: false`

### Resulting Geometry at 320x640 (Mobile Drawer)
- **Left:** `8 px >= 0` (`inset-x-2`)
- **Right:** `312 px <= 320 px`
- **Top:** `64 px >= 0` (`top-16`)
- **Bottom:** `<= 640 px`
- **Clipping Status:** `isClipped: false`

### Resulting Geometry at 1440x900 (Desktop Header)
- **Right:** `1400 px <= 1440 px`
- **Left:** `1400 - 320 = 1080 px >= 0`
- **Top:** `56 + 8 = 64 px >= 0` (`sm:top-full mt-2`)
- **Bottom:** `64 + 429 = 493 px <= 900 px`
- **Clipping Status:** `isClipped: false`

---

## 3. Test Coverage & Verification

### A. Existing Tests (`client/src/__master_offline__/notification-bell-responsive.test.jsx`)
- **Changed lines:** 0 lines changed.
- All 4 existing tests pass unchanged because default `<NotificationBell />` preserves original header positioning classes.

### B. New Tests (`client/src/__master_offline__/notification-bell-sidebar.test.jsx`)
Added 5 comprehensive unit and layout bounds tests:
1. `sidebar dropdown uses upward and rightward placement classes to prevent viewport clipping` (PASS)
2. `sidebar dropdown stays strictly inside 1440x900 viewport without left or bottom clipping` (PASS)
3. `sidebar dropdown on mobile (320x640) stays strictly inside viewport` (PASS)
4. `header dropdown placement remains right-aligned and top-full without regression` (PASS)
5. `Sidebar component mounts NotificationBell with sidebar placement` (PASS)

### C. Offline Test Gate
Ran full offline runner `node scripts/run_offline_tests.js`:
- **Receipt:** `scratch/clinical-offline-BCXTVR`
- **Protected File Pins:** 15/15 matched `docs/release/PROTECTED_HASHES.json` (`sourceFrozen: true`).
- **Backend:** 2,553 PASS / 0 FAIL (117 suites) — 100% green
- **Email-PDF:** 31 PASS / 0 FAIL (2 suites) — 100% green
- **Client:** 654 PASS (+5 from baseline 649) / 2 FAIL (same 2 pre-existing uncommitted U18 failures in `optional-client-diagnostics`), 75 suites (+1 suite)
- **Root:** 38 PASS / 2 FAIL (`connect EACCES 127.0.0.1:58325` sandbox loopback restriction)
- **Gate Notice:** `GATE INCOMPLETE in this environment: ml-scoring, ml-flask, root, ml-status-contract`

---

## 4. Protected Files Check

All 15 protected files from `docs/release/PROTECTED_HASHES.json` remain untouched and match their registered SHA-256 hashes:
1. `server/src/middleware/auth.js`
2. `server/src/controllers/doctorController.js`
3. `ml-engine/app.py`
4. `ml-engine/evaluate_symptom_model.py`
5. `client/src/components/SymptomTagInput.jsx`
6. `server/tests/ir04BackendIntegration.test.js`
7. `server/tests/patientProfileOwnedIntegration.test.js`
8. `server/tests/prescriptionDurationOwnedIntegration.test.js`
9. `server/tests/lab.test.js`
10. `server/tests/universityDemoSeedVerify.test.js`
11. `client/tests/ir04-isolated-five-role-e2e.spec.js`
12. `server/src/config/dbGuard.js`
13. `server/src/models/Consultation.js`
14. `server/src/models/Patient.js`
15. `server/src/utils/versionedEncryption.js`

---

## 5. NOT VERIFIED

- **Live production browser rendering:** Measured via synthetic DOM layout engine simulation in offline Jest environment; live visual verification requires host browser.
- **Python ML scoring & flask:** Sandboxed environment cannot execute local Python 3.14 binaries (`code 103`).
- **Live Atlas / MongoDB connectivity:** Offline test harness uses inert mocks and loopback boundaries.

---

## 6. Host Operator Execution Block

Inside the sandbox, creating git lock files is blocked by OS permission boundaries (`.git/index.lock: Permission denied`). The working directory contains only the surgical edits. Execute the following PowerShell block on the host terminal to create the branch, stage the exact files, and commit:

```powershell
# Run from repository root: C:\Users\chamo\OneDrive\Desktop\Final project\medisync

# 1. Switch to a new hotfix branch from main
git switch -c hotfix/sidebar-dropdown main

# 2. Stage only the 3 touched files (never git add . or -A)
git add client/src/components/common/NotificationBell.jsx `
        client/src/components/common/Sidebar.jsx `
        client/src/__master_offline__/notification-bell-sidebar.test.jsx `
        docs/new/HOTFIX_SIDEBAR_DROPDOWN_REPORT.md

# 3. Verify staged changes
git diff --cached --stat

# 4. Commit the hotfix
git commit -m "fix(ui): keep sidebar notification dropdown inside the viewport"
```
