# MediSync — Owner Production Actions & Runbook (Sub-Project 4)

> [!NOTE]
> **SUPERSEDED**: This document is superseded by the consolidated master checklist in [docs/OWNER_CHECKLIST_FINAL.md](file:///c:/Users/chamo/OneDrive/Desktop/Final%20project/medisync/docs/OWNER_CHECKLIST_FINAL.md). Retained for historical audit purposes only.

This document contains explicit commands and guidance for the repository owner for Sub-Project 4.

---

## 1. Storage Boot Guard Hardening

### Action: Remove Auto-Provision Flag
Once Render has successfully booted and created the `verificationtokens` collection and indexes on MongoDB Atlas:
1. Open [Render Dashboard](https://dashboard.render.com/) -> `medisync-backend` -> **Environment**.
2. Remove or delete the environment variable:
   ```
   MEDISYNC_AUTO_PROVISION_STORAGE
   ```
3. Keep:
   ```
   MEDISYNC_VERIFICATION_TOKENS_APPROVED=true
   ```
4. Save Changes.
5. **Why**: This restores the fail-closed security posture so that any unexpected schema or collection changes in the future will halt startup rather than silently auto-mutating production storage.

---

## 2. Official Census 2024 Population Data Entry

### Action: Enter Official DCS Table 2 District Populations
`server/src/data/districtPopulation2024.json` and `client/src/data/districtPopulation2024.json` currently have all 25 districts set to `null` (`status: "pending_owner_data"`) to prevent unverified or invented numbers.
When official Census of Population and Housing 2024 district counts are available from `statistics.gov.lk`:
1. Obtain the official Table 2 publication from the Department of Census and Statistics Sri Lanka.
2. Replace the `null` values in `server/src/data/districtPopulation2024.json` and `client/src/data/districtPopulation2024.json` with the exact verified population integers.
3. Update `"status": "verified"` and `"retrievedAt": "<ISO-DATE>"`.
4. Commit and deploy. The UI incidence per 100k will automatically transition from `"population data pending"` to numeric rates.

---

## 3. Production Seeder & Removal Exact Commands

### Seeding Dispensing Samples (`SEED_2026_11_B`)
```powershell
# Help inspection:
node scripts/seed-dispensing-sample.js --help

# Dry run (read-only verification):
node scripts/seed-dispensing-sample.js --db medisync_prod --dry-run

# Execution (writes enabled):
$env:MEDISYNC_SEED_RUN_APPROVAL="SEED RUN APPROVED"
node scripts/seed-dispensing-sample.js --db medisync_prod --confirm
```

### Removing Synthetic Outbreak Demo Batch (`DEMO_OUTBREAK_2026_V1`)
```powershell
# Help inspection:
node scripts/remove_demo_batch.js --help

# Dry run (read-only verification):
node scripts/remove_demo_batch.js --db medisync_prod --dry-run

# Execution (destructive deletion):
$env:APPROVE_DEMO_OUTBREAK_REMOVAL="true"
node scripts/remove_demo_batch.js --db medisync_prod --confirm-demo-removal DEMO_OUTBREAK_2026_V1
```


---

## 4. Sri Lankan Priority Diseases Curated Profile Entry (`pending_owner_data`)

### Background & Non-Fabrication Rule
Under National Surveillance guidelines in Sri Lanka, 11 communicable diseases require dedicated monitoring:
1. **Dengue**: Covered in Tier 1 (`Dengue`).
2. **Malaria**: Covered in Tier 1 (`Malaria`).
3. **Typhoid**: Covered in Tier 1 (`Typhoid`).
4. **Tuberculosis**: Covered in Tier 1 (`Tuberculosis`).
5. **Hepatitis (A, B, C, D, E)**: Covered in Tier 1 (`Hepatitis A` through `E`).
6. **Influenza / Flu**: Covered in Tier 1 (`Common Cold`) and Tier 2 KB (`Flu` -> `J11.1`).
7. **Leptospirosis**: MISSING in Tier 1. (Raw SymCAT profile was a 100% dummy imputation fallback artifact and is quarantined).
8. **Chikungunya**: MISSING in Tier 1 and absent in SymCAT.
9. **Cholera**: MISSING in Tier 1 and absent in SymCAT.
10. **Dysentery**: MISSING in Tier 1 and absent in SymCAT.
11. **Measles**: MISSING in Tier 1 and absent in SymCAT.

### Action for Owner (When Official Case Definitions are Available):
1. **Source Citation**:
   - Epidemiology Unit, Ministry of Health Sri Lanka: [Surveillance Case Definitions for Notifiable Diseases](https://www.epid.gov.lk/).
   - World Health Organization: [WHO Recommended Surveillance Standards](https://www.who.int/).
2. **Procedure**:
   - Extract the clinical case definition symptoms for Leptospirosis, Chikungunya, Cholera, Dysentery, and Measles from the official MOH/WHO documentation.
   - Append the verified cases to `ml-engine/data/dataset.csv` with their standard ICD-10 codes:
     - Leptospirosis (`A27.9`)
     - Chikungunya (`A92.0`)
     - Cholera (`A00.9`)
     - Dysentery (`A09.0` / `A06.0`)
     - Measles (`B05.9`)
   - Re-run `node scripts/run_offline_tests.js`.
