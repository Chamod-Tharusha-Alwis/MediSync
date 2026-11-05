# MediSync — Demo Data Removal Plan

Stage A planning document. Created: 2026-11-05 (Antigravity no-network, branch `antigravity/stage-a`)

**Status: AWAITING `APPROVE DELETE-DEMO` before any deletion.**

Every demo/synthetic/test item is listed here. No deletion until the operator types
`APPROVE DELETE-DEMO` after reviewing the dry-run counts.

---

## Scope

Decision D1: synthetic data is acceptable for a university project. No on-site banner
(already removed). The old demo batch (`DEMO_OUTBREAK_2026_V1`, `CON-DEMO`, `CON-SYNTH`
records) served as placeholder data and is replaced by the new seeded data (Stage C).

The test OTP harness is a separate item — see section 5.

---

## 1. Mongo collections: old demo records

### Dry-run query (run before APPROVE DELETE-DEMO)

```js
// Count records to be deleted — no writes
db.consultations.countDocuments({ $or: [
  { isSimulatedDemo: true },
  { demoBatchId: "DEMO_OUTBREAK_2026_V1" },
  { consultationId: /^CON-DEMO/ },
  { consultationId: /^CON-SYNTH/ }
]})

db.outbreakalerts.countDocuments({ $or: [
  { demoBatchId: "DEMO_OUTBREAK_2026_V1" },
  { isSimulatedDemo: true }
]})

// ML tracking rows cannot be counted here — see section 2
```

Print the counts in a dry-run summary before asking for APPROVE DELETE-DEMO.

### Delete queries (only after APPROVE DELETE-DEMO)

```js
db.consultations.deleteMany({ $or: [
  { isSimulatedDemo: true },
  { demoBatchId: "DEMO_OUTBREAK_2026_V1" },
  { consultationId: /^CON-DEMO/ },
  { consultationId: /^CON-SYNTH/ }
]})

db.outbreakalerts.deleteMany({ $or: [
  { demoBatchId: "DEMO_OUTBREAK_2026_V1" },
  { isSimulatedDemo: true }
]})
```

**Safety rules:**
- Always dry-run first.
- Never run without `demoBatchId` or `isSimulatedDemo` filter — do not delete all records.
- Never touch the five real test accounts or any record without a demo marker.

---

## 2. ML SQLite: demo tracking rows

The ML engine (`medisync-ml.onrender.com`) has an ephemeral SQLite database with
outbreak tracking rows from prior demo ingest runs. Because the Render free tier has
no persistent disk, these rows may already be lost after a restart.

**Check:** `GET https://medisync-ml.onrender.com/health` and inspect the row count.

**If rows exist:**
The seed script's `--sync-ml` mode (from the old `seed-demo-outbreak.js`) sent rows via
`POST /ingest`. A matching delete requires either:
- A `DELETE /ingest?batch=DEMO_OUTBREAK_2026_V1` endpoint (check if it exists in `ml-engine/app.py`).
- Or simply restarting the ML service (Render free tier ephemeral disk resets on restart).

**After Stage C seed:** re-ingest with new seeded data via the same `/ingest` endpoint
if the ML service needs tracking rows for forecasting. The `OUTBREAK_AND_PUBLIC_HEALTH_DESIGN.md`
plan makes ML tracking rows optional (backend fallback for forecasting).

**Operator action needed:** confirm whether ML tracking rows need to be cleared or will
be lost on next Render restart.

---

## 3. UI strings and i18n keys

Search for and remove these strings from `client/src/i18n/translations/en.js`, `si.js`,
`ta.js` and any component that hard-codes them:

| String pattern | Location | Action |
|---------------|---------|--------|
| "SYNTHETIC EPIDEMIOLOGICAL SIMULATION" | Outbreak/ML views | Remove key and usage |
| "FOR SYSTEM TESTING ONLY" | Same | Remove |
| "TMP-" display name prefix | Any UI that shows TMP accounts | Remove prefix logic |
| "demo" in any user-visible label | Scan i18n files | Remove or replace |
| "simulated" in any user-visible label | Scan i18n files | Remove or replace |

**Scan command (for use with network):**
```bash
grep -r "SYNTHETIC\|FOR SYSTEM TESTING\|TMP-\|simulated\|demo" client/src/i18n/
```

---

## 4. Scripts

| Script | Action |
|--------|--------|
| `scripts/seed-demo-outbreak.js` | Delete after APPROVE DELETE-DEMO (or archive) |
| `scripts/seed-platform-data.js` | Keep (new seed script) |

---

## 5. Test OTP harness (separate approval — after Stage E)

**Files that contain the test OTP harness:**

| File | Change needed |
|------|--------------|
| `server/src/security/testOtpHarness.js` | Delete file |
| `server/src/utils/emailService.js` | Remove `TEST_OTP_ENABLED` block |
| `server/src/controllers/authController.js` | Remove bypass block |
| `server/src/controllers/patientController.js` | Remove bypass block |
| `server/src/controllers/labController.js` | Remove bypass block |

**After file changes:**
1. Add `server/tests/testOtpRemoval.test.js` — asserts the bypass is gone (checks that
   `TEST_OTP_ENABLED` has no effect on OTP verification).
2. Tell the operator to: unset `TEST_OTP_ENABLED` and `TEST_OTP_CODE` on Render and redeploy.
3. Tell the operator to rotate credentials for all 5 test accounts.
4. Commit `chore(cleanup): remove test otp harness and production bypass`.

**This step requires a separate operator approval** because it affects live login behavior.
Do not perform until Stage E tests are complete and passing.

---

## 6. Environment variables

| Variable | Location | Action after Stage E |
|----------|---------|---------------------|
| `TEST_OTP_ENABLED` | Render backend | Operator unsets |
| `TEST_OTP_CODE` | Render backend | Operator unsets |
| `DEMO_SEED_ALLOW` | Local `.env` | Remove from local env; ensure it is not committed |

---

## 7. Models/fields

| Model | Field | Action |
|-------|-------|--------|
| Consultation | `isSimulatedDemo` | After old records deleted: add to serializer exclude list; eventually remove from schema in a future migration |
| Consultation | `demoBatchId` | Same as above |
| OutbreakAlert | `isSimulatedDemo`, `demoBatchId` | Same |

The new seed uses `seedBatchId` (private, excluded from all serializers) — no UI-visible
field.

---

## 8. Docs and comments

| File | Action |
|------|--------|
| `docs/TEMP_TEST_HARNESS.md` | Move to `docs/archive/` after OTP removal |
| Any comment referencing demo/test data | Remove or update during Stage F commenting pass |
| `docs/CHANGELOG_PHASES.md` | Retain as history; note when demo data was removed |

---

## Approval checklist

Before typing `APPROVE DELETE-DEMO`, operator should see:
- [ ] Dry-run counts for Mongo collections
- [ ] Confirmation that new seeded data (Stage C) is live and verified
- [ ] Confirmation that public health views show seeded data, not demo data
- [ ] ML SQLite plan (clear or allow restart)
