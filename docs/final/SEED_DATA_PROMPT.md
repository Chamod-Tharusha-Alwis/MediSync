# MEDISYNC SEED DATA PROMPT

Save as: `C:\Users\chamo\OneDrive\Desktop\Final project\medisync\docs\final\SEED_DATA_PROMPT.md`
Usage: attach to the agent (full access) and send **continue**. Same autonomous rules as `MASTER_PROMPT_ALL_IN_ONE.md` section 0 (no questions, self-verify, owner-only items to `OWNER_ACTIONS.md`, state in `MASTER_STATE.md`, protected ledger 15/15 untouched, no secrets or PII in logs, truth rules).

---

# AGENT INSTRUCTIONS

## 0. Safety first
1. Target database is `medisync_prod`. Before writing, confirm `docs/final/OWNER_ACTIONS.md` OA-03 (mongodump backup) is done or record that the owner has not confirmed it, then continue only with the **reversible** approach below.
2. **Reversible by design:** every seeded document carries `isSynthetic: true` (where the schema has it) and `syntheticSeedBatch: "viva-2026-11"` (or the existing batch field). Provide `--rollback` that deletes only documents with that batch tag. Never modify or delete any document without the tag, including the owner's existing accounts and test data.
3. Provide `--dry-run` (prints counts per collection, writes nothing) and run it first. Real run requires an explicit `--confirm` flag.
4. Reuse existing seed tooling in `scripts/`, `scripts/fixtures/` and `server/src/demo/` if present; extend it rather than writing a parallel one. Do not edit protected files; use new files.
5. Use the existing encryption helpers and blind-index logic for encrypted fields (name, NIC, contact, allergies, diagnosis, notes); set `keyVersion` correctly. Never write plaintext into encrypted fields.
6. **Seeding must send no emails or SMS.** Run with notifications disabled or a mocked transport. Seeded patient emails use a non-routable domain (`@example.invalid`), except the single demo patient below.
7. Passwords come from `SEED_TEST_PASSWORD` (read from env). Never print, log or commit it. If it is not set, stop that step and add the need to `OWNER_ACTIONS.md`.
8. Do not add demo/synthetic labels to the UI. The data flag stays in the database only.
9. Run the schema validators and the offline suite after changing any seeding code; the ledger must stay 15/15.

## 1. What to seed (read the schemas first and adapt field names)

**Facilities and staff**
- 2 hospitals (one with a lab), 2 pharmacies in different districts, with the existing role accounts kept as they are. Add only what is missing: 4 doctors (different specialties, **real-format SLMC numbers marked synthetic in the batch, not the old placeholder**), 3 pharmacists, 2 lab technicians. All accounts active, 2FA behavior as the existing accounts have.

**Patients (30)**
- Synthetic names (mix of Sinhala, Tamil and Muslim names), **synthetic NICs in valid Sri Lankan format that do not belong to real people** (use an obviously fake birth-year/day combination and document the generator), districts spread over all 25 districts, genders, blood groups, allergies on about 5 patients (penicillin, sulfa, NSAIDs), chronic conditions on about 8, preferred language en/si/ta spread.
- **One demo patient** whose email is the owner's mailbox from `OWNER_ACTIONS.md` (if unknown, use a placeholder and add `BLOCKED-OWNER`), used for the live OTP and QR demo. Give this patient 3 consultations, a prescription in each state (pending, fully dispensed, partially dispensed, superseded, expired), one lab test with a report ready, one with sample collected.

**Consultations (about 400 over the last 70 days)**
- Realistic daily volume spread across districts, with a plausible disease mix: dengue, influenza, viral fever, diarrhoeal disease, hypertension, diabetes, asthma, URTI, skin infections, chickenpox, typhoid, leptospirosis, etc. Use ICD codes **from the catalog the platform actually serves** (check the ICD-10 vs ICD-11 labelling; never label an ICD-11 code as ICD-10). Symptoms drawn from the ML symptom vocabulary so the triage demo is coherent. Each has doctor, hospital, district, timestamp (Asia/Colombo-aware), follow-up on some.
- Prescriptions on about 70% of consultations using drugs that exist in the formulary and resolve (no "unresolved ingredient"); about 60% of those dispensed through the real dispensing service path so receipts, pharmacy, pharmacist, timestamps and release data are consistent. A few carry a doctor safety acknowledgment (Warfarin + Ciprofloxacin) with reason text.
- Surveillance fields: set `surveillanceVerification` to `verified` for synthetic consultations **through the same fields the review feature uses**, with the seed batch noted as the verifier, so the public map and detector have verified data. Leave about 15 recent ones `pending` so the "awaiting review" state and the admin review queue can be demonstrated.

**Outbreak scenarios (prove each with the real detector)**
- Read `server/src/services/surveillanceService.js` and compute volumes from the actual formula; do not guess.
  - S-A: **Dengue in one district (e.g., Gampaha)**: low flat 56-day baseline, then a clear rise in the last 7 days that passes Gate 1 (N >= 5), Gate 2 (2 consecutive calendar days) and z > 2.0. Result must produce a Pending alert that an admin can approve.
  - S-B: negative control, a one-day spike that must NOT alert (persistence gate).
  - S-C: negative control, a small isolated cluster under N = 5 that must NOT alert.
  - S-D: a second disease (e.g., Chickenpox or Influenza) in a different district creeping up to show multi-disease detection.
- After seeding, run the detector (the same code path as `POST /api/admin/outbreak/trigger`, or its service function in a test harness) and record which scenarios alert. If S-A does not alert, adjust the seeded counts (not the detector) until it does, and document the final counts.

**Labs and prescriptions flow**
- 12 lab tests across statuses: consented, approved, sample collected, in progress, report ready (valid sample PDFs generated by the existing PDF tooling, encrypted at rest as the platform does). Status must be consistent across hospital, doctor and patient views.

**Audit and other collections**
- Do not fabricate audit-log history. The audit log fills from real actions during the demo. Do not create fake OTP sessions, tokens, or ban records. Create `VerificationToken` records only through the normal consultation summary export path for the demo patient's consultations.

## 2. Verify after seeding (record in `docs/final/SEED_REPORT.md`)
1. Counts per collection (patients, consultations, prescriptions, dispensings, lab tests), all tagged; the rollback dry-run lists exactly those.
2. Spot-check decryption through the normal API (not by printing database values): the demo patient timeline, one pharmacy history page (names only, no NIC), one lab report download.
3. Public health: `/public-health` shows data in en/si/ta; awaiting-review count is non-zero; S-A alert visible after admin approval; S-B and S-C produced no alert.
4. Doctor flow with the demo patient works end to end (ML analysis, ICD search, prescription, override flow, supersession notice).
5. Pharmacy flow: pending prescriptions load for the demo patient, dispense works, duplicate dispense returns `Prescription is not eligible for dispensing.` (`ALREADY_DISPENSED`).
6. Verify page: scan the QR from the demo patient's latest PDF, OTP is sent to the owner mailbox (count the email), unlock shows clinical and release data (or mark `BLOCKED-OWNER`).
7. Offline suite failed 0, ledger 15/15, client build 0, both CI workflows green.
8. Write the exact commands to dry-run, seed, and roll back in `docs/final/SEED_REPORT.md`, and list the demo accounts (usernames only, **never passwords**) and the synthetic NIC to use in screenshots.

## 3. Owner actions to log
- Take the `mongodump` backup before the real seed.
- Provide `SEED_TEST_PASSWORD` locally (never commit it); rotate it after the viva.
- Confirm the mailbox for the demo patient.
- Use the synthetic NIC from the seed report for all report and viva screenshots.

## 4. Final response format
Counts seeded per collection, scenario results (S-A to S-D alerted or not), commands for dry-run, seed and rollback, demo account list (usernames only), open owner actions, any known issues.
