# MediSync Sub-Project 1: Phase 2 Polish and Cleanup — Master Plan

Branch: `feat/phase2-polish-and-cleanup` (off `main` @ `0871fd3`, contains PRs #17, #18, #19).
Status: **APPROVED BY OWNER (2026-11-07) — Phase 1 Complete; awaiting owner confirmation to begin Phase 2**.

## 0. Ground rules (apply to every phase)

- Never commit, merge or push to `main`. Commit and push only this branch.
- No secrets in files, logs or chat. `server/.env` stays untracked.
- `medisync_prod` is read-only for the agent. The agent never runs seed, delete, `--confirm`, `--refresh` or `--remove` against production. Owner-only commands go in `OWNER_ACTIONS.md`.
- `clinicalValidation: not_established` stays everywhere it appears today.
- Outbreak rules are not weakened: N >= 5 eligible cases, 2 consecutive days, z > 2.0 (Watch 2–3, Alert 3–4, Critical >= 4, from `surveillanceService.js`).
- Protected files (15 in `docs/release/PROTECTED_HASHES.json`) change only with a re-pin and written reason.
- Every new UI string exists in EN, SI and TA (key parity test must stay green).
- After every task: update `PROGRESS_TRACKER.md` and `TASK_BOARD.md`.
- Phase gate: `node scripts/run_offline_tests.js` (0 failed) + `npm --prefix client run build` (exit 0) → commit → push → report. Next phase starts only after the gate passes.

## 1. Goals

1. Shrink the working folder (40+ GB) to under 2 GB excluding `node_modules`, without the agent deleting large data itself.
2. Patient consultation summary email with PDF, and working PDF downloads (still gated).
3. Grouped prescriptions (patient) and grouped dispensing receipts (pharmacy); remove stale restock item.
4. Resilient ML status on admin page, Session Monitor filters/masking, explain 6-vs-5 alerts, 3-level outbreak view.
5. Official 2024 district population data for incidence per 100,000 (or BLOCKED with owner steps).
6. ML evaluation charts clearly labelled as synthetic, plus optional real-data dengue backtest.
7. Honest docs, reconciled acceptance matrix, owner live-test checklist.

## 2. Phases, tasks and acceptance criteria

### Phase 1 — Size audit and cleanup
| Task | Acceptance criteria |
|---|---|
| 1.1 SIZE_AUDIT.md | Top-level + second-level sizes, file counts, last-modified; top 30 largest files; each large item has description, git-tracked yes/no, verdict KEEP/GITIGNORE/OWNER-DELETE/REGENERABLE. Covers scratch, Python, .venv, %SystemDrive%, research, medisync-qa-evidence, _audit_report, .agents, root node_modules, stray "e candidate source…" file. Explains scratch from evidence. Measured by directory totals only. |
| 1.2 Git history | `git count-objects -vH` and largest historical blobs reported. No rewrite, no force push. |
| 1.3 .gitignore | All listed patterns ignored; any tracked ones removed with `git rm --cached` only; working files untouched. |
| 1.4 Dead code | Candidate list with search proof. Only clearly unused + gate-green removals. Rest listed for owner. |
| 1.5 `scripts/size_report.ps1` | Read-only, rerunnable, prints totals only. |
| 1.6 OWNER_ACTIONS.md | Copy-paste delete commands per approved item; advice to move out of OneDrive. Agent deletes nothing large. |

### Phase 2 — Consultation email and PDF
| Task | Acceptance criteria |
|---|---|
| 2.1 Summary email | Sent to the patient's own verified email after consultation completes; prescription list + `consultation_<id>.pdf`; no NIC in body/subject/filename; no PII in logs; failure logs a code, retries with backoff, never blocks the consultation save; respects daily cap; idempotent (one send per consultation); in-app "Resend summary email" button, rate limited. |
| 2.2 PDF download fix | Root cause documented (route / blob auth header / content-type / font fallback). Flag default OFF → 503. Flag ON in tests → download works for consultation and lab report. |
| 2.3 Tests | Sent once, correct recipient, no NIC leak, failure non-blocking, PDF download works, 503 when off. |

Note: attaching the PDF to email while `PDF_EXPORT_ENABLED` is off — see Open Question Q3.

### Phase 3 — Grouped prescriptions and dispensing
| Task | Acceptance criteria |
|---|---|
| 3.1 Patient Active Prescriptions | One card per consultation, all medications with status, matching consultation-details view. |
| 3.2 Pharmacy Dispensation History | One row per receipt number with all medications; server-side shaping or aggregation by receipt. |
| 3.3 Restock warnings | "Predictive Restock Warnings" removed or repurposed; no dead routes; no collections dropped. |
| 3.4 Dispensing analytics + sample seeder | 0 shown only when truly empty. `scripts/seed-dispensing-sample.js`: namespace `SEED_2026_11_B`, additive, dry-run default, idempotent, same approval flags as existing seeder, last 30 days. Agent runs it only against offline/automated-test DB. Owner commands in OWNER_ACTIONS.md. |
| 3.5 Tests | Grouping and analytics covered. |

### Phase 4 — Admin, outbreak and ML service
| Task | Acceptance criteria |
|---|---|
| 4.1 ML status resilience | Server warm-up + retry (backoff + jitter), short-TTL cached status, distinct `waking` / `down` / `available`, client message "Service waking up, retry in 30–60s", non-blocking health ping. Analyze/Retry debounced and disabled while pending. Doctor manual flow unblocked. |
| 4.2 Session Monitor | Role filter (All/Admin/Doctor/Patient/Pharmacy/Hospital) + search, kept in URL query, correct counts. NIC and email masked by default; reveal action audit-logged; consistent with Users panel. |
| 4.3 6 vs 5 alerts | Read-only investigation; cause written in DECISIONS.md; fix detector or doc expectation; test added. |
| 4.4 Outbreak levels | See interpretation below. Level selector on admin page; read-only summary on public page; public disclosure threshold kept. |
| 4.5 Wording | No remaining dead ML Alerts or "demo" UI wording; DB provenance fields unchanged. |

### Phase 5 — Population data
| Task | Acceptance criteria |
|---|---|
| 5.1 `server/src/data/districtPopulation2024.json` | Values only from official DCS Census of Population and Housing 2024 final report district table, with source URL and year. If fetch fails: nulls + BLOCKED + owner steps. No numbers from memory/news. |
| 5.2 Use | Incidence per 100,000 on admin and public maps; population offset in baseline without weakening N/z/2-day rules. Tests. |

### Phase 6 — ML evaluation graphs
| Task | Acceptance criteria |
|---|---|
| 6.1 `ml-engine/evaluation/` | matplotlib, fixed seed, 200 dpi PNGs to `docs/ml-evaluation/`, `REPORT.md` embedding them. |
| 6.2 Charts | Symptom model confusion matrix, per-class P/R/F1, top-1/top-3; detector S1–S8 detection, false alarms, days-to-alert; 14-day forecast vs actual with MAE/RMSE vs naive baseline. Synthetic charts titled "SYNTHETIC evaluation, not real-world accuracy". |
| 6.3 Leakage check | States whether test data shares reference profiles with the model. |
| 6.4 Real-data backtest (optional) | Only if network allows: CC0 colmozzie weekly Colombo dengue 2008–2014, time split, no shuffle, charted separately. Otherwise BLOCKED. No invented numbers, no clinical claims, outputs small. |

### Phase 7 — Docs, full gate, handover
| Task | Acceptance criteria |
|---|---|
| 7.1 Docs | ARCHITECTURE.md + README test totals consistent; DEMO_BATCH_REMOVAL_RUNBOOK.md corrected (missing-flag behavior, example counts, alert query scope); honest note that `MEDISYNC_PROTOTYPE_MODE` + `MEDISYNC_ALLOW_OPERATOR_KEYS` bypass the key vault (see `server/src/app.js:60-70`). |
| 7.2 Acceptance matrix | Regenerated with only verified facts; viewport/localization "manual - not run" unless actually run; protected-file list copied from the real ledger. |
| 7.3 Gate + handover | Full gate + build green, push, compare link printed, OWNER_ACTIONS.md ordered live-test checklist (max 50 OTPs/day, no retries after failure). |

## 3. Interpretation: "outbreak 3 levels"

**Proposed (primary):** three **geographic aggregation levels** — District (25), Province (9), Island-wide (1). At each level the same detector rules run on the aggregated daily counts (N >= 5, 2 consecutive days, z > 2) and produce the existing tier (Watch / Alert / Critical). Admin page gets a level selector. Public page gets a read-only summary per level, still subject to the public disclosure threshold.

Evidence this fits the codebase: tiers Watch/Alert/Critical already exist (`surveillanceService.js:111`), and `PROVINCE_CLUSTERS` already exists on the client (`districtClustering.test.js`).

**Alternative:** "3 levels" means only the three tiers (Watch/Alert/Critical). These already exist, so under this reading 4.4 reduces to UI display work. → Open Question Q1.

Side effect to note: Province/Island aggregation will usually cross the N >= 5 floor more easily than a district, so higher levels can alert when no single district does. This is expected behaviour, not rule weakening, and will be documented.

## 4. Assumptions

- A1. `main` @ `0871fd3` is the base; offline gate is green there (to be re-confirmed as first step of Phase 1; last recorded 3,479 passed on the pre-merge branch).
- A2. "Under 2 GB excluding node_modules" measures the working folder on disk, not only git-tracked size.
- A3. Phase 1 deletions of large folders are owner-run; the agent only writes commands.
- A4. Email "verified email" = the patient account email field already used for OTP delivery.
- A5. "Daily email cap" = existing Brevo/Resend daily limit logic in `emailService.js` (e.g. `BREVO_DAILY_FREE_LIMIT`).
- A6. Agent cannot set Render env vars; `PDF_EXPORT_ENABLED` stays off in production until the owner sets it.
- A7. Phase 4.3 investigation uses read-only queries (find/count/aggregate) against `medisync_prod` only if needed; offline reproduction preferred.
- A8. Network fetches (DCS site, colmozzie dataset) may be blocked; then BLOCKED with owner steps, no fabricated data.

## 5. Open questions for the owner (RESOLVED 2026-11-07)

- Q1. Confirm "3 levels" = District / Province / Island-wide (primary interpretation above)? -> **APPROVED: YES (District 25 / Province 9 / Island-wide 1).**
- Q2. Keep a small curated copy of `medisync-qa-evidence/` in git, or ignore it entirely? -> **APPROVED: Ignore `medisync-qa-evidence/` entirely in `.gitignore` (optionally a few small PNGs in `docs/evidence/` later).**
- Q3. Should the consultation summary email attach the PDF even when `PDF_EXPORT_ENABLED` is off? -> **APPROVED: Attach PDF only when `PDF_EXPORT_ENABLED=true`; otherwise send the prescription list email only.**
- Q4. Restock warnings (3.3): remove entirely, or repurpose as "District health burden" link? -> **APPROVED: Remove the "Predictive Restock Warnings" sidebar item.**
- Q5. Phase 4.3: allowed to run read-only aggregate queries against `medisync_prod`, or offline reproduction only? -> **APPROVED: Read-only `count`/`aggregate` queries on `medisync_prod` are allowed (never print document contents or PII, zero writes). Owner runs `remove_demo_batch` dry-run first and will paste counts.**
- Q6. Province mapping: use the official 9-province district mapping (standard administrative split). OK? -> **APPROVED: YES, official 9 provinces / 25 districts, with a test that each district maps to exactly one province.**

## 6. Risks

| Risk | Mitigation |
|---|---|
| Accidental deletion of large data | Agent never deletes large items; owner commands only. `git rm --cached` only. |
| Protected file drift | Re-pin with reason; gate's `protectedAccountedFor` must be 15. |
| Email leaks PII / duplicate sends | Idempotency key per consultation, NIC-free templates, PII-free logs, tests. |
| Render cold start causing 429 storms | Server cache + backoff/jitter; client debounce/disable. |
| Higher-level aggregation over-alerting | Same rules per level; documented; tests per level. |
| Fabricated official data | Fetch from official source or null + BLOCKED. |
| Gate runtime (~5 min) and OneDrive locking files | Run gate once per phase; advise moving repo out of OneDrive. |

## 7. Rollback notes

- All work is on `feat/phase2-polish-and-cleanup`; `main` untouched. Rollback = do not merge, or `git revert <commit>` per phase.
- `.gitignore` / `git rm --cached` changes are reversible with `git add -f`.
- Seeder `SEED_2026_11_B` is additive and namespaced; owner removal path documented before any owner run.
- Re-pins in `PROTECTED_HASHES.json` are per-file and revertible.

## 8. Corrections found while planning (to fix in Phase 7, flagged now)

- `docs/new/FINAL_ACCEPTANCE_MATRIX.md` (written in M5) lists protected files that are **not** in the real ledger (e.g. `operatorKeyPolicy.js`, `productionAtlasPolicy.js`, `qaConnectionAdmission.js`, `operatorDatabaseMode.js`, seed scripts) and omits real entries (`lab.test.js`, `universityDemoSeedVerify.test.js`, `ir04-isolated-five-role-e2e.spec.js`, `dbGuard.js`, `Consultation.js`, `Patient.js`, `versionedEncryption.js`). It also marks viewport and localization checks PASS although only HTTP 200 status was verified. Both will be corrected in 7.2.
