# Viva outbreak demo: owner runbook

**Synthetic demonstration data.** These steps put invented consultations into the database so the
**unchanged** outbreak rule can be shown working. This is a demonstration, not a measure of accuracy and
not real surveillance data. The design and the expected results are in [SEED_DESIGN.md](SEED_DESIGN.md).
The offline proof is in [OFFLINE_PROOF.json](OFFLINE_PROOF.json).

**Only you run the `--confirm` commands.** Every command below without `--confirm` is a dry run. A dry run
never connects to any database.

Run everything from the repository root, with the Node runtime the project already uses (Node 24).
- `--confirm` connects through the existing guard `server/scripts/operatorDatabaseMode.js`, using the
  connection settings in `server/.env`. It writes to production; add `--qa` to target the approved QA
  database instead.
- The scripts never print connection strings or keys.

## 0. Before you start (Monday or Tuesday morning)

- In Atlas, check the cluster's current data size, so you can compare it after seeding. The free tier
  (M0) limit is 512 MB.
- The bulk batch is projected at **35.7 MB**:
  - 30,032 consultations at 1,232 bytes each including indexes. That is the larger of the as-written size
    (1,060 B) and the encrypted form (1,232 B), measured on the local test database.
  - Plus 650 small parent records.
- Decide whether the older 7-scenario viva seed (`scripts/seed_viva_outbreaks.js`) is in the database
  too. Both seeds can live together: different districts are used for every scripted signal.
- Gampaha and Matara dengue are used by both seeds. If both seeds are present, those two buckets merge,
  and their alerts will differ from the tables below.

## 1. Dry run: what good output looks like

```bash
node server/scripts/demo/seedDemoBulk.cjs --reference-date=2026-11-17 --scan-dates=2026-11-17,2026-11-18
```

Use the date you will actually seed on as `--reference-date`. Good output for 2026-11-17 (abridged; this
is the real output):

```
Mode: DRY RUN - no database connection, nothing written
Batch tag: viva-2026-11-outbreaks   seed: 20261118   reference day D: 2026-11-17 (records end on D-1)
Total consultations: 30032
By disease: dengue 11927, influenza 7582, diarrhoeal 6010, leptospirosis 3027, typhoid 1486
Districts touched: 25  (...)
  A              42 cases  Clear outbreak A: Kurunegala dengue  dates 2026-11-12..2026-11-16 (5 days)
  B              16 cases  Clear outbreak B: Kegalle leptospirosis  dates 2026-11-13..2026-11-16 (4 days)
  C              91 cases  Slow rise: Anuradhapura influenza  dates 2026-09-15..2026-11-16 (45 days)
  D               8 cases  Noise spike: Hambantota typhoid  dates 2026-11-15..2026-11-15 (1 days)
  background  29875 cases  background, all districts  dates 2025-11-17..2026-11-16 (365 days)
Projected storage: 35.7 MB (...) WITHIN CAP
Plan digest: b5401e1e861902b78f84495cc7fd00ad43f26bac2251e88e041f015170c15c36
Unchanged rule (evaluateOutbreakCriteria) on this plan, scan on 2026-11-17:
  FLAG     Gampaha ICD10:A90  ... [background]
  FLAG     Matara ICD10:A90  ... [background]
  FLAG     Kurunegala ICD10:A90  n7=58 maxZ=7.58 consecutive=4 Critical ... [scenario A]
  no flag  Anuradhapura ICD10:J111 ... (PERSISTENCE_CRITERIA_NOT_MET) [scenario C: Slow rise]
  FLAG     Kegalle ICD10:A279  n7=19 maxZ=7.43 consecutive=4 Critical ... [scenario B]
  no flag  Hambantota ICD10:A010  n7=11 ... (PERSISTENCE_CRITERIA_NOT_MET) [scenario D: Noise spike]
[DRY RUN] Zero connections, zero writes.
```

**Stop if you see any of these:**
- `PLAN_OUTSIDE_BOUNDS`;
- `OVER CAP`;
- a total far from 30,000;
- a digest that changes between two dry runs on the same date.

The dry-run rule check covers the rule path only. The production scan also asks the ML engine. The
offline proof showed that the engine adds a Hambantota typhoid alert (Section 4).

## 2. Seed the bulk batch (Tuesday 17 Nov), then one scan

1. Run the dry run (step 1) and copy the digest it prints.
2. Write:
   ```bash
   node server/scripts/demo/seedDemoBulk.cjs --reference-date=2026-11-17 --confirm --expect-digest=<digest from step 1>
   ```
3. Good output:
   - `Connected to production database "..."`
   - then `WRITE COMPLETE`, with consultations `inserted: 30032`, written in 31 batches.
   - The offline run took about 4.5 s. Over the internet it will be slower, perhaps a minute or two.
   - Re-running the same command inserts 0 and reports 30,032 existing.
4. In the admin console, open the outbreak monitor and run **one** surveillance scan. The offline scan
   of this data took 0.41 s.
5. Expected alerts on Tuesday. All are Pending, and all carry the label "Demonstration alert generated
   from synthetic seed data. Not an active public health notice."

| Alert | Source | Severity |
|---|---|---|
| Kurunegala dengue | rule, scenario A | Critical |
| Kegalle leptospirosis | rule, scenario B | Critical |
| Gampaha dengue | rule, background seasonal false alarm | High |
| Matara dengue | rule, background seasonal false alarm | High |
| Hambantota typhoid | ML heuristic, scenario D: the one-day spike the rule suppressed | High |

6. Check the district map: all 25 districts should show activity, with Colombo and Gampaha the
   busiest.
7. The scheduled scan (`server/src/utils/cronJobs.js`) may also run and create the same alerts. That
   is expected.

## 3. The two-minute viva demo (Wednesday 18 Nov)

1. Optional: approve or dismiss Tuesday's alerts so the monitor is tidy.
   - Wednesday's scan recomputes the source list for each district and disease, so it can create fresh
     Pending copies of Tuesday's alerts.
   - Approval delivery is limited to the demo e-mail allowlist for synthetic alerts.
2. Dry run, then write the live outbreak (default district Badulla):
   ```bash
   node server/scripts/demo/seedDemoLiveOutbreak.cjs --reference-date=2026-11-18
   ```
   ```bash
   node server/scripts/demo/seedDemoLiveOutbreak.cjs --reference-date=2026-11-18 --confirm --expect-digest=<digest it printed>
   ```
   - For 2026-11-18 and Badulla the digest is `70536e64fa8d4d80ef69f708f1755e0da34e5648eff20dbe975b5a099ea0225c`.
   - It adds 36 verified dengue cases over 13-17 Nov.
   - `--district=<name>` picks another district. It must be one of the 25 and not Kurunegala, Kegalle,
     Anuradhapura or Hambantota.
   - Running it twice adds nothing.
3. Click **Run scan** in the outbreak monitor.
4. Show the new pending alert. The offline proof gave:
   - Badulla, ICD10:A90, **Critical**;
   - 41 cases in the 7-day window;
   - max z 7.5 on 5 consecutive days;
   - daily counts 0, 2, 5, 6, 9, 10, 9;
   - 103 source consultations (all Badulla dengue cases in the 63-day look-back);
   - the message "Unreviewed statistical signal (Critical - max z=7.5, 5 consecutive days). Requires
     administrator approval."
5. Approve it. Show that it carries the demonstration label.
6. Show the district map with Badulla highlighted.

## 4. Explain-it script (what each scenario shows)

| Scenario | What was seeded | Expected (fixed in the design) | Observed offline | Why |
|---|---|---|---|---|
| A: Kurunegala dengue | 42 extra cases over 5 days | Alert | **Alert, Critical** (z 7.6, 4 days) | Sharp, sustained rise: both gates pass |
| B: Kegalle leptospirosis | 16 extra cases over 4 days | Alert | **Alert, Critical** (z 7.4, 4 days) | Same rule, a second disease with a low baseline |
| C: Anuradhapura influenza slow rise | Rate doubled gradually over 9 weeks | No alert (a miss) | **No alert** (max z 1.87) | The 56-day baseline rises with the cases, so z never passes 2. The rule is blind to slow growth |
| D: Hambantota typhoid noise spike | 8 extra cases on one day | No alert | **Rule: suppressed** (z 18 on one day only). **ML heuristic: alert, High** | The persistence guard works. But the scan's second path, the ML-engine heuristic (more than 10 cases and a 150% rise for a High-danger disease), has no persistence check. Background typhoid brought the week to 11 cases |
| Background | 29,875 noise cases | No alert intended | **2 false alarms**: Gampaha and Matara dengue (High) | The dengue season (OpenDengue shape) rises about 1.4 times into mid-November. A z-score against a 56-day baseline reads a seasonal rise as an outbreak |
| Live demo, Badulla | 36 cases over 5 days | Alert after one scan | **Alert, Critical** (z 7.5, 5 days) | As A |

Link this to Section 6.3 of the report. The rule is a baseline. On the public OpenDengue counts, a fixed
95th-percentile threshold scored better than the z-score rule (F1 0.79 against 0.55). The synthetic demo
shows the same weakness live: two seasonal false alarms and a missed slow rise. None of this says
anything about real outbreaks, because the data are synthetic.

## 5. Clean-up (after the viva)

1. Dry run. It shows the delete filters and does not connect:
   ```bash
   node server/scripts/demo/cleanDemo.cjs
   ```
2. Delete:
   ```bash
   node server/scripts/demo/cleanDemo.cjs --confirm
   ```
   - It deletes only documents with `syntheticSeedBatch = viva-2026-11-outbreaks` **and**
     `isSynthetic = true` **and** this seed's identifier prefix.
   - It aborts before deleting anything if a document with the prefix lacks a flag.
   - It also deletes alerts whose source consultations are all from this seed.
3. Good output:
   - `deleted` equals `matched` for every collection;
   - `unflaggedRemoved: 0`;
   - `mixedAlertsLeft: []`. If an alert ID is listed there, review it by hand.
   - The offline run deleted 30,068 consultations (30,032 bulk plus 36 live), 600 patients, 25 doctors,
     25 clinics and 9 alerts. Counts then returned exactly to the starting numbers.
4. Verify:
   - The Atlas data size returns to about the step 0 figure. Space is reclaimed by the storage engine
     over time, so the figure may lag.
   - The outbreak monitor shows no demo alerts.
   - `scripts/cleanup_viva_outbreaks.js` would remove this seed **and** the older viva seed. Use it only
     if you want both gone.

## 6. Rollback checklist (if something looks wrong)

- **Wrong counts in the dry run:** do not run `--confirm`. Nothing has been written.
- **`PRE_FLIGHT_COLLISION_DETECTED`:** an identifier is already used by a non-seed record. Nothing was
  written. Stop and investigate. Do not delete the other record.
- **A write stopped halfway (network):**
  - Re-run the same command; upserts make it safe.
  - Or run `cleanDemo.cjs --confirm` to remove everything written so far.
- **Unexpected alerts after a scan:**
  - They will carry the synthetic label.
  - Dismiss them in the monitor, or run the clean-up.
  - Do not change any threshold.
- **The demo alert does not appear:** check that the live command printed `inserted: 36`, and that the
  scan ran after it. The window is the 7 complete days ending yesterday, so run the live command on the
  viva day itself.
- **Database close to the 512 MB limit:** run the clean-up and check the size again.

## Limits (say these in the viva)

- Synthetic data only, shaped from public weekly counts. These are not real patients or real district
  incidence.
- This demonstrates the unchanged rule. It is not a measure of the rule's accuracy. The scenarios were
  written to show both outcomes.
- The storage figure was measured on a local MongoDB 8.3 with the model's indexes. Production indexes
  may differ slightly.
- The offline proof used the local ML engine with a fresh temporary database. The production engine's
  disease danger levels decide the heuristic path.

Last verified: 2026-11-18 at commit f5337833. Location and internal links only; the content is a dated record and was not re-checked against the code (current documents are listed in docs/INDEX.md).
