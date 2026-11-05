# MediSync — Cleanup and Commenting Plan

Stage A planning document. Created: 2026-11-05 (Antigravity no-network, branch `antigravity/stage-a`)

Covers V3 §10. All deletions listed; no file removed without operator confirmation.

---

## 1. Dead code and removed features

After Stage B (inventory removal, admin page consolidation), the following files and
code paths will be dead. Remove them in Stage F only after Stage B commits are pushed
and CI is green.

### Files to delete after U10 (inventory removal)

| File | Reason |
|------|--------|
| `scripts/seedRestockData.js` | Seeds inventory data — no longer needed |
| `server/src/services/dispensingService.js` inventory sections | Only the inventory lookup logic; keep the rest |

### Routes to remove after U10/U15

| Route | File | Reason |
|-------|------|--------|
| `GET /api/pharmacy/inventory` | `pharmacyRoutes.js` | Inventory removed |
| `PUT /api/pharmacy/inventory` | `pharmacyRoutes.js` | Inventory removed |
| `GET /api/pharmacy/analytics/restock` | `pharmacyRoutes.js` | Old restock analytics |
| `POST /api/pharmacy/predict-restock` | `pharmacyRoutes.js` | ML restock prediction |
| `GET /api/pharmacy/restock-alerts` | `pharmacyRoutes.js` | Restock alerts |
| `POST /api/pharmacy/seed-restock` | `pharmacyRoutes.js` | Seed route (already `maintenanceDenied`) |
| `DELETE /api/pharmacy/seed-restock` | `pharmacyRoutes.js` | Same |
| `GET /admin/dashboard/alerts` (page route) | Client router | Alerts page removed (U15) |
| `GET /admin/dashboard/identity` (page route) | Client router | Identity page removed (U14) |

### Client components to delete after B2

| Component | Reason |
|-----------|--------|
| `client/src/pages/admin/UserAuditProfile.jsx` (identity page) | Folded into user detail panel |
| Any inventory-related component in pharmacy Dashboard | After U10 |

---

## 2. Scripts to archive or delete

The `scripts/` folder has accumulated a large number of one-off verification and harness
scripts. The following are candidates for `scripts/archive/` (or deletion after operator
confirmation). **Do not delete until operator sees this list.**

### Keep (ships with or runs in production / CI)

| File | Purpose |
|------|---------|
| `scripts/seed-platform-data.js` | The new seed script (Stage C) |
| `scripts/run_offline_tests.js` | CI and local offline gate |
| `scripts/verify_*.cjs` (active verifiers) | Used by CI or by name in MASTER_TRACKER |
| Any script referenced in `package.json` scripts | Keep |

### Archive candidates (one-off verifiers, harnesses, phase scripts)

Scan `scripts/` for files matching these patterns and confirm with operator:
- `phase4*.cjs`, `phase5*.js` — legacy phase harnesses
- `gateB1*.cjs`, `gateB1*.ps1` — Gate B1 harnesses (Gate B1 is complete)
- `agent_b_*.cjs` — agent B audit scripts (audit complete)
- `verify_b6_challenger.cjs`, `verify_m*_challenger.cjs` — point-in-time verifiers
- `run_e1_probes.js`, `run_e2_*.js`, `run_e3_*.js` — legacy probes
- `university*.cjs`, `university*.test.cjs` — university demo scripts
- PowerShell scripts (`*.ps1`) that are not referenced anywhere

Proposed action: move all candidates to `scripts/archive/` with an `ARCHIVE_INDEX.md`.

### Scripts to delete (not archive)

| File | Reason |
|------|--------|
| `scripts/seed-demo-outbreak.js` | Replaced by `seed-platform-data.js`; demo batch will be removed |
| `scripts/seedRestockData.js` | Inventory removed |
| Any script that writes to `local_sqlite` | ML SQLite is not used for public data |

---

## 3. `docs/temp/` consolidation

`docs/temp/` holds timestamped evidence receipts from every agent session. These are
useful for the viva (evidence of work). Proposed:
1. Create `docs/archive/` folder.
2. Move all `docs/temp/CODEX_*.json`, `docs/temp/CODEX_*.md`, `docs/temp/CODEX_*.patch`
   files to `docs/archive/evidence/` with dates preserved.
3. Keep `docs/temp/TEST_CREDENTIALS.local.md` in place (git-ignored, never moved).
4. Create `docs/archive/EVIDENCE_INDEX.md` listing every evidence file with a one-line
   description and the feature it covers.
5. `docs/agent-work/` files: retain in place (they are git-tracked history); add archived
   pointers per `TRACKER_RECONCILIATION.md`.

---

## 4. Code comments and documentation

### Why-comments in controllers and services

| File | Comment needed |
|------|---------------|
| `server/src/controllers/authController.js` | Explain `checkOtpRequestThrottle` pattern; explain TEST_OTP bypass location (after removal) |
| `server/src/controllers/labController.js` | Explain OTP namespacing (`OTP_NS_HOSPITAL`, etc.); explain 10-min TTL choice |
| `server/src/controllers/pharmacyController.js` | Explain consent-token check in dispense flow |
| `server/src/controllers/publicController.js` | Explain case definition and suppression threshold |
| `server/src/services/outbreakService.js` | Explain detection algorithm choice (z-score/CUSUM), baseline window |
| `server/src/middleware/clinicalWriteAuthorization.js` | Explain why clinical writes need extra authorization |
| `server/src/middleware/patientConsent.js` | Explain consent token lifecycle |

### JSDoc for exported functions

Add `@param`, `@returns`, `@throws` to all exported controller and service functions.

### README per top-level folder

| Folder | Contents of README.md |
|--------|----------------------|
| `client/` | Purpose; `npm start`, `npm run build`, `npm test`; i18n notes |
| `server/` | Purpose; `npm start`, `npm test`; env vars required |
| `ml-engine/` | Purpose; Python version; `pip install -r requirements.txt`; `python app.py` |
| `scripts/` | Purpose; list of active scripts with one-line description; archive note |
| `docs/` | Structure; tracker pointer; evidence archive pointer |

### Root `ARCHITECTURE.md`

- Request flow diagram (HTTP → Express middleware → controller → service → Mongo/Redis).
- Authentication flow (JWT → verify → role check → ownership check).
- Data model summary (key collections and their relationships).
- ML service integration (what it does, what it does not do, cold-start behavior).
- Deployment topology (Render backend + ML, Vercel frontend, Atlas, Redis, Resend/Brevo).

### `.env.example`

One file at repo root with all required environment variables, no real values, with a
comment describing each variable and whether it is required or optional.

---

## 5. ESLint warnings

Run `npm run build` or `npx eslint client/src --ext .jsx,.js` after Stage B and collect
all warnings. Fix:
- `no-unused-vars` from removed features.
- `react-hooks/exhaustive-deps` violations (may be the cause of U6 OTP firing on mount).
- Any `no-console` violations in shipped code.

Target: zero warnings in `npm run build` output.

---

## 6. Naming consistency

- District names: lower-case in storage and query; capitalize in display (U19).
- API responses: camelCase throughout; check for any `snake_case` leaks.
- Component file names: PascalCase (`PasswordStrengthMeter.jsx`, not `password-strength-meter.jsx`).

---

## 7. `console.log` audit

Production shipped code must have no `console.log`. Run:
```bash
grep -r "console.log" server/src client/src --include="*.js" --include="*.jsx"
```
Replace each with:
- Server: `logger.debug(...)` or `logger.info(...)` (use the existing logger).
- Client: remove entirely or use `logger` if one exists.

Exceptions: test files and scripts are allowed to log.

---

## 8. Protected files (ledger rule from V1 §2.3)

The 15 files in `docs/release/PROTECTED_HASHES.json` must not be modified.
If a file needs a change (e.g. to remove a dead feature), stop and ask the operator first.
Verify hashes before every push.
